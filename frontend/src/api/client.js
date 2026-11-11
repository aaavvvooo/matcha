import axios from 'axios'

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000'

// This module is the single owner of the access token. AuthContext sets it on login/logout and
// mirrors every change into React state via onTokenChange; the WebSocket reads it with
// getClientToken() each time it connects. The refresh token never reaches JS (httpOnly cookie).
let _token = null
// Bumped every time the session ends locally, so a refresh still in flight at that moment
// can't put a token back (late refreshes must not re-sign-in a user who just logged out).
let _epoch = 0
// Local time the current token was set (see the request interceptor's proactive refresh).
let _tokenSetAt = 0
const PROACTIVE_REFRESH_MIN_AGE_MS = 60 * 1000
const _listeners = new Set()

function _emit() {
  _listeners.forEach(listener => listener(_token))
}

export function setClientToken(token) {
  if (token === _token) return
  if (!token) _epoch += 1
  _token = token
  _tokenSetAt = Date.now()
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

// The JWT's expiry as epoch milliseconds, or null when it is missing or unreadable.
export function tokenExpiryMs(token) {
  if (!token) return null
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const { exp } = JSON.parse(atob(part))
    return typeof exp === 'number' ? exp * 1000 : null
  } catch {
    return null
  }
}

// True when the JWT is missing, unreadable, or expires within `marginSeconds`.
export function tokenExpiresSoon(token, marginSeconds = 30) {
  const expiry = tokenExpiryMs(token)
  return expiry === null || expiry - Date.now() < marginSeconds * 1000
}

const client = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // always send the refresh_token cookie
})

// Attach the Bearer token to every request. A token about to expire is refreshed first (same
// single-flight call), so an idle tab's next request doesn't hit a 401 that the browser would log.
// At most once a minute per token, so a client clock running ahead can't turn every request
// into a refresh; anything the pre-check misses still goes through the 401 path below.
client.interceptors.request.use(async (config) => {
  if (_token && tokenExpiresSoon(_token) && Date.now() - _tokenSetAt > PROACTIVE_REFRESH_MIN_AGE_MS) {
    try {
      await refreshAccessToken()
    } catch {
      // Session gone or offline: send as is and let the response interceptor decide.
    }
  }
  if (_token) config.headers.Authorization = `Bearer ${_token}`
  return config
})

function noSessionError() {
  const err = new Error('No session')
  err.response = { status: 401 }
  return err
}

// Single-flight refresh — the only /auth/refresh caller in the app (boot restore, axios 401s
// and the WebSocket all come here). The server rotates the refresh cookie on every use, so a
// second parallel call would present a revoked cookie and end the session.
let _refreshPromise = null

export function refreshAccessToken() {
  if (!_refreshPromise) {
    const epoch = _epoch
    _refreshPromise = axios
      .post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true })
      .then((res) => {
        // Signed out while this was in flight: drop the result.
        if (epoch !== _epoch) throw noSessionError()
        if (res.status === 204 || !res.data?.access_token) {
          // 204: no refresh cookie, so there is no session. Same outcome as a 401.
          setClientToken(null)
          throw noSessionError()
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

// Resolves once any refresh in flight has settled (never rejects). Logout waits for it so the
// server revokes the refresh token after, not before, a concurrent rotation.
export function settleRefresh() {
  return _refreshPromise ? _refreshPromise.then(() => undefined, () => undefined) : Promise.resolve()
}

// On 401: refresh the token (shared with every other 401 in flight), then retry the original
client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config

    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true
      let token
      try {
        token = await refreshAccessToken()
      } catch (refreshError) {
        // Session over: back to sign-in. A transient refresh failure (offline, 429, 5xx)
        // surfaces as the original error so the page can show its own error state.
        if (refreshError?.response?.status === 401) window.location.href = '/login'
        return Promise.reject(error)
      }
      original.headers.Authorization = `Bearer ${token}`
      return client(original)
    }

    return Promise.reject(error)
  }
)

export default client
