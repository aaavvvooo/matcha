import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import './Header.css';

function Header() {
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <header className="header">
      <div className="container">
        <nav className="navbar">
          <Link to="/" className="nav-logo">matcha</Link>

          {user && (
            <ul className="nav-menu">
              <li><Link to="/browse">Browse</Link></li>
              <li><Link to="/search">Search</Link></li>
              <li><Link to="/profile/me">Profile</Link></li>
              <li><Link to="/chat">Chat</Link></li>
            </ul>
          )}

          <div className="nav-actions">
            {user ? (
              <>
                <Link to="/notifications" className="btn-notif" title="Notifications">
                  &#9825;
                  {unreadCount > 0 && (
                    <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                  )}
                </Link>
                <span className="nav-username">{user.user?.username ?? user.username}</span>
                <button className="btn nav-btn-logout" onClick={handleLogout}>Logout</button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost nav-btn">Sign in</Link>
                <Link to="/register" className="btn btn-primary nav-btn">Get started</Link>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}

export default Header;
