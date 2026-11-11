// What each notification type says, and where it leads. Unknown types fall back to a generic
// line, so a type added on the server later never renders blank or throws.
const TEXT = {
  like: 'liked your profile',
  view: 'viewed your profile',
  message: 'sent you a message',
  match: 'matched with you!',
  unlike: 'disconnected from you',
  date_proposed: 'proposed a date',
  date_accepted: 'accepted your date',
  date_declined: 'declined your date',
  date_cancelled: 'cancelled a date',
  date_reminder: 'has a date with you coming up',
}

export function notificationText(type) {
  return TEXT[type] || 'sent you a notification'
}

export const isDateNotification = (type) => typeof type === 'string' && type.startsWith('date_')

// Route a notification opens when clicked, or null when it is not a link.
export function notificationLink(type) {
  return isDateNotification(type) ? '/dates' : null
}
