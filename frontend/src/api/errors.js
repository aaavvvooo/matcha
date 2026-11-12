// Human-readable text for a failed API call: the server's safe `detail` (FastAPI sends a
// string, or a list of validation errors for a 422), else the fallback.
export function apiError(err, fallback) {
  const d = err?.response?.data?.detail;
  if (typeof d === 'string' && d) return d;
  if (Array.isArray(d) && d.length) {
    const msgs = d.map(e => e?.msg).filter(Boolean);
    if (msgs.length) return msgs.join('; ');
  }
  if (err?.response?.status === 429) return 'Too many requests, please wait a moment';
  return fallback;
}
