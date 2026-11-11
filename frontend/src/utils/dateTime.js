// Dates travel as ISO 8601 UTC instants and are always shown in the viewer's own timezone.

export function formatDateTime(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// "YYYY-MM-DDTHH:mm" in local time, the format <input type="datetime-local"> uses.
export function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// The value of a datetime-local input is local time without an offset: reading it with
// `new Date(value)` interprets it in the viewer's timezone, and toISOString() makes it UTC.
// Returns null for an empty or unreadable value.
export function localInputToIso(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
