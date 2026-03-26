'use client'

// ─── Heartbeat Sound Engine (Web Audio API) ───────────────────────────────
// Synthesizes a realistic heartbeat sound without external audio files.
// BPM changes dynamically as the donor gets closer.

let audioCtx: AudioContext | null = null
let heartbeatTimer: ReturnType<typeof setTimeout> | null = null
let currentBPM = 70
let isPlaying = false

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  return audioCtx
}

function playHeartbeatSound(ctx: AudioContext) {
  // "lub" sound
  const osc1 = ctx.createOscillator()
  const gain1 = ctx.createGain()
  osc1.connect(gain1)
  gain1.connect(ctx.destination)
  osc1.type = 'sine'
  osc1.frequency.setValueAtTime(80, ctx.currentTime)
  osc1.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.12)
  gain1.gain.setValueAtTime(0, ctx.currentTime)
  gain1.gain.linearRampToValueAtTime(0.6, ctx.currentTime + 0.02)
  gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
  osc1.start(ctx.currentTime)
  osc1.stop(ctx.currentTime + 0.15)

  // "dub" sound (slight delay)
  const osc2 = ctx.createOscillator()
  const gain2 = ctx.createGain()
  osc2.connect(gain2)
  gain2.connect(ctx.destination)
  osc2.type = 'sine'
  osc2.frequency.setValueAtTime(65, ctx.currentTime + 0.18)
  osc2.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 0.30)
  gain2.gain.setValueAtTime(0, ctx.currentTime + 0.18)
  gain2.gain.linearRampToValueAtTime(0.45, ctx.currentTime + 0.20)
  gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32)
  osc2.start(ctx.currentTime + 0.18)
  osc2.stop(ctx.currentTime + 0.33)
}

function scheduleNextBeat() {
  if (!isPlaying) return
  const intervalMs = (60 / currentBPM) * 1000

  heartbeatTimer = setTimeout(() => {
    try {
      const ctx = getAudioContext()
      if (ctx.state === 'suspended') ctx.resume()
      playHeartbeatSound(ctx)
    } catch {/* ignore */ }
    scheduleNextBeat()
  }, intervalMs)
}

export function startHeartbeat(bpm = 70) {
  stopHeartbeat()
  currentBPM = Math.max(40, Math.min(200, bpm))
  isPlaying = true
  scheduleNextBeat()
}

export function updateHeartbeatBPM(bpm: number) {
  currentBPM = Math.max(40, Math.min(200, bpm))
}

export function stopHeartbeat() {
  isPlaying = false
  if (heartbeatTimer !== null) {
    clearTimeout(heartbeatTimer)
    heartbeatTimer = null
  }
}

export function resumeAudioContext() {
  if (audioCtx?.state === 'suspended') {
    audioCtx.resume()
  }
}
