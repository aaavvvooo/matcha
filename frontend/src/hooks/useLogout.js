import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Ends the session and returns to the landing page. AuthContext.logout clears
// local state even if the API call fails, so navigation always happens.
export function useLogout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return useCallback(async () => {
    await logout();
    navigate('/');
  }, [logout, navigate]);
}
