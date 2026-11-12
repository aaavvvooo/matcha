import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Sparkle, CalendarPlus, Phone, Video } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { useCall } from '../../context/CallContext';
import MatchaCup from '../../components/ui/MatchaCup';
import Avatar from '../../components/ui/Avatar';
import Btn from '../../components/ui/Btn';
import ProposeDateForm from '../../components/dates/ProposeDateForm';
import { displayName } from '../../utils/displayName';

const CONVERSATION_POLL_MS = 30000;
const MAX_BODY = 2000; // keep in sync with MAX_BODY_LENGTH in backend chat_service.py

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

function ChatListView({ conversations, onSelect, state, onRetry }) {
  if (state === 'loading' || state === 'idle') {
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
        {state === 'error' && conversations.length === 0 ? (
          <div role="alert" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 48 }}>
            <div style={{ fontSize: 14, color: 'var(--ink3)' }}>Couldn't load your conversations.</div>
            <Btn variant="secondary" onClick={onRetry}>Try again</Btn>
          </div>
        ) : conversations.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 48 }}>
            <MatchaCup size={56} mood="shy" animate={true}/>
            <div style={{ fontSize: 13, color: 'var(--ink4)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 4 }}>
              Like someone and wait for a match to start chatting <Sparkle size={12}/>
            </div>
          </div>
        ) : (
          conversations.map(c => {
            const name = displayName(c, 'Unknown');
            const unread = c.unread_count || 0;
            const hasUnread = unread > 0;
            return (
              <div key={c.user_id} onClick={() => onSelect(c.user_id)} style={{
                padding: '14px 16px', marginBottom: 10,
                background: 'var(--white)', borderRadius: 'var(--r-md)',
                border: `1.5px solid ${hasUnread ? 'var(--sand)' : 'var(--cream3)'}`,
                display: 'flex', gap: 14, alignItems: 'center',
                cursor: 'pointer',
                boxShadow: hasUnread ? 'var(--shadow-sm)' : 'none',
              }}>
                <Avatar name={name} src={c.photo_url} size={52} online={c.is_online}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink4)', flexShrink: 0, marginLeft: 8 }}>{timeAgo(c.sent_at)}</div>
                  </div>
                  <div style={{ fontSize: 13, color: hasUnread ? 'var(--ink2)' : 'var(--ink4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: hasUnread ? 500 : 400 }}>
                    {c.last_message || 'Say hello!'}
                  </div>
                </div>
                {hasUnread && (
                  <div aria-label={`${unread} unread`} style={{
                    minWidth: 20, height: 20, padding: '0 6px', borderRadius: 'var(--r-full)', flexShrink: 0,
                    background: 'var(--spice)', color: 'var(--white)', fontSize: 11, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{unread > 99 ? '99+' : unread}</div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ChatThreadView({
  partner, messages, myId, state, hasMore, error, notConnected,
  onSend, onBack, onLoadOlder, onRetry, onDismissError,
}) {
  const [input, setInputState] = useState('');
  // Mirrors `input` synchronously: a fast double click or double Enter fires a second send before
  // React has re-rendered the cleared field, which would send the same text twice (seen in Firefox).
  const draftRef = useRef('');
  const setInput = useCallback(update => {
    const next = typeof update === 'function' ? update(draftRef.current) : update;
    draftRef.current = next;
    setInputState(next);
  }, []);
  const [proposing, setProposing] = useState(false);
  const [dateSent, setDateSent] = useState(false);
  const { startCall, busy: inCall } = useCall();
  const endRef = useRef(null);
  const stickToEndRef = useRef(true);
  const name = displayName(partner, 'Unknown');
  const lastId = messages.length ? messages[messages.length - 1].id : null;

  // Scroll to the newest message when it changes, not when older ones are prepended.
  useEffect(() => {
    if (stickToEndRef.current) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lastId]);

  // The server rejected one of our sends: put its text back so it isn't lost. The error
  // carries the text only when it is tied to that send (by the client ref), so a later,
  // unrelated error never restores something that was delivered.
  useEffect(() => {
    if (error?.text) setInput(prev => prev || error.text);
  }, [error]);

  function handleSend() {
    const text = draftRef.current.trim();
    if (!text || notConnected) return;
    stickToEndRef.current = true;
    if (onSend(partner.user_id, text)) setInput('');
  }

  function handleLoadOlder() {
    stickToEndRef.current = false;
    onLoadOlder();
  }

  const canSend = !!input.trim() && !notConnected;

  return (
    <div className="screen" style={{ height: '100%', background: 'var(--cream2)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '12px 12px',
        display: 'flex', gap: 8, alignItems: 'center',
        background: 'var(--white)', borderBottom: '1.5px solid var(--cream3)',
        boxShadow: 'var(--shadow-sm)', flexShrink: 0,
      }}>
        <button onClick={onBack} aria-label="Back to conversations" style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--ink3)', lineHeight: 1, flexShrink: 0, padding: 0 }}>←</button>
        <Avatar name={name} src={partner.photo_url} size={42} online={notConnected ? undefined : partner.is_online}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 17, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          {!notConnected && (
            <div style={{ fontSize: 11, color: partner.is_online ? 'var(--matcha2)' : 'var(--ink4)' }}>
              {partner.is_online ? '● online' : 'offline'}
            </div>
          )}
        </div>
        {!notConnected && partner.is_online && ['audio', 'video'].map(media => (
          <button
            key={media}
            onClick={() => startCall(partner, media)}
            disabled={inCall}
            aria-label={media === 'video' ? 'Start video call' : 'Start audio call'}
            title={inCall ? 'You are already in a call' : (media === 'video' ? 'Video call' : 'Audio call')}
            style={{
              background: 'none', border: '1.5px solid var(--sand)',
              borderRadius: 'var(--r-full)', width: 36, height: 36, flexShrink: 0,
              cursor: inCall ? 'default' : 'pointer', opacity: inCall ? 0.5 : 1,
              color: 'var(--matcha2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {media === 'video' ? <Video size={18} strokeWidth={1.75} /> : <Phone size={18} strokeWidth={1.75} />}
          </button>
        ))}
        {!notConnected && (
          <button
            onClick={() => { setProposing(p => !p); setDateSent(false); }}
            aria-label="Propose a date"
            aria-expanded={proposing}
            title="Propose a date"
            style={{
              background: proposing ? 'var(--cream2)' : 'none', border: '1.5px solid var(--sand)',
              borderRadius: 'var(--r-full)', width: 36, height: 36, flexShrink: 0, cursor: 'pointer',
              color: 'var(--spice)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <CalendarPlus size={18} strokeWidth={1.75} />
          </button>
        )}
      </div>

      {/* Propose a date (only while connected: the partner comes from the loaded conversations) */}
      {proposing && !notConnected && (
        <div style={{ flexShrink: 0, maxHeight: '70%', overflowY: 'auto' }}>
          <ProposeDateForm
            inviteeId={partner.user_id}
            inviteeName={name}
            onCancel={() => setProposing(false)}
            onDone={() => { setProposing(false); setDateSent(true); }}
          />
        </div>
      )}
      {dateSent && !proposing && !notConnected && (
        <div role="status" style={{
          padding: '10px 18px', background: 'var(--cream3)', color: 'var(--ink2)', fontSize: 13,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexShrink: 0,
        }}>
          <span>Date proposed to {name}. <Link to="/dates">See your dates</Link></span>
          <button onClick={() => setDateSent(false)} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 8px' }}>
        {state === 'error' && (
          <div role="alert" style={{ textAlign: 'center', marginBottom: 16, fontSize: 13, color: 'var(--ink3)' }}>
            Couldn't load this conversation.{' '}
            <Btn variant="secondary" onClick={onRetry} style={{ padding: '6px 14px', fontSize: 13 }}>Try again</Btn>
          </div>
        )}
        {state === 'loading' && messages.length === 0 && (
          <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink4)' }}>Loading…</div>
        )}
        {hasMore && (
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <Btn variant="ghost" onClick={handleLoadOlder} style={{ fontSize: 13 }}>Load earlier messages</Btn>
          </div>
        )}
        {!notConnected && state === 'ready' && !hasMore && (
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink4)', fontStyle: 'italic', marginBottom: 16 }}>
            You matched — say something real.
          </div>
        )}
        {messages.map(msg => {
          const mine = msg.sender_id === myId;
          return (
            <div key={msg.id} style={{
              display: 'flex',
              justifyContent: mine ? 'flex-end' : 'flex-start',
              marginBottom: 10,
              gap: 8,
              alignItems: 'flex-end',
            }}>
              {!mine && <Avatar name={name} src={partner.photo_url} size={28}/>}
              <div style={{
                maxWidth: '74%',
                padding: '10px 14px',
                background: mine ? 'var(--spice)' : 'var(--white)',
                borderRadius: mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                color: mine ? 'var(--white)' : 'var(--ink)',
                fontSize: 14,
                lineHeight: 1.5,
                boxShadow: 'var(--shadow-sm)',
                border: mine ? 'none' : '1.5px solid var(--cream3)',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
              }}>
                {msg.body}
                <div style={{ fontSize: 10, color: mine ? 'var(--white)' : 'var(--ink4)', opacity: mine ? 0.7 : 1, marginTop: 3, textAlign: 'right' }}>
                  {formatTime(msg.sent_at)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef}/>
      </div>

      {/* Status banners */}
      {notConnected && (
        <div role="alert" style={{
          padding: '12px 18px', background: 'var(--cream3)', color: 'var(--ink2)',
          fontSize: 13, textAlign: 'center', flexShrink: 0,
        }}>
          You're no longer connected with {name}, so you can't send messages.
        </div>
      )}
      {!notConnected && error && (
        <div role="alert" style={{
          padding: '10px 18px', background: 'var(--danger-bg)', color: 'var(--danger-fg)', fontSize: 13,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexShrink: 0,
        }}>
          <span>{error.detail}</span>
          <button onClick={onDismissError} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Input bar */}
      <div style={{ padding: '10px 16px 16px', background: 'var(--white)', borderTop: '1.5px solid var(--cream3)', display: 'flex', gap: 10, flexShrink: 0 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={notConnected ? 'Chat unavailable' : 'Say something…'}
          aria-label="Message"
          maxLength={MAX_BODY}
          disabled={notConnected}
          style={{
            flex: 1, padding: '12px 16px', borderRadius: 'var(--r-full)',
            background: 'var(--cream)', border: '1.5px solid var(--sand)',
            color: 'var(--ink)', fontSize: 14,
          }}
        />
        <button onClick={handleSend} disabled={!canSend} aria-label="Send" style={{
          width: 44, height: 44, borderRadius: '50%',
          background: canSend ? 'var(--spice)' : 'var(--sand)',
          border: 'none', color: canSend ? 'var(--white)' : 'var(--ink4)',
          fontSize: 18, cursor: canSend ? 'pointer' : 'default', transition: 'all .18s',
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
  const {
    conversations, conversationsState, messages, hasMore, threadState, chatError, myId,
    setActiveUserId, loadConversations, refreshConversations, loadMessages, loadOlder, sendMessage, dismissChatError,
  } = useChat();

  const partnerId = routeUserId ? Number(routeUserId) : null;
  const validRoute = partnerId !== null && Number.isInteger(partnerId) && partnerId > 0;
  const listReady = conversationsState === 'ready';
  const convo = validRoute ? conversations.find(c => c.user_id === partnerId) : undefined;
  const inList = !!convo;

  // Opening a thread: tell the chat context (unread bookkeeping) and reset stale errors.
  useEffect(() => {
    if (!validRoute) return undefined;
    setActiveUserId(partnerId);
    dismissChatError();
    return () => setActiveUserId(null);
  }, [partnerId, validRoute, setActiveUserId, dismissChatError]);

  // Online status comes with the conversation list, which is otherwise loaded once: refresh it
  // while a thread is open so the call buttons follow whether the partner is online. Once when the
  // thread opens (if the list is already there), then every 30 s while the tab is visible; after
  // a failure the interval doubles (up to 5 min) instead of giving up.
  const listReadyRef = useRef(false);
  listReadyRef.current = listReady;
  useEffect(() => {
    if (!validRoute) return undefined;
    let timer = null;
    let delay = CONVERSATION_POLL_MS;
    let stopped = false;
    const run = async () => {
      if (stopped) return;
      if (!document.hidden) {
        const ok = await refreshConversations();
        if (stopped) return;
        delay = ok ? CONVERSATION_POLL_MS : Math.min(delay * 2, 5 * 60 * 1000);
      }
      timer = setTimeout(run, delay);
    };
    if (listReadyRef.current) run();
    else timer = setTimeout(run, delay);
    return () => { stopped = true; clearTimeout(timer); };
  }, [validRoute, partnerId, refreshConversations]);

  // Load history (which also marks it read) only for someone we are connected to, once the
  // conversation list says so: asking for anyone else is a guaranteed 403 the browser logs.
  useEffect(() => {
    if (validRoute && listReady && inList) loadMessages(partnerId);
  }, [partnerId, validRoute, listReady, inList, loadMessages]);

  useEffect(() => {
    if (!validRoute && routeUserId) navigate('/chat', { replace: true });
  }, [validRoute, routeUserId, navigate]);

  if (!validRoute) {
    return (
      <ChatListView
        conversations={conversations}
        state={conversationsState}
        onSelect={id => navigate(`/chat/${id}`)}
        onRetry={loadConversations}
      />
    );
  }

  // Until the list is known we can't tell "not connected" from "not loaded yet": show the
  // loading cup, or the list's error + retry if it failed. Never claim "not connected" on a failure.
  if (!inList && !listReady) {
    return (
      <ChatListView
        conversations={[]}
        state={conversationsState === 'error' ? 'error' : 'loading'}
        onSelect={id => navigate(`/chat/${id}`)}
        onRetry={loadConversations}
      />
    );
  }

  const state = inList ? threadState[partnerId] : 'forbidden';
  const notConnected =
    !inList ||
    state === 'forbidden' ||
    (chatError?.code === 'not_connected' && chatError.to === partnerId);
  const error = chatError && (chatError.to == null || chatError.to === partnerId) ? chatError : null;

  return (
    <ChatThreadView
      key={partnerId}
      partner={convo || { user_id: partnerId }}
      messages={messages[partnerId] || []}
      myId={myId}
      state={state}
      hasMore={!!hasMore[partnerId]}
      error={error}
      notConnected={notConnected}
      onSend={sendMessage}
      onBack={() => navigate('/chat')}
      onLoadOlder={() => loadOlder(partnerId)}
      onRetry={() => loadMessages(partnerId)}
      onDismissError={dismissChatError}
    />
  );
}
