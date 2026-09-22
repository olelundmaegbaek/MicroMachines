/**
 * One engine, one car. Two oscillators tuned an interval apart through a
 * lowpass filter, with a slow wobble on both, so the result has overtones and
 * a bit of life rather than being the flute a bare sine gives you.
 *
 * The pitch is never written straight onto the oscillator: every parameter is
 * moved with `setTargetAtTime`, so it GLIDES. Writing a new frequency each
 * frame steps the waveform and clicks, audibly, sixty times a second.
 *
 * `CAR_TUNING` is the only import: the note has to follow the same top speed
 * the car actually has, and a second copy of 46 in this file would drift the
 * day the handling is retuned.
 */

import { CAR_TUNING } from '../car/physics'
import type { CarSound } from './carSound'
import { AUDIO_MIX } from './mix'

export const ENGINE_SOUND = {
  /** Time constant of the pitch glide, in seconds. The anti-click. */
  glide: 0.07,
  /** The same for gain and filter, which may be a shade lazier. */
  breathe: 0.09,
  /** Share of the voice's peak that is there at idle... */
  idleGain: 0.45,
  /** ...and the share the accelerator adds on top. Together: 1. */
  throttleGain: 0.55,
  /**
   * Off the throttle the note sags a little below what the speed alone would
   * give. That drop, together with the filter closing, is the whole difference
   * between an engine and a buzzer.
   */
  offThrottleBend: 0.93,
  /** How far the filter opens when coasting, as a share of full throttle. */
  coastDrive: 0.32,
  /** Resonance of the lowpass. Enough to give the note a formant, not a whine. */
  resonance: 3.5,
  /** Depth of the wobble on the pitch, in cents. A few percent, no more. */
  wobbleCents: 11,
  /** Depth of the wobble on the cutoff, as a share of the cutoff. */
  wobbleFilter: 0.14,
  /** Time constant used to fade a whole engine in and out (car select). */
  fade: 0.15,
} as const

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/** 0..1 of the rev range, from the car's horizontal speed. */
export function engineRev(sound: CarSound, speed: number): number {
  return Math.pow(clamp01(Math.abs(speed) / CAR_TUNING.maxSpeed), sound.revCurve)
}

/**
 * The fundamental this car sings at that speed, in Hz. Pure, and exported so
 * the curve can be measured in Node instead of trusted.
 */
export function engineHz(sound: CarSound, speed: number, throttle: number): number {
  const hz = sound.idleHz + (sound.topHz - sound.idleHz) * engineRev(sound, speed)
  return throttle > 0 ? hz : hz * ENGINE_SOUND.offThrottleBend
}

/** Lowpass cutoff in Hz. Off the throttle the note thins out. */
export function engineCutoffHz(sound: CarSound, speed: number, throttle: number): number {
  const drive = ENGINE_SOUND.coastDrive + (1 - ENGINE_SOUND.coastDrive) * clamp01(throttle)
  return sound.toneHz + (sound.brightHz - sound.toneHz) * engineRev(sound, speed) * drive
}

export interface EngineVoice {
  /** One FRAME's parameters — never called from the physics tick. */
  update(speed: number, throttle: number, running: boolean): void
  dispose(): void
}

export function createEngineVoice(
  context: AudioContext,
  destination: AudioNode,
  sound: CarSound,
): EngineVoice {
  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = sound.toneHz
  filter.Q.value = ENGINE_SOUND.resonance

  const voice = context.createGain()
  voice.gain.value = 0
  filter.connect(voice)
  voice.connect(destination)

  const base = context.createOscillator()
  base.type = sound.wave
  base.frequency.value = sound.idleHz
  const baseGain = context.createGain()
  // The two oscillator gains sum to exactly 1, so the voice's peak is its
  // gain and the mix budget in AUDIO_MIX is arithmetic rather than hopeful.
  baseGain.gain.value = 1 - sound.overtoneMix
  base.connect(baseGain)
  baseGain.connect(filter)

  const overtone = context.createOscillator()
  overtone.type = sound.overtoneWave
  overtone.frequency.value = sound.idleHz * sound.overtone
  const overtoneGain = context.createGain()
  overtoneGain.gain.value = sound.overtoneMix
  overtone.connect(overtoneGain)
  overtoneGain.connect(filter)

  // The wobble. Without it the note is mathematically steady, which no engine
  // ever is: a few cents of pitch and a seventh of the cutoff, slowly.
  const wobble = context.createOscillator()
  wobble.type = 'sine'
  wobble.frequency.value = sound.wobbleHz
  const wobblePitch = context.createGain()
  wobblePitch.gain.value = ENGINE_SOUND.wobbleCents
  wobble.connect(wobblePitch)
  wobblePitch.connect(base.detune)
  wobblePitch.connect(overtone.detune)
  const wobbleCutoff = context.createGain()
  wobbleCutoff.gain.value = sound.toneHz * ENGINE_SOUND.wobbleFilter
  wobble.connect(wobbleCutoff)
  wobbleCutoff.connect(filter.frequency)

  base.start()
  overtone.start()
  wobble.start()

  return {
    update(speed, throttle, running): void {
      const now = context.currentTime
      const hz = engineHz(sound, speed, throttle)
      base.frequency.setTargetAtTime(hz, now, ENGINE_SOUND.glide)
      overtone.frequency.setTargetAtTime(hz * sound.overtone, now, ENGINE_SOUND.glide)

      const cutoff = engineCutoffHz(sound, speed, throttle)
      filter.frequency.setTargetAtTime(cutoff, now, ENGINE_SOUND.breathe)
      wobbleCutoff.gain.setTargetAtTime(
        cutoff * ENGINE_SOUND.wobbleFilter,
        now,
        ENGINE_SOUND.breathe,
      )

      const load = ENGINE_SOUND.idleGain + ENGINE_SOUND.throttleGain * clamp01(throttle)
      const level = running ? AUDIO_MIX.engine * load : 0
      voice.gain.setTargetAtTime(level, now, running ? ENGINE_SOUND.breathe : ENGINE_SOUND.fade)
    },
    dispose(): void {
      try {
        base.stop()
        overtone.stop()
        wobble.stop()
      } catch {
        // Already stopped: disposing twice must not take the game with it.
      }
      base.disconnect()
      overtone.disconnect()
      wobble.disconnect()
      baseGain.disconnect()
      overtoneGain.disconnect()
      wobblePitch.disconnect()
      wobbleCutoff.disconnect()
      filter.disconnect()
      voice.disconnect()
    },
  }
}
