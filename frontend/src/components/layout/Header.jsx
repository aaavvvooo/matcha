import { Link } from 'react-router-dom';
import './Header.css';

function Header() {
  return (
    <header className="header">
      <div className="container">
        <nav className="navbar">
          <div className="logo">
            <Link to="/">
              <h1>Matcha</h1>
            </Link>
          </div>
          <ul className="nav-menu">
            <li><Link to="/">Home</Link></li>
            <li><Link to="/browse">Browse</Link></li>
            <li><Link to="/profile/me">Profile</Link></li>
            <li><Link to="/chat">Chat</Link></li>
          </ul>
          <div className="nav-actions">
            <button className="btn-notification">🔔</button>
            <button className="btn-login">Login</button>
          </div>
        </nav>
      </div>
    </header>
  );
}

export default Header;
