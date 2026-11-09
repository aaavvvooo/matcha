import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { login as loginApi, logout as logoutApi, getMe } from '../api/authApi';
import { setClientToken, refreshAccessToken, onTokenRefreshed } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const accessTokenRef = useRef(null);
  accessTokenRef.current = accessToken;
  // True from the start of logout(); a re-render mid-logout would otherwise put
  // the old token back into accessTokenRef before the guard below reads it.
  const loggingOutRef = useRef(false);

  // Keep axios client in sync with the current token
  useEffect(() => {
    setClientToken(accessToken);
  }, [accessToken]);

  // A refresh done by the axios client (on a 401) or the WebSocket must reach
  // React state too, or logout/getMe would keep using the expired token.
  // Ignored once signed out, so a refresh still in flight at logout can't
  // bring the session back.
  useEffect(() => {
    onTokenRefreshed((token) => {
      if (accessTokenRef.current && !loggingOutRef.current) setAccessToken(token);
    });
    return () => onTokenRefreshed(null);
  }, []);

  // Runs once when the app first loads — tries to restore session
  useEffect(() => {
    refreshAccessToken()
      .then(async (token) => {
        setAccessToken(token);
        const me = await getMe(token);
        setUser(me);
      })
      .catch(() => {
        // No active session, that's fine
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  async function login(username, password) {
    const data = await loginApi(username, password);
    loggingOutRef.current = false;
    setAccessToken(data.access_token);
    const me = await getMe(data.access_token);
    setUser(me);
    return me;
  }

  // Always end the local session, even if the server call fails (expired token,
  // network error) — logout must never leave the user stuck or throw to the caller.
  async function logout() {
    loggingOutRef.current = true; // stop late refreshes from re-signing in
    try {
      await logoutApi(accessToken);
    } catch {
      // server-side blacklisting failed; the token still expires on its own
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }

  // Re-fetches /auth/me — used to revalidate has_profile before entering a
  // protected route, since profile deletion isn't reflected in stale state.
  const refreshUser = useCallback(async () => {
    if (!accessTokenRef.current) return null;
    const me = await getMe(accessTokenRef.current);
    setUser(me);
    return me;
  }, []);

  return (
    <AuthContext.Provider value={{ accessToken, user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
