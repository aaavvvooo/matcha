import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import MatchaCup from '../../components/ui/MatchaCup';
import Avatar from '../../components/ui/Avatar';
import FameMeter from '../../components/ui/FameMeter';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ChatListView({ conversations, onSelect, loading }) {
  const navigate = useNavigate();
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <MatchaCup size={60} mood="happy" animate={true} style={{ animation: 'float 3s ease-in-out infinite' }}/>
      </div>
    );
  }
  return (
    <div className="screen" style={{ height: '100%', background: 'var(--cream)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 20px', background: 'var(--white)', borderBottom: '1.5px solid var(--cream3)', flexShrink: 0 }}>
        <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>Messages</div>
        <div style={{ fontSize: 13, color: 'var(--ink4)', marginTop: 2 }}>Your connected matches</div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {conversations.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 48 }}>
            <MatchaCup size={56} mood="shy" animate={true}/>
            <div style={{ fontSize: 13, color: 'var(--ink4)', fontStyle: 'italic' }}>
              Like someone and wait for a match to start chatting ✦
            </div>
          </div>
        ) : (
          conversations.map(c => {
            const name = c.full_name || c.username || 'Unknown';
            const hasUnread = (c.unread_count || 0) > 0;
            return (
              <div key={c.user_id} onClick={() => onSelect(c.user_id, c)} style={{
                padding: '14px 16px', marginBottom: 10,
                background: 'var(--white)', borderRadius: 'var(--r-md)',
                border: `1.5px solid ${hasUnread ? 'var(--sand)' : 'var(--cream3)'}`,
                display: 'flex', gap: 14, alignItems: 'center',
                cursor: 'pointer',
                boxShadow: hasUnread ? 'var(--shadow-sm)' : 'none',
              }}>
                <Avatar name={name} size={52} online={c.is_online}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink4)', flexShrink: 0, marginLeft: 8 }}>{timeAgo(c.sent_at)}</div>
                  </div>
                  <div style={{ fontSize: 13, color: hasUnread ? 'var(--ink2)' : 'var(--ink4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: hasUnread ? 500 : 400 }}>
                    {c.last_message || 'Say hello!'}
                  </div>
                </div>
                {hasUnread && <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--spice)', flexShrink: 0 }}/>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ChatThreadView({ partner, messages, onSend, onBack, myId }) {
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const endRef = useRef(null);
  const name = partner?.full_name || partner?.username || 'Unknown';

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  function handleSend() {
    const text = input.trim();
    if (!text || !partner) return;
    onSend(partner.user_id || partner.id, text);
    setInput('');
  }

  return (
    <div className="screen" style={{ height: '100%', background: 'var(--cream2)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '12px 18px',
        display: 'flex', gap: 14, alignItems: 'center',
        background: 'var(--white)', borderBottom: '1.5px solid var(--cream3)',
        boxShadow: 'var(--shadow-sm)', flexShrink: 0,
      }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--ink3)', lineHeight: 1 }}>←</button>
        <Avatar name={name} size={42} online={partner?.is_online}/>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 17, fontWeight: 600, color: 'var(--ink)' }}>{name}</div>
          <div style={{ fontSize: 11, color: partner?.is_online ? 'var(--matcha2)' : 'var(--ink4)' }}>
            {partner?.is_online ? '● online' : 'offline'}
          </div>
        </div>
        {partner?.fame_rating !== undefined && <FameMeter score={partner.fame_rating}/>}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 8px' }}>
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink4)', fontStyle: 'italic', marginBottom: 16 }}>
          You matched — say something real.
        </div>
        {messages.map((msg, i) => {
          const mine = msg.sender_id === myId || msg.from === myId || msg.is_mine;
          return (
            <div key={msg.id ?? i} style={{
              display: 'flex',
              justifyContent: mine ? 'flex-end' : 'flex-start',
              marginBottom: 10,
              gap: 8,
              alignItems: 'flex-end',
            }}>
              {!mine && <Avatar name={name} size={28}/>}
              <div style={{
                maxWidth: '74%',
                padding: '10px 14px',
                background: mine ? 'var(--spice)' : 'var(--white)',
                borderRadius: mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                color: mine ? '#fff' : 'var(--ink)',
                fontSize: 14,
                lineHeight: 1.5,
                boxShadow: 'var(--shadow-sm)',
                border: mine ? 'none' : '1.5px solid var(--cream3)',
              }}>
                {msg.body || msg.content || msg.text}
                <div style={{ fontSize: 10, color: mine ? 'rgba(255,255,255,.6)' : 'var(--ink4)', marginTop: 3, textAlign: 'right' }}>
                  {formatTime(msg.sent_at || msg.created_at) || msg.time || ''}
                </div>
              </div>
            </div>
          );
        })}
        {typing && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 10 }}>
            <Avatar name={name} size={28}/>
            <div style={{ padding: '10px 14px', background: 'var(--white)', borderRadius: '18px 18px 18px 4px', border: '1.5px solid var(--cream3)', display: 'flex', gap: 4, alignItems: 'center' }}>
              {[0, 1, 2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--clay)', animation: `pulse 1.2s ${i * .2}s infinite` }}/>)}
            </div>
          </div>
        )}
        <div ref={endRef}/>
      </div>

      {/* Input bar */}
      <div style={{ padding: '10px 16px 16px', background: 'var(--white)', borderTop: '1.5px solid var(--cream3)', display: 'flex', gap: 10, flexShrink: 0 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Say something…"
          style={{
            flex: 1, padding: '12px 16px', borderRadius: 'var(--r-full)',
            background: 'var(--cream)', border: '1.5px solid var(--sand)',
            color: 'var(--ink)', fontSize: 14,
          }}
        />
        <button onClick={handleSend} style={{
          width: 44, height: 44, borderRadius: '50%',
          background: input ? 'var(--spice)' : 'var(--sand)',
          border: 'none', color: input ? '#fff' : 'var(--ink4)',
          fontSize: 18, cursor: 'pointer', transition: 'all .18s',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'DM Sans, sans-serif',
        }}>↑</button>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { userId: routeUserId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { conversations, messages, loadConversations, loadMessages, sendMessage } = useChat();
  const [activePartner, setActivePartner] = useState(null);
  const [loading, setLoading] = useState(true);

  const myId = user?.user?.id || user?.id;

  useEffect(() => {
    loadConversations().finally(() => setLoading(false));
  }, [loadConversations]);

  useEffect(() => {
    if (routeUserId) {
      const convo = conversations.find(c => String(c.user_id) === String(routeUserId));
      if (convo) {
        handleSelect(routeUserId, convo);
      } else if (!loading) {
        handleSelect(routeUserId, { user_id: routeUserId });
      }
    }
  }, [routeUserId, conversations, loading]);

  async function handleSelect(userId, partner) {
    setActivePartner(partner);
    if (!messages[userId]) {
      await loadMessages(userId).catch(() => {});
    }
  }

  function handleBack() {
    setActivePartner(null);
    navigate('/chat');
  }

  const thread = activePartner ? (messages[activePartner.user_id || activePartner.id] || []) : [];

  if (activePartner) {
    return (
      <ChatThreadView
        partner={activePartner}
        messages={thread}
        onSend={sendMessage}
        onBack={handleBack}
        myId={myId}
      />
    );
  }

  return (
    <ChatListView
      conversations={conversations}
      onSelect={handleSelect}
      loading={loading}
    />
  );
}
