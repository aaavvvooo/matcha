import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Sparkle, CalendarPlus, Phone, Plus, Video } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { useCall } from '../../context/CallContext';
import { usePageHeader } from '../../context/HeaderContext';
import ActionsMenu from '../../components/ui/ActionsMenu';
import MatchaCup from '../../components/ui/MatchaCup';
import Avatar from '../../components/ui/Avatar';
import Btn from '../../components/ui/Btn';
import ProposeDateForm from '../../components/dates/ProposeDateForm';
import ChatDates from '../../components/dates/ChatDates';
import { displayName } from '../../utils/displayName';
import './ChatPage.css';

const LIST_HEADER = { title: 'Messages' };
const CALLS = [
  { media: 'audio', label: 'Audio call', icon: Phone },
  { media: 'video', label: 'Video call', icon: Video },
];

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

function ChatListView({ conversations, activeId, state, onRetry }) {
  if (state === 'loading' || state === 'idle') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <MatchaCup size={60} mood="happy" animate={true} style={{ animation: 'float 3s ease-in-out infinite' }}/>
      </div>
    );
  }
  return (
    <div className="screen" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
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
              <Link key={c.user_id} to={`/chat/${c.user_id}`} className={`list-card${c.user_id === activeId ? ' chat-row--active' : ''}`} aria-current={c.user_id === activeId ? 'page' : undefined} style={{
                color: 'inherit',
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
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

// Avatar + name open the partner's profile (the server still applies blocks there).
function PartnerLink({ id, name, photoUrl, online, notConnected }) {
  return (
    <Link to={`/profile/${id}`} aria-label={`View ${name}'s profile`} className="chat-partner-link">
      <Avatar name={name} src={photoUrl} size={34} online={notConnected ? undefined : online}/>
      <span className="chat-partner-text">
        <span className="chat-partner-name">{name}</span>
        {!notConnected && (
          <span className={`chat-partner-status${online ? ' chat-partner-status--online' : ''}`}>
            {online ? '● online' : 'offline'}
          </span>
        )}
      </span>
    </Link>
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
  // Bumped only when a proposal succeeds, so the dates strip refetches once (not on dismiss).
  const [datesVersion, setDatesVersion] = useState(0);
  const { startCall, busy: inCall } = useCall();
  const endRef = useRef(null);
  const stickToEndRef = useRef(true);
  const name = displayName(partner, 'Unknown');
  const toggleProposing = useCallback(() => {
    setProposing(p => !p);
    setDateSent(false);
  }, []);
  usePageHeader(useMemo(() => ({
    title: name,
    onBack,
    titleNode: (
      <PartnerLink
        id={partner.user_id}
        name={name}
        photoUrl={partner.photo_url}
        online={partner.is_online}
        notConnected={notConnected}
      />
    ),
    tools: !notConnected && (
      <>
        {partner.is_online && CALLS.map(({ media, label, icon: Icon }) => (
          <button
            key={media}
            type="button"
            className="site-header-tool"
            onClick={() => startCall(partner, media)}
            disabled={inCall}
            aria-label={`Start ${label.toLowerCase()}`}
            title={inCall ? 'You are already in a call' : label}
          >
            <Icon size={18} strokeWidth={1.75} aria-hidden="true"/>
          </button>
        ))}
        <button
          type="button"
          className="site-header-tool"
          onClick={toggleProposing}
          aria-label="Propose a date"
          aria-expanded={proposing}
          title="Propose a date"
        >
          <CalendarPlus size={18} strokeWidth={1.75} aria-hidden="true"/>
        </button>
      </>
    ),
  }), [name, onBack, partner, notConnected, startCall, inCall, proposing, toggleProposing]));
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

  // Phones: the same actions as the header's on desktop, next to the message box.
  const actions = [
    ...(partner.is_online ? CALLS.map(({ media, label, icon }) => (
      { label, icon, onSelect: () => startCall(partner, media), disabled: inCall }
    )) : []),
    { label: proposing ? 'Close date proposal' : 'Propose a date', icon: CalendarPlus, onSelect: toggleProposing },
  ];

  return (
    <div className="screen" style={{ height: '100%', background: 'var(--cream2)', display: 'flex', flexDirection: 'column' }}>
      {/* Dates with this person and their status (missed, confirmed, …); refetched after proposing. */}
      {/* Hidden once not connected (unlike/block): no stale dates with someone you can't reach. */}
      {!notConnected && <ChatDates partnerId={partner.user_id} myId={myId} reloadKey={datesVersion}/>}

      {/* Propose a date (only while connected: the partner comes from the loaded conversations) */}
      {proposing && !notConnected && (
        <div style={{ flexShrink: 0, maxHeight: '70%', overflowY: 'auto' }}>
          <ProposeDateForm
            inviteeId={partner.user_id}
            inviteeName={name}
            onCancel={() => setProposing(false)}
            onDone={() => { setProposing(false); setDateSent(true); setDatesVersion(v => v + 1); }}
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
      <div className="chat-composer">
        {!notConnected && (
          <ActionsMenu className="mobile-only" label="Call or propose a date" icon={Plus} align="left" actions={actions}/>
        )}
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={notConnected ? 'Chat unavailable' : 'Say something…'}
          aria-label="Message"
          maxLength={MAX_BODY}
          disabled={notConnected}
          style={{
            flex: 1, minWidth: 0, padding: '12px 16px', borderRadius: 'var(--r-full)',
            background: 'var(--cream)', border: '1.5px solid var(--sand)',
            color: 'var(--ink)', fontSize: 14,
          }}
        />
        <button onClick={handleSend} disabled={!canSend} aria-label="Send" style={{
          width: 44, height: 44, flexShrink: 0, borderRadius: '50%',
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

  const backToList = useCallback(() => navigate('/chat'), [navigate]);

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

  const state = inList ? threadState[partnerId] : 'forbidden';
  const notConnected =
    !inList ||
    state === 'forbidden' ||
    (chatError?.code === 'not_connected' && chatError.to === partnerId);
  const error = chatError && (chatError.to == null || chatError.to === partnerId) ? chatError : null;
  const partner = useMemo(() => convo || { user_id: partnerId }, [convo, partnerId]);
  // Until the list is known we can't tell "not connected" from "not loaded yet": show the
  // loading cup, or the list's error + retry if it failed. Never claim "not connected" on a failure.
  const threadReady = validRoute && (inList || listReady);
  usePageHeader(threadReady ? undefined : LIST_HEADER);

  // Phones show one pane at a time, desktop both.
  return (
    <div className={`chat-layout${validRoute ? ' chat-layout--thread' : ''}`}>
      <div className="chat-list-pane">
        <ChatListView
          conversations={conversations}
          activeId={partnerId}
          state={conversationsState}
          onRetry={loadConversations}
        />
      </div>
      <div className="chat-thread-pane">
        {threadReady ? (
          <ChatThreadView
            key={partnerId}
            partner={partner}
            messages={messages[partnerId] || []}
            myId={myId}
            state={state}
            hasMore={!!hasMore[partnerId]}
            error={error}
            notConnected={notConnected}
            onSend={sendMessage}
            onBack={backToList}
            onLoadOlder={() => loadOlder(partnerId)}
            onRetry={() => loadMessages(partnerId)}
            onDismissError={dismissChatError}
          />
        ) : validRoute ? (
          <ChatListView
            conversations={[]}
            state={conversationsState === 'error' ? 'error' : 'loading'}
            onRetry={loadConversations}
          />
        ) : (
          <div className="chat-empty">
            <MatchaCup size={96} mood="happy" animate={true}/>
            <div className="chat-empty-title">Pick a conversation</div>
          </div>
        )}
      </div>
    </div>
  );
}
