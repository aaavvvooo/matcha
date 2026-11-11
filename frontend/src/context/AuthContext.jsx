import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { login as loginApi, logout as logoutApi, getMe } from '../api/authApi';
import {
  getClientToken,
  onTokenChange,
  refreshAccessToken,
  setClientToken,
  settleRefresh,
} from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Mirror of the API client's token (api/client.js owns it): login/logout set it there, and
  // refreshes by axios 401s or the WebSocket arrive here through onTokenChange. A null token
  // (logout, or a refresh the server rejected) is the end of the session.
  const [accessToken, setAccessToken] = useState(getClientToken);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => onTokenChange((token) => {
    setAccessToken(token);
    if (!token) setUser(null);
  }), []);

  // Runs once when the app first loads — tries to restore session through the client's
  // single-flight refresh (204/401 = no session; the OAuth callback page relies on this too).
  useEffect(() => {
    let restored = false;
    refreshAccessToken()
      .then(async (token) => {
        restored = true;
        const me = await getMe(token);
        setUser(me);
      })
      .catch(() => {
        // No session is fine. A token without a user (getMe failed) is not a usable session.
        if (restored) setClientToken(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  async function login(username, password) {
    const data = await loginApi(username, password);
    setClientToken(data.access_token);
    const me = await getMe(data.access_token);
    setUser(me);
    return me;
  }

  // Always end the local session, even if the server call fails (expired token,
  // network error) — logout must never leave the user stuck or throw to the caller.
  async function logout() {
    const token = getClientToken();
    // Signs out locally first: closes the socket and discards any refresh still in flight.
    setClientToken(null);
    try {
      // Let a concurrent rotation land first, so the server revokes the newest refresh token.
      await settleRefresh();
      await logoutApi(token);
    } catch {
      // server-side blacklisting failed; the token still expires on its own
    }
  }

  // Re-fetches /auth/me — used to revalidate has_profile before entering a
  // protected route, since profile deletion isn't reflected in stale state.
  const refreshUser = useCallback(async () => {
    const token = getClientToken();
    if (!token) return null;
    const me = await getMe(token);
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
