// A short message about a call that did not start or has ended (declined, missed, no microphone...).
// Errors are announced as alerts, everything else politely.
export default function CallNotice({ notice, onDismiss }) {
  if (!notice) return null
  const isError = notice.tone === 'error'
  return (
    <div className="call-notice-wrap">
      <div
        key={notice.key}
        className={`call-notice${isError ? ' call-notice-error' : ''}`}
        role={isError ? 'alert' : 'status'}
      >
        <span>{notice.text}</span>
        <button type="button" onClick={onDismiss} aria-label="Dismiss message" className="call-notice-close">×</button>
      </div>
    </div>
  )
}
