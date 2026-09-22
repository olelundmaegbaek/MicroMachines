/**
 * The game's one audio object: two engines, two tyre squeals, the one-shots,
 * the mute, and the unlock that a browser insists on.
 *
 * Two rules shape the whole file.
 *
 * 1. NOTHING here may break the game. If Web Audio is missing or the context
 *    refuses to start, `createGameAudio` hands back a silent stand-in with the
 *    same methods and the race is played in silence.
 * 2. Web Audio runs on its own clock, so parameters are written ONCE PER
 *    FRAME, in `update`. The physics tick may call the cue methods
 *    (`impact`, `landing`, ...) as often as it likes: they only note a number
 *    down, and `update` is what turns the loudest of them into a sound.
 */

import type { CarSound } from './carSound'
import {
  CUES,
  impactStrength,
  playBeep,
  playFall,
  playFanfare,
  playImpact,
  playLanding,
} from './cues'
import { createEngineVoice, type EngineVoice } from './engine'
import { AUDIO_MIX, createAudioOutput, hostWindow, loadMuted, saveMuted } from './mix'
import { createNoiseBuffer, createSquealVoice, type SquealVoice } from './tyres'

/** What one car sounds like RIGHT NOW. Plain numbers — no car model in here. */
export interface AudioCarView {
  /** Horizontal speed in units per second. */
  speed: number
  /** 0..1 from the physics: 0 tracking, 1 fully sideways. */
  slip: number
  /** 0..1 accelerator. */
  throttle: number
  airborne: boolean
  /** False on the car select, where an idling engine would only nag. */
  running: boolean
}

export interface GameAudio {
  /** False when the browser gave us no audio at all. */
  readonly available: boolean
  readonly muted: boolean
  /** `M`. Remembered in localStorage. */
  toggleMute(): void
  /** Which car each player drives. A cue: the voices are rebuilt in `update`. */
  setCars(sounds: readonly CarSound[]): void
  /** One frame. The ONLY place Web Audio parameters are written. */
  update(cars: readonly AudioCarView[]): void
  /** Car into car, or car into prop. `speed` is the closing speed. */
  impact(speed: number): void
  /** Down from the ramp. `strength` is the car's own `landingImpact`. */
  landing(strength: number): void
  /** 3, 2, 1 as 3, 2, 1 — and 0 for KØR!. */
  countdown(step: number): void
  /** A car crossed the line. */
  finish(): void
  /** A car went over the edge. */
  fall(): void
  dispose(): void
}

/** The whole game, minus the sound. Every method is here, all of them do nothing. */
function silentAudio(): GameAudio {
  let muted = loadMuted()
  return {
    available: false,
    get muted(): boolean {
      return muted
    },
    toggleMute(): void {
      muted = !muted
      saveMuted(muted)
    },
    setCars(): void {},
    update(): void {},
    impact(): void {},
    landing(): void {},
    countdown(): void {},
    finish(): void {},
    fall(): void {},
    dispose(): void {},
  }
}

export function createGameAudio(): GameAudio {
  const output = createAudioOutput()
  if (!output) return silentAudio()

  const { context, master } = output
  let noise: AudioBuffer
  try {
    noise = createNoiseBuffer(context)
  } catch {
    output.close()
    return silentAudio()
  }

  let muted = loadMuted()
  master.gain.value = muted ? 0 : AUDIO_MIX.master

  const engines: (EngineVoice | null)[] = []
  const squeals: (SquealVoice | null)[] = []
  /** The spec each player's voices were BUILT from, to spot a car change. */
  const built: (CarSound | null)[] = []
  let wanted: readonly CarSound[] = []

  // Cues, queued by the physics tick and spent once per frame.
  let pendingImpact = 0
  let pendingLanding = 0
  let pendingCountdown: number | null = null
  let pendingFinish = false
  let pendingFall = false

  // The retrigger gate. See CUES.retrigger: a car leaning on a pot reports a
  // hit every single tick, and one sound per hit is a machine gun.
  let lastImpactAt = Number.NEGATIVE_INFINITY
  let lastImpactStrength = 0
  let lastLandingAt = Number.NEGATIVE_INFINITY
  let lastLandingStrength = 0

  const passesGate = (strength: number, previous: number, since: number): boolean => {
    if (strength <= 0) return false
    if (since >= CUES.retrigger.gateSeconds) return true
    return strength > previous * CUES.retrigger.louderBy
  }

  const buildVoices = (): void => {
    for (let player = 0; player < wanted.length; player += 1) {
      const sound = wanted[player]
      if (built[player] === sound) continue
      engines[player]?.dispose()
      squeals[player]?.dispose()
      try {
        engines[player] = createEngineVoice(context, master, sound)
        squeals[player] = createSquealVoice(context, master, noise, sound)
        built[player] = sound
      } catch {
        // One car without an engine must not silence the other.
        engines[player] = null
        squeals[player] = null
        built[player] = sound
      }
    }
  }

  /**
   * A context starts SUSPENDED until the user has touched something, and the
   * classic mistake is to never resume it: the game is then silent for
   * everyone who does not know to press something twice. The listener sits on
   * the real events, not on the game loop, because a resume outside a gesture
   * is what some browsers refuse.
   */
  const host = hostWindow()
  const unlock = (): void => {
    try {
      void context.resume().then(() => {
        if (context.state === 'running') detach()
      })
    } catch {
      detach()
    }
  }
  const detach = (): void => {
    host?.removeEventListener('keydown', unlock)
    host?.removeEventListener('pointerdown', unlock)
  }
  host?.addEventListener('keydown', unlock)
  host?.addEventListener('pointerdown', unlock)

  const flushCues = (): void => {
    // Nothing is scheduled on a suspended context: it would all pile up and
    // fire at once the moment the player finally presses a key.
    if (context.state !== 'running') {
      pendingImpact = 0
      pendingLanding = 0
      pendingCountdown = null
      pendingFinish = false
      pendingFall = false
      return
    }
    const now = context.currentTime

    if (passesGate(pendingImpact, lastImpactStrength, now - lastImpactAt)) {
      playImpact(context, master, noise, pendingImpact)
      lastImpactAt = now
      lastImpactStrength = pendingImpact
    }
    pendingImpact = 0

    if (passesGate(pendingLanding, lastLandingStrength, now - lastLandingAt)) {
      playLanding(context, master, noise, pendingLanding)
      lastLandingAt = now
      lastLandingStrength = pendingLanding
    }
    pendingLanding = 0

    if (pendingCountdown !== null) {
      playBeep(context, master, pendingCountdown === 0)
      pendingCountdown = null
    }
    if (pendingFinish) {
      playFanfare(context, master)
      pendingFinish = false
    }
    if (pendingFall) {
      playFall(context, master)
      pendingFall = false
    }
  }

  return {
    available: true,
    get muted(): boolean {
      return muted
    },

    toggleMute(): void {
      muted = !muted
      saveMuted(muted)
      try {
        master.gain.setTargetAtTime(
          muted ? 0 : AUDIO_MIX.master,
          context.currentTime,
          AUDIO_MIX.muteFade,
        )
      } catch {
        // A closed context. The mute is remembered either way.
      }
    },

    setCars(sounds): void {
      wanted = sounds
    },

    update(cars): void {
      try {
        buildVoices()
        for (let player = 0; player < cars.length; player += 1) {
          const car = cars[player]
          engines[player]?.update(car.speed, car.throttle, car.running)
          squeals[player]?.update(car.slip, car.speed, car.airborne)
        }
        flushCues()
      } catch {
        // A frame without sound is a frame without sound. The race goes on.
      }
    },

    impact(speed): void {
      const strength = impactStrength(speed)
      if (strength > pendingImpact) pendingImpact = strength
    },

    landing(strength): void {
      if (strength < CUES.landing.threshold) return
      if (strength > pendingLanding) pendingLanding = strength
    },

    countdown(step): void {
      pendingCountdown = step
    },

    finish(): void {
      pendingFinish = true
    },

    fall(): void {
      pendingFall = true
    },

    dispose(): void {
      detach()
      for (const engine of engines) engine?.dispose()
      for (const squeal of squeals) squeal?.dispose()
      engines.length = 0
      squeals.length = 0
      built.length = 0
      output.close()
    },
  }
}
