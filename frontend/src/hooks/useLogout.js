import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Ends the session and returns to the landing page. AuthContext.logout clears local state
// synchronously (before its server call) and never throws, so navigating in the same tick
// lands on the landing page without a detour through a protected route's /login redirect.
export function useLogout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return useCallback(async () => {
    const done = logout();
    navigate('/');
    await done;
  }, [logout, navigate]);
}
