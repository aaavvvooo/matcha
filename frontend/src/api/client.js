import axios from 'axios'

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000'

// This module owns the access token. AuthContext mirrors it into React state via
// onTokenChange; the WebSocket reads it with getClientToken() each time it connects.
let _token = null
const _listeners = new Set()

function _emit() {
  _listeners.forEach(listener => listener(_token))
}

export function setClientToken(token) {
  if (token === _token) return
  _token = token
  _emit()
}

export function getClientToken() {
  return _token
}

// Called with the new token (or null) whenever it changes; returns the unsubscribe function.
export function onTokenChange(listener) {
  _listeners.add(listener)
  return () => _listeners.delete(listener)
}

// True when the JWT is missing, unreadable, or expires within `marginSeconds`.
export function tokenExpiresSoon(token, marginSeconds = 30) {
  if (!token) return true
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const { exp } = JSON.parse(atob(part))
    return typeof exp !== 'number' || exp * 1000 - Date.now() < marginSeconds * 1000
  } catch {
    return true
  }
}

const client = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // always send the refresh_token cookie
})

// Attach Bearer token to every request
client.interceptors.request.use((config) => {
  if (_token) config.headers.Authorization = `Bearer ${_token}`
  return config
})

// Single-flight refresh: the refresh cookie rotates on every use, so concurrent
// callers (axios retries, the WebSocket) must share one request.
let _refreshPromise = null

export function refreshAccessToken() {
  if (!_refreshPromise) {
    _refreshPromise = axios
      .post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true })
      .then((res) => {
        if (res.status === 204 || !res.data?.access_token) {
          // 204: the refresh cookie is gone, so there is no session. Same outcome as a 401.
          setClientToken(null)
          const err = new Error('No session')
          err.response = { status: 401 }
          throw err
        }
        setClientToken(res.data.access_token)
        return res.data.access_token
      })
      .catch((err) => {
        // 401: the session is gone, AuthContext falls back to the logged-out flow.
        // Offline / rate-limited: keep the token, the caller may retry.
        if (err.response?.status === 401) setClientToken(null)
        throw err
      })
      .finally(() => {
        _refreshPromise = null
      })
  }
  return _refreshPromise
}

// On 401: refresh the token (shared with every other 401 in flight), then retry the original
client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config

    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true
      try {
        const newToken = await refreshAccessToken()
        original.headers.Authorization = `Bearer ${newToken}`
        return client(original)
      } catch {
        window.location.href = '/login'
      }
    }

    return Promise.reject(error)
  }
)

export default client
