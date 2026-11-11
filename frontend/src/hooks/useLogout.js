import { useCallback, startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Ends the session and returns to the landing page. AuthContext.logout clears local state
// synchronously (before its server call) and never throws. React Router applies location
// changes as a transition, so the sign-out is put in the same transition: one render lands on
// the landing page, instead of an urgent signed-out render of the current protected route
// redirecting to /login first.
export function useLogout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return useCallback(async () => {
    let done;
    startTransition(() => {
      done = logout();
      navigate('/');
    });
    await done;
  }, [logout, navigate]);
}
