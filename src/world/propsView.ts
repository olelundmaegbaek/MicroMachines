import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import type { PropInstance } from './props'

/**
 * The props you can SEE. It owns no placement of its own: every position,
 * yaw and scale comes from `props.ts`, and the tumble of a knocked prop comes
 * from `propCollision.ts`. Change a number there and the picture follows.
 *
 * Drawing rules, in order of how much they save:
 *  - Each GLB is loaded ONCE, however many times it is placed.
 *  - One InstancedMesh per model, so the eight apples and plates are one draw
 *    call each, not eight.
 *  - ONE material for every prop in the kit. The whole Kenney Food Kit samples
 *    a single 512x512 `colormap.png` (see public/assets/CREDITS.md), so 20
 *    models would otherwise mean 20 copies of the same atlas on the GPU.
 */

export const PROPS_LOOK = {
  /**
   * Only props whose circle comes within this of the road edge cast a shadow.
   *
   * The shadow map is ONE map over the whole table and every caster is drawn
   * into it again, so the cost is paid per prop, per frame, for the whole
   * scene — not just for the half the camera is looking at. A pizza box 20
   * units inside the loop is never next to a car, and its shadow is a few
   * pixels of a 2 m table seen from a chase camera. The props the eye judges
   * are the ones the car drives past, and those are exactly the ones with a
   * small clearance: every obstacle (which reaches over the road, so its
   * clearance is negative) and the light props just off the edge.
   *
   * 4 units is ONE CAR LENGTH from the road edge. Measured on the phase 4
   * layout that is 19 casters of 32 props.
   */
  shadowRange: 4,
} as const

export interface PropsView {
  readonly object: THREE.Object3D
  /** Resolves once every model is in the scene. */
  readonly ready: Promise<void>
  /** Re-draws the props that moved this frame. Call once per rendered frame. */
  update(): void
  dispose(): void
}

/** One InstancedMesh and the props it draws, in instance order. */
interface Batch {
  mesh: THREE.InstancedMesh
  members: readonly PropInstance[]
  /** The `version` each slot was last drawn at, so a still prop costs nothing. */
  drawn: number[]
}

const UP = new THREE.Vector3(0, 1, 0)
const SIDE = new THREE.Vector3(1, 0, 0)

/** Flattens a loaded model into ONE geometry with its node transforms baked. */
function bakeGeometry(root: THREE.Object3D, file: string): THREE.BufferGeometry {
  root.updateMatrixWorld(true)
  const parts: THREE.BufferGeometry[] = []
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const geometry = child.geometry.clone()
    geometry.applyMatrix4(child.matrixWorld)
    parts.push(geometry)
  })
  if (parts.length === 0) throw new Error(`${file}: no mesh inside`)
  if (parts.length === 1) return parts[0]
  // The cake is six slices and the pizza box is a box plus a lid; they share
  // one material, so they are one draw call once merged.
  const merged = mergeGeometries(parts, false)
  for (const part of parts) part.dispose()
  if (!merged) throw new Error(`${file}: meshes do not share an attribute layout`)
  return merged
}

/** First material in a loaded model. Every Kenney model has exactly one. */
function firstMaterial(root: THREE.Object3D): THREE.Material | null {
  let found: THREE.Material | null = null
  root.traverse((child) => {
    if (found || !(child instanceof THREE.Mesh)) return
    found = Array.isArray(child.material) ? child.material[0] : child.material
  })
  return found
}

function disposeMaterial(material: THREE.Material): void {
  if (material instanceof THREE.MeshStandardMaterial && material.map) material.map.dispose()
  material.dispose()
}

export function createPropsView(props: readonly PropInstance[]): PropsView {
  const group = new THREE.Group()
  group.name = 'props'
  const loader = new GLTFLoader().setPath(`${import.meta.env.BASE_URL}assets/props/`)
  const geometries: THREE.BufferGeometry[] = []
  const batches: Batch[] = []
  let sharedMaterial: THREE.Material | null = null

  // Scratch objects: an instance matrix is rebuilt every frame for the props
  // that move, and allocating three vectors per prop per frame is a habit
  // that shows up in the profile long before it shows up in the code.
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const spin = new THREE.Quaternion()
  const lean = new THREE.Quaternion()
  const turn = new THREE.Quaternion()
  const axis = new THREE.Vector3()
  const matrix = new THREE.Matrix4()
  const pivot = new THREE.Matrix4()
  const unpivot = new THREE.Matrix4()
  const tumble = new THREE.Matrix4()

  /** Half the model's height, which is the pivot a rolling prop turns about. */
  const pivotHeight = new Map<PropInstance, number>()

  const writeInstance = (batch: Batch, slot: number): void => {
    const prop = batch.members[slot]
    position.set(prop.x, prop.y, prop.z)
    scale.setScalar(prop.scale)
    spin.setFromAxisAngle(UP, prop.yaw)
    if (prop.roll !== 0) {
      lean.setFromAxisAngle(SIDE, prop.roll)
      spin.multiply(lean)
    }
    matrix.compose(position, spin, scale)
    if (prop.tumbleAngle !== 0) {
      // Roll about the prop's middle, not about its origin: the models stand
      // on their own y = 0, and turning about that would swing an apple round
      // the table instead of rolling it across it.
      const half = pivotHeight.get(prop) ?? 0
      axis.set(prop.tumbleAxisX, 0, prop.tumbleAxisZ)
      if (axis.lengthSq() < 1e-9) axis.set(1, 0, 0)
      turn.setFromAxisAngle(axis.normalize(), prop.tumbleAngle)
      pivot.makeTranslation(prop.x, prop.y + half, prop.z)
      unpivot.makeTranslation(-prop.x, -(prop.y + half), -prop.z)
      tumble.makeRotationFromQuaternion(turn)
      matrix.premultiply(unpivot).premultiply(tumble).premultiply(pivot)
    }
    batch.mesh.setMatrixAt(slot, matrix)
    batch.drawn[slot] = prop.version
  }

  const addBatch = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    members: readonly PropInstance[],
    castShadow: boolean,
  ): void => {
    const mesh = new THREE.InstancedMesh(geometry, material, members.length)
    mesh.name = `props-${members[0].model}${castShadow ? '' : '-flat'}`
    mesh.castShadow = castShadow
    // Receiving costs a shader branch per pixel, and a prop far from the road
    // only ever has the table's own shadow fall on it, which is nothing.
    mesh.receiveShadow = castShadow
    const batch: Batch = { mesh, members, drawn: members.map(() => -1) }
    for (let slot = 0; slot < members.length; slot += 1) writeInstance(batch, slot)
    mesh.instanceMatrix.needsUpdate = true
    batches.push(batch)
    group.add(mesh)
  }

  const build = async (): Promise<void> => {
    const files = [...new Set(props.map((prop) => prop.file))]
    const models = await Promise.all(files.map((file) => loader.loadAsync(file)))

    files.forEach((file, index) => {
      const scene = models[index].scene
      const material = firstMaterial(scene)
      if (!material) throw new Error(`${file}: no material`)
      if (sharedMaterial === null) sharedMaterial = material
      else disposeMaterial(material)
      const paint = sharedMaterial

      const geometry = bakeGeometry(scene, file)
      geometry.computeBoundingBox()
      geometries.push(geometry)

      const members = props.filter((prop) => prop.file === file)
      const box = geometry.boundingBox
      for (const prop of members) {
        pivotHeight.set(prop, box ? ((box.max.y - box.min.y) * prop.scale) / 2 : 0)
      }

      // Two batches per model at most: the shadow flag lives on the mesh, not
      // on the instance, so the casters and the rest cannot share one.
      for (const casts of [true, false]) {
        const bucket = members.filter(
          (prop) => (prop.roadClearance <= PROPS_LOOK.shadowRange) === casts,
        )
        if (bucket.length > 0) addBatch(geometry, paint, bucket, casts)
      }
    })
  }

  const ready = build()

  return {
    object: group,
    ready,

    update(): void {
      for (const batch of batches) {
        let touched = false
        for (let slot = 0; slot < batch.members.length; slot += 1) {
          if (batch.members[slot].version === batch.drawn[slot]) continue
          writeInstance(batch, slot)
          touched = true
        }
        if (touched) batch.mesh.instanceMatrix.needsUpdate = true
      }
    },

    dispose(): void {
      for (const batch of batches) batch.mesh.dispose()
      for (const geometry of geometries) geometry.dispose()
      if (sharedMaterial) disposeMaterial(sharedMaterial)
      group.clear()
    },
  }
}
