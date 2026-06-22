import { createContext, useContext, useState, useCallback } from 'react'
import { useNotifications } from './NotificationContext'
import { getConversations, getMessages } from '../api/chatApi'

const ChatContext = createContext(null)

export function ChatProvider({ children }) {
  const { wsRef } = useNotifications()
  const [conversations, setConversations] = useState([])
  const [messages, setMessages] = useState({})  // keyed by other user's id
  const [activeUserId, setActiveUserId] = useState(null)

  const loadConversations = useCallback(async () => {
    const data = await getConversations()
    setConversations(data)
    return data
  }, [])

  const loadMessages = useCallback(async (userId) => {
    const data = await getMessages(userId)
    setMessages(prev => ({ ...prev, [userId]: data }))
    return data
  }, [])

  const sendMessage = useCallback((toUserId, body) => {
    const ws = wsRef?.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify({ type: 'message', to: toUserId, body }))
    return true
  }, [wsRef])

  // Called by NotificationContext when a new message arrives via WS
  const receiveMessage = useCallback((msg) => {
    const partnerId = msg.from
    setMessages(prev => {
      const thread = prev[partnerId] || []
      return { ...prev, [partnerId]: [...thread, msg] }
    })
    setConversations(prev => {
      const exists = prev.find(c => c.user_id === partnerId)
      if (exists) {
        return prev.map(c =>
          c.user_id === partnerId ? { ...c, last_message: msg.body, sent_at: msg.sent_at } : c
        )
      }
      return [{ user_id: partnerId, username: msg.from_username, last_message: msg.body, sent_at: msg.sent_at }, ...prev]
    })
  }, [])

  return (
    <ChatContext.Provider value={{
      conversations, messages, activeUserId, setActiveUserId,
      loadConversations, loadMessages, sendMessage, receiveMessage,
    }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  return useContext(ChatContext)
}
