// "First Last" for a user-like object, falling back to the username.
export function displayName(u, fallback = 'Unknown') {
  const full = [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim();
  return full || u?.username || fallback;
}
