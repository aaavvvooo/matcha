import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import BottomNav from './BottomNav';
import Header from './Header';
import Footer from './Footer';
import './Layout.css';

const PUBLIC_PATHS = ['/', '/login', '/register', '/verify-email', '/forgot-password', '/reset-password'];

// The landing page draws its own <header> and <footer>.
const OWN_CHROME_PATHS = ['/'];

function Layout({ children }) {
  const location = useLocation();
  const { user } = useAuth();

  const isPublic = PUBLIC_PATHS.includes(location.pathname);
  const showNav = user && !isPublic;
  const showChrome = !OWN_CHROME_PATHS.includes(location.pathname);
  // Pages with their own chrome also provide their own <main>; nesting landmarks breaks them.
  const Content = showChrome ? 'main' : 'div';

  return (
    <div className="app-shell">
      {showNav && <BottomNav />}
      <div className="app-shell-column">
        {showChrome && <Header inApp={showNav} />}
        <Content className="app-shell-content">
          {children}
        </Content>
        {showChrome && <Footer />}
      </div>
    </div>
  );
}

export default Layout;
