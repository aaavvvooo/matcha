const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000"

export async function register(full_name, username, email, password, confirm_password) {
  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ full_name, username, email, password, confirm_password }),
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.detail || 'Registration failed');
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
  if (!res.ok) throw new Error(json.detail || 'Login failed');
  return json;
}

export async function logout(accessToken) {
  const res = await fetch(`${BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.detail || 'Logout failed');
  return json;
}

export async function refreshToken() {
  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.detail || 'Session expired');
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
  if (!res.ok) throw new Error(json.detail || 'Verification failed');
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
  if (!res.ok) throw new Error(json.detail || 'Request failed');
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
  if (!res.ok) throw new Error(json.detail || 'Reset failed');
  return json;
}

export async function getMe(accessToken) {
  const res = await fetch(`${BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.detail || 'Unauthorized');
  return json;
}