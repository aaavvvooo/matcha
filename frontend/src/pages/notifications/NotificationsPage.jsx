import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useNotifications } from '../../context/NotificationContext'
import Btn from '../../components/ui/Btn'
import './NotificationsPage.css'

const TYPE_LABELS = {
  like: 'liked your profile',
  view: 'viewed your profile',
  message: 'sent you a message',
  match: 'matched with you',
  unlike: 'unliked your profile',
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function NotificationsPage() {
  const { notifications, loadState, reload, clearUnread } = useNotifications()

  // Mark read once the list is in; on failure the unread dots simply stay.
  useEffect(() => {
    if (loadState === 'ready') clearUnread()
  }, [loadState, clearUnread])

  return (
    <div className="notif-page">
      <div className="notif-inner">
        <h1 className="notif-title">Notifications</h1>

        {loadState === 'error' && notifications.length === 0 ? (
          <div className="notif-empty" role="alert">
            <p>Couldn't load your notifications.</p>
            <Btn variant="secondary" onClick={reload}>Try again</Btn>
          </div>
        ) : loadState === 'loading' && notifications.length === 0 ? (
          <p className="notif-empty">Loading…</p>
        ) : notifications.length === 0 ? (
          <p className="notif-empty">You have no notifications yet.</p>
        ) : (
        <ul className="notif-list">
          {notifications.map(n => (
            <li key={n.id} className={`notif-item${n.is_read ? '' : ' unread'}`}>
              <div className="notif-avatar">
                {n.from_photo_url
                  ? <img src={n.from_photo_url} alt={n.from_username} />
                  : <span>{(n.from_username?.[0] || '?').toUpperCase()}</span>
                }
              </div>
              <div className="notif-body">
                <p className="notif-text">
                  {n.from_username
                    ? <Link to={`/profile/${n.from_user}`}>{n.from_username}</Link>
                    : 'Someone'
                  }
                  {' '}{TYPE_LABELS[n.type] || n.type}
                </p>
                <span className="notif-time">{timeAgo(n.created_at)}</span>
              </div>
              {!n.is_read && <span className="notif-dot" />}
            </li>
          ))}
        </ul>
        )}
      </div>
    </div>
  )
}
