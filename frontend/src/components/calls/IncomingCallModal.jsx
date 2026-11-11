import { useEffect, useRef } from 'react'
import { Phone, PhoneOff, Video } from 'lucide-react'
import Avatar from '../ui/Avatar'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import './Calls.css'

const ACCEPT_DELAY_MS = 600

// Shown on whatever page the user is on. Escape declines. The name is rendered as text.
export default function IncomingCallModal({ peer, media, onAccept, onDecline }) {
  const ref = useRef(null)
  const declineRef = useRef(null)
  // The modal can pop up while the user is typing: focus starts on Decline (never on an Accept
  // button, which a stray Space / Enter would press and switch the camera on), and Accept ignores
  // clicks for a moment after the modal appears.
  useFocusTrap(ref, onDecline, declineRef)
  const armedRef = useRef(false)
  useEffect(() => {
    const timer = setTimeout(() => { armedRef.current = true }, ACCEPT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])
  const accept = (withVideo) => { if (armedRef.current) onAccept(withVideo) }
  const isVideo = media === 'video'

  return (
    <div className="call-backdrop">
      <div
        ref={ref}
        className="call-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="call-modal-title"
        aria-describedby="call-modal-desc"
        tabIndex={-1}
      >
        <Avatar name={peer.name} src={peer.photo} size={88} />
        <h2 id="call-modal-title" className="call-modal-name">{peer.name}</h2>
        <p id="call-modal-desc" className="call-modal-sub">
          {isVideo ? 'is video calling you' : 'is calling you'}
        </p>
        <div className="call-modal-actions">
          {isVideo && (
            <button type="button" className="call-btn call-btn-accept" onClick={() => accept(true)} aria-label="Accept with video">
              <Video size={20} /> <span>Accept with video</span>
            </button>
          )}
          <button
            type="button"
            className={`call-btn ${isVideo ? 'call-btn-secondary' : 'call-btn-accept'}`}
            onClick={() => accept(false)}
            aria-label={isVideo ? 'Accept audio only' : 'Accept call'}
          >
            <Phone size={20} /> <span>{isVideo ? 'Audio only' : 'Accept'}</span>
          </button>
          <button type="button" ref={declineRef} className="call-btn call-btn-decline" onClick={onDecline} aria-label="Decline call">
            <PhoneOff size={20} /> <span>Decline</span>
          </button>
        </div>
      </div>
    </div>
  )
}
