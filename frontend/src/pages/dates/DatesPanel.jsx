import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { CalendarHeart, MapPin, Clock } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../context/NotificationContext'
import { getDates, acceptDate, declineDate, cancelDate } from '../../api/datesApi'
import { formatDateTime } from '../../utils/dateTime'
import { apiErrorMessage } from '../../utils/apiError'
import { displayName } from '../../utils/displayName'
import Avatar from '../../components/ui/Avatar'
import Btn from '../../components/ui/Btn'

const PAGE = 50
// Bursts of date_* frames (a few changes at once) collapse into one reload.
const RELOAD_DEBOUNCE_MS = 300
const ACTIONS = { accept: acceptDate, decline: declineDate, cancel: cancelDate }
const BUSY_TEXT = { accept: 'Accepting…', decline: 'Declining…', cancel: 'Cancelling…' }

// Frames that can change the list: every date_* event, and an unlike (which cancels dates).
const refreshesDates = (frame) =>
  frame?.type === 'notification' &&
  (frame.event === 'unlike' || (typeof frame.event === 'string' && frame.event.startsWith('date_')))

function statusLabel(date, mine, past) {
  if (date.status === 'pending') {
    if (past) return 'Expired'
    return mine ? 'Waiting for a reply' : 'Needs your reply'
  }
  return { accepted: 'Confirmed', declined: 'Declined', cancelled: 'Cancelled' }[date.status] || date.status
}

function DateCard({ date, myId, busyAction, error, onAction }) {
  const mine = date.proposer_id === myId
  const past = new Date(date.scheduled_at).getTime() < Date.now()
  const other = date.with_user
  const name = displayName(other, 'Unknown')
  const dim = date.status === 'declined' || date.status === 'cancelled' || (past && date.status === 'pending')
  const busy = !!busyAction

  const buttons = []
  if (date.status === 'pending' && !past) {
    if (mine) buttons.push(['cancel', 'Cancel proposal', 'secondary'])
    else {
      buttons.push(['accept', 'Accept', 'matcha'])
      buttons.push(['decline', 'Decline', 'danger'])
    }
  } else if (date.status === 'accepted' && !past) {
    buttons.push(['cancel', 'Cancel date', 'danger'])
  }

  return (
    <li style={{
      listStyle: 'none', padding: '14px 16px', background: 'var(--white)', borderRadius: 'var(--r-md)',
      border: '1.5px solid var(--cream3)', opacity: dim ? 0.75 : 1,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Avatar name={name} src={other.photo_url} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 16, fontWeight: 600, color: 'var(--ink)', overflowWrap: 'anywhere' }}>
            {date.title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
            {mine ? 'You invited ' : 'Invited by '}
            <Link to={`/profile/${other.id}`}>{name}</Link>
          </div>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--r-full)', flexShrink: 0,
          background: date.status === 'accepted' ? 'var(--matcha)' : 'var(--cream2)',
          color: date.status === 'accepted' ? '#fff' : 'var(--ink2)',
          border: '1px solid var(--sand)',
        }}>{statusLabel(date, mine, past)}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink2)' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <Clock size={14} style={{ flexShrink: 0, marginTop: 3 }} aria-hidden="true" />
          <span>{formatDateTime(date.scheduled_at)}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <MapPin size={14} style={{ flexShrink: 0, marginTop: 3 }} aria-hidden="true" />
          <span style={{ overflowWrap: 'anywhere' }}>{date.place}</span>
        </div>
        {date.note && (
          <div style={{ color: 'var(--ink3)', fontStyle: 'italic', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {date.note}
          </div>
        )}
      </div>

      {error && (
        <div role="alert" style={{
          padding: '8px 12px', borderRadius: 'var(--r-sm)', fontSize: 13,
          background: 'var(--danger-bg)', color: 'var(--danger-fg)', border: '1px solid var(--danger-border)',
        }}>{error}</div>
      )}

      {buttons.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {buttons.map(([action, label, variant]) => (
            <Btn key={action} variant={variant} disabled={busy} onClick={() => onAction(date.id, action)}
              style={{ padding: '8px 18px', fontSize: 13 }}>
              {busyAction === action ? BUSY_TEXT[action] : label}
            </Btn>
          ))}
        </div>
      )}
    </li>
  )
}

function Section({ title, children }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</h2>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: 0, padding: 0 }}>{children}</ul>
    </section>
  )
}

// The signed-in user's dates: upcoming first, history on demand. Reloads itself when a date_*
// notification (or an unlike) arrives on the shared socket.
export default function DatesPanel() {
  const { user } = useAuth()
  const { subscribe, connected } = useNotifications()
  const myId = user?.user?.id || user?.id

  const [upcoming, setUpcoming] = useState([])
  const [history, setHistory] = useState([])
  const [state, setState] = useState('loading') // 'loading' | 'ready' | 'error'
  const [showHistory, setShowHistory] = useState(false)
  const [historyState, setHistoryState] = useState('idle') // 'idle' | 'loading' | 'ready' | 'error'
  const [busy, setBusy] = useState({})    // date id -> action in flight
  const [errors, setErrors] = useState({}) // date id -> message
  const showHistoryRef = useRef(false)
  const aliveRef = useRef(true)
  // Request sequence numbers: only the newest response of each list may update state, so a slow
  // earlier response can't overwrite a newer one.
  const upcomingSeqRef = useRef(0)
  const historySeqRef = useRef(0)
  const reloadTimerRef = useRef(null)
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      clearTimeout(reloadTimerRef.current)
    }
  }, [])

  const loadUpcoming = useCallback(async () => {
    const seq = ++upcomingSeqRef.current
    try {
      const data = await getDates({ upcoming: true, order: 'asc', limit: PAGE })
      if (!aliveRef.current || seq !== upcomingSeqRef.current) return
      setUpcoming(data)
      setState('ready')
    } catch {
      if (aliveRef.current && seq === upcomingSeqRef.current) setState(s => (s === 'ready' ? s : 'error'))
    }
  }, [])

  const loadHistory = useCallback(async () => {
    const seq = ++historySeqRef.current
    setHistoryState(s => (s === 'ready' ? s : 'loading'))
    try {
      const data = await getDates({ upcoming: false, order: 'desc', limit: PAGE })
      if (!aliveRef.current || seq !== historySeqRef.current) return
      setHistory(data)
      setHistoryState('ready')
    } catch {
      if (aliveRef.current && seq === historySeqRef.current) setHistoryState(s => (s === 'ready' ? s : 'error'))
    }
  }, [])

  const reloadAll = useCallback(() => {
    clearTimeout(reloadTimerRef.current)
    reloadTimerRef.current = null
    loadUpcoming()
    if (showHistoryRef.current) loadHistory()
  }, [loadUpcoming, loadHistory])

  // Live frames and reconnects go through here; our own actions reload at once.
  const scheduleReload = useCallback(() => {
    clearTimeout(reloadTimerRef.current)
    reloadTimerRef.current = setTimeout(reloadAll, RELOAD_DEBOUNCE_MS)
  }, [reloadAll])

  useEffect(() => { loadUpcoming() }, [loadUpcoming])

  // Live updates over the one shared socket.
  useEffect(() => subscribe(frame => { if (refreshesDates(frame)) scheduleReload() }), [subscribe, scheduleReload])

  // After a reconnect (frames may have been missed) resync once. The first connection of a cold
  // mount is not a reconnect: the initial load already covers it.
  const sawConnectedRef = useRef(false)
  const droppedRef = useRef(false)
  useEffect(() => {
    if (connected) {
      if (sawConnectedRef.current && droppedRef.current) {
        droppedRef.current = false
        scheduleReload()
      }
      sawConnectedRef.current = true
    } else if (sawConnectedRef.current) {
      droppedRef.current = true
    }
  }, [connected, scheduleReload])

  function toggleHistory() {
    const next = !showHistory
    setShowHistory(next)
    showHistoryRef.current = next
    if (next && historyState === 'idle') loadHistory()
  }

  async function act(id, action) {
    setBusy(b => ({ ...b, [id]: action }))
    setErrors(e => ({ ...e, [id]: '' }))
    try {
      await ACTIONS[action](id)
      reloadAll()
    } catch (err) {
      const status = err?.response?.status
      const fallback = status === 404 ? 'This date no longer exists' : "That didn't work, please try again"
      const message = apiErrorMessage(err, fallback)
      if (aliveRef.current) setErrors(e => ({ ...e, [id]: message }))
      // The date changed under us (409/403/404): show its real state.
      if (status === 409 || status === 403 || status === 404) reloadAll()
    } finally {
      if (aliveRef.current) setBusy(b => ({ ...b, [id]: undefined }))
    }
  }

  const renderCard = (d) => (
    <DateCard key={d.id} date={d} myId={myId} busyAction={busy[d.id]} error={errors[d.id]} onAction={act} />
  )

  if (state === 'loading') {
    return <p style={{ textAlign: 'center', color: 'var(--ink4)', padding: '48px 0' }}>Loading…</p>
  }
  if (state === 'error') {
    return (
      <div role="alert" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 48 }}>
        <div style={{ fontSize: 14, color: 'var(--ink3)' }}>Couldn't load your dates.</div>
        <Btn variant="secondary" onClick={() => { setState('loading'); loadUpcoming() }}>Try again</Btn>
      </div>
    )
  }

  const awaiting = upcoming.filter(d => d.status === 'pending' && d.invitee_id === myId)
  const rest = upcoming.filter(d => !awaiting.includes(d))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {upcoming.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <CalendarHeart size={44} strokeWidth={1.5} color="var(--sand)" style={{ marginBottom: 12 }} aria-hidden="true" />
          <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 20, color: 'var(--ink2)', marginBottom: 8 }}>
            No upcoming dates
          </div>
          <div style={{ fontSize: 14, color: 'var(--ink4)' }}>
            Open a chat with a match and propose one.
          </div>
        </div>
      ) : (
        <>
          {awaiting.length > 0 && <Section title="Waiting for your answer">{awaiting.map(renderCard)}</Section>}
          {rest.length > 0 && <Section title="Upcoming">{rest.map(renderCard)}</Section>}
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Btn variant="ghost" onClick={toggleHistory} style={{ fontSize: 13 }}>
          {showHistory ? 'Hide past and closed dates' : 'Show past and closed dates'}
        </Btn>
      </div>
      {showHistory && (
        historyState === 'error' ? (
          <div role="alert" style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink3)' }}>
            Couldn't load your history.{' '}
            <Btn variant="secondary" onClick={loadHistory} style={{ padding: '6px 14px', fontSize: 13 }}>Try again</Btn>
          </div>
        ) : historyState === 'loading' ? (
          <p style={{ textAlign: 'center', color: 'var(--ink4)' }}>Loading…</p>
        ) : history.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--ink4)', fontSize: 13 }}>Nothing here yet.</p>
        ) : (
          <Section title="Past and closed">{history.map(renderCard)}</Section>
        )
      )}
    </div>
  )
}
