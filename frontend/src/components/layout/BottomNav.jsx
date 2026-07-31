import { useLocation, useNavigate } from 'react-router-dom';
import { Compass, Search, Heart, MessageCircle, CircleUser, LogOut } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import MatchaCup from '../ui/MatchaCup';
import './BottomNav.css';

function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();
  const { user, logout } = useAuth();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  const NAV_ITEMS = [
    { path: '/browse',                icon: Compass, label: 'Discover' },
    { path: '/search',                icon: Search, label: 'Search' },
    { path: '/matches',               icon: Heart, label: 'Matches' },
    { path: '/chat',                  icon: MessageCircle, label: 'Chat' },
    { path: user ? `/profile/${user.id}` : '/profile/settings', icon: CircleUser, label: 'Profile' },
  ];

  const isActive = (item) => location.pathname === item.path ||
    (item.path === '/chat' && location.pathname.startsWith('/chat')) ||
    (item.label === 'Profile' && location.pathname === '/profile/settings');

  return (
    <>
      {/* Mobile: bottom tab bar */}
      <div className="bottom-nav">
        {NAV_ITEMS.map(item => {
          const active = isActive(item);
          const Icon = item.icon;
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
              <Icon size={20} strokeWidth={active ? 2.25 : 1.75} fill={item.label === 'Matches' && active ? 'var(--spice)' : 'none'}/>
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

      {/* Desktop: left sidebar */}
      <div className="side-nav">
        <div className="side-nav-brand">
          <MatchaCup size={24} mood="happy" animate={false}/> Matcha
        </div>
        {NAV_ITEMS.map(item => {
          const active = isActive(item);
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`side-nav-item${active ? ' active' : ''}`}
            >
              <Icon size={18} strokeWidth={active ? 2.25 : 1.75} fill={item.label === 'Matches' && active ? 'var(--spice)' : 'none'} className="icon"/>
              <span>{item.label}</span>
              {item.path === '/matches' && unreadCount > 0 && (
                <div style={{
                  position: 'absolute',
                  top: 8,
                  right: 12,
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
                }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </div>
              )}
            </button>
          );
        })}

        <button onClick={handleLogout} className="side-nav-item side-nav-signout">
          <LogOut size={18} strokeWidth={1.75} className="icon"/>
          <span>Sign out</span>
        </button>
      </div>
    </>
  );
}

export default BottomNav;
