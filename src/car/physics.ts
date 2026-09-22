/**
 * The arcade drift model. Hand-written, not a physics engine: the point is a
 * car that is fun to throw sideways, not a tyre model.
 *
 * Pure maths — no Three.js, no DOM. The only import is a type, which means the
 * file can be run straight from Node (`node script.mjs` importing this .ts) and
 * the handling can be measured instead of guessed.
 *
 * Axis conventions come from types.ts and are BINDING: `heading` is a yaw in
 * radians, 0 points along +Z and it grows counter-clockwise seen from above, so
 * the nose is `(sin h, 0, cos h)` and the car's own +X axis — the one lateral
 * speed is measured along — points to its LEFT, `(cos h, 0, -sin h)`.
 */

import type { Controls } from '../types'

/**
 * Every number that decides how the car feels. Tune here, nowhere else.
 * Units are world units and seconds (one world unit is ~1.75 cm, see
 * constants.ts), so 46 u/s is a toy car crossing the 130-unit table in under
 * three seconds.
 *
 * Drag and top speed
 * ------------------
 * Thrust falls off linearly with speed so the car eases up to its top speed
 * instead of slamming into a clamp:
 *   thrust(v) = engineAccel * (1 - v / (maxSpeed * engineHeadroom))
 * Drag is rolling (linear in v) plus air (quadratic):
 *   drag(v) = linearDrag * v + quadraticDrag * v^2
 * Top speed is where the two meet, so we pick the top speed and solve for the
 * drag rather than the other way round:
 *   thrust(maxSpeed) = 32 * (1 - 1/1.4)   = 9.14 u/s^2
 *   linearDrag       = 0.4 * 9.14 / 46    = 0.0795  1/s
 *   quadraticDrag    = 0.6 * 9.14 / 46^2  = 0.00259 1/u
 * The 40/60 split between rolling and air drag is a feel choice: it makes the
 * car shed ~7.9 u/s in the first second off the throttle at top speed, and far
 * less at low speed, so a lifted throttle mid-corner does not stop the car
 * dead.
 */
export const CAR_TUNING = {
  /** Steady-state speed at full throttle on a flat, full-grip surface. */
  maxSpeed: 46,
  /** Engine ceiling in reverse; drag lands the real figure a touch under it. */
  reverseMaxSpeed: 14,
  /**
   * Forward acceleration at a standstill. Raised from the 26 the plan started
   * from: with 26 the car needs 3.7 s to reach 90 % of top speed, and 32 puts
   * it at 3.00 s, which is the "about three seconds" the plan asks for.
   */
  engineAccel: 32,
  /** Reverse is deliberately lazy — this is an escape gear, not a race gear. */
  reverseAccel: 16,
  brakeDecel: 40,
  /** How far past maxSpeed the bare engine curve would pull. See above. */
  engineHeadroom: 1.4,
  linearDrag: 0.0795,
  quadraticDrag: 0.00259,

  /** Front-to-rear axle distance for the bicycle model. */
  wheelBase: 2.6,
  /** Full lock at a crawl. */
  maxSteerAngleLowSpeed: 0.62,
  /** Full lock at top speed — a car that steers 0.62 rad at 46 u/s is nervous. */
  maxSteerAngleTopSpeed: 0.22,
  /**
   * The road wheels take time to reach the commanded angle. A keyboard is a
   * digital input: without this the car snaps to full lock in one tick and
   * twitches instead of turning in.
   */
  steerRate: 5.5,
  /** Coming back to centre is quicker than going to lock, as in a real car. */
  steerReturnRate: 8.0,

  /**
   * Lateral velocity is damped exponentially: vLat *= exp(-grip * dt). High
   * grip means the car follows its nose, low grip means the tail runs wide.
   * THIS is where the drift lives.
   */
  lateralGrip: 7.0,
  /** The handbrake all but removes the rear grip... */
  handbrakeGripFactor: 0.12,
  /** ...and kicks the car's own yaw in the steered direction (rad/s). */
  handbrakeYawBoost: 1.8,
  /** Speed at which the yaw kick is fully applied. */
  handbrakeYawSpeed: 16,

  gravity: 55,
  /** In the air the steering still bites this much — toy-like, and it is fun. */
  airControl: 0.35,
  /** Vertical speed that counts as a full-strength landing. */
  landingSpeed: 30,
  /** Half-life of the landing impact value the visuals squash with. */
  landingFadeSeconds: 0.12,

  /**
   * Slip angle (rad) where a tyre starts to mark and squeal, and where it is
   * sliding as hard as the model reports. Widened from the 0.10/0.55 the plan
   * started from: a steady full-lock corner sits at 0.39 rad all on its own, so
   * with 0.10 the car reported slip 0.64 and laid black lines through every
   * ordinary corner. 0.25 keeps the marks for when the car is properly sideways.
   */
  slipAngleStart: 0.25,
  slipAngleFull: 0.75,
  /** Below this speed slip is noise, not a drift. */
  slipMinSpeed: 3,
  /** Below this the car is parked: kills the creep from the linear drag tail. */
  restSpeed: 0.08,
} as const

/** Nothing under the car (off the table edge). */
export const NO_GROUND = Number.NEGATIVE_INFINITY

/** Denominator guard in the slip angle, per the model definition. */
const SLIP_EPSILON = 0.5

/** Where a car starts, and where the temporary respawn puts it back. */
export interface CarStart {
  x: number
  z: number
  heading: number
}

export interface CarState {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  heading: number
  yawRate: number
  airborne: boolean

  /** Derived, refreshed every tick — see `refreshCarState`. */
  /** Signed speed along the nose; negative is reversing. */
  forwardSpeed: number
  /** Signed speed along the car's own +X axis, i.e. positive = sliding left. */
  lateralSpeed: number
  /** Horizontal speed, always >= 0. */
  speed: number
  /** atan2(lateral, |forward|) in radians; sign follows `lateralSpeed`. */
  slipAngle: number
  /** 0 = tracking, 1 = fully sideways. Drives squeal, skid marks and smoke. */
  slip: number
  /** Current road-wheel angle, positive = steering left. The view reads this. */
  steerAngle: number
  /** 0..1, set on touchdown and decaying; the visuals squash the body with it. */
  landingImpact: number
}

export interface StepOptions {
  /**
   * Surface grip multiplier on the lateral damping. 1 = bare table; the track
   * phase passes 0.55 for spilled coffee and 0.4 for flour.
   */
  surfaceGrip?: number
  /** Height of the ground under the car, or NO_GROUND when it should fall. */
  groundY?: number
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha
}

/** Folds an angle back into (-pi, pi]. */
function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

function approach(value: number, target: number, maxStep: number): number {
  const delta = target - value
  return Math.abs(delta) <= maxStep ? target : value + Math.sign(delta) * maxStep
}

export function createCarState(start: CarStart): CarState {
  const state: CarState = {
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    heading: 0,
    yawRate: 0,
    airborne: false,
    forwardSpeed: 0,
    lateralSpeed: 0,
    speed: 0,
    slipAngle: 0,
    slip: 0,
    steerAngle: 0,
    landingImpact: 0,
  }
  resetCarState(state, start)
  return state
}

/** Parks the car on its start pose, dead still. */
export function resetCarState(state: CarState, start: CarStart): void {
  state.x = start.x
  state.y = 0
  state.z = start.z
  state.vx = 0
  state.vy = 0
  state.vz = 0
  state.heading = wrapAngle(start.heading)
  state.yawRate = 0
  state.airborne = false
  state.steerAngle = 0
  state.landingImpact = 0
  refreshCarState(state)
}

export function copyCarState(target: CarState, source: Readonly<CarState>): void {
  target.x = source.x
  target.y = source.y
  target.z = source.z
  target.vx = source.vx
  target.vy = source.vy
  target.vz = source.vz
  target.heading = source.heading
  target.yawRate = source.yawRate
  target.airborne = source.airborne
  target.forwardSpeed = source.forwardSpeed
  target.lateralSpeed = source.lateralSpeed
  target.speed = source.speed
  target.slipAngle = source.slipAngle
  target.slip = source.slip
  target.steerAngle = source.steerAngle
  target.landingImpact = source.landingImpact
}

/**
 * Recomputes the derived fields from position, velocity and heading. `stepCar`
 * ends with this; anything that edits the velocity between ticks (the car-to-car
 * collision) has to call it too, or the skid marks and the HUD read last tick's
 * slip.
 */
export function refreshCarState(state: CarState): void {
  const sinH = Math.sin(state.heading)
  const cosH = Math.cos(state.heading)
  state.forwardSpeed = state.vx * sinH + state.vz * cosH
  state.lateralSpeed = state.vx * cosH - state.vz * sinH
  state.speed = Math.hypot(state.vx, state.vz)
  state.slipAngle = Math.atan2(
    state.lateralSpeed,
    Math.max(Math.abs(state.forwardSpeed), SLIP_EPSILON),
  )

  const angle = Math.abs(state.slipAngle)
  const span = CAR_TUNING.slipAngleFull - CAR_TUNING.slipAngleStart
  const raw = clamp01((angle - CAR_TUNING.slipAngleStart) / span)
  // Fade slip in with speed: at walking pace a big slip angle is a parking
  // manoeuvre, not a drift, and it should not smoke the tyres.
  state.slip = raw * clamp01(state.speed / CAR_TUNING.slipMinSpeed)
}

/** Advances one car by exactly `dt` seconds. */
export function stepCar(
  state: CarState,
  controls: Readonly<Controls>,
  dt: number,
  options: StepOptions = {},
): void {
  const tuning = CAR_TUNING
  const surfaceGrip = options.surfaceGrip ?? 1
  const groundY = options.groundY ?? 0

  // 1. Split the world velocity into the car's own frame, using the heading it
  //    had at the start of the tick — that is the velocity the wheels see.
  const sinOld = Math.sin(state.heading)
  const cosOld = Math.cos(state.heading)
  const forwardBefore = state.vx * sinOld + state.vz * cosOld
  const speedBefore = Math.hypot(state.vx, state.vz)

  // 2. Steering, bicycle model. Lock shrinks with speed so the car is agile in
  //    a hairpin and calm on the straight.
  const lockSpan = clamp01(speedBefore / tuning.maxSpeed)
  const lock = lerp(tuning.maxSteerAngleLowSpeed, tuning.maxSteerAngleTopSpeed, lockSpan)
  // `steer` is -1..1 with negative = left, heading grows to the left: flip it.
  const steerTarget = -controls.steer * lock
  const steerStep = (steerTarget === 0 ? tuning.steerReturnRate : tuning.steerRate) * dt
  state.steerAngle = approach(state.steerAngle, steerTarget, steerStep)

  // vLong / wheelBase * tan(steer): a standing car cannot turn, which is both
  // true and what makes a handbrake turn feel earned.
  let yawRate = (forwardBefore / tuning.wheelBase) * Math.tan(state.steerAngle)

  // 6. The handbrake adds yaw of its own in the steered direction, on top of
  //    the grip it takes away below. It is the combination that swings the tail
  //    round mid-corner; either half alone feels limp.
  if (controls.handbrake && !state.airborne && controls.steer !== 0) {
    const direction = -Math.sign(controls.steer)
    const bite = clamp01(Math.abs(forwardBefore) / tuning.handbrakeYawSpeed)
    yawRate += tuning.handbrakeYawBoost * direction * bite * Math.sign(forwardBefore)
  }

  // In the air the wheels have nothing to push against, but a little authority
  // to straighten up mid-jump is toy-like and fun.
  if (state.airborne) yawRate *= tuning.airControl

  state.yawRate = yawRate
  state.heading = wrapAngle(state.heading + yawRate * dt)

  // Re-split in the NEW frame: the car has just rotated under its own velocity,
  // and that difference IS the lateral speed the tyres now have to fight.
  const sinNew = Math.sin(state.heading)
  const cosNew = Math.cos(state.heading)
  let vLong = state.vx * sinNew + state.vz * cosNew
  let vLat = state.vx * cosNew - state.vz * sinNew

  if (!state.airborne) {
    // 3. Engine and brakes.
    if (controls.throttle > 0) {
      const headroom = clamp01(1 - vLong / (tuning.maxSpeed * tuning.engineHeadroom))
      vLong += tuning.engineAccel * headroom * controls.throttle * dt
    }
    if (controls.brake > 0) {
      if (vLong > tuning.restSpeed) {
        // Braking stops at zero; it never drags the car into reverse in one tick.
        vLong = Math.max(0, vLong - tuning.brakeDecel * controls.brake * dt)
      } else {
        const headroom = clamp01(1 + vLong / tuning.reverseMaxSpeed)
        vLong -= tuning.reverseAccel * headroom * controls.brake * dt
      }
    }
  }

  // 4. Drag, on the whole horizontal velocity so a sideways car scrubs too.
  //    Both forms are the EXACT solutions of their differential equations over
  //    dt, not an Euler step, so a 1/120 s tick gives the same speed as 1/60 s.
  const rolling = Math.exp(-tuning.linearDrag * dt)
  vLong *= rolling
  vLat *= rolling
  const planar = Math.hypot(vLong, vLat)
  if (planar > 0) {
    const air = 1 / (1 + tuning.quadraticDrag * planar * dt)
    vLong *= air
    vLat *= air
  }

  // 5. Lateral grip. Exponential, so the behaviour is tick-length independent;
  //    a linear subtraction would drift at 144 Hz. surfaceGrip is the hook the
  //    track phase hangs coffee (0.55) and flour (0.4) on.
  if (!state.airborne) {
    const grip =
      tuning.lateralGrip * surfaceGrip * (controls.handbrake ? tuning.handbrakeGripFactor : 1)
    vLat *= Math.exp(-grip * dt)
  }

  // 8. Back to world space and integrate.
  state.vx = vLong * sinNew + vLat * cosNew
  state.vz = vLong * cosNew - vLat * sinNew

  if (
    !state.airborne &&
    controls.throttle === 0 &&
    controls.brake === 0 &&
    Math.hypot(state.vx, state.vz) < tuning.restSpeed
  ) {
    state.vx = 0
    state.vz = 0
  }

  state.x += state.vx * dt
  state.z += state.vz * dt

  // Air and landing.
  state.landingImpact *= Math.pow(2, -dt / tuning.landingFadeSeconds)
  state.vy -= tuning.gravity * dt
  state.y += state.vy * dt
  if (state.y <= groundY) {
    if (state.airborne) {
      const impact = clamp01(-state.vy / tuning.landingSpeed)
      state.landingImpact = Math.max(state.landingImpact, impact)
    }
    state.y = groundY
    state.vy = 0
    state.airborne = false
  } else {
    state.airborne = true
  }

  refreshCarState(state)
}
