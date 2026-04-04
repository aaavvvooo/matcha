import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Header.css';

function Header() {
  const { user, logout } = useAuth();
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
              <li><Link to="/profile/me">Profile</Link></li>
              <li><Link to="/chat">Chat</Link></li>
            </ul>
          )}

          <div className="nav-actions">
            {user ? (
              <>
                <button className="btn-notif" title="Notifications">&#9825;</button>
                <span className="nav-username">{user.username}</span>
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
