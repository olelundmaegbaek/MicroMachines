/** Shared, engine-agnostic types. Nothing in here may import Three.js. */

/** Player 1 is index 0 (top half of the screen), player 2 is index 1. */
export type PlayerId = 0 | 1

/** One player's control state for a single physics tick. */
export interface Controls {
  /** 0..1 */
  throttle: number
  /** 0..1 */
  brake: number
  /** -1..1, negative is left. */
  steer: number
  handbrake: boolean
}

/**
 * The pose the chase camera follows.
 *
 * BINDING heading convention, shared with the phase 2 car model: `heading` is
 * a yaw in radians, 0 points along +Z, and it grows counter-clockwise seen
 * from above (so increasing heading turns LEFT). The forward vector is
 * `(sin(heading), 0, cos(heading))`, which is exactly what you get by setting
 * `object.rotation.y = heading` on a mesh whose nose points along local +Z.
 */
export interface CarPose {
  x: number
  y: number
  z: number
  heading: number
  /** Signed forward speed in units per second; negative is reversing. */
  speed: number
}

/**
 * A scissor/viewport rectangle in CSS pixels, in WebGL coordinates: the origin
 * is the BOTTOM-left corner of the canvas.
 */
export interface ViewportRect {
  x: number
  y: number
  width: number
  height: number
  /** width / height of this rectangle — never the full canvas aspect. */
  aspect: number
}
