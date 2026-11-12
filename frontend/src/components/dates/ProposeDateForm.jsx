import { useState, useMemo } from 'react'
import { proposeDate, MAX_TITLE, MAX_PLACE, MAX_NOTE } from '../../api/datesApi'
import { localInputToIso, toLocalInputValue } from '../../utils/dateTime'
import { apiError } from '../../api/errors'
import Btn from '../ui/Btn'

const fieldStyle = {
  padding: '11px 14px', borderRadius: 'var(--r-sm)', background: 'var(--white)',
  border: '1.5px solid var(--sand)', color: 'var(--ink)', fontSize: 14, width: '100%',
}
const labelStyle = { fontSize: 13, fontWeight: 500, color: 'var(--ink2)' }

// Characters the server refuses: control characters (a note may keep \n), bidi controls, U+2028/2029.
// eslint-disable-next-line no-control-regex
const BAD_LINE_CHARS = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069\u2028\u2029]/
// eslint-disable-next-line no-control-regex
const BAD_NOTE_CHARS = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069\u2028\u2029]/
// A pasted tab is harmless: turn it into a space instead of complaining.
const tabsToSpaces = (text) => text.replace(/\t/g, ' ')

// Propose a date to a connected user. Only rendered for people in the loaded conversations
// list, so a "not connected" answer is the rare race (unlike / block a moment ago).
export default function ProposeDateForm({ inviteeId, inviteeName, onDone, onCancel }) {
  const [title, setTitle] = useState('')
  const [place, setPlace] = useState('')
  const [when, setWhen] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Computed once per mount: the input's own min/max, enforced again by the server.
  const { min, max } = useMemo(() => {
    const now = new Date()
    const soon = new Date(now.getTime() + 60 * 1000)
    const far = new Date(now.getTime() + 365 * 24 * 3600 * 1000)
    return { min: toLocalInputValue(soon), max: toLocalInputValue(far) }
  }, [])

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    const cleanTitle = tabsToSpaces(title).trim()
    const cleanPlace = tabsToSpaces(place).trim()
    const cleanNote = tabsToSpaces(note).trim()
    const iso = localInputToIso(when)
    if (!cleanTitle || !cleanPlace) return setError('Add a title and a place')
    if (BAD_LINE_CHARS.test(cleanTitle) || BAD_LINE_CHARS.test(cleanPlace) || BAD_NOTE_CHARS.test(cleanNote)) {
      return setError('Remove special or invisible control characters from the text')
    }
    if (!iso) return setError('Pick a date and time')
    const ms = new Date(iso).getTime() - Date.now()
    if (ms <= 0) return setError('Pick a time in the future')
    if (ms > 366 * 24 * 3600 * 1000) return setError("Dates can't be planned more than a year ahead")

    setBusy(true)
    setError('')
    try {
      const created = await proposeDate({
        inviteeId, title: cleanTitle, place: cleanPlace, scheduledAt: iso, note: cleanNote,
      })
      onDone(created)
    } catch (err) {
      const status = err?.response?.status
      setError(
        status === 403
          ? `You're no longer connected with ${inviteeName}.`
          : apiError(err, "Couldn't send the proposal, please try again")
      )
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} aria-label={`Propose a date to ${inviteeName}`} style={{
      padding: '14px 16px', background: 'var(--cream2)', borderBottom: '1.5px solid var(--cream3)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>
        Propose a date to {inviteeName}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label htmlFor="date-title" style={labelStyle}>What</label>
        <input id="date-title" value={title} onChange={e => setTitle(e.target.value)}
          maxLength={MAX_TITLE} placeholder="Coffee, a walk, dinner…" style={fieldStyle} required />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label htmlFor="date-place" style={labelStyle}>Where</label>
        <input id="date-place" value={place} onChange={e => setPlace(e.target.value)}
          maxLength={MAX_PLACE} placeholder="Place or address" style={fieldStyle} required />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label htmlFor="date-when" style={labelStyle}>When (your local time)</label>
        <input id="date-when" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)}
          min={min} max={max} style={fieldStyle} required />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label htmlFor="date-note" style={labelStyle}>Note (optional)</label>
        <textarea id="date-note" value={note} onChange={e => setNote(e.target.value)}
          maxLength={MAX_NOTE} rows={2} placeholder="Anything they should know?"
          style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'inherit' }} />
      </div>

      {error && (
        <div role="alert" style={{
          padding: '9px 12px', borderRadius: 'var(--r-sm)', fontSize: 13,
          background: 'var(--danger-bg)', color: 'var(--danger-fg)', border: '1px solid var(--danger-border)',
        }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn type="submit" disabled={busy} style={{ padding: '10px 22px', fontSize: 14 }}>
          {busy ? 'Sending…' : 'Send proposal'}
        </Btn>
        <Btn variant="ghost" onClick={onCancel} disabled={busy} style={{ fontSize: 14 }}>Cancel</Btn>
      </div>
    </form>
  )
}
