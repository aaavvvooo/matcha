import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarHeart } from 'lucide-react';
import { getDates } from '../../api/datesApi';
import { useNotifications } from '../../context/NotificationContext';
import { formatDateTime } from '../../utils/dateTime';
import { isInactive, isPast, refreshesDates, statusLabel } from '../../utils/dateStatus';

// GET /dates has no per-person filter: take the caller's most recent dates and keep this pair's.
const FETCH_LIMIT = 100;
const SHOWN = 3;
const RELOAD_DEBOUNCE_MS = 300;

/**
 * Dates with one chat partner and where each stands (confirmed, waiting, missed…), shown in the
 * thread so a missed or declined date is visible where the two people talk.
 * @param {{ partnerId: number, myId: number, reloadKey?: unknown }} props reloadKey: change it to refetch (e.g. after proposing)
 */
export default function ChatDates({ partnerId, myId, reloadKey }) {
  const [dates, setDates] = useState([]);
  const { subscribe } = useNotifications();
  const requestRef = useRef(0);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const all = await getDates({ order: 'desc', limit: FETCH_LIMIT });
      if (request !== requestRef.current) return;
      setDates(all.filter(d => d.with_user?.id === partnerId).slice(0, SHOWN));
    } catch {
      // Optional context for the thread: on failure keep what we had (the dates page has details).
    }
  }, [partnerId]);

  useEffect(() => {
    setDates([]);
    load();
  }, [load, reloadKey]);

  useEffect(() => subscribe(frame => {
    if (!refreshesDates(frame)) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(load, RELOAD_DEBOUNCE_MS);
  }), [subscribe, load]);

  useEffect(() => () => {
    clearTimeout(timerRef.current);
    requestRef.current += 1; // a response landing after unmount is ignored
  }, []);

  if (dates.length === 0) return null;

  return (
    <section aria-label="Your dates together" style={{
      flexShrink: 0, padding: '8px 12px', background: 'var(--cream2)',
      borderBottom: '1.5px solid var(--cream3)',
    }}>
      <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {dates.map(date => {
          const past = isPast(date);
          const label = statusLabel(date, date.proposer_id === myId, past);
          const missed = date.status === 'pending' && past;
          const confirmed = date.status === 'accepted' && !past;
          return (
            <li key={date.id} style={{
              listStyle: 'none', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
              color: 'var(--ink2)', opacity: isInactive(date, past) && !missed ? 0.7 : 1, minWidth: 0,
            }}>
              <CalendarHeart size={14} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--spice)' }}/>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <strong style={{ fontWeight: 600 }}>{date.title}</strong> · {formatDateTime(date.scheduled_at)}
              </span>
              <span style={{
                flexShrink: 0, padding: '2px 8px', borderRadius: 'var(--r-full)', fontWeight: 600, fontSize: 11,
                border: `1px solid ${missed ? 'var(--danger-border)' : 'var(--sand)'}`,
                background: missed ? 'var(--danger-bg)' : confirmed ? 'var(--matcha)' : 'var(--white)',
                color: missed ? 'var(--danger-fg)' : confirmed ? 'var(--white)' : 'var(--ink2)',
              }}>{label}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
