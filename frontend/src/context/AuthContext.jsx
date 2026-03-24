import { createContext, useContext, useState, useEffect } from 'react';
import { login as loginApi, logout as logoutApi, refreshToken, getMe } from '../api/authApi';
import { setClientToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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
  }

  async function logout() {
    await logoutApi(accessToken);
    setAccessToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ accessToken, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
