import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from './AuthContext'
import { getNotifications, markRead } from '../api/notificationsApi'

const NotificationContext = createContext(null)

const WS_BASE = process.env.REACT_APP_WS_URL || 'ws://localhost:8000'

export function NotificationProvider({ children }) {
  const { accessToken, user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const wsRef = useRef(null)

  const addNotification = useCallback((notif) => {
    setNotifications(prev => [notif, ...prev])
    setUnreadCount(c => c + 1)
  }, [])

  // Load existing notifications when user logs in
  useEffect(() => {
    if (!accessToken) {
      setNotifications([])
      setUnreadCount(0)
      return
    }
    getNotifications()
      .then(data => {
        setNotifications(data)
        setUnreadCount(data.filter(n => !n.is_read).length)
      })
      .catch(() => {})
  }, [accessToken])

  // WebSocket connection for real-time events
  useEffect(() => {
    if (!accessToken || !user) return

    const ws = new WebSocket(`${WS_BASE}/chat/ws/${accessToken}`)
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'notification') {
          addNotification({
            id: Date.now(),
            type: msg.event,
            from_user: msg.from_user,
            from_username: msg.from_username,
            from_photo_url: msg.from_photo_url,
            is_read: false,
            created_at: new Date().toISOString(),
          })
        }
      } catch {}
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [accessToken, user, addNotification])

  async function clearUnread() {
    if (!accessToken) return
    await markRead().catch(() => {})
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, clearUnread, wsRef }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationContext)
}
