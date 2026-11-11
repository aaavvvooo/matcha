// A short repeating two-tone ring for an incoming call, made with WebAudio (no audio file).
// Browsers refuse to start audio before the user has interacted with the page, and an attempt
// logs a console warning, so the tone only plays once the page has had a user gesture.
// Returns a stop function (a no-op when nothing was started).
export function startRingtone() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx || !navigator.userActivation?.hasBeenActive) return () => {}

  let ctx
  try {
    ctx = new AudioCtx()
  } catch {
    return () => {}
  }
  if (ctx.state === 'suspended') {
    // Not allowed to start after all: stay silent rather than queue a resume the browser rejects.
    ctx.close().catch(() => {})
    return () => {}
  }

  function beep(freq, start, length) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.12, start + 0.03)
    gain.gain.linearRampToValueAtTime(0, start + length)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(start)
    osc.stop(start + length + 0.05)
  }
  function ring() {
    const t = ctx.currentTime
    beep(440, t, 0.35)
    beep(480, t + 0.45, 0.35)
  }

  ring()
  const timer = setInterval(ring, 2500)
  return () => {
    clearInterval(timer)
    ctx.close().catch(() => {})
  }
}
