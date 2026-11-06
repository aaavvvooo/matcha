import { Link, useNavigate } from 'react-router-dom';
import { Bell, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import MatchaCup from '../ui/MatchaCup';
import './Header.css';

function Header({ inApp }) {
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  const username = user?.username;

  return (
    <header className={`site-header${inApp ? ' site-header--app' : ''}`}>
      <Link to={user ? '/browse' : '/'} className="site-header-brand" aria-label="Matcha home">
        <MatchaCup size={24} mood="happy" animate={false} />
        Matcha
      </Link>

      <div className="site-header-actions">
        {user ? (
          <>
            <Link
              to="/notifications"
              className="site-header-icon"
              aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            >
              <Bell size={20} strokeWidth={1.75} />
              {unreadCount > 0 && (
                <span className="site-header-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
              )}
            </Link>
            {username && <span className="site-header-user">{username}</span>}
            <button type="button" className="site-header-logout" onClick={handleLogout}>
              <LogOut size={16} strokeWidth={1.75} />
              <span>Log out</span>
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="site-header-link">Sign in</Link>
            <Link to="/register" className="site-header-cta">Get started</Link>
          </>
        )}
      </div>
    </header>
  );
}

export default Header;
