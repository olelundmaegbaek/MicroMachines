/**
 * Car-to-car collision. Two circles in the XZ plane, equal mass — the table is
 * flat and the cars are toys, so nothing here needs to be cleverer than that.
 *
 * Pure maths, type-only imports: runnable from Node like physics.ts.
 *
 * Shoving the opponent off the table edge is a DESIGN GOAL, not a bug, so there
 * is no clamping to the table anywhere in this file.
 */

import type { CarState } from './physics'

export const CAR_COLLISION = {
  /** The car is 4.0 x 1.8; 1.1 is a circle that hugs the body without snagging. */
  radius: 1.1,
  /** Toy cars are plastic: a clear bounce, but not a billiard ball. */
  restitution: 0.45,
  /** Overlap smaller than this is ignored, so two touching cars do not buzz. */
  slop: 0.02,
  /**
   * Share of the remaining overlap pushed out per tick. Below 1 the cars settle
   * over a couple of ticks instead of popping apart and bouncing back in.
   */
  separation: 0.8,
  /** Closing speed under this only separates the cars; no bounce, no twist. */
  minImpactSpeed: 0.4,
  /**
   * Yaw twist per unit of closing speed, in radians. Circles cannot transmit
   * torque, so this is a deliberate stand-in for the real thing: a car is a
   * rectangle, and a hit on a corner pushes through a point off the centre
   * line. Taking the contact point on an ellipse through the body gives a
   * twist proportional to -(nose . n)(left . n) — zero for a square nose-to-nose
   * or a square T-bone, strongest on a glancing corner hit, and always away
   * from the impact.
   */
  yawTwist: 0.02,
  /** Hard cap on one hit's twist, so a head-on at full speed cannot spin you. */
  maxYawTwist: 0.35,
} as const

function clamp(value: number, limit: number): number {
  return value < -limit ? -limit : value > limit ? limit : value
}

/** Folds an angle back into (-pi, pi]. */
function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

/**
 * The twist one car takes from a hit whose outward normal is (nx, nz).
 * Exported because the prop collision (`world/propCollision.ts`) is the same
 * hit with one body nailed to the table, and the twist must not be a second,
 * slightly different copy of this.
 */
export function twistFor(state: CarState, nx: number, nz: number, impact: number): number {
  const sinH = Math.sin(state.heading)
  const cosH = Math.cos(state.heading)
  const alongNose = nx * sinH + nz * cosH
  const alongLeft = nx * cosH - nz * sinH
  // 2 * a * b peaks at 1 for a 45-degree hit, which is where a glancing blow
  // spins a car the hardest.
  const lever = -2 * alongNose * alongLeft
  return clamp(CAR_COLLISION.yawTwist * impact * lever, CAR_COLLISION.maxYawTwist)
}

/**
 * Separates and bounces two cars if they overlap. Mutates position, velocity
 * and heading; the caller must run `refreshCarState` on both afterwards, since
 * the derived slip/speed are now stale.
 *
 * Returns the closing speed of the impact (0 when they were not touching, or
 * were already moving apart), for the sound and the visual thump.
 */
export function resolveCarCollision(a: CarState, b: CarState): number {
  const contact = CAR_COLLISION.radius * 2
  let dx = b.x - a.x
  let dz = b.z - a.z
  let distance = Math.hypot(dx, dz)
  if (distance >= contact) return 0

  if (distance < 1e-6) {
    // Exactly concentric: pick a fixed axis so the result stays deterministic.
    dx = 1
    dz = 0
    distance = 1e-6
  }
  const nx = dx / distance
  const nz = dz / distance

  const overlap = contact - distance
  if (overlap > CAR_COLLISION.slop) {
    const push = ((overlap - CAR_COLLISION.slop) * CAR_COLLISION.separation) / 2
    a.x -= nx * push
    a.z -= nz * push
    b.x += nx * push
    b.z += nz * push
  }

  // Closing speed along the normal. Positive means they are driving apart.
  const closing = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz
  if (closing >= 0) return 0
  const impact = -closing
  if (impact < CAR_COLLISION.minImpactSpeed) return impact

  // Equal masses, so each car takes half of the impulse.
  const push = ((1 + CAR_COLLISION.restitution) * impact) / 2
  a.vx -= nx * push
  a.vz -= nz * push
  b.vx += nx * push
  b.vz += nz * push

  a.heading = wrapAngle(a.heading + twistFor(a, nx, nz, impact))
  b.heading = wrapAngle(b.heading + twistFor(b, -nx, -nz, impact))

  return impact
}
