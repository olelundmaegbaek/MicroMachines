/**
 * The output stage: one AudioContext, one master GainNode every voice goes
 * through, and the gain budget the whole game has to fit inside.
 *
 * NO Three.js in here, and no game logic. Above all, nothing in this file may
 * throw when the browser has no Web Audio, a private tab refuses storage, or
 * the context cannot be created: `createAudioOutput` returns null and the game
 * runs on in silence. Sound is the last tenth, never a dependency.
 */

/**
 * Every gain in the game, as PEAK AMPLITUDE at the master node's input, and
 * the ceiling they all have to stay under. Tune the loudness here, nowhere
 * else.
 *
 * The budget is deliberately arithmetic rather than hopeful: the worst case a
 * race can actually produce — both engines flat out, both cars sideways and a
 * car-to-car bump in the same millisecond — is `worstCasePeak()`, and that is
 * what the verification checks against `ceiling`.
 */
export const AUDIO_MIX = {
  /** Master gain. Everything is multiplied by this one number. */
  master: 0.5,
  /** Peak ONE engine may reach, both of its oscillators summed. */
  engine: 0.26,
  /** Peak ONE tyre squeal may reach. */
  squeal: 0.13,
  /** The loudest one-shot: a car-to-car bump at full closing speed. */
  impact: 0.5,
  /** Coming down off the ramp. Duller and a shade quieter than a bump. */
  landing: 0.42,
  /** One countdown beep. */
  beep: 0.3,
  /** One note of the finish fanfare — the notes overlap by a hair. */
  fanfare: 0.26,
  /** The falling "hovsa". */
  fall: 0.3,
  /** Digital full scale. Anything above this clips. */
  ceiling: 1,
  /** Cars that can sound at once. Two players, two engines, two squeals. */
  voices: 2,
  /** Seconds the master takes to reach a new value, i.e. the mute fade. */
  muteFade: 0.06,
  /**
   * A backstop AFTER the master gain, for the pile-up the budget below does
   * not price in (a bump, a landing and a fanfare in the same frame). At
   * -3 dBFS it sits above everything a race actually produces, so ordinary
   * play never touches it and it cannot pump the engines.
   */
  limiter: {
    threshold: -3,
    knee: 0,
    ratio: 20,
    attack: 0.002,
    release: 0.1,
  },
} as const

/**
 * The loudest moment a race can produce, at the speakers: both engines at top
 * speed, both cars squealing, and a bump on top. Exported so the verification
 * measures the real constants instead of a number copied into a script.
 */
export function worstCasePeak(): number {
  const voices = AUDIO_MIX.voices * (AUDIO_MIX.engine + AUDIO_MIX.squeal)
  return (voices + AUDIO_MIX.impact) * AUDIO_MIX.master
}

/** Where the mute choice is remembered between visits. */
const MUTE_KEY = 'micromachines.muted'

/**
 * Both storage calls are wrapped: `localStorage` THROWS in a private tab (and
 * does not exist at all outside a browser), and a game that will not start
 * because it could not remember a mute setting would be a poor joke.
 */
export function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    // A private tab. The setting simply does not survive the visit.
  }
}

export interface AudioOutput {
  readonly context: AudioContext
  /** Every voice connects here, and nowhere else. */
  readonly master: GainNode
  /** Releases the context and everything hanging off the master. */
  close(): void
}

/** The window, when there is one. The verification harness runs in Node. */
export function hostWindow(): (Window & typeof globalThis) | null {
  return typeof window === 'undefined' ? null : window
}

/**
 * Builds the output stage, or returns null if this browser cannot. Every
 * caller has to handle null — that is the whole contract of the audio module.
 */
export function createAudioOutput(): AudioOutput | null {
  if (typeof AudioContext === 'undefined') return null
  try {
    const context = new AudioContext()
    const master = context.createGain()
    master.gain.value = 0
    const limiter = context.createDynamicsCompressor()
    limiter.threshold.value = AUDIO_MIX.limiter.threshold
    limiter.knee.value = AUDIO_MIX.limiter.knee
    limiter.ratio.value = AUDIO_MIX.limiter.ratio
    limiter.attack.value = AUDIO_MIX.limiter.attack
    limiter.release.value = AUDIO_MIX.limiter.release
    master.connect(limiter)
    limiter.connect(context.destination)
    return {
      context,
      master,
      close(): void {
        try {
          master.disconnect()
          limiter.disconnect()
          void context.close()
        } catch {
          // Already closed, or closing while a node was still stopping.
        }
      },
    }
  } catch {
    return null
  }
}
