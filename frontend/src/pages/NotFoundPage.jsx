import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MatchaCup from '../components/ui/MatchaCup';

// Shown for any URL no route matches (Layout already supplies the header, <main> and footer).
function NotFoundPage() {
  const { user } = useAuth();
  return (
    <div className="status-card">
      <div className="status-card__inner">
        <MatchaCup size={84} mood="sad"/>
        <h1 className="status-card__title">Page not found</h1>
        <p className="status-card__body">The page you are looking for doesn’t exist or has moved.</p>
        <Link to={user ? '/browse' : '/'} className="btn btn-primary">
          {user ? 'Back to Discover' : 'Back to home'}
        </Link>
      </div>
    </div>
  );
}

export default NotFoundPage;
