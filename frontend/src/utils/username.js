// Mirrors the server rule (backend/application/schema/fields.py USERNAME_PATTERN). UX only: the
// server re-validates every write.
export const USERNAME_RE = /^[A-Za-z0-9_.-]{3,30}$/;
export const USERNAME_HINT = '3–30 characters: letters, digits, dot, dash or underscore.';
