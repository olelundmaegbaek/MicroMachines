/**
 * Tyre squeal: filtered noise whose loudness and band follow the car's own
 * `slip`, which the physics already computes as 0..1.
 *
 * It fades rather than switches. A gate that snapped on at a slip threshold
 * would chirp in and out through every corner; `setTargetAtTime` with a fast
 * attack and a slower release gives the "coming and going" the brief asks for,
 * and costs one line.
 */

import type { CarSound } from './carSound'
import { AUDIO_MIX } from './mix'

export const TYRE_SOUND = {
  /** Length of the looping noise bed. Long enough not to hear the loop. */
  noiseSeconds: 2,
  /** Centre of the band at the threshold of sliding, in Hz. */
  fromHz: 740,
  /** ...and when the car is fully sideways. */
  toHz: 2150,
  /** Bandwidth. Higher is a narrower, more tyre-like squeal. */
  q: 3.5,
  /** Time constant going up — a tyre lets go quickly. */
  rise: 0.05,
  /** ...and coming down, which is slower, as the slide washes off. */
  fall: 0.14,
  /** Slip below this is an ordinary corner and makes no sound at all. */
  threshold: 0.15,
  /** No squeal below this speed: a parking manoeuvre is not a drift. */
  minSpeed: 4,
  /** Speed at which a slide squeals at full strength. */
  fullSpeed: 12,
  /** Exponent on the slip: above 1 it keeps a light slide discreet. */
  curve: 1.4,
} as const

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/** How hard this car's tyres are screaming right now, 0..1. */
export function squealStrength(slip: number, speed: number, airborne: boolean): number {
  if (airborne) return 0
  if (slip <= TYRE_SOUND.threshold) return 0
  const slide = (slip - TYRE_SOUND.threshold) / (1 - TYRE_SOUND.threshold)
  const bite = clamp01((speed - TYRE_SOUND.minSpeed) / (TYRE_SOUND.fullSpeed - TYRE_SOUND.minSpeed))
  return Math.pow(clamp01(slide), TYRE_SOUND.curve) * bite
}

/**
 * ONE buffer of white noise for the whole game. Both squeals, every bump and
 * every landing read from it — a fresh buffer per sound would allocate a
 * couple of hundred kilobytes in the middle of a race.
 */
export function createNoiseBuffer(context: AudioContext): AudioBuffer {
  const frames = Math.floor(context.sampleRate * TYRE_SOUND.noiseSeconds)
  const buffer = context.createBuffer(1, frames, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let frame = 0; frame < frames; frame += 1) data[frame] = Math.random() * 2 - 1
  return buffer
}

export interface SquealVoice {
  /** One FRAME's parameters — never called from the physics tick. */
  update(slip: number, speed: number, airborne: boolean): void
  dispose(): void
}

export function createSquealVoice(
  context: AudioContext,
  destination: AudioNode,
  noise: AudioBuffer,
  sound: CarSound,
): SquealVoice {
  const source = context.createBufferSource()
  source.buffer = noise
  source.loop = true

  const band = context.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = TYRE_SOUND.fromHz * sound.squealTilt
  band.Q.value = TYRE_SOUND.q

  const voice = context.createGain()
  voice.gain.value = 0

  source.connect(band)
  band.connect(voice)
  voice.connect(destination)
  source.start()

  let previous = 0

  return {
    update(slip, speed, airborne): void {
      const strength = squealStrength(slip, speed, airborne)
      const now = context.currentTime
      const hz = TYRE_SOUND.fromHz + (TYRE_SOUND.toHz - TYRE_SOUND.fromHz) * strength
      band.frequency.setTargetAtTime(hz * sound.squealTilt, now, TYRE_SOUND.rise)
      voice.gain.setTargetAtTime(
        AUDIO_MIX.squeal * strength,
        now,
        strength >= previous ? TYRE_SOUND.rise : TYRE_SOUND.fall,
      )
      previous = strength
    },
    dispose(): void {
      try {
        source.stop()
      } catch {
        // Already stopped.
      }
      source.disconnect()
      band.disconnect()
      voice.disconnect()
    },
  }
}
