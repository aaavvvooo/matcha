import { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const PROFILE_EXEMPT_PATHS = ['/profile/setup'];

function Spinner() {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cream)' }}>
      <div style={{ fontSize: 14, color: 'var(--ink4)', fontStyle: 'italic', fontFamily: 'DM Sans, sans-serif' }}>Loading…</div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { accessToken, user, loading, refreshUser } = useAuth();
  // Keyed on sign-in state, not the token: a silent refresh must not re-run the profile
  // check, which shows the spinner and would unmount the page (and its live state).
  const signedIn = Boolean(accessToken);
  const location = useLocation();
  const exempt = PROFILE_EXEMPT_PATHS.includes(location.pathname);
  const [checkingProfile, setCheckingProfile] = useState(!exempt);
  const [hasProfile, setHasProfile] = useState(true);

  // Revalidate has_profile when the authenticated user changes (login/logout),
  // not on every route navigation — profile edits update `user` directly.
  useEffect(() => {
    if (exempt || !signedIn) {
      setCheckingProfile(false);
      return;
    }
    setCheckingProfile(true);
    refreshUser()
      .then(me => setHasProfile(Boolean(me?.has_profile)))
      .catch(() => setHasProfile(true)) // network hiccup — don't lock the user out
      .finally(() => setCheckingProfile(false));
  }, [signedIn, user?.id, exempt, refreshUser]);

  if (loading || checkingProfile) return <Spinner />;
  if (!signedIn) return <Navigate to="/login" />;
  if (!exempt && !hasProfile) return <Navigate to="/profile/setup" />;

  return children;
}

export default ProtectedRoute;
