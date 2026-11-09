// FastAPI sends `detail` as a string, or as a list of validation errors (422).
export function apiError(err, fallback) {
  const d = err?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d.length) return d.map(e => e?.msg).filter(Boolean).join('; ') || fallback;
  return fallback;
}
