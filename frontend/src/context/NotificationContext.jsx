import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from './AuthContext'
import { getNotifications, getUnreadCount, markRead } from '../api/notificationsApi'
import { getClientToken, onTokenChange, refreshAccessToken, tokenExpiresSoon, tokenExpiryMs } from '../api/client'

const NotificationContext = createContext(null)

const WS_BASE = process.env.REACT_APP_WS_URL || 'ws://localhost:8000'

const RECONNECT_MIN_MS = 1000
const RECONNECT_MAX_MS = 30000
// WebSocket close code and reasons set by the server (backend/application/api/endpoints/chat.py).
const POLICY_VIOLATION = 1008
const REASON_TOO_MANY = 'too_many_connections'
// The socket lives as long as the access token it last presented. A fresh token is renewed this
// long before the old one expires (or 40% of what is left, for short-lived tokens), so a call or
// an idle tab does not wait for an unrelated request to refresh the token.
const REFRESH_LEAD_MS = 120000
const REFRESH_MIN_WAIT_MS = 5000
const REFRESH_RETRY_MS = 15000

export function NotificationProvider({ children }) {
  const { accessToken, user } = useAuth()
  // The socket must outlive silent token refreshes: key it on "signed in as", never on the token.
  const signedIn = !!accessToken
  const userId = user?.id
  const [notifications, setNotifications] = useState([])
  // Server-side total (the list is only the newest page). Live pushes carry the new total.
  const [unreadCount, setUnreadCount] = useState(0)
  // 'idle' (signed out) | 'loading' | 'ready' | 'error'
  const [loadState, setLoadState] = useState('idle')
  const wsRef = useRef(null)
  // True from the server's auth_ok until the socket closes; other contexts resync on reconnect.
  const [connected, setConnected] = useState(false)
  // Frame consumers (ChatContext) register here instead of opening their own socket.
  const listenersRef = useRef(new Set())
  const liveIdRef = useRef(0)
  // Set when the user marks everything read while the initial GET is in flight,
  // so a late response can't bring back a stale unread count.
  const clearedDuringLoadRef = useRef(false)

  const addNotification = useCallback((notif, unread) => {
    setNotifications(prev => (prev.some(n => n.id === notif.id) ? prev : [notif, ...prev]))
    if (Number.isInteger(unread)) setUnreadCount(unread)
  }, [])

  const load = useCallback(async () => {
    if (!signedIn) return
    clearedDuringLoadRef.current = false
    setLoadState('loading')
    try {
      const [data, unread] = await Promise.all([getNotifications(), getUnreadCount()])
      const cleared = clearedDuringLoadRef.current
      setNotifications(cleared ? data.map(n => ({ ...n, is_read: true })) : data)
      setUnreadCount(cleared ? 0 : unread)
      setLoadState('ready')
    } catch {
      setLoadState('error')
    }
  }, [signedIn])

  // Load existing notifications when the user logs in
  useEffect(() => {
    if (!signedIn) {
      setNotifications([])
      setUnreadCount(0)
      setLoadState('idle')
      return
    }
    load()
  }, [signedIn, load])

  // WebSocket for real-time events; reconnects with exponential backoff. The token is read
  // from the API client at every (re)connect, so it is always the current one.
  useEffect(() => {
    if (!signedIn || !userId) return undefined

    let stopped = false
    let retryTimer = null
    let delay = RECONNECT_MIN_MS
    // Set after a 1008-triggered refresh, cleared by the next auth_ok: if the fresh token is
    // rejected too, the session is gone (the next API call's 401 handling signs the user out).
    let refreshedForAuth = false
    // In-band re-auth state: true from auth_ok to close; the token the server currently knows.
    let authed = false
    let presentedToken = null
    let renewTimer = null

    // Renew the access token shortly before the socket's one expires, even when nothing else
    // calls the API (single-flight, shared with every other refresh). A new token reaches the
    // server through the onTokenChange listener below.
    const scheduleRenewal = () => {
      clearTimeout(renewTimer)
      renewTimer = null
      const expiry = tokenExpiryMs(getClientToken())
      if (stopped || !authed || expiry === null) return
      const remaining = expiry - Date.now()
      const wait = Math.max(REFRESH_MIN_WAIT_MS, remaining - Math.min(REFRESH_LEAD_MS, remaining * 0.4))
      renewTimer = setTimeout(async () => {
        try {
          await refreshAccessToken()
        } catch (err) {
          // 401: the session is over (handled by the client). Otherwise (offline, 429) try again.
          if (err?.response?.status !== 401 && !stopped && authed) {
            clearTimeout(renewTimer)
            renewTimer = setTimeout(scheduleRenewal, REFRESH_RETRY_MS)
          }
        }
      }, wait)
    }
    const presentToken = (token) => {
      const ws = wsRef.current
      if (!token || !authed || !ws || ws.readyState !== WebSocket.OPEN) return
      presentedToken = token
      ws.send(JSON.stringify({ type: 'auth', token }))
    }
    const offTokenChange = onTokenChange((token) => {
      if (token && token !== presentedToken) presentToken(token)
      scheduleRenewal()
    })

    const scheduleRetry = (wait) => {
      if (stopped) return
      retryTimer = setTimeout(connect, wait ?? delay)
      delay = Math.min(delay * 2, RECONNECT_MAX_MS)
    }

    async function connect() {
      retryTimer = null
      let token = getClientToken()
      if (tokenExpiresSoon(token)) {
        try {
          token = await refreshAccessToken()
        } catch (err) {
          // 401: the session is over (the client has cleared it, AuthContext signs out).
          // Anything else (offline, 429): try again later.
          if (err?.response?.status !== 401) scheduleRetry()
          return
        }
      }
      if (stopped) return

      const ws = new WebSocket(`${WS_BASE}/chat/ws`)
      wsRef.current = ws

      // Read again at open: an axios refresh may have rotated the token while connecting.
      ws.onopen = () => {
        presentedToken = getClientToken() ?? token
        ws.send(JSON.stringify({ type: 'auth', token: presentedToken }))
      }

      ws.onmessage = (event) => {
        let msg
        try {
          msg = JSON.parse(event.data)
        } catch {
          return // not JSON (e.g. a keep-alive frame): nothing to handle
        }
        if (msg?.type === 'auth_ok') {
          // Also the answer to every re-auth frame: only the first one starts a healthy session.
          authed = true
          // The token may have been renewed while connecting: make the server aware of it.
          const current = getClientToken()
          if (current && current !== presentedToken) presentToken(current)
          scheduleRenewal()
          // Healthy only now (not onopen: the server accepts first, then closes with 1008 on
          // a bad token), so the backoff and the one-refresh budget reset here.
          delay = RECONNECT_MIN_MS
          refreshedForAuth = false
          setConnected(true)
          return
        }
        listenersRef.current.forEach(listener => listener(msg))
        if (msg?.type === 'notification') {
          liveIdRef.current += 1
          addNotification({
            // Server id when present, so a later GET doesn't duplicate the item.
            id: msg.id ?? `live-${liveIdRef.current}`,
            type: msg.event,
            from_user: msg.from_user,
            from_username: msg.from_username,
            from_photo_url: msg.from_photo_url,
            is_read: false,
            created_at: msg.created_at || new Date().toISOString(),
          }, msg.unread)
        }
      }

      ws.onclose = async (event) => {
        authed = false
        clearTimeout(renewTimer)
        if (wsRef.current === ws) {
          wsRef.current = null
          setConnected(false)
        }
        if (stopped) return
        if (event.code === POLICY_VIOLATION && event.reason === REASON_TOO_MANY) {
          scheduleRetry(RECONNECT_MAX_MS) // other tabs hold all the slots: don't hammer
          return
        }
        if (event.code === POLICY_VIOLATION) {
          // Rejected, expired or logged-out credentials: get a fresh token (shared
          // single-flight refresh) once, then reconnect. A second rejection of a fresh token,
          // or a refresh the server refuses (401: the client clears the session and
          // AuthContext signs out), ends the retries. Offline / 429 / 5xx falls back to backoff.
          if (refreshedForAuth) return
          refreshedForAuth = true
          try {
            await refreshAccessToken()
          } catch (err) {
            if (err?.response?.status === 401) return
            refreshedForAuth = false
          }
          if (stopped) return
        }
        scheduleRetry()
      }
    }

    connect()

    return () => {
      stopped = true
      authed = false
      offTokenChange()
      clearTimeout(renewTimer)
      clearTimeout(retryTimer)
      const ws = wsRef.current
      wsRef.current = null
      setConnected(false)
      if (ws) {
        // Closing a socket that is still connecting logs a console warning; close it once open.
        if (ws.readyState === WebSocket.CONNECTING) ws.onopen = () => ws.close()
        else ws.close()
      }
    }
  }, [signedIn, userId, addNotification])

  // Subscribe to every parsed server frame; returns the unsubscribe function.
  const subscribe = useCallback((listener) => {
    listenersRef.current.add(listener)
    return () => listenersRef.current.delete(listener)
  }, [])

  // Sends a JSON frame on the shared socket. Returns false when it is not open.
  const send = useCallback((frame) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify(frame))
    return true
  }, [])

  // Stable identity: pages call this from useEffect, so a new function per render would loop.
  // Returns false (and keeps the unread state) if the server call failed.
  const clearUnread = useCallback(async () => {
    if (!signedIn) return false
    try {
      await markRead()
    } catch {
      return false
    }
    clearedDuringLoadRef.current = true
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)
    return true
  }, [signedIn])

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, loadState, reload: load, clearUnread, connected, subscribe, send }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationContext)
}
