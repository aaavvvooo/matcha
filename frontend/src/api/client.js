import axios from 'axios'

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000'

// Module-level token — set by AuthContext via setClientToken()
let _token = null

export function setClientToken(token) {
  _token = token
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

let isRefreshing = false
let queue = []

// On 401: refresh the token, retry all queued requests, then retry the original
client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true

      if (isRefreshing) {
        // Another refresh is in flight — queue this request
        return new Promise((resolve, reject) => queue.push({ resolve, reject }))
          .then((token) => {
            original.headers.Authorization = `Bearer ${token}`
            return client(original)
          })
      }

      isRefreshing = true
      try {
        const res = await axios.post(
          `${BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        )
        const newToken = res.data.access_token
        _token = newToken
        queue.forEach(({ resolve }) => resolve(newToken))
        queue = []
        original.headers.Authorization = `Bearer ${newToken}`
        return client(original)
      } catch {
        queue.forEach(({ reject }) => reject())
        queue = []
        _token = null
        window.location.href = '/login'
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

export default client
