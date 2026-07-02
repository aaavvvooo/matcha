import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import BottomNav from './BottomNav';
import './Layout.css';

const PUBLIC_PATHS = ['/', '/login', '/register', '/verify-email', '/forgot-password', '/reset-password'];

function Layout({ children }) {
  const location = useLocation();
  const { user } = useAuth();

  const isPublic = PUBLIC_PATHS.includes(location.pathname);
  const showNav = user && !isPublic;

  return (
    <div className="app-shell">
      {showNav && <BottomNav />}
      <div className="app-shell-content">
        {children}
      </div>
    </div>
  );
}

export default Layout;
