import client from './client'

// Keep in sync with backend schema/date_schemas.py.
export const MAX_TITLE = 100
export const MAX_PLACE = 200
export const MAX_NOTE = 500

// scheduledAt is an ISO 8601 UTC instant (Date#toISOString).
export const proposeDate = ({ inviteeId, title, place, scheduledAt, note }) =>
  client
    .post('/dates', {
      invitee_id: inviteeId,
      title,
      place,
      scheduled_at: scheduledAt,
      ...(note ? { note } : {}),
    })
    .then(r => r.data)

// upcoming: true = still ahead and pending/accepted, false = everything else, undefined = all.
export const getDates = ({ status, upcoming, order, limit, offset } = {}) =>
  client.get('/dates', { params: { status, upcoming, order, limit, offset } }).then(r => r.data)

export const acceptDate = (id) => client.post(`/dates/${id}/accept`).then(r => r.data)
export const declineDate = (id) => client.post(`/dates/${id}/decline`).then(r => r.data)
export const cancelDate = (id) => client.post(`/dates/${id}/cancel`).then(r => r.data)
