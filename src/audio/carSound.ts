/**
 * What ONE car sounds like, as data. The catalog (`car/catalog.ts`) owns the
 * values — a third car is one more entry there, and nothing in the audio code
 * knows how many cars exist.
 *
 * The two cars drive identically (docs/UI.md is explicit about that), so the
 * difference is purely in the ear: a different fundamental, a different
 * overtone and a different filter colour, or the splitscreen turns into one
 * undifferentiated drone.
 */
export interface CarSound {
  /** Fundamental at a standstill, in Hz. */
  readonly idleHz: number
  /** Fundamental at CAR_TUNING.maxSpeed, in Hz. */
  readonly topHz: number
  /**
   * Shape of the rev climb, as an exponent on the normalised speed. Below 1
   * the note picks up hard off the line and flattens out at speed, which is
   * what a small engine with too few gears does.
   */
  readonly revCurve: number
  /** Waveform of the fundamental. A sine alone whistles; these have edges. */
  readonly wave: OscillatorType
  /** The second oscillator's interval: 1.5 is a fifth, 2 an octave. */
  readonly overtone: number
  readonly overtoneWave: OscillatorType
  /** The overtone's share of the voice, 0..1. The fundamental takes the rest. */
  readonly overtoneMix: number
  /** Lowpass cutoff at idle, in Hz. Low is muffled, high is raspy. */
  readonly toneHz: number
  /** Lowpass cutoff flat out on the throttle, in Hz. */
  readonly brightHz: number
  /** Speed of the slow wobble that keeps the note from sounding synthetic. */
  readonly wobbleHz: number
  /**
   * Multiplier on the tyre squeal's band, so two cars sliding side by side are
   * still two cars and not one thick hiss.
   */
  readonly squealTilt: number
}
