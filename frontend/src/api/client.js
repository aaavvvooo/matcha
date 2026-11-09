import axios from 'axios'

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000'

// Module-level token — set by AuthContext via setClientToken()
let _token = null
// AuthContext's setter, so a refresh done here also updates React state.
let _onTokenRefreshed = null

export function setClientToken(token) {
  _token = token
}

export function getClientToken() {
  return _token
}

export function onTokenRefreshed(listener) {
  _onTokenRefreshed = listener
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

// Single-flight: concurrent callers share one /auth/refresh call, since the
// server rotates the refresh cookie and a second parallel call would fail.
let _refreshing = null

export function refreshAccessToken() {
  if (!_refreshing) {
    _refreshing = axios
      .post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true })
      .then((res) => {
        _token = res.data.access_token
        _onTokenRefreshed?.(_token)
        return _token
      })
      .finally(() => {
        _refreshing = null
      })
  }
  return _refreshing
}

// On 401: refresh the token once, then retry the original request
client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config

    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true
      let token
      try {
        token = await refreshAccessToken()
      } catch {
        _token = null
        window.location.href = '/login'
        return Promise.reject(error)
      }
      original.headers.Authorization = `Bearer ${token}`
      return client(original)
    }

    return Promise.reject(error)
  }
)

export default client
