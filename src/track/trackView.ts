import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import type { TrackLayout } from './kitchenTable'
import type { Track } from './types'

/**
 * The track you can SEE. It owns no geometry of its own: every height comes
 * from `track.heightAt` and every position from `track.pointAt`, so the ramp
 * the car flies off is the ramp that is drawn.
 *
 * This is a kitchen table, not a circuit — no tarmac, no white lines. The
 * route is a dusting of flour shaken out along it, thin enough that the wood
 * reads through, plus a few toy cones in the corners that keep the line
 * readable where the dust is scuffed.
 */

export const TRACK_LOOK = {
  dust: {
    /**
     * Segment length along the track. 0.6 keeps the ribbon smooth through the
     * 9.3-radius corners and still covers the lap in ~450 segments.
     */
    step: 0.6,
    /** Soft outer edge, so the stripe never shows a cut line. */
    feather: 1.3,
    /** How far inside the road edge the solid core stops. */
    inset: 0.5,
    color: 0xfbf1e0,
    /**
     * Measured against the wood, not chosen: the table is a dark walnut that
     * renders at sRGB (140, 50, 20), so a wash that read as a faint dusting on
     * the old flat beige now reads as a painted white road. At 0.26 the stripe
     * lands at (199, 177, 163) — unmistakable at speed — while a third of its
     * red still comes from the wood underneath, so the grain and the boards
     * read through it. The old 0.34 left only a quarter.
     */
    opacity: 0.26,
    /** Above the table, BELOW the skid marks at y = 0.02. */
    lift: 0.012,
    /** Per-vertex alpha jitter: shaken flour, not a painted stripe. */
    speckle: 0.3,
    /**
     * The dust stops for the ramp: the orange track is the route there, and a
     * ribbon that climbs it would hang a transparent skirt off the brink.
     * Faded out over this many units either side, never cut off sharply.
     */
    rampFade: 2,
    /** The dust picks up again this far past the brink, where the car lands. */
    rampClear: 1,
  },
  flour: {
    step: 0.7,
    feather: 1.6,
    color: 0xfffaf2,
    opacity: 0.7,
    lift: 0.016,
    speckle: 0.34,
  },
  coffee: {
    step: 0.5,
    feather: 1.1,
    /**
     * Darker than it looks it should be, because these ribbons are unlit: the
     * old 0x6b4423 was a shade under a beige table but a shade OVER a walnut
     * one, and a spill that is lighter than the table reads as milk. This
     * renders at (90, 38, 15) against the table's (140, 50, 20).
     */
    color: 0x462a16,
    opacity: 0.78,
    lift: 0.015,
    speckle: 0.18,
  },
  board: {
    /** Pale beech against the darker table, so the plateau reads as a board. */
    color: 0xe7c894,
    roughness: 0.72,
    /** Lifts the board so its rim cannot z-fight with the table top. */
    lift: 0.004,
    /** Sampling along the track; the kerb breaks are 2 units apart at least. */
    step: 0.4,
  },
  cones: {
    file: 'item-cone.glb',
    /** A corner radius under this is worth marking; the straights get none. */
    cornerRadius: 26,
    /** Arc length between cones inside a corner. */
    spacing: 6.5,
    /** Just outside the road edge. */
    outside: 0.8,
    /** Toy cone height in world units — a quarter of a car length. */
    height: 1.05,
  },
  ramp: {
    piece: 'track-wide-straight.glb',
    support: 'supports-wide.glb',
    /**
     * The slope is three butted pieces: toy track IS modular, and three short
     * pieces follow the curving centre line far closer than one rigid plank
     * (the centre line wanders 0.23 units off the straight chord over the
     * ramp, which three pieces cut to under 0.03 each).
     */
    pieces: 3,
    /** Supports stand this far either side of the centre line. */
    supportOffset: 2.4,
    supportScaleX: 1.4,
    supportScaleZ: 1.2,
    /** Below this there is no room for a leg: the slab is all but on the table. */
    minSupportHeight: 0.35,
  },
  /**
   * The start/finish gate, straddling the line.
   *
   * Model facts, measured from gate-finish.glb and not guessed: it is
   * 1.55 x 1.1625 x 0.30 with its feet on its own y = 0, its legs' inner faces
   * at x = +-0.4577 (a clear 0.9154, 59 % of its width) and its banner's
   * underside at y = 0.8738 (75 % of its height). Both scales are computed
   * from the bounding box of the LOADED model and those two fractions.
   */
  gate: {
    file: 'gate-finish.glb',
    clearWidthFraction: 0.9154 / 1.55,
    clearHeightFraction: 0.8738 / 1.1625,
    /** Each leg stands this far outside the road edge, so it cannot be hit. */
    legClearance: 0.75,
    /**
     * Clear height under the banner, a good four car heights. The gate is
     * stretched across the road and raised far less, exactly as the ramp
     * pieces above are stretched: one uniform factor wide enough for a 10-unit
     * road would stand 15 units tall, and the chase camera — six units up and
     * aimed 23 degrees down — crops anything over about eight units from a car
     * length away, so the banner would never be in shot.
     */
    clearHeight: 5.25,
    /** Keeps the feet out of a z-fight with the table top. */
    lift: 0.01,
  },
  /** Both ribbons draw before the skid marks (renderOrder 1), never after. */
  dustRenderOrder: -2,
  zoneRenderOrder: -1,
} as const

/**
 * Model facts, measured from the GLB files (see the phase 3 report), not
 * guessed: `track-wide-straight` is 2 wide with its DRIVING SURFACE at local
 * y = -0.70 and 0.30 of plastic below it, and one tile is 4.0 long with a 0.2
 * lip at each end that laps the neighbouring piece. `supports-wide` is
 * 2 x 1 x 1 and stands on its own y = 0.
 */
const TOY_TRACK = {
  width: 2,
  surfaceY: -0.7,
  thickness: 0.3,
  tileLength: 4,
  supportHeight: 1,
} as const

export interface TrackView {
  readonly object: THREE.Object3D
  /** Resolves once the toy-track models are in the scene. */
  readonly ready: Promise<void>
  dispose(): void
}

interface WorldPoint {
  x: number
  y: number
  z: number
}

/** A point `lateral` units left of the centre line, on the surface. */
function pointOn(track: Track, s: number, lateral: number): WorldPoint {
  const centre = track.pointAt(s)
  const tangent = track.tangentAt(s)
  return {
    x: centre.x + tangent.z * lateral,
    y: track.heightAt(s, lateral),
    z: centre.z - tangent.x * lateral,
  }
}

/** Deterministic 0..1 hash. The same table every reload, so it can be judged. */
function hashNoise(a: number, b: number): number {
  const value = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return value - Math.floor(value)
}

interface RibbonSpec {
  from: number
  length: number
  step: number
  /** Half width of the fully opaque core at `t` (0..1 along the ribbon). */
  core(t: number): number
  /** Soft edge outside the core. */
  feather: number
  /** Opacity along the ribbon, for ends that fade out. */
  fade(t: number): number
  color: number
  opacity: number
  lift: number
  speckle: number
}

/** Alpha per rail: transparent outside, solid across the middle three. */
const RAIL_ALPHA = [0, 1, 1, 1, 0] as const

/**
 * One mesh for a whole stripe: a five-rail ribbon swept along the centre line,
 * with the outer rails at alpha 0 so the edge is soft. Never one quad per
 * segment as separate meshes — the lap is 450 segments long.
 */
function buildRibbon(track: Track, spec: RibbonSpec): THREE.BufferGeometry {
  const segments = Math.max(2, Math.round(spec.length / spec.step))
  const rails = RAIL_ALPHA.length
  const rows = segments + 1
  const positions = new Float32Array(rows * rails * 3)
  const colors = new Float32Array(rows * rails * 4)
  const indices = new Uint32Array(segments * (rails - 1) * 6)
  const base = new THREE.Color(spec.color)

  for (let row = 0; row < rows; row += 1) {
    const t = row / segments
    const s = spec.from + t * spec.length
    const core = spec.core(t)
    const outer = core + spec.feather
    const offsets = [-outer, -core, 0, core, outer]
    for (let rail = 0; rail < rails; rail += 1) {
      const point = pointOn(track, s, offsets[rail])
      const vertex = (row * rails + rail) * 3
      positions[vertex] = point.x
      positions[vertex + 1] = point.y + spec.lift
      positions[vertex + 2] = point.z

      const jitter = 1 - spec.speckle * hashNoise(row, rail)
      const colour = (row * rails + rail) * 4
      colors[colour] = base.r
      colors[colour + 1] = base.g
      colors[colour + 2] = base.b
      colors[colour + 3] = spec.opacity * spec.fade(t) * RAIL_ALPHA[rail] * jitter
    }
  }

  let index = 0
  for (let row = 0; row < segments; row += 1) {
    for (let rail = 0; rail < rails - 1; rail += 1) {
      const a = row * rails + rail
      const b = a + 1
      const c = a + rails
      const d = c + 1
      indices[index] = a
      indices[index + 1] = c
      indices[index + 2] = b
      indices[index + 3] = b
      indices[index + 4] = c
      indices[index + 5] = d
      index += 6
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.computeBoundingSphere()
  return geometry
}

/**
 * The raised board, sampled straight off the height map — including its sloped
 * kerbs and its tapered sides, so the wood is exactly the surface the car
 * drives on.
 */
function buildBoard(track: Track, layout: TrackLayout): THREE.BufferGeometry {
  const board = layout.board
  const columns = Math.max(4, Math.round(board.length / TRACK_LOOK.board.step))
  const reach = board.halfWidth + board.edgeTaper
  const offsets = [
    -reach,
    -board.halfWidth,
    -board.halfWidth * 0.5,
    0,
    board.halfWidth * 0.5,
    board.halfWidth,
    reach,
  ]
  const rows = columns + 1
  const positions = new Float32Array(rows * offsets.length * 3)
  const indices = new Uint32Array(columns * (offsets.length - 1) * 6)

  for (let row = 0; row < rows; row += 1) {
    const s = board.from + (row / columns) * board.length
    for (let rail = 0; rail < offsets.length; rail += 1) {
      const point = pointOn(track, s, offsets[rail])
      const vertex = (row * offsets.length + rail) * 3
      positions[vertex] = point.x
      positions[vertex + 1] = point.y + TRACK_LOOK.board.lift
      positions[vertex + 2] = point.z
    }
  }

  let index = 0
  for (let row = 0; row < columns; row += 1) {
    for (let rail = 0; rail < offsets.length - 1; rail += 1) {
      const a = row * offsets.length + rail
      const b = a + 1
      const c = a + offsets.length
      const d = c + 1
      indices[index] = a
      indices[index + 1] = c
      indices[index + 2] = b
      indices[index + 3] = b
      indices[index + 4] = c
      indices[index + 5] = d
      index += 6
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

/** First mesh in a loaded model, depth first. */
function findMesh(root: THREE.Object3D): THREE.Mesh | null {
  if (root instanceof THREE.Mesh) return root
  for (const child of root.children) {
    const found = findMesh(child)
    if (found) return found
  }
  return null
}

/** Menger radius of the centre line at `s`, with 2-unit arms. */
function cornerRadius(track: Track, s: number): number {
  const before = track.pointAt(s - 2)
  const here = track.pointAt(s)
  const after = track.pointAt(s + 2)
  const ab = Math.hypot(here.x - before.x, here.z - before.z)
  const bc = Math.hypot(after.x - here.x, after.z - here.z)
  const ca = Math.hypot(before.x - after.x, before.z - after.z)
  const area =
    Math.abs(
      (here.x - before.x) * (after.z - before.z) - (after.x - before.x) * (here.z - before.z),
    ) / 2
  return area < 1e-9 ? Infinity : (ab * bc * ca) / (4 * area)
}

interface ConeSpot extends WorldPoint {
  yaw: number
}

/**
 * Cones down both edges of every corner, and nowhere else: on a straight they
 * would read as a slalom, and on the ramp there is no table to stand them on.
 */
function coneSpots(track: Track, layout: TrackLayout): ConeSpot[] {
  const spots: ConeSpot[] = []
  const look = TRACK_LOOK.cones
  const rampFrom = layout.ramp.from - 3
  const rampLength = layout.ramp.length + 6
  let sinceLast: number = look.spacing
  for (let s = 0; s < track.length; s += 0.5) {
    if (cornerRadius(track, s) > look.cornerRadius) {
      // Leave a corner and the next one starts with a cone, not with a gap.
      sinceLast = look.spacing
      continue
    }
    sinceLast += 0.5
    if (sinceLast < look.spacing) continue
    const onRamp = ((s - rampFrom) % track.length + track.length) % track.length < rampLength
    if (onRamp) continue
    sinceLast = 0
    const lateral = track.widthAt(s) / 2 + look.outside
    for (const side of [-1, 1]) {
      const point = pointOn(track, s, lateral * side)
      spots.push({ ...point, yaw: hashNoise(s, side) * Math.PI * 2 })
    }
  }
  return spots
}

export function createTrackView(track: Track, layout: TrackLayout): TrackView {
  const group = new THREE.Group()
  group.name = 'track'

  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  const textures: THREE.Texture[] = []

  const ribbonMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    // Flat on the table and drawn after it; writing depth would make the
    // ribbons fight each other where the coffee lies on the route.
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  materials.push(ribbonMaterial)

  const addRibbon = (spec: RibbonSpec, renderOrder: number, name: string): void => {
    const geometry = buildRibbon(track, spec)
    geometries.push(geometry)
    const mesh = new THREE.Mesh(geometry, ribbonMaterial)
    mesh.name = name
    mesh.renderOrder = renderOrder
    mesh.frustumCulled = false
    group.add(mesh)
  }

  // The route itself, all the way round, pinching to the ramp's width where
  // the road does (see the width table in kitchenTable.ts).
  const dust = TRACK_LOOK.dust
  const dustFadeFrom = layout.ramp.from - dust.rampFade
  const dustFadeLength = layout.ramp.length + 2 * dust.rampFade + dust.rampClear
  /** 1 on the table, 0 across the ramp, with a soft edge at both ends. */
  const dustFade = (s: number): number => {
    const along = ((s - dustFadeFrom) % track.length + track.length) % track.length
    if (along >= dustFadeLength) return 1
    if (along < dust.rampFade) return 1 - along / dust.rampFade
    const tail = dustFadeLength - along
    if (tail < dust.rampFade) return 1 - tail / dust.rampFade
    return 0
  }
  addRibbon(
    {
      from: 0,
      length: track.length,
      step: dust.step,
      core: (t) => Math.max(0.4, track.widthAt(t * track.length) / 2 - dust.inset),
      feather: dust.feather,
      fade: (t) => dustFade(t * track.length),
      color: dust.color,
      opacity: dust.opacity,
      lift: dust.lift,
      speckle: dust.speckle,
    },
    TRACK_LOOK.dustRenderOrder,
    'track-dust',
  )

  // The grip zones, painted from the very spans `gripAt` reads.
  for (const zone of layout.zones) {
    const isCoffee = zone.id === 'coffee'
    const look = isCoffee ? TRACK_LOOK.coffee : TRACK_LOOK.flour
    addRibbon(
      {
        from: zone.from,
        length: zone.length,
        step: look.step,
        // A spill is a lens, a dusting is a stripe with soft ends.
        core: isCoffee
          ? (t) => zone.halfWidth * Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2))
          : () => zone.halfWidth - look.feather,
        feather: look.feather,
        fade: isCoffee ? () => 1 : (t) => Math.min(1, Math.min(t, 1 - t) * 8),
        color: look.color,
        opacity: look.opacity,
        lift: look.lift,
        speckle: look.speckle,
      },
      TRACK_LOOK.zoneRenderOrder,
      `zone-${zone.id}`,
    )
  }

  const boardGeometry = buildBoard(track, layout)
  geometries.push(boardGeometry)
  const boardMaterial = new THREE.MeshStandardMaterial({
    color: TRACK_LOOK.board.color,
    roughness: TRACK_LOOK.board.roughness,
    metalness: 0,
  })
  materials.push(boardMaterial)
  const boardMesh = new THREE.Mesh(boardGeometry, boardMaterial)
  boardMesh.name = 'cutting-board'
  boardMesh.castShadow = true
  boardMesh.receiveShadow = true
  group.add(boardMesh)

  const loader = new GLTFLoader().setPath(`${import.meta.env.BASE_URL}assets/track/`)

  const claim = (root: THREE.Object3D): void => {
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.castShadow = true
      child.receiveShadow = true
    })
  }

  /** Stands one toy-track piece on the height profile between two arc lengths. */
  const standPiece = (piece: THREE.Object3D, from: number, to: number, scaleX: number): void => {
    const start = pointOn(track, from, 0)
    const end = pointOn(track, to, 0)
    const flat = Math.hypot(end.x - start.x, end.z - start.z)
    const rise = end.y - start.y
    // YXZ: pitch about the piece's own X first, yaw about world Y after, or
    // the climb would tilt the axis the piece is turned about.
    piece.rotation.order = 'YXZ'
    piece.rotation.set(-Math.atan2(rise, flat), Math.atan2(end.x - start.x, end.z - start.z), 0)
    piece.scale.set(scaleX, 1, Math.hypot(flat, rise) / TOY_TRACK.tileLength)
    // Put the piece's DRIVING SURFACE on the profile, not its origin: what the
    // car touches is the top of the plastic, and the 0.3 below it is allowed
    // to sink into the table where the ramp starts.
    const surface = new THREE.Vector3(0, TOY_TRACK.surfaceY, 0).applyEuler(piece.rotation)
    piece.position.set(start.x - surface.x, start.y - surface.y, start.z - surface.z)
  }

  /** The maps a loaded model brought with it, so dispose() gives them back. */
  const collect = (root: THREE.Object3D): void => {
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of materials) {
        if (material instanceof THREE.MeshStandardMaterial && material.map) {
          textures.push(material.map)
        }
      }
    })
  }

  /**
   * The gate over the finish line. `s = 0` IS the line (kitchenTable.ts), so
   * the position and the heading come out of the track's own functions and not
   * out of a pair of typed-in coordinates.
   */
  const buildGate = async (): Promise<void> => {
    const look = TRACK_LOOK.gate
    const gltf = await loader.loadAsync(look.file)
    const gate = gltf.scene
    gate.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(gate)
    const size = box.getSize(new THREE.Vector3())
    // Wide enough that the whole road runs between the legs, tall enough that
    // the banner is in frame — two factors, both read off the model itself.
    const span = (track.widthAt(0) + 2 * look.legClearance) / (size.x * look.clearWidthFraction)
    const rise = look.clearHeight / (size.y * look.clearHeightFraction)
    gate.scale.set(span, rise, rise)

    const foot = pointOn(track, 0, 0)
    const tangent = track.tangentAt(0)
    // `rotation.y = heading` turns the model's own +X into the left of travel
    // (types.ts), which is what makes the gate span the road instead of lying
    // along it. `box.min.y` puts its feet, not its origin, on the table.
    gate.rotation.y = Math.atan2(tangent.x, tangent.z)
    gate.position.set(foot.x, foot.y + look.lift - box.min.y * rise, foot.z)
    gate.name = 'finish-gate'
    claim(gate)
    collect(gate)
    group.add(gate)
  }

  const buildRamp = async (): Promise<void> => {
    const look = TRACK_LOOK.ramp
    const [pieceGltf, supportGltf] = await Promise.all([
      loader.loadAsync(look.piece),
      loader.loadAsync(look.support),
    ])
    const ramp = layout.ramp
    const scaleX = (ramp.halfWidth * 2) / TOY_TRACK.width
    const step = ramp.length / look.pieces

    for (let index = 0; index < look.pieces; index += 1) {
      const piece = pieceGltf.scene.clone(true)
      standPiece(piece, ramp.from + index * step, ramp.from + (index + 1) * step, scaleX)
      claim(piece)
      group.add(piece)
    }

    // Legs under every joint, including the brink, which carries the car.
    for (let index = 1; index <= look.pieces; index += 1) {
      const s = ramp.from + index * step
      const height = track.heightAt(s, 0) - TOY_TRACK.thickness
      if (height < look.minSupportHeight) continue
      const tangent = track.tangentAt(s)
      const heading = Math.atan2(tangent.x, tangent.z)
      for (const side of [-1, 1]) {
        const support = supportGltf.scene.clone(true)
        const foot = track.pointAt(s)
        support.position.set(
          foot.x + tangent.z * look.supportOffset * side,
          0,
          foot.z - tangent.x * look.supportOffset * side,
        )
        support.rotation.y = heading
        support.scale.set(look.supportScaleX, height / TOY_TRACK.supportHeight, look.supportScaleZ)
        claim(support)
        group.add(support)
      }
    }
  }

  const buildCones = async (): Promise<void> => {
    const gltf = await loader.loadAsync(TRACK_LOOK.cones.file)
    gltf.scene.updateMatrixWorld(true)
    const mesh = findMesh(gltf.scene)
    if (!mesh) throw new Error(`${TRACK_LOOK.cones.file}: no mesh inside`)

    // Bake the node transform and the target size into the geometry, so every
    // instance matrix is nothing but a position and a yaw.
    const geometry = mesh.geometry.clone()
    geometry.applyMatrix4(mesh.matrixWorld)
    geometry.computeBoundingBox()
    const box = geometry.boundingBox
    const tall = box ? box.max.y - box.min.y : 1
    geometry.scale(
      TRACK_LOOK.cones.height / tall,
      TRACK_LOOK.cones.height / tall,
      TRACK_LOOK.cones.height / tall,
    )
    geometries.push(geometry)

    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    materials.push(material)
    if (material instanceof THREE.MeshStandardMaterial && material.map) {
      textures.push(material.map)
    }

    const spots = coneSpots(track, layout)
    const cones = new THREE.InstancedMesh(geometry, material, spots.length)
    cones.name = 'track-cones'
    cones.castShadow = true
    cones.receiveShadow = true
    const dummy = new THREE.Object3D()
    spots.forEach((spot, index) => {
      dummy.position.set(spot.x, spot.y, spot.z)
      dummy.rotation.set(0, spot.yaw, 0)
      dummy.updateMatrix()
      cones.setMatrixAt(index, dummy.matrix)
    })
    cones.instanceMatrix.needsUpdate = true
    group.add(cones)
  }

  const ready = Promise.all([buildRamp(), buildCones(), buildGate()]).then(() => undefined)

  return {
    object: group,
    ready,
    dispose(): void {
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) material.dispose()
      for (const texture of textures) texture.dispose()
      group.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        child.geometry.dispose()
        const material = child.material
        if (Array.isArray(material)) for (const entry of material) entry.dispose()
        else material.dispose()
      })
    },
  }
}
