const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000"

// FastAPI sends `detail` as a string, or as a list of validation errors (422).
function errorMessage(json, fallback) {
  const d = json?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d.length) return d.map(e => e.msg).filter(Boolean).join('; ') || fallback;
  return fallback;
}

export async function register(first_name, last_name, username, email, password, confirm_password) {
  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ first_name, last_name, username, email, password, confirm_password }),
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(errorMessage(json, 'Registration failed'));
  return json;
}

export async function login(username, password) {
  const body = new URLSearchParams({ username, password });
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(errorMessage(json, 'Login failed'));
  return json;
}

export async function logout(accessToken) {
  const res = await fetch(`${BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(errorMessage(json, 'Logout failed'));
  return json;
}

// Resolves with {access_token, token_type}, or null when there is no session to restore
// (204: no refresh cookie). Rejects when the cookie is present but rejected (401) or the call fails.
export async function refreshToken() {
  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  if (res.status === 204) return null;
  const json = await res.json();
  if (!res.ok) throw new Error(errorMessage(json, 'Session expired'));
  return json;
}

export async function verifyEmail(token) {
  const res = await fetch(`${BASE_URL}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(errorMessage(json, 'Verification failed'));
  return json;
}

export async function forgotPassword(username_or_email) {
  const res = await fetch(`${BASE_URL}/auth/forget-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username_or_email }),
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(errorMessage(json, 'Request failed'));
  return json;
}

export async function resetPassword(token, password) {
  const res = await fetch(`${BASE_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(errorMessage(json, 'Reset failed'));
  return json;
}

export async function getMe(accessToken) {
  const res = await fetch(`${BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(errorMessage(json, 'Unauthorized'));
  return json;
}