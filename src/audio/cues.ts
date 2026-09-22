/**
 * The one-shots: bumps, landings, the countdown, the finish fanfare and the
 * "hovsa" of a car going over the edge.
 *
 * Each of them builds its own little graph, plays it, and disconnects itself
 * when it ends. Nothing is kept alive between hits, so a race cannot leak
 * nodes however many plates get flattened.
 */

import { AUDIO_MIX } from './mix'

export const CUES = {
  /**
   * A car pinned against a pot reports an impact EVERY tick — measured at 161
   * hits in 180 ticks — because the physics has to keep pushing or the car
   * sinks into the prop. One sound per report is a machine gun, so a fresh
   * bump is only allowed inside the gate when it is clearly harder than the
   * one that is still ringing. This belongs in the audio layer: the physics
   * must go on pushing every tick.
   */
  retrigger: {
    /** Seconds a source is held shut after it has sounded. */
    gateSeconds: 0.12,
    /** ...unless the new hit is this much stronger than the last one. */
    louderBy: 1.35,
  },
  impact: {
    /** Closing speed that sounds at all, in units per second. */
    minSpeed: 1.5,
    /** ...and the speed that sounds at full strength. */
    fullSpeed: 22,
    /** The knock: filtered noise, dull rather than a hiss. */
    noiseHz: 1250,
    noiseSeconds: 0.14,
    /** The body of the hit: a short, falling sine. */
    thudHz: 104,
    /** Where the thud slides to, as a share of where it started. */
    thudBend: 0.55,
    thudSeconds: 0.2,
    /** Share of the peak the noise takes; the thud takes the rest. */
    noiseMix: 0.55,
  },
  landing: {
    /** `landingImpact` below this is a kerb, not a landing. */
    threshold: 0.12,
    noiseHz: 620,
    noiseSeconds: 0.2,
    thudHz: 74,
    thudBend: 0.45,
    thudSeconds: 0.3,
    noiseMix: 0.45,
  },
  countdown: {
    /** 3, 2, 1 — short and dry. */
    beepHz: 640,
    beepSeconds: 0.14,
    beepWave: 'square',
    /** KØR! — longer, brighter, and a fifth up, so it reads as "go". */
    goHz: 960,
    goSeconds: 0.42,
    goWave: 'square',
    /** Lowpass over the square, so it is a beep and not a razor. */
    toneHz: 2600,
  },
  fanfare: {
    /** A major arpeggio with the octave on top: four notes, half a second. */
    rootHz: 523.25,
    semitones: [0, 4, 7, 12],
    spacing: 0.1,
    noteSeconds: 0.24,
    wave: 'triangle',
  },
  fall: {
    /** Hovsa. Down an octave and a half while the car drops. */
    fromHz: 560,
    toHz: 115,
    seconds: 0.85,
    wave: 'sine',
  },
} as const

/** Web Audio cannot ramp to zero exponentially; this is "silent enough". */
const SILENT = 0.0001

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/** A closing speed in units per second as a 0..1 loudness. */
export function impactStrength(speed: number): number {
  const { minSpeed, fullSpeed } = CUES.impact
  return clamp01((speed - minSpeed) / (fullSpeed - minSpeed))
}

/** Frees a finished one-shot's nodes the moment it stops sounding. */
function releaseOnEnd(source: AudioScheduledSourceNode, ...nodes: readonly AudioNode[]): void {
  source.onended = (): void => {
    source.disconnect()
    for (const node of nodes) node.disconnect()
  }
}

/** A burst of noise through a lowpass, decaying to nothing. */
function knock(
  context: AudioContext,
  destination: AudioNode,
  noise: AudioBuffer,
  peak: number,
  cutoffHz: number,
  seconds: number,
): void {
  const source = context.createBufferSource()
  source.buffer = noise
  // A random window into the noise bed, so two bumps are never the same bump.
  const offset = Math.random() * Math.max(0, noise.duration - seconds)
  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = cutoffHz
  const gain = context.createGain()
  const now = context.currentTime
  gain.gain.setValueAtTime(peak, now)
  gain.gain.exponentialRampToValueAtTime(SILENT, now + seconds)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(destination)
  releaseOnEnd(source, filter, gain)
  source.start(now, offset, seconds)
  source.stop(now + seconds)
}

/** A short tone that falls while it fades: the body of a hit. */
function thud(
  context: AudioContext,
  destination: AudioNode,
  peak: number,
  fromHz: number,
  bend: number,
  seconds: number,
): void {
  const osc = context.createOscillator()
  osc.type = 'sine'
  const gain = context.createGain()
  const now = context.currentTime
  osc.frequency.setValueAtTime(fromHz, now)
  osc.frequency.exponentialRampToValueAtTime(fromHz * bend, now + seconds)
  gain.gain.setValueAtTime(peak, now)
  gain.gain.exponentialRampToValueAtTime(SILENT, now + seconds)
  osc.connect(gain)
  gain.connect(destination)
  releaseOnEnd(osc, gain)
  osc.start(now)
  osc.stop(now + seconds)
}

/** Car into car, or car into pot. `strength` is 0..1. */
export function playImpact(
  context: AudioContext,
  destination: AudioNode,
  noise: AudioBuffer,
  strength: number,
): void {
  const peak = AUDIO_MIX.impact * clamp01(strength)
  const cue = CUES.impact
  knock(context, destination, noise, peak * cue.noiseMix, cue.noiseHz, cue.noiseSeconds)
  thud(context, destination, peak * (1 - cue.noiseMix), cue.thudHz, cue.thudBend, cue.thudSeconds)
}

/** Down from the ramp. `strength` is the car's own `landingImpact`. */
export function playLanding(
  context: AudioContext,
  destination: AudioNode,
  noise: AudioBuffer,
  strength: number,
): void {
  const peak = AUDIO_MIX.landing * clamp01(strength)
  const cue = CUES.landing
  knock(context, destination, noise, peak * cue.noiseMix, cue.noiseHz, cue.noiseSeconds)
  thud(context, destination, peak * (1 - cue.noiseMix), cue.thudHz, cue.thudBend, cue.thudSeconds)
}

/** 3, 2, 1 — and `go` for the longer, brighter one on KØR!. */
export function playBeep(context: AudioContext, destination: AudioNode, go: boolean): void {
  const cue = CUES.countdown
  const osc = context.createOscillator()
  osc.type = go ? cue.goWave : cue.beepWave
  osc.frequency.value = go ? cue.goHz : cue.beepHz
  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = cue.toneHz
  const gain = context.createGain()
  const now = context.currentTime
  const seconds = go ? cue.goSeconds : cue.beepSeconds
  gain.gain.setValueAtTime(AUDIO_MIX.beep, now)
  gain.gain.exponentialRampToValueAtTime(SILENT, now + seconds)
  osc.connect(filter)
  filter.connect(gain)
  gain.connect(destination)
  releaseOnEnd(osc, filter, gain)
  osc.start(now)
  osc.stop(now + seconds)
}

/** A car is home. Four notes, and then it is over. */
export function playFanfare(context: AudioContext, destination: AudioNode): void {
  const cue = CUES.fanfare
  const start = context.currentTime
  for (let index = 0; index < cue.semitones.length; index += 1) {
    const osc = context.createOscillator()
    osc.type = cue.wave
    osc.frequency.value = cue.rootHz * Math.pow(2, cue.semitones[index] / 12)
    const gain = context.createGain()
    const at = start + index * cue.spacing
    gain.gain.setValueAtTime(AUDIO_MIX.fanfare, at)
    gain.gain.exponentialRampToValueAtTime(SILENT, at + cue.noteSeconds)
    osc.connect(gain)
    gain.connect(destination)
    releaseOnEnd(osc, gain)
    osc.start(at)
    osc.stop(at + cue.noteSeconds)
  }
}

/** Over the edge: a tone falling for as long as the car does. */
export function playFall(context: AudioContext, destination: AudioNode): void {
  const cue = CUES.fall
  const osc = context.createOscillator()
  osc.type = cue.wave
  const gain = context.createGain()
  const now = context.currentTime
  osc.frequency.setValueAtTime(cue.fromHz, now)
  osc.frequency.exponentialRampToValueAtTime(cue.toHz, now + cue.seconds)
  gain.gain.setValueAtTime(AUDIO_MIX.fall, now)
  gain.gain.exponentialRampToValueAtTime(SILENT, now + cue.seconds)
  osc.connect(gain)
  gain.connect(destination)
  releaseOnEnd(osc, gain)
  osc.start(now)
  osc.stop(now + cue.seconds)
}
