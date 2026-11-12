// Helpers for voice / video calls: call ids, microphone and camera access, readable errors.

// Used when GET /chat/ice-servers fails, so a call can still be tried.
export const FALLBACK_ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302'] }]

// A random v4 UUID. crypto.randomUUID only exists in secure contexts; getRandomValues does not.
export function newCallId() {
  const c = window.crypto
  if (c?.randomUUID) return c.randomUUID()
  const b = new Uint8Array(16)
  c.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function mediaSupported() {
  return !!(navigator.mediaDevices?.getUserMedia && typeof RTCPeerConnection !== 'undefined')
}

export function stopStream(stream) {
  stream?.getTracks().forEach(t => t.stop())
}

// Errors getUserMedia can answer with that mean "no usable camera" (as opposed to "refused").
const CAMERA_MISSING = ['NotFoundError', 'OverconstrainedError', 'NotReadableError', 'AbortError']

// Opens the microphone (and the camera for a video call). When the camera is missing or busy,
// falls back to audio only. Returns { stream, video, cameraFallback }; rejects with the browser's
// error (or an `InsecureContext` one) otherwise. A failed attempt never leaves a track running.
export async function acquireMedia(wantVideo) {
  if (!mediaSupported()) {
    const err = new Error('insecure')
    err.name = 'InsecureContext'
    throw err
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: wantVideo })
    return { stream, video: wantVideo, cameraFallback: false }
  } catch (err) {
    if (!wantVideo || !CAMERA_MISSING.includes(err?.name)) throw err
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    return { stream, video: false, cameraFallback: true }
  }
}

// Visible text for a failed getUserMedia / RTCPeerConnection setup.
export function describeMediaError(err) {
  switch (err?.name) {
    case 'InsecureContext':
      return 'Calls need a secure page (HTTPS or http://localhost) to use your microphone and camera.'
    case 'NotAllowedError':
    case 'SecurityError':
    case 'NotSupportedError':
      return 'Microphone or camera access is blocked. Allow it in your browser’s site settings and try again.'
    case 'NotFoundError':
      return 'No microphone was found. Connect one and try again.'
    case 'NotReadableError':
    case 'AbortError':
      return 'Your microphone or camera is being used by another app.'
    case 'OverconstrainedError':
      return 'Your microphone or camera can’t be used for this call.'
    default:
      return 'Couldn’t access your microphone or camera.'
  }
}
