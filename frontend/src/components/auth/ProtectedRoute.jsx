import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

function ProtectedRoute({ children }) {
  const { accessToken, loading } = useAuth();

  if (loading) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cream)' }}>
      <div style={{ fontSize: 14, color: 'var(--ink4)', fontStyle: 'italic', fontFamily: 'DM Sans, sans-serif' }}>Loading…</div>
    </div>
  );
  if (!accessToken) return <Navigate to="/login" />;

  return children;
}

export default ProtectedRoute;
