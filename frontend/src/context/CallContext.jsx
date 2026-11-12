import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAuth } from './AuthContext'
import { useNotifications } from './NotificationContext'
import { useChat } from './ChatContext'
import { getIceServers } from '../api/chatApi'
import { displayName } from '../utils/displayName'
import {
  FALLBACK_ICE_SERVERS, acquireMedia, describeMediaError, newCallId, stopStream,
} from '../utils/callMedia'
import { startRingtone } from '../utils/ringtone'
import IncomingCallModal from '../components/calls/IncomingCallModal'
import CallOverlay from '../components/calls/CallOverlay'
import CallNotice from '../components/calls/CallNotice'

// One voice / video call at a time, signalled over NotificationContext's single socket
// (docs/DESIGN.md §7). The provider sits inside every other provider and renders the incoming-call
// modal and the in-call overlay itself, so a call can ring and run on any page.
//
// Roles are fixed: the caller creates the offer (only after the callee accepted), the callee
// answers, so offers never collide. Everything mutable about the running call lives in `session`
// (a ref); React state only mirrors what the UI shows.
const CallContext = createContext(null)

const DISCONNECT_GRACE_MS = 4000     // 'disconnected' may heal by itself before we act
const RESTART_TIMEOUT_MS = 10000     // after an ICE restart (or waiting for the caller's), give up
const CONNECT_TIMEOUT_MS = 30000     // accepted but never connected (e.g. NAT without TURN)
const NOTICE_MS = 7000

const mediaOf = (m) => (m === 'video' ? 'video' : 'audio')

// What to tell the user for a server `hangup` reason.
function hangupText(reason, name, direction, answered) {
  switch (reason) {
    case 'timeout':
      return direction === 'out' ? `${name} didn’t answer.` : `Missed call from ${name}.`
    case 'connection_lost':
      return 'The call ended because a connection was lost.'
    case 'disconnected':
      return `The call ended: you’re no longer connected with ${name}.`
    case 'cancelled':
      return `Missed call from ${name}.`
    default:
      return answered ? `${name} ended the call.` : `Missed call from ${name}.`
  }
}

async function loadIceServers() {
  try {
    const data = await getIceServers()
    const list = (data?.ice_servers || []).map(srv => ({
      urls: srv.urls,
      ...(srv.username ? { username: srv.username } : {}),
      ...(srv.credential ? { credential: srv.credential } : {}),
    }))
    return list.length ? list : FALLBACK_ICE_SERVERS
  } catch {
    return FALLBACK_ICE_SERVERS
  }
}

async function flushCandidates(s) {
  const pending = s.pending
  s.pending = []
  for (const candidate of pending) {
    try { await s.pc.addIceCandidate(candidate) } catch { /* stale candidate: harmless */ }
  }
}

export function CallProvider({ children }) {
  const { accessToken } = useAuth()
  const signedIn = !!accessToken
  const { subscribe, send, connected } = useNotifications()
  const { conversations } = useChat()

  // What the UI shows: null (idle) or
  // { id, direction: 'out'|'in', phase, peer: { id, name, photo }, media, connectedAt }.
  // phase: preparing · calling · ringing (out) · incoming · accepting (in) · connecting ·
  // connected · reconnecting.
  const [view, setView] = useState(null)
  const [localStream, setLocalStream] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [notice, setNotice] = useState(null)

  const sessionRef = useRef(null)
  const sendRef = useRef(send)
  const conversationsRef = useRef(conversations)
  const stopRingtoneRef = useRef(() => {})
  useEffect(() => { sendRef.current = send }, [send])
  useEffect(() => { conversationsRef.current = conversations }, [conversations])

  const showNotice = useCallback((text, tone = 'info') => {
    setNotice({ text, tone, key: Date.now() + Math.random() })
  }, [])
  const dismissNotice = useCallback(() => setNotice(null), [])
  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  const peerOf = useCallback((id, username) => {
    const convo = conversationsRef.current.find(c => c.user_id === id)
    return {
      id,
      name: convo ? displayName(convo, username || 'Someone') : (username || 'Someone'),
      photo: convo?.photo_url || null,
    }
  }, [])

  const patchView = useCallback((patch) => {
    setView(prev => (prev ? { ...prev, ...patch } : prev))
  }, [])

  const sendFrame = useCallback((action, s, extra) => (
    sendRef.current({ type: 'call', action, call_id: s.id, to: s.peerId, ...extra })
  ), [])

  // Releases everything a session holds. Safe to call twice.
  const teardown = useCallback((s) => {
    Object.values(s.timers).forEach(clearTimeout)
    s.timers = {}
    const pc = s.pc
    s.pc = null
    if (pc) {
      pc.onicecandidate = null
      pc.ontrack = null
      pc.oniceconnectionstatechange = null
      try { pc.close() } catch { /* already closed */ }
    }
    stopStream(s.local)
    stopStream(s.remote)
    s.local = null
    s.remote = null
    s.pending = []
  }, [])

  // Ends the call locally; `notify` ('cancel' | 'decline' | 'hangup') also tells the server.
  const finish = useCallback((text, tone, notify) => {
    const s = sessionRef.current
    if (!s) return
    sessionRef.current = null
    if (notify) sendFrame(notify, s)
    teardown(s)
    stopRingtoneRef.current()
    stopRingtoneRef.current = () => {}
    setView(null)
    setLocalStream(null)
    setRemoteStream(null)
    setMuted(false)
    setCameraOff(false)
    setElapsed(0)
    if (text) showNotice(text, tone)
  }, [sendFrame, teardown, showNotice])
  const finishRef = useRef(finish)
  useEffect(() => { finishRef.current = finish }, [finish])

  // The hang-up control: cancel while ringing out, decline before accepting, hang up otherwise.
  const endCall = useCallback(() => {
    const s = sessionRef.current
    if (!s) return
    let notify = 'hangup'
    if (s.direction === 'out' && s.stage !== 'active') notify = s.stage === 'invited' ? 'cancel' : null
    if (s.direction === 'in' && s.stage !== 'active') notify = 'decline'
    finish(null, 'info', notify)
  }, [finish])

  const declineIncoming = useCallback(() => {
    const s = sessionRef.current
    if (s && s.direction === 'in' && s.stage === 'incoming') finish(null, 'info', 'decline')
  }, [finish])

  const sendSignal = useCallback((s, data) => {
    if (sessionRef.current !== s) return
    if (!sendFrame('signal', s, { data })) finishRef.current('You’re offline, so the call ended.', 'error')
  }, [sendFrame])

  // ── peer connection ──────────────────────────────────────────────────────
  // Signal handling is serialised per session, so a candidate never overtakes the offer / answer
  // that has to be applied before it.
  const enqueue = useCallback((s, task) => {
    s.chain = s.chain.then(async () => {
      if (sessionRef.current !== s) return
      await task()
    }).catch(() => {
      if (sessionRef.current === s) finishRef.current('The call could not be connected.', 'error', 'hangup')
    })
  }, [])
  const onIceState = useCallback((s) => {
    const pc = s.pc
    if (!pc || sessionRef.current !== s) return
    const state = pc.iceConnectionState
    if (state === 'connected' || state === 'completed') {
      clearTimeout(s.timers.grace)
      clearTimeout(s.timers.fail)
      clearTimeout(s.timers.connect)
      s.timers = {}
      setView(prev => (prev ? { ...prev, phase: 'connected', connectedAt: prev.connectedAt || Date.now() } : prev))
      return
    }
    if (state !== 'disconnected' && state !== 'failed') return
    patchView({ phase: 'reconnecting' })

    const recover = () => {
      if (sessionRef.current !== s) return
      clearTimeout(s.timers.grace)
      if (s.direction === 'out' && !s.restarted) {
        // One ICE restart, started by the caller (the offerer); then it is over or it worked.
        s.restarted = true
        s.timers.fail = setTimeout(() => finishRef.current('The connection was lost and the call ended.', 'error', 'hangup'), RESTART_TIMEOUT_MS)
        enqueue(s, async () => {
          const offer = await pc.createOffer({ iceRestart: true })
          await pc.setLocalDescription(offer)
          sendSignal(s, { kind: 'offer', sdp: pc.localDescription.sdp })
        })
      } else if (!s.timers.fail) {
        // The callee waits for the caller's restart; nothing arrives -> give up.
        s.timers.fail = setTimeout(() => finishRef.current('The connection was lost and the call ended.', 'error', 'hangup'), RESTART_TIMEOUT_MS + DISCONNECT_GRACE_MS)
      }
    }
    if (state === 'failed') recover()
    else if (!s.timers.grace) s.timers.grace = setTimeout(recover, DISCONNECT_GRACE_MS)
  }, [patchView, sendSignal, enqueue])

  const createConnection = useCallback((s) => {
    const pc = new RTCPeerConnection({ iceServers: s.ice })
    s.pc = pc
    s.local.getTracks().forEach(track => pc.addTrack(track, s.local))
    pc.onicecandidate = (e) => {
      // Firefox also fires the end-of-candidates marker (null, or a candidate with an empty
      // line); there is nothing to relay and the server would refuse it.
      if (!e.candidate || !e.candidate.candidate) return
      sendSignal(s, { kind: 'candidate', candidate: e.candidate.toJSON() })
    }
    pc.ontrack = (e) => {
      const stream = e.streams[0] || s.remote || new MediaStream()
      if (!e.streams[0]) stream.addTrack(e.track)
      s.remote = stream
      setRemoteStream(stream)
      // Keep the UI in step when the peer adds or drops a track later.
      stream.onaddtrack = () => setRemoteStream(new MediaStream(stream.getTracks()))
      stream.onremovetrack = () => setRemoteStream(new MediaStream(stream.getTracks()))
    }
    pc.oniceconnectionstatechange = () => onIceState(s)
    s.timers.connect = setTimeout(
      () => finishRef.current('The call could not be connected.', 'error', 'hangup'), CONNECT_TIMEOUT_MS,
    )
    return pc
  }, [onIceState, sendSignal])

  const handleSignal = useCallback((s, data) => {
    enqueue(s, async () => {
      const pc = s.pc
      if (!pc || !data) return
      if (data.kind === 'offer') {
        if (s.direction !== 'in') return
        await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp })
        await flushCandidates(s)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        sendSignal(s, { kind: 'answer', sdp: pc.localDescription.sdp })
      } else if (data.kind === 'answer') {
        if (s.direction !== 'out') return
        await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp })
        await flushCandidates(s)
      } else if (data.kind === 'candidate') {
        // Candidates that beat the description wait for it.
        if (!pc.remoteDescription) s.pending.push(data.candidate)
        else {
          try { await pc.addIceCandidate(data.candidate) } catch { /* stale candidate: harmless */ }
        }
      }
    })
  }, [enqueue, sendSignal])

  // ── starting a call ──────────────────────────────────────────────────────
  const startCall = useCallback(async (partner, media) => {
    if (sessionRef.current) return false
    if (!connected) {
      showNotice('You’re offline. Reconnecting, try again in a moment.', 'error')
      return false
    }
    const peer = peerOf(partner.user_id, partner.username)
    const s = {
      id: newCallId(), direction: 'out', peer, peerId: peer.id, stage: 'preparing',
      media: mediaOf(media), local: null, remote: null, pc: null, ice: null,
      pending: [], timers: {}, restarted: false, chain: Promise.resolve(),
    }
    sessionRef.current = s
    setView({ id: s.id, direction: 'out', phase: 'preparing', peer, media: s.media, connectedAt: null })
    try {
      const [got, ice] = await Promise.all([acquireMedia(media === 'video'), loadIceServers()])
      if (sessionRef.current !== s) {
        stopStream(got.stream) // cancelled while the browser was asking for permission
        return false
      }
      s.local = got.stream
      s.ice = ice
      s.media = got.video ? 'video' : 'audio'
      setLocalStream(got.stream)
      if (got.cameraFallback) showNotice('No camera available, calling with audio only.', 'info')
      s.stage = 'invited'
      patchView({ phase: 'calling', media: s.media })
      if (!sendFrame('invite', s, { media: s.media })) {
        finish('You’re offline. Reconnecting, try again in a moment.', 'error')
        return false
      }
      return true
    } catch (err) {
      if (sessionRef.current === s) finish(describeMediaError(err), 'error')
      return false
    }
  }, [connected, peerOf, showNotice, patchView, sendFrame, finish])

  // ── answering a call ─────────────────────────────────────────────────────
  const acceptIncoming = useCallback(async (withVideo) => {
    const s = sessionRef.current
    if (!s || s.direction !== 'in' || s.stage !== 'incoming') return
    s.stage = 'accepting'
    stopRingtoneRef.current()
    stopRingtoneRef.current = () => {}
    patchView({ phase: 'accepting' })
    try {
      const [got, ice] = await Promise.all([acquireMedia(withVideo && s.media === 'video'), loadIceServers()])
      if (sessionRef.current !== s) {
        stopStream(got.stream) // the caller gave up while the browser was asking for permission
        return
      }
      s.local = got.stream
      s.ice = ice
      if (got.cameraFallback) showNotice('No camera available, joining with audio only.', 'info')
      setLocalStream(got.stream)
      createConnection(s)
      s.stage = 'active'
      patchView({ phase: 'connecting' })
      if (!sendFrame('accept', s)) finish('You’re offline. Reconnecting, try again in a moment.', 'error')
    } catch (err) {
      // Could not open the microphone / camera: tell the caller we are not coming, so it stops ringing.
      if (sessionRef.current === s) finish(describeMediaError(err), 'error', 'decline')
    }
  }, [patchView, showNotice, createConnection, sendFrame, finish])

  // ── frames from the server ───────────────────────────────────────────────
  useEffect(() => {
    if (!signedIn) return undefined
    return subscribe((frame) => {
      if (frame?.type === 'error' && typeof frame.call_id === 'string') {
        const s = sessionRef.current
        if (!s || s.id !== frame.call_id) return
        if (s.stage === 'active' && (frame.code === 'rate_limited' || frame.code === 'invalid_signal')) {
          return // one refused candidate or a burst of signals: the call goes on (a bad offer times out)
        }
        const gone = ['unknown_call', 'not_connected', 'rate_limited'].includes(frame.code)
        const text = {
          not_connected: `You can’t call ${s.peer.name} any more.`,
          rate_limited: 'You’re calling too often. Try again in a minute.',
          unknown_call: 'The call is no longer available.',
        }[frame.code] || (s.stage === 'active' ? 'The call failed.' : 'The call could not be started.')
        let notify = null
        if (!gone) notify = s.stage === 'active' ? 'hangup' : (s.direction === 'out' && s.stage === 'invited' ? 'cancel' : null)
        finish(text, 'error', notify)
        return
      }
      if (frame?.type !== 'call' || typeof frame.call_id !== 'string') return

      if (frame.action === 'invite') {
        if (!Number.isInteger(frame.from) || (frame.media !== 'audio' && frame.media !== 'video')) return
        if (sessionRef.current) {
          // Already in a call in this tab (the server normally answers busy first).
          sendRef.current({ type: 'call', action: 'busy', call_id: frame.call_id, to: frame.from })
          return
        }
        const peer = peerOf(frame.from, frame.from_username)
        sessionRef.current = {
          id: frame.call_id, direction: 'in', peer, peerId: frame.from, stage: 'incoming', media: frame.media,
          local: null, remote: null, pc: null, ice: null, pending: [], timers: {}, restarted: false,
          chain: Promise.resolve(),
        }
        setView({ id: frame.call_id, direction: 'in', phase: 'incoming', peer, media: frame.media, connectedAt: null })
        stopRingtoneRef.current = startRingtone()
        return
      }

      const s = sessionRef.current
      if (!s || s.id !== frame.call_id) return
      const name = s.peer.name
      switch (frame.action) {
        case 'ringing':
          if (s.direction === 'out' && s.stage === 'invited') patchView({ phase: 'ringing' })
          break
        case 'accept':
          if (s.direction !== 'out' || s.stage !== 'invited') break
          s.stage = 'active'
          patchView({ phase: 'connecting' })
          try {
            createConnection(s)
          } catch {
            finish('Calls are not supported in this browser.', 'error', 'hangup')
            break
          }
          enqueue(s, async () => {
            // Only now, after the callee said yes, does any offer / candidate leave this browser.
            const offer = await s.pc.createOffer()
            await s.pc.setLocalDescription(offer)
            sendSignal(s, { kind: 'offer', sdp: s.pc.localDescription.sdp })
          })
          break
        case 'signal':
          if (s.stage === 'active') handleSignal(s, frame.data)
          break
        case 'decline':
          finish(`${name} declined the call.`, 'info')
          break
        case 'busy':
          finish(frame.reason === 'you_in_call'
            ? 'You’re already in a call (maybe in another tab).'
            : `${name} is on another call.`, 'info')
          break
        case 'unavailable':
          finish(`${name} isn’t available right now.`, 'info')
          break
        case 'answered_elsewhere':
          // Also while this tab is still opening the microphone to accept: drop that attempt
          // (the pending acquire notices the session is gone and stops its tracks).
          if (s.direction === 'in' && (s.stage === 'incoming' || s.stage === 'accepting')) {
            finish(frame.outcome === 'declined'
              ? 'This call was declined in another tab.'
              : 'This call was answered in another tab.', 'info')
          }
          break
        case 'cancel':
        case 'hangup':
          finish(hangupText(frame.reason, name, s.direction, s.stage === 'active'), frame.reason === 'connection_lost' ? 'error' : 'info')
          break
        default:
          break
      }
    })
  }, [signedIn, subscribe, peerOf, patchView, createConnection, enqueue, sendSignal, handleSignal, finish])

  // ── lifecycle ────────────────────────────────────────────────────────────
  // The socket carries the call: when it drops the server has already ended it for the peer.
  useEffect(() => {
    if (!connected && sessionRef.current) finish('The connection was lost, so the call ended.', 'error')
  }, [connected, finish])

  // Signing out ends the call without a word; unmounting releases the devices.
  useEffect(() => {
    if (!signedIn) finishRef.current(null)
  }, [signedIn])
  useEffect(() => () => finishRef.current(null), [])

  // Closing the tab: tell the other side instead of leaving it to the socket timeout.
  useEffect(() => {
    function onPageHide() {
      const s = sessionRef.current
      if (!s) return
      if (s.direction === 'out') {
        if (s.stage === 'active') sendFrame('hangup', s)
        else if (s.stage === 'invited') sendFrame('cancel', s)
      }
      else if (s.stage === 'active') sendFrame('hangup', s)
      else if (s.stage === 'accepting') sendFrame('decline', s)
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [sendFrame])

  // Call timer.
  const connectedAt = view?.connectedAt
  useEffect(() => {
    if (!connectedAt) return undefined
    const tick = () => setElapsed(Math.floor((Date.now() - connectedAt) / 1000))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [connectedAt])

  // ── controls ─────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const s = sessionRef.current
    if (!s?.local) return
    const next = !s.muted
    s.muted = next
    s.local.getAudioTracks().forEach(t => { t.enabled = !next })
    setMuted(next)
  }, [])

  const toggleCamera = useCallback(() => {
    const s = sessionRef.current
    if (!s?.local || s.local.getVideoTracks().length === 0) return
    const next = !s.cameraOff
    s.cameraOff = next
    s.local.getVideoTracks().forEach(t => { t.enabled = !next })
    setCameraOff(next)
  }, [])

  const value = useMemo(() => ({
    call: view, startCall, endCall, busy: !!view,
  }), [view, startCall, endCall])

  return (
    <CallContext.Provider value={value}>
      {children}
      {view?.phase === 'incoming' && (
        <IncomingCallModal
          peer={view.peer}
          media={view.media}
          onAccept={acceptIncoming}
          onDecline={declineIncoming}
        />
      )}
      {view && view.phase !== 'incoming' && (
        <CallOverlay
          view={view}
          localStream={localStream}
          remoteStream={remoteStream}
          muted={muted}
          cameraOff={cameraOff}
          elapsed={elapsed}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
          onHangUp={endCall}
        />
      )}
      <CallNotice notice={notice} onDismiss={dismissNotice} />
    </CallContext.Provider>
  )
}

export function useCall() {
  return useContext(CallContext)
}
