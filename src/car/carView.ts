import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { CAR_SIZE } from '../constants'
import type { CarPose } from '../types'
import type { CarLivery, CarSpec } from './catalog'
import { repaintPixels, type CarPaint } from './paint'
import type { CarState } from './physics'

/**
 * The car on screen: the Kenney kit model, scaled to CAR_SIZE, painted, and
 * driven by the interpolated physics state. No physics lives in here, and
 * nothing in here is read back by the simulation.
 *
 * Model facts, measured from the GLB files rather than guessed (see the phase 2
 * report): both bodies are 1.30 wide x 1.10 tall, hatchback-sports is 2.85 long
 * and sedan-sports 2.55, both sit on y = 0 in their own space, and the NOSE
 * POINTS ALONG +Z — the `wheel-front-*` nodes are at positive z and the sedan's
 * `spoiler` node at negative z. +Z forward is exactly the convention in
 * types.ts, so the model needs no yaw correction. The wheels are cylinders
 * 0.35 wide and 0.60 across lying on the local X axis, so X is the axle they
 * roll about.
 */

/** Named nodes in the Kenney car kit. The whole animation hangs off these. */
const NODES = {
  body: 'body',
  /** sedan-sports only; painted with the body so the ducktail matches. */
  spoiler: 'spoiler',
  wheels: [
    { name: 'wheel-front-left', front: true },
    { name: 'wheel-front-right', front: true },
    { name: 'wheel-back-left', front: false },
    { name: 'wheel-back-right', front: false },
  ],
} as const

/** A contact patch on the table, in world XZ. The skid marks trail these. */
export interface WheelContact {
  x: number
  z: number
}

export interface CarView {
  readonly object: THREE.Object3D
  /** Resolves when the GLB is in the scene. Rejects if the file will not load. */
  readonly ready: Promise<void>
  /**
   * Moves the car to the pose between the previous and the current physics
   * tick, spins and steers the wheels, and returns the pose it drew — so the
   * chase camera follows exactly the car the player sees.
   */
  present(
    previous: Readonly<CarState>,
    current: Readonly<CarState>,
    alpha: number,
    frameSeconds: number,
  ): Readonly<CarPose>
  /** Rear wheel contact points in world space. Valid after `present`. */
  readonly rearContacts: readonly [WheelContact, WheelContact]
  dispose(): void
}

interface Wheel {
  node: THREE.Object3D
  front: boolean
  /** Rolling radius in world units, measured from the node's bounding box. */
  radius: number
  /** Accumulated roll angle, kept per wheel so each rolls at its own radius. */
  spin: number
}

const loader = new GLTFLoader().setPath(`${import.meta.env.BASE_URL}assets/cars/`)

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha
}

/** Folds an angle back into (-pi, pi]. */
function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

/**
 * A private, repainted copy of the shared kit atlas. Returns null when the
 * texture cannot be read, and the caller falls back to a flat tint.
 */
function repaintTexture(source: THREE.Texture, paint: CarPaint): THREE.Texture | null {
  // three types Texture.image as any; narrow it to what drawImage needs.
  const image = source.image as (CanvasImageSource & { width: number; height: number }) | null
  if (!image || !image.width || !image.height) return null
  const { width, height } = image

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: false })
  if (!context) return null

  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, width, height)
  repaintPixels(pixels.data, paint)
  context.putImageData(pixels, 0, 0)

  const texture = new THREE.CanvasTexture(canvas)
  // Copy the sampler the glTF asked for. flipY in particular: GLTFLoader sets
  // it to false, and a CanvasTexture defaults to true — get that wrong and the
  // car is upholstered in the wrong half of the atlas.
  texture.flipY = source.flipY
  texture.colorSpace = source.colorSpace
  texture.wrapS = source.wrapS
  texture.wrapT = source.wrapT
  texture.magFilter = source.magFilter
  texture.minFilter = source.minFilter
  texture.anisotropy = source.anisotropy
  texture.needsUpdate = true
  return texture
}

/**
 * One painted car. The spec says which model, the livery says which colour —
 * two players who picked the SAME car get two views, one per livery, and that
 * is the only way they can be told apart in splitscreen.
 */
export function createCarView(spec: CarSpec, livery: CarLivery): CarView {
  const object = new THREE.Group()
  object.name = `${spec.name} (${livery.name})`

  const ownedMaterials: THREE.Material[] = []
  const ownedTextures: THREE.Texture[] = []
  const wheels: Wheel[] = []

  // Until the GLB lands these keep the skid marks pointing somewhere sane.
  let rearAxleZ = -CAR_SIZE.length * 0.3
  let halfTrack = CAR_SIZE.width * 0.35

  const pose: CarPose = { x: 0, y: 0, z: 0, heading: 0, speed: 0 }
  const rearContacts: [WheelContact, WheelContact] = [
    { x: 0, z: 0 },
    { x: 0, z: 0 },
  ]

  const paintBody = (root: THREE.Object3D): void => {
    const body = root.getObjectByName(NODES.body)
    if (!(body instanceof THREE.Mesh)) return
    const source = body.material
    if (Array.isArray(source) || !(source instanceof THREE.MeshStandardMaterial)) return

    // Clone first, always: the loaded material instance is shared by every mesh
    // in the file, and the texture behind it by every model in the kit.
    const painted = source.clone()
    const texture = painted.map ? repaintTexture(painted.map, livery.paint) : null
    if (texture) {
      painted.map = texture
      ownedTextures.push(texture)
    } else {
      // No canvas to repaint with: a flat tint at least keeps the two cars apart.
      painted.map = null
      painted.color.setHSL(livery.paint.hue, livery.paint.saturation, 0.5 + livery.paint.lightnessShift)
    }
    ownedMaterials.push(painted)

    body.material = painted
    const spoiler = root.getObjectByName(NODES.spoiler)
    if (spoiler instanceof THREE.Mesh) spoiler.material = painted
  }

  const ready = loader.loadAsync(spec.file).then((gltf) => {
    const root = gltf.scene

    // Uniform scale from the measured length, not from a guessed number.
    const raw = new THREE.Box3().setFromObject(root)
    const scale = CAR_SIZE.length / (raw.max.z - raw.min.z)
    root.scale.setScalar(scale)
    root.updateMatrixWorld(true)

    // Put the wheels on the table. The kit models happen to sit on y = 0
    // already, but measuring costs nothing and survives an asset update.
    const scaled = new THREE.Box3().setFromObject(root)
    root.position.y = -scaled.min.y
    root.updateMatrixWorld(true)

    for (const wheel of NODES.wheels) {
      const node = root.getObjectByName(wheel.name)
      if (!node) {
        console.warn(`${spec.file}: no node named ${wheel.name}`)
        continue
      }
      // Steer about Y, roll about X, in that order — with the default XYZ order
      // the roll would tilt the axis the steering turns about.
      node.rotation.order = 'YXZ'
      const box = new THREE.Box3().setFromObject(node)
      wheels.push({ node, front: wheel.front, radius: (box.max.y - box.min.y) / 2, spin: 0 })
      if (!wheel.front) {
        rearAxleZ = node.position.z * scale
        halfTrack = Math.abs(node.position.x) * scale
      }
    }

    paintBody(root)
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.castShadow = true
      // The toy look wants flat, bright bodywork: a car shading itself only
      // muddies it, and the table under it still takes the shadow.
      child.receiveShadow = false
    })

    object.add(root)
  })

  return {
    object,
    ready,
    rearContacts,
    present(previous, current, alpha, frameSeconds): Readonly<CarPose> {
      pose.x = lerp(previous.x, current.x, alpha)
      pose.y = lerp(previous.y, current.y, alpha)
      pose.z = lerp(previous.z, current.z, alpha)
      // Shortest way round, so crossing +/-pi does not spin the car in place.
      pose.heading = wrapAngle(
        previous.heading + wrapAngle(current.heading - previous.heading) * alpha,
      )
      pose.speed = lerp(previous.forwardSpeed, current.forwardSpeed, alpha)

      object.position.set(pose.x, pose.y, pose.z)
      object.rotation.y = pose.heading

      const steerAngle = lerp(previous.steerAngle, current.steerAngle, alpha)
      for (const wheel of wheels) {
        // omega = v / r, signed, so the wheels run backwards when reversing.
        // Wrapped, so a long race does not grind the angle down to whole degrees.
        wheel.spin = (wheel.spin + (pose.speed / wheel.radius) * frameSeconds) % (Math.PI * 2)
        wheel.node.rotation.x = wheel.spin
        // The road-wheel angle is already positive-is-left, and so is rotation.y.
        if (wheel.front) wheel.node.rotation.y = steerAngle
      }

      const sinH = Math.sin(pose.heading)
      const cosH = Math.cos(pose.heading)
      // Nose is (sin, cos), the car's own left is (cos, -sin).
      for (let side = 0; side < 2; side += 1) {
        const offset = side === 0 ? halfTrack : -halfTrack
        rearContacts[side].x = pose.x + sinH * rearAxleZ + cosH * offset
        rearContacts[side].z = pose.z + cosH * rearAxleZ - sinH * offset
      }

      return pose
    },
    dispose(): void {
      for (const material of ownedMaterials) material.dispose()
      for (const texture of ownedTextures) texture.dispose()
    },
  }
}
