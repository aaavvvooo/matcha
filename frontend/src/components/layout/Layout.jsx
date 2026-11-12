import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import BottomNav from './BottomNav';
import Header from './Header';
import Footer from './Footer';
import './Layout.css';

const PUBLIC_PATHS = ['/', '/login', '/register', '/verify-email', '/forgot-password', '/reset-password', '/oauth/callback'];

function Layout({ children }) {
  const location = useLocation();
  const { user } = useAuth();

  const isPublic = PUBLIC_PATHS.includes(location.pathname);
  const showNav = user && !isPublic;
  // The landing page draws its own <header>, <main> and <footer>.
  const showChrome = location.pathname !== '/';
  // Pages with their own chrome also provide their own <main>; nesting landmarks breaks them.
  const Content = showChrome ? 'main' : 'div';

  return (
    <div className="app-shell">
      <div className="app-shell-body">
        {showNav && <BottomNav />}
        <div className="app-shell-column">
          {showChrome && <Header inApp={showNav} />}
          <Content className="app-shell-content">
            {children}
          </Content>
        </div>
      </div>
      {/* Last in the shell: below the mobile tab bar, full width on desktop */}
      {showChrome && <Footer />}
    </div>
  );
}

export default Layout;
