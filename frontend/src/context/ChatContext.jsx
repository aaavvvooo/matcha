import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAuth } from './AuthContext'
import { useNotifications } from './NotificationContext'
import { getConversations, getMessages, markThreadRead } from '../api/chatApi'

const ChatContext = createContext(null)

// Matches the server default page size (GET /chat/messages/{id}?limit=50).
export const PAGE_SIZE = 50

// Thread order is the server id order. Live and fetched copies of a message share an id.
function mergeThread(existing, incoming) {
  const byId = new Map()
  existing.forEach(m => byId.set(m.id, m))
  incoming.forEach(m => byId.set(m.id, m))
  return [...byId.values()].sort((a, b) => a.id - b.id)
}

export function ChatProvider({ children }) {
  const { accessToken, user } = useAuth()
  // Key effects on being signed in, not on the token: it changes on every silent refresh.
  const signedIn = !!accessToken
  const { subscribe, send, connected } = useNotifications()
  const myId = user?.user?.id || user?.id

  const [conversations, setConversations] = useState([])
  // 'idle' (signed out) | 'loading' | 'ready' | 'error'
  const [conversationsState, setConversationsState] = useState('idle')
  const [messages, setMessages] = useState({})      // keyed by the other user's id, oldest first
  const [hasMore, setHasMore] = useState({})        // keyed by the other user's id
  const [threadState, setThreadState] = useState({}) // 'loading' | 'ready' | 'error' | 'forbidden'
  const [chatError, setChatError] = useState(null)  // last error frame / send failure: {code, detail, to}
  const [activeUserId, setActiveUserIdState] = useState(null)

  const activeRef = useRef(null)
  const myIdRef = useRef(myId)
  const seenIdsRef = useRef(new Set())
  const conversationsRef = useRef([])
  // Text of messages sent but not yet confirmed, by client ref, so a rejection can give it back.
  const pendingRef = useRef(new Map())
  const refCounterRef = useRef(0)
  useEffect(() => { conversationsRef.current = conversations }, [conversations])
  useEffect(() => { myIdRef.current = myId }, [myId])

  const setActiveUserId = useCallback((id) => {
    const next = id == null ? null : Number(id)
    activeRef.current = next
    setActiveUserIdState(next)
  }, [])

  const unreadMessages = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0),
    [conversations]
  )

  const loadConversations = useCallback(async () => {
    setConversationsState(s => (s === 'ready' ? s : 'loading'))
    try {
      const data = await getConversations()
      setConversations(data)
      setConversationsState('ready')
      return data
    } catch {
      setConversationsState('error')
      return []
    }
  }, [])

  const clearUnread = useCallback((userId) => {
    setConversations(prev => prev.map(c => (c.user_id === userId && c.unread_count ? { ...c, unread_count: 0 } : c)))
  }, [])

  // Loads (or refreshes) the newest page of a thread. The server marks it read.
  const loadMessages = useCallback(async (userId) => {
    const id = Number(userId)
    setThreadState(prev => ({ ...prev, [id]: prev[id] === 'ready' ? 'ready' : 'loading' }))
    try {
      const data = await getMessages(id, { limit: PAGE_SIZE })
      data.forEach(m => seenIdsRef.current.add(m.id))
      setMessages(prev => ({ ...prev, [id]: mergeThread(prev[id] || [], data) }))
      setHasMore(prev => ({ ...prev, [id]: prev[id] === undefined ? data.length >= PAGE_SIZE : prev[id] }))
      setThreadState(prev => ({ ...prev, [id]: 'ready' }))
      clearUnread(id)
      return data
    } catch (e) {
      // 403: unliked or blocked. Anything else is a load failure the page can retry.
      setThreadState(prev => ({ ...prev, [id]: e.response?.status === 403 ? 'forbidden' : 'error' }))
      return []
    }
  }, [clearUnread])

  const loadOlder = useCallback(async (userId) => {
    const id = Number(userId)
    const oldest = (messages[id] || [])[0]
    if (!oldest) return
    try {
      const data = await getMessages(id, { limit: PAGE_SIZE, beforeId: oldest.id })
      data.forEach(m => seenIdsRef.current.add(m.id))
      setMessages(prev => ({ ...prev, [id]: mergeThread(prev[id] || [], data) }))
      setHasMore(prev => ({ ...prev, [id]: data.length >= PAGE_SIZE }))
    } catch (e) {
      setChatError({
        code: e.response?.status === 403 ? 'not_connected' : 'history_failed',
        detail: e.response?.status === 403 ? "You're no longer connected with this user" : "Couldn't load earlier messages",
        to: id,
      })
    }
  }, [messages])

  const dismissChatError = useCallback(() => setChatError(null), [])

  const sendMessage = useCallback((toUserId, body) => {
    setChatError(null)
    refCounterRef.current += 1
    // The server echoes this ref on our copy of the message and on any error for it.
    const ref = `${Date.now().toString(36)}-${refCounterRef.current}-${Math.random().toString(36).slice(2, 8)}`
    pendingRef.current.set(ref, body)
    const sent = send({ type: 'message', to: Number(toUserId), body, ref })
    if (!sent) {
      pendingRef.current.delete(ref)
      setChatError({
        code: 'offline', detail: "You're offline. Reconnecting, try again in a moment",
        to: Number(toUserId), text: body,
      })
    }
    return sent
  }, [send])

  // Server frames: new messages (incoming and our own echo), errors, connection changes.
  useEffect(() => {
    if (!signedIn) return undefined
    return subscribe((frame) => {
      if (frame?.type === 'message') {
        if (frame.ref) pendingRef.current.delete(frame.ref)
        if (seenIdsRef.current.has(frame.id)) return
        seenIdsRef.current.add(frame.id)
        const mine = frame.from === myIdRef.current
        const partnerId = mine ? frame.to : frame.from
        const msg = {
          id: frame.id, sender_id: frame.from, receiver_id: frame.to,
          body: frame.body, sent_at: frame.sent_at, is_read: mine,
        }
        setMessages(prev => ({ ...prev, [partnerId]: mergeThread(prev[partnerId] || [], [msg]) }))
        const viewing = activeRef.current === partnerId
        if (!mine && viewing) {
          // Open thread: it is read as it arrives.
          markThreadRead(partnerId).catch(() => {})
        }
        if (!conversationsRef.current.some(c => c.user_id === partnerId)) {
          // First message from someone we have no row for (new match): fetch the real row.
          loadConversations()
        } else {
          setConversations(prev => {
            const row = prev.find(c => c.user_id === partnerId)
            if (!row) return prev
            const updated = {
              ...row,
              last_message: msg.body, last_sender_id: msg.sender_id, sent_at: msg.sent_at,
              unread_count: !mine && !viewing ? (row.unread_count || 0) + 1 : row.unread_count || 0,
            }
            // Most recent activity first, like the server's ordering.
            return [updated, ...prev.filter(c => c.user_id !== partnerId)]
          })
        }
      } else if (frame?.type === 'error') {
        // Give the rejected text back (only when the server tied the error to one of our sends).
        const text = frame.ref ? pendingRef.current.get(frame.ref) : undefined
        if (frame.ref) pendingRef.current.delete(frame.ref)
        setChatError({ code: frame.code, detail: frame.detail, to: frame.to ?? null, text })
        // The server says we can't chat with them (unlike/block): refresh who we're connected to.
        if (frame.code === 'not_connected') loadConversations()
      } else if (frame?.type === 'notification' && (frame.event === 'match' || frame.event === 'unlike')) {
        loadConversations()
      }
    })
  }, [signedIn, subscribe, loadConversations])

  // Load on sign-in, reset on sign-out.
  useEffect(() => {
    if (!signedIn) {
      setConversations([])
      setConversationsState('idle')
      setMessages({})
      setHasMore({})
      setThreadState({})
      setChatError(null)
      seenIdsRef.current = new Set()
      pendingRef.current = new Map()
      return
    }
    loadConversations()
  }, [signedIn, loadConversations])

  // After a reconnect, catch up on anything missed while the socket was down.
  const everConnectedRef = useRef(false)
  useEffect(() => {
    if (!signedIn) {
      everConnectedRef.current = false
      return
    }
    if (!connected) return
    if (everConnectedRef.current) {
      pendingRef.current = new Map() // confirmations for sends made while down are lost
      const active = activeRef.current
      loadConversations().then((list) => {
        // Skip threads we are no longer connected to: their history would be a 403.
        if (active != null && list.some(c => c.user_id === active)) loadMessages(active)
      })
    }
    everConnectedRef.current = true
  }, [connected, signedIn, loadConversations, loadMessages])

  return (
    <ChatContext.Provider value={{
      conversations, conversationsState, messages, hasMore, threadState, chatError, activeUserId,
      unreadMessages, myId,
      setActiveUserId, loadConversations, loadMessages, loadOlder, sendMessage,
      dismissChatError,
    }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  return useContext(ChatContext)
}
