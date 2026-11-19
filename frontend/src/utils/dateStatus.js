// Date status wording shared by the dates page and the chat thread, so both say the same thing.

/** True once the date's time has passed. */
export const isPast = (date, now = Date.now()) => new Date(date.scheduled_at).getTime() < now;

/**
 * Label for a date from the viewer's side. A pending date whose time has passed got no answer
 * in time: it is "Missed" (the server treats it as expired; no actions remain).
 * @param {{status: string, scheduled_at: string}} date
 * @param {boolean} mine the viewer proposed it
 */
export function statusLabel(date, mine, past = isPast(date)) {
  if (date.status === 'pending') {
    if (past) return mine ? 'Missed · no reply' : 'Missed';
    return mine ? 'Waiting for a reply' : 'Needs your reply';
  }
  if (date.status === 'accepted') return past ? 'Took place' : 'Confirmed';
  return { declined: 'Declined', cancelled: 'Cancelled' }[date.status] || date.status;
}

/** Faded in lists: nothing left to do and it didn't (or won't) happen. */
export const isInactive = (date, past = isPast(date)) =>
  date.status === 'declined' || date.status === 'cancelled' || (past && date.status === 'pending');

/** Socket frames that can change someone's dates: every date_* event, and an unlike (cancels them). */
export const refreshesDates = (frame) =>
  frame?.type === 'notification' &&
  (frame.event === 'unlike' || (typeof frame.event === 'string' && frame.event.startsWith('date_')));
