/**
 * WHEN a tyre raises dust, how much of it, and what the dust is made of.
 *
 * Pure numbers — no Three.js and no track import. The kind is decided from the
 * grip the track already reports under the car, matched against the track's
 * OWN zone table, so the flour is flour because the track says it is flour and
 * not because a threshold in here happens to agree with it.
 */

import type { ParticleKind } from './particles'

export const TYRE_DUST = {
  /** Particles per second from ONE rear wheel at full strength. */
  rate: {
    dust: 34,
    /** Flour goes up in a proper cloud; that is why the section is scary. */
    flour: 58,
    coffee: 40,
  },
  /** Slip below this is an ordinary corner and raises nothing. */
  slipThreshold: 0.18,
  /** No slip dust below this speed: a parking manoeuvre is not a drift. */
  minSpeed: 2.5,
  /** Wheelspin: the accelerator alone raises dust up to this speed. */
  spinSpeed: 12,
  /** What a standing start is worth, as a share of a full-blown drift. */
  spinShare: 0.55,
  /**
   * Hard cap per wheel per frame. A frame that ran five physics ticks must not
   * be allowed to empty the ring buffer into one puff.
   */
  maxPerFrame: 4,
  /** Share of the car's own velocity a puff keeps, thrown backwards. */
  wake: 0.18,
  /** Particles in a full-strength landing burst. */
  landingBurst: 24,
  /** How hard they are thrown outwards, in units per second. */
  landingSpeed: 5.5,
  /** A `landingImpact` below this is a kerb, not a landing. */
  landingThreshold: 0.12,
  /** Slack on the float compare against the track's zone grips. */
  gripEpsilon: 0.01,
} as const

/** Zone ids from the track that have a dust of their own. */
const KIND_BY_ZONE: Readonly<Record<string, ParticleKind>> = {
  flour: 'flour',
  coffee: 'coffee',
}

/** A grip zone as the dust reads it. `track/kitchenTable.ts` owns the values. */
export interface DustZone {
  readonly id: string
  readonly grip: number
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/**
 * What the car is driving on, from the grip under it. The zones come from the
 * track, so there is exactly one place where "flour is 0.40" is written down.
 */
export function dustKindForGrip(grip: number, zones: readonly DustZone[]): ParticleKind {
  for (const zone of zones) {
    if (Math.abs(grip - zone.grip) > TYRE_DUST.gripEpsilon) continue
    const kind = KIND_BY_ZONE[zone.id]
    if (kind) return kind
  }
  return 'dust'
}

/**
 * How hard the rear tyres are working, 0..1. Either the car is sideways, or it
 * is trying to put power down from a standstill; both scrub the surface.
 */
export function dustStrength(
  slip: number,
  speed: number,
  throttle: number,
  airborne: boolean,
): number {
  if (airborne) return 0
  const sliding =
    speed >= TYRE_DUST.minSpeed && slip > TYRE_DUST.slipThreshold
      ? (slip - TYRE_DUST.slipThreshold) / (1 - TYRE_DUST.slipThreshold)
      : 0
  const spinning =
    throttle > 0 ? clamp01(1 - speed / TYRE_DUST.spinSpeed) * TYRE_DUST.spinShare : 0
  return clamp01(Math.max(sliding, spinning))
}

/** Particles per second from ONE rear wheel, for that surface. */
export function dustRate(kind: ParticleKind, strength: number): number {
  return TYRE_DUST.rate[kind] * clamp01(strength)
}

/** How many particles a landing throws up, from the car's `landingImpact`. */
export function landingBurstCount(impact: number): number {
  if (impact < TYRE_DUST.landingThreshold) return 0
  return Math.round(TYRE_DUST.landingBurst * clamp01(impact))
}
