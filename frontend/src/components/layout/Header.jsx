import { Link, NavLink } from 'react-router-dom';
import { ArrowLeft, Bell, LogOut, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { usePageHeaderConfig } from '../../context/HeaderContext';
import { useLogout } from '../../hooks/useLogout';
import MatchaCup from '../ui/MatchaCup';
import './Header.css';

function Header({ inApp }) {
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const handleLogout = useLogout();
  const page = usePageHeaderConfig();

  const hasPhoneTitle = Boolean(page?.title) && page.phoneTitle !== false;
  const isClear = Boolean(page?.overlay && !page.solid);
  const className = [
    'site-header',
    inApp && 'site-header--app',
    page?.onBack && 'site-header--back',
    page?.overlay && 'site-header--overlay',
    isClear && 'site-header--clear',
    hasPhoneTitle && !isClear && 'site-header--titled',
  ].filter(Boolean).join(' ');

  return (
    <header className={className}>
      <div className="site-header-lead">
        {page?.onBack && (
          <button type="button" className="site-header-back" aria-label="Back" onClick={page.onBack}>
            <ArrowLeft size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
        <Link to={user ? '/browse' : '/'} className="site-header-brand" aria-label="Matcha home">
          <MatchaCup size={24} mood="happy" animate={false} />
          <span className="site-header-word">Matcha</span>
        </Link>
        {page?.title && <h1 className={`site-header-title${hasPhoneTitle ? '' : ' desktop-only'}`}>{page.titleNode || page.title}</h1>}
      </div>

      {page?.tools && <div className="site-header-tools desktop-only">{page.tools}</div>}

      <div className="site-header-actions">
        {user ? (
          <>
            <NavLink to="/profile/settings" className="site-header-icon" aria-label="Settings">
              <Settings size={20} strokeWidth={1.75} aria-hidden="true" />
            </NavLink>
            <NavLink
              to="/notifications"
              className="site-header-icon"
              aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            >
              <Bell size={20} strokeWidth={1.75} aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="site-header-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
              )}
            </NavLink>
            <button type="button" className="site-header-logout" aria-label="Log out" onClick={handleLogout}>
              <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
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
