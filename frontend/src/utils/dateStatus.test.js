import { isInactive, refreshesDates, statusLabel } from './dateStatus';

const NOW = Date.parse('2026-11-19T12:00:00Z');
const at = iso => ({ scheduled_at: iso });
const past = '2026-11-18T12:00:00Z';
const future = '2026-11-20T12:00:00Z';
const label = (status, iso, mine) => statusLabel({ status, ...at(iso) }, mine, Date.parse(iso) < NOW);

test('a pending date whose time passed is missed, from either side', () => {
  expect(label('pending', past, false)).toBe('Missed');
  expect(label('pending', past, true)).toBe('Missed · no reply');
});

test('upcoming and settled dates keep their usual wording', () => {
  expect(label('pending', future, false)).toBe('Needs your reply');
  expect(label('pending', future, true)).toBe('Waiting for a reply');
  expect(label('accepted', future, true)).toBe('Confirmed');
  expect(label('accepted', past, true)).toBe('Took place');
  expect(label('declined', future, true)).toBe('Declined');
  expect(label('cancelled', past, false)).toBe('Cancelled');
});

test('missed, declined and cancelled dates are inactive; confirmed ones are not', () => {
  expect(isInactive({ status: 'pending' }, true)).toBe(true);
  expect(isInactive({ status: 'declined' }, false)).toBe(true);
  expect(isInactive({ status: 'accepted' }, false)).toBe(false);
});

test('only date_* events and unlikes refresh dates', () => {
  expect(refreshesDates({ type: 'notification', event: 'date_accepted' })).toBe(true);
  expect(refreshesDates({ type: 'notification', event: 'unlike' })).toBe(true);
  expect(refreshesDates({ type: 'notification', event: 'like' })).toBe(false);
  expect(refreshesDates({ type: 'message', event: 'date_accepted' })).toBe(false);
});
