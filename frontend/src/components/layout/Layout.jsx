import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import BottomNav from './BottomNav';

const PUBLIC_PATHS = ['/', '/login', '/register', '/verify-email', '/forgot-password', '/reset-password'];

function Layout({ children }) {
  const location = useLocation();
  const { user } = useAuth();

  const isPublic = PUBLIC_PATHS.includes(location.pathname);
  const showBottomNav = user && !isPublic;

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--cream)',
    }}>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {children}
      </div>
      {showBottomNav && <BottomNav />}
    </div>
  );
}

export default Layout;
