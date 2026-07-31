import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { login as loginApi, logout as logoutApi, refreshToken, getMe } from '../api/authApi';
import { setClientToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const accessTokenRef = useRef(null);
  accessTokenRef.current = accessToken;

  // Keep axios client in sync with the current token
  useEffect(() => {
    setClientToken(accessToken);
  }, [accessToken]);

  // Runs once when the app first loads — tries to restore session
  useEffect(() => {
    refreshToken()
      .then(async (data) => {
        setAccessToken(data.access_token);
        const me = await getMe(data.access_token);
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
    setAccessToken(data.access_token);
    const me = await getMe(data.access_token);
    setUser(me);
    return me;
  }

  async function logout() {
    await logoutApi(accessToken);
    setAccessToken(null);
    setUser(null);
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
