import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  MessageCircle, Bell, Sparkle, Eye, PartyPopper, HeartCrack,
  CalendarHeart, CalendarCheck, CalendarX, CalendarClock,
} from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';
import { useChat } from '../../context/ChatContext';
import Avatar from '../../components/ui/Avatar';
import { displayName } from '../../utils/displayName';
import { notificationText, notificationLink } from '../../utils/notificationInfo';
import DatesPanel from '../dates/DatesPanel';

const NOTIF_ICONS = {
  like:    <Sparkle size={16} fill="currentColor"/>,
  view:    <Eye size={16}/>,
  match:   <PartyPopper size={16}/>,
  message: <MessageCircle size={16}/>,
  unlike:  <HeartCrack size={16}/>,
  date_proposed:  <CalendarHeart size={16}/>,
  date_accepted:  <CalendarCheck size={16}/>,
  date_declined:  <CalendarX size={16}/>,
  date_cancelled: <CalendarX size={16}/>,
  date_reminder:  <CalendarClock size={16}/>,
};

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

export default function MatchesPage() {
  // '/dates' shows the Dates tab; on '/matches' the tab is local state.
  const [localTab, setLocalTab] = useState('chats');
  const location = useLocation();
  const tab = location.pathname === '/dates' ? 'dates' : localTab;
  const { notifications, unreadCount, clearUnread } = useNotifications();
  const { conversations, loadConversations } = useChat();
  const navigate = useNavigate();

  useEffect(() => { loadConversations().catch(() => {}); }, [loadConversations]);

  const unread = unreadCount;

  function selectLocalTab(next) {
    setLocalTab(next);
    if (location.pathname !== '/matches') navigate('/matches');
  }

  function handleNotifTab() {
    selectLocalTab('notifs');
    clearUnread();
  }

  return (
    <div className="screen" style={{ height: '100%', background: 'var(--cream)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', background: 'var(--white)', borderBottom: '1.5px solid var(--cream3)', flexShrink: 0 }}>
        <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 14 }}>Matches</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            ['chats', 'Chats', () => selectLocalTab('chats')],
            ['dates', 'Dates', () => navigate('/dates')],
            ['notifs', `Notifications${unread ? ` (${unread})` : ''}`, handleNotifTab],
          ].map(([id, label, handler]) => (
            <button key={id} onClick={handler} style={{
              padding: '7px 16px',
              borderRadius: 'var(--r-full)',
              background: tab === id ? 'var(--spice)' : 'transparent',
              border: `1.5px solid ${tab === id ? 'var(--spice)' : 'var(--sand)'}`,
              color: tab === id ? '#fff' : 'var(--ink2)',
              fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all .15s',
              fontFamily: 'DM Sans, sans-serif',
            }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>

        {/* Chats tab */}
        {tab === 'chats' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(conversations || []).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                <MessageCircle size={44} strokeWidth={1.5} color="var(--sand)" style={{ marginBottom: 12 }}/>
                <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 20, color: 'var(--ink2)', marginBottom: 8 }}>No conversations yet</div>
                <div style={{ fontSize: 14, color: 'var(--ink4)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>Like someone and wait for a match to start chatting <Sparkle size={13}/></div>
              </div>
            ) : (
              conversations.map(c => {
                const name = displayName(c, 'Unknown');
                const hasUnread = (c.unread_count || 0) > 0;
                return (
                  <div key={c.user_id} onClick={() => navigate(`/chat/${c.user_id}`)} style={{
                    padding: '14px 16px',
                    background: 'var(--white)',
                    borderRadius: 'var(--r-md)',
                    border: `1.5px solid ${hasUnread ? 'var(--sand)' : 'var(--cream3)'}`,
                    display: 'flex', gap: 14, alignItems: 'center',
                    cursor: 'pointer',
                    boxShadow: hasUnread ? 'var(--shadow-sm)' : 'none',
                    transition: 'transform .15s',
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
                    {hasUnread && <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--spice)', flexShrink: 0 }}/>}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Dates tab */}
        {tab === 'dates' && <DatesPanel />}

        {/* Notifications tab */}
        {tab === 'notifs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {notifications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                <Bell size={44} strokeWidth={1.5} color="var(--sand)" style={{ marginBottom: 12 }}/>
                <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 20, color: 'var(--ink2)' }}>No notifications yet</div>
              </div>
            ) : (
              notifications.map(n => {
                const icon = NOTIF_ICONS[n.type] || <Sparkle size={16}/>;
                const name = n.from_username || 'Someone';
                const text = notificationText(n.type);
                const link = notificationLink(n.type);
                // A real link (keyboard focusable, middle-click) when the notification leads somewhere.
                const Row = link ? Link : 'div';
                return (
                  <Row key={n.id} {...(link ? { to: link } : {})} style={{
                    textDecoration: 'none', color: 'inherit',
                    padding: '13px 16px',
                    background: n.is_read ? 'var(--white)' : 'var(--cream2)',
                    borderRadius: 'var(--r-md)',
                    border: `1.5px solid ${n.is_read ? 'var(--cream3)' : 'var(--sand)'}`,
                    display: 'flex', gap: 12, alignItems: 'center',
                    boxShadow: n.is_read ? 'none' : 'var(--shadow-sm)',
                  }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%',
                      background: n.is_read ? 'var(--cream3)' : 'var(--spice)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: n.is_read ? 'var(--ink3)' : '#fff', flexShrink: 0,
                    }}>{icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, color: 'var(--ink)' }}>
                        <b>{name}</b> {text}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 2 }}>{timeAgo(n.created_at)}</div>
                    </div>
                    {!n.is_read && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--spice)', flexShrink: 0 }}/>}
                  </Row>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
