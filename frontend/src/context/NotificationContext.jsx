import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from './AuthContext'
import { getNotifications, markRead } from '../api/notificationsApi'
import { getClientToken, refreshAccessToken } from '../api/client'

const NotificationContext = createContext(null)

const WS_BASE = process.env.REACT_APP_WS_URL || 'ws://localhost:8000'

const RECONNECT_MIN_MS = 1000
const RECONNECT_MAX_MS = 30000
// Server close code for a missing/invalid/expired token (chat.py _POLICY_VIOLATION).
const AUTH_REJECTED = 1008

export function NotificationProvider({ children }) {
  const { accessToken, user } = useAuth()
  // Depend on sign-in state, not the token value: a token refresh must not
  // reload notifications or reconnect the socket.
  const signedIn = Boolean(accessToken)
  const userId = user?.id
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  // 'idle' (signed out) | 'loading' | 'ready' | 'error'
  const [loadState, setLoadState] = useState('idle')
  const wsRef = useRef(null)
  const liveIdRef = useRef(0)
  // Set when the user marks everything read while the initial GET is in flight,
  // so a late response can't bring back a stale unread count.
  const clearedDuringLoadRef = useRef(false)

  const addNotification = useCallback((notif) => {
    setNotifications(prev => [notif, ...prev])
    setUnreadCount(c => c + 1)
  }, [])

  const load = useCallback(async () => {
    if (!signedIn) return
    clearedDuringLoadRef.current = false
    setLoadState('loading')
    try {
      const data = await getNotifications()
      if (clearedDuringLoadRef.current) {
        setNotifications(data.map(n => ({ ...n, is_read: true })))
        setUnreadCount(0)
      } else {
        setNotifications(data)
        setUnreadCount(data.filter(n => !n.is_read).length)
      }
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

  // WebSocket for real-time events; reconnects with exponential backoff.
  useEffect(() => {
    if (!signedIn || !userId) return

    let stopped = false
    let retryTimer = null
    let delay = RECONNECT_MIN_MS
    // Set after one token refresh; a second rejection means the session is gone.
    let refreshedForAuth = false

    const connect = () => {
      const ws = new WebSocket(`${WS_BASE}/chat/ws`)
      wsRef.current = ws

      // The token is read at connect time so a reconnect never sends a stale one.
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth', token: getClientToken() }))
      }

      ws.onmessage = (event) => {
        // The server only sends frames after accepting the token, so this is
        // the point where the connection is known to be healthy (not onopen:
        // the server accepts first and closes with 1008 on a bad token).
        delay = RECONNECT_MIN_MS
        refreshedForAuth = false
        let msg
        try {
          msg = JSON.parse(event.data)
        } catch {
          return // not JSON (e.g. a keep-alive frame): nothing to handle
        }
        if (msg?.type === 'notification') {
          liveIdRef.current += 1
          addNotification({
            id: `live-${liveIdRef.current}`,
            type: msg.event,
            from_user: msg.from_user,
            from_username: msg.from_username,
            from_photo_url: msg.from_photo_url,
            is_read: false,
            created_at: new Date().toISOString(),
          })
        }
      }

      ws.onclose = (event) => {
        if (wsRef.current === ws) wsRef.current = null
        if (stopped) return
        if (event.code !== AUTH_REJECTED) {
          retryTimer = setTimeout(connect, delay)
          delay = Math.min(delay * 2, RECONNECT_MAX_MS)
          return
        }
        // Token rejected (expired after 15 min, or revoked): refresh once and
        // reconnect. If the session itself is gone (refresh 401/403), or the
        // fresh token is rejected too, stop — the next API call's 401 handling
        // sends the user to /login. A transient refresh failure (network, 5xx)
        // falls back to the normal backoff and tries again.
        if (refreshedForAuth) return
        refreshedForAuth = true
        refreshAccessToken().then(
          () => { if (!stopped) connect() },
          (err) => {
            const status = err?.response?.status
            if (stopped || status === 401 || status === 403) return
            refreshedForAuth = false
            retryTimer = setTimeout(connect, delay)
            delay = Math.min(delay * 2, RECONNECT_MAX_MS)
          },
        )
      }
    }

    connect()

    return () => {
      stopped = true
      clearTimeout(retryTimer)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [signedIn, userId, addNotification])

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
    <NotificationContext.Provider value={{ notifications, unreadCount, loadState, reload: load, clearUnread, wsRef }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationContext)
}
