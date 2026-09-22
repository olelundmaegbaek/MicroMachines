import * as THREE from 'three'

import { TABLE } from '../constants'
import type { CarPose } from '../types'

/**
 * Every number that decides how the chase camera feels. Tune here, nowhere
 * else.
 */
export const CHASE_CAMERA = {
  fov: 55,
  near: 0.5,
  far: 500,
  /** Boom length behind the car. */
  distance: 9,
  /** Boom height above the car. */
  height: 6,
  /** The camera aims this far ahead of the car, not at the car itself. */
  lookAhead: 3,
  /** Height of the aim point over the table, so the nose sits low in frame. */
  lookHeight: 0.8,
  /**
   * Seconds for the camera to close half the gap. Yaw lags clearly behind the
   * car (that lag IS the drift feeling); position follows much tighter, or the
   * car slides around in frame.
   */
  yawHalfLife: 0.12,
  positionHalfLife: 0.05,
  /** The camera never dips below the table top. */
  minHeightAboveTable: 1.5,
  /** Speed rush: a little pull-back and a slightly wider lens. Keep it subtle. */
  speed: {
    enabled: true,
    /** Speed (units/s) at which the effect is fully applied. */
    referenceSpeed: 45,
    extraDistance: 1.6,
    extraFov: 3,
    /** Slow, so the lens does not pump on every throttle blip. */
    halfLife: 0.35,
  },
} as const

/** Frame-rate independent exponential smoothing: fraction closed in `dt`. */
function smoothing(dt: number, halfLife: number): number {
  if (halfLife <= 0) return 1
  return 1 - Math.pow(2, -dt / halfLife)
}

/** Folds an angle back into (-pi, pi]. */
function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

// Scratch vector, used and discarded inside a single update call.
const desired = new THREE.Vector3()

export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera

  private yaw = 0
  private speedEase = 0
  private placed = false
  private readonly position = new THREE.Vector3()
  private readonly aim = new THREE.Vector3()

  constructor() {
    this.camera = new THREE.PerspectiveCamera(
      CHASE_CAMERA.fov,
      1,
      CHASE_CAMERA.near,
      CHASE_CAMERA.far,
    )
  }

  /** Jumps the camera straight to its resting pose, with no swoop. */
  snapTo(target: CarPose): void {
    this.yaw = wrapAngle(target.heading)
    this.speedEase = this.speedFactor(target)
    this.applyBoom(target)
    this.position.copy(desired)
    this.commit(target)
    this.placed = true
  }

  update(dt: number, target: CarPose): void {
    if (!this.placed) {
      this.snapTo(target)
      return
    }

    // Shortest way round: lerping 3.1 towards -3.1 the naive way sends the
    // camera the long way around the car every time it crosses south.
    const yawStep = smoothing(dt, CHASE_CAMERA.yawHalfLife)
    this.yaw = wrapAngle(this.yaw + wrapAngle(target.heading - this.yaw) * yawStep)

    this.speedEase += (this.speedFactor(target) - this.speedEase) * smoothing(dt, CHASE_CAMERA.speed.halfLife)

    this.applyBoom(target)
    this.position.lerp(desired, smoothing(dt, CHASE_CAMERA.positionHalfLife))
    this.commit(target)
  }

  private speedFactor(target: CarPose): number {
    if (!CHASE_CAMERA.speed.enabled) return 0
    return clamp01(Math.abs(target.speed) / CHASE_CAMERA.speed.referenceSpeed)
  }

  /** Writes the un-smoothed ideal camera position into the scratch vector. */
  private applyBoom(target: CarPose): void {
    const distance = CHASE_CAMERA.distance + this.speedEase * CHASE_CAMERA.speed.extraDistance
    desired.set(
      target.x - Math.sin(this.yaw) * distance,
      target.y + CHASE_CAMERA.height,
      target.z - Math.cos(this.yaw) * distance,
    )
  }

  private commit(target: CarPose): void {
    this.camera.position.copy(this.position)
    this.camera.position.y = Math.max(
      this.camera.position.y,
      TABLE.surfaceY + CHASE_CAMERA.minHeightAboveTable,
    )

    // The aim point follows the SMOOTHED yaw, not the car's own heading: with
    // the raw heading the horizon snaps sideways the moment the car steps out
    // in a drift.
    this.aim.set(
      target.x + Math.sin(this.yaw) * CHASE_CAMERA.lookAhead,
      target.y + CHASE_CAMERA.lookHeight,
      target.z + Math.cos(this.yaw) * CHASE_CAMERA.lookAhead,
    )
    this.camera.lookAt(this.aim)

    const fov = CHASE_CAMERA.fov + this.speedEase * CHASE_CAMERA.speed.extraFov
    if (this.camera.fov !== fov) {
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }
  }
}
