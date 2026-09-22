import * as THREE from 'three'

import { CAR_SIZE, TABLE } from '../constants'
import type { CarPose, Controls } from '../types'

/* ------------------------------------------------------------------------ *
 * TEMPORARY — phase 1 only.
 *
 * A box on wheels with a toy drive model, built for one purpose: to give the
 * chase camera something that moves and turns so the camera can be judged.
 * There is no grip, no slip angle, no drift and no collision here.
 *
 * Phase 2 replaces this file entirely with the real arcade drift model. Keep
 * the `CarPose` shape and the heading convention (see types.ts) — the camera
 * and the renderer are written against those, not against this file.
 * ------------------------------------------------------------------------ */

/** Placeholder handling numbers. Do not tune these; phase 2 deletes them. */
const DRIVE = {
  acceleration: 26,
  reverseAcceleration: 12,
  braking: 42,
  handbrakeBraking: 30,
  /** Speed lost per second with no input: proportional plus a constant. */
  dragPerSecond: 0.5,
  rollingResistance: 3,
  maxSpeed: 48,
  maxReverseSpeed: 14,
  /** Radians per second at full lock. */
  turnRate: 2.6,
  /** Below this speed the steering fades out, as a standing car cannot turn. */
  steerFullSpeed: 12,
} as const

/** Where the two cars start until the track (phase 3) says otherwise. */
export const PLACEHOLDER_START_POSES: readonly [CarPose, CarPose] = [
  { x: -50, y: TABLE.surfaceY, z: -11, heading: Math.PI / 2, speed: 0 },
  { x: -50, y: TABLE.surfaceY, z: 11, heading: Math.PI / 2, speed: 0 },
]

export interface PlaceholderCar {
  object: THREE.Object3D
  /** The pose at the end of the last physics tick. */
  readonly pose: Readonly<CarPose>
  update(dt: number, controls: Readonly<Controls>): void
  /**
   * Moves the mesh to the pose between the previous and the current tick and
   * returns that pose, so the camera follows the same interpolated car the
   * player sees.
   */
  present(alpha: number): Readonly<CarPose>
  dispose(): void
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha
}

export function createPlaceholderCar(color: number, start: CarPose): PlaceholderCar {
  const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1 })
  const noseMaterial = new THREE.MeshStandardMaterial({ color: 0xf6f1e4, roughness: 0.5, metalness: 0 })

  const bodyGeometry = new THREE.BoxGeometry(CAR_SIZE.width, CAR_SIZE.height, CAR_SIZE.length)
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
  body.position.y = CAR_SIZE.height / 2
  body.castShadow = true

  // Nose marker: the car's local +Z is forward, and a plain box on a flat table
  // gives no clue which way it points. It lies on the roof rather than on the
  // nose, because that is the face the chase camera actually sees, and it is
  // kept flush so the car's footprint stays exactly CAR_SIZE.
  const noseGeometry = new THREE.BoxGeometry(CAR_SIZE.width * 0.55, 0.06, CAR_SIZE.length * 0.28)
  const nose = new THREE.Mesh(noseGeometry, noseMaterial)
  nose.position.set(0, CAR_SIZE.height, CAR_SIZE.length * 0.26)
  nose.castShadow = true

  const object = new THREE.Group()
  object.add(body, nose)

  const pose: CarPose = { ...start }
  const previous: CarPose = { ...start }
  const presented: CarPose = { ...start }

  const halfWidth = TABLE.width / 2 - CAR_SIZE.length / 2
  const halfDepth = TABLE.depth / 2 - CAR_SIZE.length / 2

  const applyPose = (source: Readonly<CarPose>): void => {
    object.position.set(source.x, source.y, source.z)
    object.rotation.y = source.heading
  }
  applyPose(pose)

  return {
    object,
    pose,
    update(dt: number, controls: Readonly<Controls>): void {
      previous.x = pose.x
      previous.y = pose.y
      previous.z = pose.z
      previous.heading = pose.heading
      previous.speed = pose.speed

      let speed = pose.speed
      speed += controls.throttle * DRIVE.acceleration * dt
      if (controls.brake > 0) {
        speed -= (speed > 0 ? DRIVE.braking : DRIVE.reverseAcceleration) * controls.brake * dt
      }
      if (controls.handbrake) {
        const decay = DRIVE.handbrakeBraking * dt
        speed = Math.abs(speed) <= decay ? 0 : speed - Math.sign(speed) * decay
      }

      const passive = (Math.abs(speed) * DRIVE.dragPerSecond + DRIVE.rollingResistance) * dt
      speed = Math.abs(speed) <= passive ? 0 : speed - Math.sign(speed) * passive
      speed = Math.min(DRIVE.maxSpeed, Math.max(-DRIVE.maxReverseSpeed, speed))

      // Steering authority grows with speed, and reverses when reversing.
      const authority = Math.min(1, Math.abs(speed) / DRIVE.steerFullSpeed) * Math.sign(speed)
      pose.heading = wrapAngle(pose.heading - controls.steer * DRIVE.turnRate * authority * dt)

      pose.speed = speed
      pose.x += Math.sin(pose.heading) * speed * dt
      pose.z += Math.cos(pose.heading) * speed * dt

      // Temporary walls. Phase 3 lets the car fall off the table instead.
      pose.x = Math.min(halfWidth, Math.max(-halfWidth, pose.x))
      pose.z = Math.min(halfDepth, Math.max(-halfDepth, pose.z))
    },
    present(alpha: number): Readonly<CarPose> {
      presented.x = lerp(previous.x, pose.x, alpha)
      presented.y = lerp(previous.y, pose.y, alpha)
      presented.z = lerp(previous.z, pose.z, alpha)
      // Shortest way round, so crossing +/-pi does not spin the car in place.
      presented.heading = wrapAngle(previous.heading + wrapAngle(pose.heading - previous.heading) * alpha)
      presented.speed = lerp(previous.speed, pose.speed, alpha)
      applyPose(presented)
      return presented
    },
    dispose(): void {
      bodyGeometry.dispose()
      noseGeometry.dispose()
      bodyMaterial.dispose()
      noseMaterial.dispose()
    },
  }
}
