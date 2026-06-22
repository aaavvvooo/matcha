import { useLocation, useNavigate } from 'react-router-dom';
import { useNotifications } from '../../context/NotificationContext';

const NAV_ITEMS = [
  { path: '/browse',       icon: '◎', label: 'Discover' },
  { path: '/search',       icon: '⊙', label: 'Search' },
  { path: '/matches',      icon: '♡', label: 'Matches' },
  { path: '/chat',         icon: '✉', label: 'Chat' },
  { path: '/profile/edit', icon: '◉', label: 'Profile' },
];

function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();

  return (
    <div style={{
      display: 'flex',
      borderTop: '1.5px solid var(--sand)',
      background: 'var(--white)',
      flexShrink: 0,
    }}>
      {NAV_ITEMS.map(item => {
        const active = location.pathname === item.path ||
          (item.path === '/chat' && location.pathname.startsWith('/chat'));
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '10px 4px 8px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: active ? 'var(--spice)' : 'var(--ink4)',
              transition: 'color .15s',
              position: 'relative',
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>{item.icon}</span>
            <span style={{ fontSize: 10, fontWeight: active ? 600 : 400 }}>{item.label}</span>
            {item.path === '/matches' && unreadCount > 0 && (
              <div style={{
                position: 'absolute',
                top: 6,
                right: '50%',
                marginRight: -18,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: 'var(--rose)',
                color: '#fff',
                fontSize: 9,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid var(--white)',
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default BottomNav;
