import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useChat } from '../../context/ChatContext'
import './ChatPage.css'

function ConversationList({ conversations, activeId, onSelect }) {
  return (
    <aside className="chat-sidebar">
      <h2 className="chat-sidebar-title">Conversations</h2>
      {conversations.length === 0 && (
        <p className="chat-empty-hint">No conversations yet. Like someone to get matched!</p>
      )}
      <ul className="convo-list">
        {conversations.map(c => (
          <li
            key={c.user_id}
            className={`convo-item${c.user_id === activeId ? ' active' : ''}`}
            onClick={() => onSelect(c.user_id)}
          >
            <div className="convo-avatar">
              {c.profile_photo_url
                ? <img src={c.profile_photo_url} alt={c.username} />
                : <span>{(c.username?.[0] || '?').toUpperCase()}</span>
              }
              {c.is_online && <span className="convo-online" />}
            </div>
            <div className="convo-info">
              <p className="convo-name">{c.full_name || c.username}</p>
              {c.last_message && (
                <p className="convo-last">{c.last_message}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </aside>
  )
}

function MessageThread({ userId, messages, onSend }) {
  const { user } = useAuth()
  const [text, setText] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSubmit(e) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    onSend(userId, body)
    setText('')
  }

  const myId = user?.user?.id

  return (
    <div className="chat-thread">
      <div className="thread-messages">
        {messages.map((m, i) => {
          const mine = m.sender_id === myId || m.from === myId
          return (
            <div key={m.id ?? i} className={`msg-row${mine ? ' mine' : ''}`}>
              <div className="msg-bubble">{m.body}</div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      <form className="thread-input" onSubmit={handleSubmit}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Type a message…"
          autoFocus
        />
        <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}

export default function ChatPage() {
  const { conversations, messages, loadConversations, loadMessages, sendMessage } = useChat()
  const [activeId, setActiveId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadConversations().finally(() => setLoading(false))
  }, [loadConversations])

  async function selectConvo(userId) {
    setActiveId(userId)
    if (!messages[userId]) {
      await loadMessages(userId)
    }
  }

  const thread = activeId ? (messages[activeId] || []) : []

  return (
    <div className="chat-page">
      <div className="container chat-layout">
        {loading ? (
          <div className="chat-loading">
            <div className="status-card__spinner" />
          </div>
        ) : (
          <>
            <ConversationList
              conversations={conversations}
              activeId={activeId}
              onSelect={selectConvo}
            />
            <main className="chat-main">
              {activeId
                ? <MessageThread
                    userId={activeId}
                    messages={thread}
                    onSend={sendMessage}
                  />
                : <div className="chat-placeholder">
                    <p>Select a conversation to start chatting</p>
                  </div>
              }
            </main>
          </>
        )}
      </div>
    </div>
  )
}
