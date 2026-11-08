import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from './AuthContext'
import { getNotifications, markRead } from '../api/notificationsApi'

const NotificationContext = createContext(null)

const WS_BASE = process.env.REACT_APP_WS_URL || 'ws://localhost:8000'

const RECONNECT_MIN_MS = 1000
const RECONNECT_MAX_MS = 30000

export function NotificationProvider({ children }) {
  const { accessToken, user } = useAuth()
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
    if (!accessToken) return
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
  }, [accessToken])

  // Load existing notifications when the user logs in
  useEffect(() => {
    if (!accessToken) {
      setNotifications([])
      setUnreadCount(0)
      setLoadState('idle')
      return
    }
    load()
  }, [accessToken, load])

  // WebSocket for real-time events; reconnects with exponential backoff.
  useEffect(() => {
    if (!accessToken || !user) return

    let stopped = false
    let retryTimer = null
    let delay = RECONNECT_MIN_MS

    const connect = () => {
      const ws = new WebSocket(`${WS_BASE}/chat/ws`)
      wsRef.current = ws

      ws.onopen = () => {
        delay = RECONNECT_MIN_MS
        ws.send(JSON.stringify({ type: 'auth', token: accessToken }))
      }

      ws.onmessage = (event) => {
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

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null
        if (stopped) return
        retryTimer = setTimeout(connect, delay)
        delay = Math.min(delay * 2, RECONNECT_MAX_MS)
      }
    }

    connect()

    return () => {
      stopped = true
      clearTimeout(retryTimer)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [accessToken, user, addNotification])

  // Stable identity: pages call this from useEffect, so a new function per render would loop.
  // Returns false (and keeps the unread state) if the server call failed.
  const clearUnread = useCallback(async () => {
    if (!accessToken) return false
    try {
      await markRead()
    } catch {
      return false
    }
    clearedDuringLoadRef.current = true
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)
    return true
  }, [accessToken])

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, loadState, reload: load, clearUnread, wsRef }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationContext)
}
