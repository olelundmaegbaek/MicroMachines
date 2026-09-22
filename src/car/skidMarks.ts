import * as THREE from 'three'

/**
 * Tyre marks for BOTH cars in one buffer, so the whole lot is one draw call.
 *
 * It is a ring buffer of quads in a single BufferGeometry, never a mesh per
 * mark: a drifting car lays a few hundred marks a second, and that many meshes
 * would cost more than the rest of the frame put together. Each wheel keeps its
 * own ribbon, and a new quad is stitched onto the previous quad's edge, so the
 * strip stays continuous through a corner.
 */

export const SKID_MARKS = {
  /**
   * Ring buffer size. Two rear wheels per car, one quad per `minStep` units of
   * travel: a car sliding flat out for the whole fade window lays
   * 16 s * 30 u/s / 0.35 u * 2 wheels = 2742 quads, so 6144 covers both cars
   * through the worst stretch of a race. Past that the oldest marks are simply
   * reused, which is the graceful failure we want.
   */
  maxSegments: 6144,
  /** Two rear wheels per car, two cars. */
  trailCount: 4,
  /**
   * Mark width. The scaled Kenney tyre is 0.49 wide on the hatchback and 0.55
   * on the sedan, so 0.5 sits between the two cars' tyres.
   */
  width: 0.5,
  /** Above the table top, out of z-fighting range but not visibly floating. */
  lift: 0.02,
  /** Distance the wheel must travel before the next quad. */
  minStep: 0.35,
  /** A jump longer than this is a respawn, not a slide: break the ribbon. */
  maxStep: 4,
  /** Dark rubber, not black: pure black reads as a hole on a bright table. */
  color: 0x2a1d14,
  /** Alpha of a mark at full slip. */
  opacity: 0.55,
  /** Marks fade out over this long, so the table is never permanently black. */
  fadeSeconds: 16,
  /** Slip below this leaves no mark at all — an ordinary corner stays clean. */
  slipThreshold: 0.2,
  /** The handbrake always marks, however straight the car is pointing. */
  handbrakeStrength: 0.75,
  /** No marks below this speed: a parked car with the handbrake on is parked. */
  minSpeed: 2.5,
} as const

/** How dark a mark this car's rear tyres should leave right now, 0 = none. */
export function skidStrength(
  slip: number,
  speed: number,
  handbrake: boolean,
  airborne: boolean,
): number {
  if (airborne || speed < SKID_MARKS.minSpeed) return 0
  const fromSlip = slip > SKID_MARKS.slipThreshold ? slip : 0
  const fromHandbrake = handbrake ? SKID_MARKS.handbrakeStrength : 0
  return Math.min(1, Math.max(fromSlip, fromHandbrake))
}

export interface SkidMarks {
  object: THREE.Object3D
  /** Feed one wheel's contact point every frame while it is marking. */
  mark(trail: number, x: number, z: number, strength: number): void
  /** The wheel stopped marking (or teleported): break the ribbon here. */
  lift(trail: number): void
  /**
   * Wipes every mark on the table. A new race starts on a clean table, and
   * `lift` alone cannot do it: that only breaks a ribbon, it does not erase
   * the quads already in the buffer.
   */
  clear(): void
  /** Ages the marks. Call once per frame, before `mark`. */
  update(dt: number): void
  dispose(): void
}

interface Trail {
  /** False until the next mark starts a fresh ribbon. */
  started: boolean
  /** True once there is a previous edge to stitch the next quad onto. */
  hasEdge: boolean
  lastX: number
  lastZ: number
  leftX: number
  leftZ: number
  rightX: number
  rightZ: number
}

const VERTICES_PER_SEGMENT = 4

export function createSkidMarks(): SkidMarks {
  const max = SKID_MARKS.maxSegments
  const positions = new Float32Array(max * VERTICES_PER_SEGMENT * 3)
  // Four components, so the alpha can fade per vertex; three.js switches the
  // shader to vec4 vertex colours when the attribute has itemSize 4.
  const colors = new Float32Array(max * VERTICES_PER_SEGMENT * 4)
  // 32-bit indices: 6144 quads is 24576 vertices, which still fits in 16 bits,
  // but raising maxSegments must not silently corrupt the mesh.
  const indices = new Uint32Array(max * 6)
  for (let segment = 0; segment < max; segment += 1) {
    const base = segment * VERTICES_PER_SEGMENT
    const offset = segment * 6
    indices[offset] = base
    indices[offset + 1] = base + 1
    indices[offset + 2] = base + 2
    indices[offset + 3] = base
    indices[offset + 4] = base + 2
    indices[offset + 5] = base + 3
  }

  const geometry = new THREE.BufferGeometry()
  const positionAttribute = new THREE.BufferAttribute(positions, 3)
  const colorAttribute = new THREE.BufferAttribute(colors, 4)
  geometry.setAttribute('position', positionAttribute)
  geometry.setAttribute('color', colorAttribute)
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  // Unused slots sit at the origin with alpha 0, so the whole index buffer can
  // be drawn every frame: a ring buffer's live range wraps and cannot be
  // expressed as one draw range anyway.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4)

  const rubber = new THREE.Color(SKID_MARKS.color)
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    // Flat on the table and drawn after it: writing depth would make the marks
    // fight each other where two ribbons cross.
    depthWrite: false,
    side: THREE.DoubleSide,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'skid-marks'
  mesh.frustumCulled = false
  mesh.renderOrder = 1

  const ages = new Float32Array(max)
  const strengths = new Float32Array(max)
  let head = 0
  let tail = 0
  let live = 0

  const trails: Trail[] = []
  for (let index = 0; index < SKID_MARKS.trailCount; index += 1) {
    trails.push({
      started: false,
      hasEdge: false,
      lastX: 0,
      lastZ: 0,
      leftX: 0,
      leftZ: 0,
      rightX: 0,
      rightZ: 0,
    })
  }

  const writeAlpha = (segment: number, alpha: number): void => {
    const base = segment * VERTICES_PER_SEGMENT * 4
    for (let vertex = 0; vertex < VERTICES_PER_SEGMENT; vertex += 1) {
      colors[base + vertex * 4 + 3] = alpha
    }
  }

  const pushQuad = (
    aLeftX: number,
    aLeftZ: number,
    aRightX: number,
    aRightZ: number,
    bLeftX: number,
    bLeftZ: number,
    bRightX: number,
    bRightZ: number,
    strength: number,
  ): void => {
    const segment = head
    head = (head + 1) % max
    if (live === max) tail = (tail + 1) % max
    else live += 1

    ages[segment] = 0
    strengths[segment] = strength

    const base = segment * VERTICES_PER_SEGMENT * 3
    const corners = [aLeftX, aLeftZ, aRightX, aRightZ, bRightX, bRightZ, bLeftX, bLeftZ]
    for (let vertex = 0; vertex < VERTICES_PER_SEGMENT; vertex += 1) {
      positions[base + vertex * 3] = corners[vertex * 2]
      positions[base + vertex * 3 + 1] = SKID_MARKS.lift
      positions[base + vertex * 3 + 2] = corners[vertex * 2 + 1]
      const colorBase = segment * VERTICES_PER_SEGMENT * 4 + vertex * 4
      colors[colorBase] = rubber.r
      colors[colorBase + 1] = rubber.g
      colors[colorBase + 2] = rubber.b
    }
    writeAlpha(segment, strength * SKID_MARKS.opacity)
    positionAttribute.needsUpdate = true
    colorAttribute.needsUpdate = true
  }

  return {
    object: mesh,
    mark(trail, x, z, strength): void {
      const state = trails[trail]
      if (!state) return
      if (!state.started) {
        state.started = true
        state.hasEdge = false
        state.lastX = x
        state.lastZ = z
        return
      }

      const dx = x - state.lastX
      const dz = z - state.lastZ
      const distance = Math.hypot(dx, dz)
      if (distance < SKID_MARKS.minStep) return
      if (distance > SKID_MARKS.maxStep) {
        // Teleported (respawn): start over rather than drag a line across the
        // table.
        state.hasEdge = false
        state.lastX = x
        state.lastZ = z
        return
      }

      // The mark is as wide as the tyre, across the direction of travel.
      const half = SKID_MARKS.width / 2
      const sideX = (-dz / distance) * half
      const sideZ = (dx / distance) * half
      const leftX = x + sideX
      const leftZ = z + sideZ
      const rightX = x - sideX
      const rightZ = z - sideZ

      if (state.hasEdge) {
        pushQuad(
          state.leftX,
          state.leftZ,
          state.rightX,
          state.rightZ,
          leftX,
          leftZ,
          rightX,
          rightZ,
          strength,
        )
      } else {
        // First quad of a ribbon: give the previous point the same edge, so the
        // strip starts where the wheel started sliding and not one step later.
        pushQuad(
          state.lastX + sideX,
          state.lastZ + sideZ,
          state.lastX - sideX,
          state.lastZ - sideZ,
          leftX,
          leftZ,
          rightX,
          rightZ,
          strength,
        )
        state.hasEdge = true
      }

      state.leftX = leftX
      state.leftZ = leftZ
      state.rightX = rightX
      state.rightZ = rightZ
      state.lastX = x
      state.lastZ = z
    },
    lift(trail): void {
      const state = trails[trail]
      if (state) state.started = false
    },
    clear(): void {
      // Alpha 0 on every slot, live or not: the ring buffer draws its whole
      // index range every frame, so an old quad left opaque would still show.
      for (let segment = 0; segment < max; segment += 1) writeAlpha(segment, 0)
      head = 0
      tail = 0
      live = 0
      for (const trail of trails) {
        trail.started = false
        trail.hasEdge = false
      }
      colorAttribute.needsUpdate = true
    },
    update(dt): void {
      if (live === 0) return
      for (let index = 0; index < live; index += 1) {
        ages[(tail + index) % max] += dt
      }
      // Ages grow in ring order, so everything expired sits at the tail.
      while (live > 0 && ages[tail] >= SKID_MARKS.fadeSeconds) {
        writeAlpha(tail, 0)
        tail = (tail + 1) % max
        live -= 1
      }
      for (let index = 0; index < live; index += 1) {
        const segment = (tail + index) % max
        const fade = 1 - ages[segment] / SKID_MARKS.fadeSeconds
        writeAlpha(segment, strengths[segment] * SKID_MARKS.opacity * fade)
      }
      colorAttribute.needsUpdate = true
    },
    dispose(): void {
      geometry.dispose()
      material.dispose()
    },
  }
}
