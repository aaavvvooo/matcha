import { useEffect, useRef } from 'react'
import { Mic, MicOff, PhoneOff, Video, VideoOff } from 'lucide-react'
import Avatar from '../ui/Avatar'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import './Calls.css'

const STATUS = {
  preparing: 'Starting…',
  calling: 'Calling…',
  ringing: 'Ringing…',
  accepting: 'Starting…',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
}

function formatElapsed(total) {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Attaches a MediaStream to a <video> through its ref and detaches it when done.
function useStream(ref, stream) {
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    el.srcObject = stream || null
    if (stream) {
      const playing = el.play()
      if (playing && playing.catch) playing.catch(() => {})
    }
    return () => { el.srcObject = null }
  }, [ref, stream])
}

export default function CallOverlay({
  view, localStream, remoteStream, muted, cameraOff, elapsed,
  onToggleMute, onToggleCamera, onHangUp,
}) {
  const rootRef = useRef(null)
  const localRef = useRef(null)
  const remoteRef = useRef(null)
  useFocusTrap(rootRef, null)
  useStream(localRef, localStream)
  useStream(remoteRef, remoteStream)

  const hasLocalVideo = !!localStream && localStream.getVideoTracks().length > 0
  const hasRemoteVideo = !!remoteStream && remoteStream.getVideoTracks().length > 0
  const status = view.phase === 'connected' ? formatElapsed(elapsed) : (STATUS[view.phase] || '')
  const hangLabel = view.phase === 'connected' || view.phase === 'reconnecting' || view.phase === 'connecting'
    ? 'Hang up' : 'Cancel call'

  return (
    <div
      ref={rootRef}
      className="call-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Call with ${view.peer.name}`}
      data-call-phase={view.phase}
      tabIndex={-1}
    >
      <div className="call-stage">
        {/* Always mounted: it also plays the audio of an audio-only call. */}
        <video ref={remoteRef} className={`call-remote${hasRemoteVideo ? '' : ' call-remote-hidden'}`} autoPlay playsInline />
        {!hasRemoteVideo && (
          <div className="call-stage-avatar">
            <Avatar name={view.peer.name} src={view.peer.photo} size={112} />
          </div>
        )}
      </div>

      <div className="call-topbar">
        <div className="call-peer">{view.peer.name}</div>
        <div className="call-status" role="status" aria-live="polite">{status}</div>
      </div>

      {hasLocalVideo && (
        <video
          ref={localRef}
          className={`call-local${cameraOff ? ' call-local-off' : ''}`}
          autoPlay
          playsInline
          muted
        />
      )}

      <div className="call-controls">
        <button
          type="button"
          className={`call-round${muted ? ' call-round-on' : ''}`}
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
          disabled={!localStream}
        >
          {muted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
        {hasLocalVideo && (
          <button
            type="button"
            className={`call-round${cameraOff ? ' call-round-on' : ''}`}
            onClick={onToggleCamera}
            aria-pressed={cameraOff}
            aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
          >
            {cameraOff ? <VideoOff size={22} /> : <Video size={22} />}
          </button>
        )}
        <button type="button" className="call-round call-round-hangup" onClick={onHangUp} aria-label={hangLabel}>
          <PhoneOff size={22} />
        </button>
      </div>
    </div>
  )
}
