/**
 * Bane 1, "Morgenbordet" — the whole track in one file: the numbers that shape
 * it and the pure geometry built from them.
 *
 * Three-free and physics-free on purpose. Nothing in here imports the car
 * model and the car model imports nothing from here; `main.ts` ties the two
 * together. That also means this file runs straight from Node, so the lap
 * length, the corner radii and the clearance to the table edge can be MEASURED
 * instead of guessed (see the phase 3 report).
 *
 * Adding a second track is a new file exporting the same `Track` interface —
 * the renderer and the car model must not have to change.
 *
 * Geometry conventions, binding and shared with types.ts:
 *  - `s` is arc length along the centre line, 0 at the finish line, growing in
 *    the driving direction (which is growing `phi`), wrapping at `trackLength`.
 *  - `lateralOffset` is positive to the LEFT of the driving direction, i.e.
 *    along the car's own +X axis.
 *  - a heading of 0 points along +Z and grows counter-clockwise seen from
 *    above, so a tangent (tx, tz) is the heading `atan2(tx, tz)`.
 */

import { TABLE } from '../constants'
import type { Ground, Track, TrackPoint, TrackPose, TrackProjection, TrackSurface } from './types'

/**
 * Every number that shapes this track. Measured, not chosen: the superellipse
 * and its four bulges come from docs/TRACK.md, where the shape was checked for
 * self-intersection, corner radius and clearance to the table edge before a
 * line of code existed.
 */
export const KITCHEN_TABLE = {
  centreLine: {
    /** Half width and half depth of the superellipse, in world units. */
    a: 54,
    b: 25,
    /** Squareness. n > 2 gives the flat-sided, round-cornered table loop. */
    n: 2.6,
    /**
     * Gaussian bells on the radius scale, `amount * exp(-0.5 * (dphi/width)^2)`.
     * They are what turns a symmetric superellipse into a track with character:
     * the flour stretch leans out to the back edge, the plate corner swings
     * wide, and the ramp straight cuts its corner.
     */
    bulges: [
      { phi: -0.6, width: 0.5, amount: -0.11 },
      { phi: -1.95, width: 0.42, amount: 0.1 },
      { phi: 0.42, width: 0.38, amount: 0.06 },
      { phi: 2.6, width: 0.4, amount: 0.07 },
    ],
  },

  /** The finish line, and therefore s = 0. Racing runs towards growing phi. */
  startPhi: 1.2,

  road: {
    /** Default road width — just under six car widths. */
    width: 10,
    /**
     * Width overrides, in phi, linearly interpolated in arc length between
     * keyframes and falling back to `width` outside the listed range. The only
     * use on this track is the pinch onto the ramp, which is 8 wide where the
     * road is 10; a later track can narrow itself anywhere with this table.
     * Keyframes must not wrap past the finish line.
     */
    widthKeyframes: [
      { phi: 4.7, width: 10 },
      { phi: 4.86, width: 8 },
      { phi: 5.15, width: 8 },
      { phi: 5.3, width: 10 },
    ],
  },

  /**
   * One checkpoint per section of docs/TRACK.md, in passing order. Sections
   * given as a phi range in the document are represented by their midpoint
   * (start straight 1.2..2.0, pot chicane 2.6..3.4, flour 4.0..4.6), the rest
   * by the single phi the document names.
   */
  checkpointPhi: [1.6, 2.15, 3.0, 4.3, 5.0, 5.5, 6.0, 0.45],

  /**
   * Grip zones, as a span along the track plus a lateral reach — never a
   * free-floating polygon, so they cannot drift off the road when the centre
   * line is retuned. First match wins; the cutting board gets its grip from
   * its own height profile below, so the two can never disagree.
   */
  zones: [
    /** Spilled flour along the back edge. The one really dangerous section. */
    { id: 'flour', grip: 0.4, fromPhi: 4.0, toPhi: 4.6, halfWidth: 5.6 },
    /** A tipped cup: allowed to spill a little past the road, it is a spill. */
    { id: 'coffee', grip: 0.55, fromPhi: 5.3, toPhi: 5.68, halfWidth: 7 },
  ],

  /**
   * A piece of orange toy track on legs, standing on the table. Ends in a
   * sheer edge, so the car is thrown off the top and lands on the table again.
   * `brinkOffset` puts the edge that far past the section's phi.
   */
  ramp: {
    phi: 5.0,
    brinkOffset: 6,
    /** Arc length of the climb. Height/climb is the launch angle: 16.3 deg. */
    climbLength: 12,
    height: 3.5,
    /** Half of the rideable width — narrower than the 10-wide road, by design. */
    halfWidth: 4,
    /**
     * A short lateral run-up OUTSIDE the model's edge. Without it, drifting
     * sideways onto the ramp teleports the car up the full height in one tick;
     * with it the car climbs the last half unit over several ticks instead.
     */
    edgeTaper: 0.5,
  },

  /**
   * The raised wooden board. `entrySlope` is the length of the sloped kerb on
   * the way up: at a realistic 35 u/s the car covers 0.58 units of track per
   * tick, so a 4-unit slope lifts it at most 0.15 units per tick — a bump, not
   * a step, and nowhere near a wall that would stop the car dead.
   */
  cuttingBoard: {
    phi: 6.0,
    height: 1,
    plateauLength: 8,
    entrySlope: 4,
    exitSlope: 2,
    halfWidth: 6,
    edgeTaper: 0.4,
    /** Dry wood: a shade better than the table top. */
    grip: 1.05,
  },

  /** Two cars side by side behind the line, offset across so they fit. */
  startGrid: {
    behindLine: 7,
    lateral: 2.6,
  },

  respawn: {
    /** Long enough that the fall reads as a fall before the car is back. */
    delaySeconds: 1.5,
    /** Across the road, mirrored per player: two cars never land on top. */
    lateral: 2.2,
  },

  sampling: {
    /**
     * Steps of the dense phi table the arc length is integrated from. The lap
     * length is converged to 3e-5 units by 16384 (271.44373 against 271.44376
     * at a million steps), and the table is thrown away once the even-spaced
     * one is built.
     */
    densePhiSteps: 16384,
    /** Target distance between even-spaced samples. */
    spacing: 0.15,
    /** Every Nth sample is scanned in the global search, then refined. */
    coarseStride: 16,
    /**
     * Samples searched either side of the hint. A car at top speed moves 0.77
     * units per tick, i.e. 5 samples, so 24 is a wide margin; the search falls
     * back to the global one if the best sample sits on the window edge.
     */
    hintWindow: 24,
  },
} as const

const TAU = Math.PI * 2

/** Folds an angle back into (-pi, pi]. */
function wrapPi(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

/** The bulged radius scale at `phi`. */
function radiusScale(phi: number): number {
  let scale = 1
  for (const bulge of KITCHEN_TABLE.centreLine.bulges) {
    const offset = wrapPi(phi - bulge.phi) / bulge.width
    scale += bulge.amount * Math.exp(-0.5 * offset * offset)
  }
  return scale
}

interface Span {
  from: number
  length: number
}

interface Zone extends Span {
  grip: number
  halfWidth: number
}

interface BoardProfile extends Span {
  height: number
  entrySlope: number
  exitSlope: number
  /** Where the exit slope starts, measured from the board's leading edge. */
  exitFrom: number
  halfWidth: number
  edgeTaper: number
  grip: number
}

interface RampProfile extends Span {
  height: number
  halfWidth: number
  edgeTaper: number
  brink: number
}

interface BuiltTrack {
  length: number
  count: number
  spacing: number
  x: Float64Array
  z: Float64Array
  tx: Float64Array
  tz: Float64Array
  checkpoints: number[]
  zones: Zone[]
  ramp: RampProfile
  board: BoardProfile
  widthKeys: { s: number; width: number }[]
}

function buildTrack(): BuiltTrack {
  const { a, b, n } = KITCHEN_TABLE.centreLine
  const exponent = 2 / n
  const steps = KITCHEN_TABLE.sampling.densePhiSteps

  // 1. Dense table in phi, with its running arc length. The superellipse runs
  //    far faster in phi down the straights than round the corners, so phi is
  //    useless as a track coordinate — but it integrates cleanly.
  const denseX = new Float64Array(steps + 1)
  const denseZ = new Float64Array(steps + 1)
  const cumulative = new Float64Array(steps + 1)
  for (let index = 0; index <= steps; index += 1) {
    const phi = (index / steps) * TAU
    const scale = radiusScale(phi)
    const cos = Math.cos(phi)
    const sin = Math.sin(phi)
    denseX[index] = a * scale * Math.sign(cos) * Math.abs(cos) ** exponent
    denseZ[index] = b * scale * Math.sign(sin) * Math.abs(sin) ** exponent
    if (index > 0) {
      cumulative[index] =
        cumulative[index - 1] +
        Math.hypot(denseX[index] - denseX[index - 1], denseZ[index] - denseZ[index - 1])
    }
  }
  const length = cumulative[steps]

  const arcAtPhi = (phi: number): number => {
    const wrapped = (((phi % TAU) + TAU) % TAU) / TAU
    const position = wrapped * steps
    const index = Math.floor(position)
    const fraction = position - index
    return cumulative[index] + (cumulative[index + 1] - cumulative[index]) * fraction
  }
  const startArc = arcAtPhi(KITCHEN_TABLE.startPhi)
  /** Arc length from the finish line to `phi`, in [0, length). */
  const lapSOfPhi = (phi: number): number => {
    const raw = arcAtPhi(phi) - startArc
    return ((raw % length) + length) % length
  }

  // 2. Resample at EVEN ARC LENGTH from the finish line. Everything downstream
  //    — projection, zones, the dust ribbon, the cones — assumes even spacing.
  const count = Math.max(64, Math.round(length / KITCHEN_TABLE.sampling.spacing))
  const spacing = length / count
  const x = new Float64Array(count)
  const z = new Float64Array(count)
  let cursor = 0
  let previousTarget = -1
  for (let index = 0; index < count; index += 1) {
    const target = (startArc + index * spacing) % length
    // The targets wrap once, past the finish line; restart the walk there.
    if (target < previousTarget) cursor = 0
    previousTarget = target
    while (cursor < steps - 1 && cumulative[cursor + 1] < target) cursor += 1
    const run = cumulative[cursor + 1] - cumulative[cursor]
    const fraction = run > 0 ? (target - cumulative[cursor]) / run : 0
    x[index] = denseX[cursor] + (denseX[cursor + 1] - denseX[cursor]) * fraction
    z[index] = denseZ[cursor] + (denseZ[cursor + 1] - denseZ[cursor]) * fraction
  }

  // 3. Tangents by central difference on the closed ring. Even spacing means
  //    no weighting is needed, which is half the reason for step 2.
  const tx = new Float64Array(count)
  const tz = new Float64Array(count)
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count
    const previous = (index + count - 1) % count
    const dx = x[next] - x[previous]
    const dz = z[next] - z[previous]
    const inverse = 1 / Math.hypot(dx, dz)
    tx[index] = dx * inverse
    tz[index] = dz * inverse
  }

  const checkpoints = KITCHEN_TABLE.checkpointPhi.map(lapSOfPhi)

  const zones: Zone[] = KITCHEN_TABLE.zones.map((zone) => {
    const from = lapSOfPhi(zone.fromPhi)
    const to = lapSOfPhi(zone.toPhi)
    return {
      from,
      length: ((to - from) % length + length) % length,
      grip: zone.grip,
      halfWidth: zone.halfWidth,
    }
  })

  const rampSpec = KITCHEN_TABLE.ramp
  const brink = (lapSOfPhi(rampSpec.phi) + rampSpec.brinkOffset) % length
  const ramp: RampProfile = {
    from: ((brink - rampSpec.climbLength) % length + length) % length,
    length: rampSpec.climbLength,
    height: rampSpec.height,
    halfWidth: rampSpec.halfWidth,
    edgeTaper: rampSpec.edgeTaper,
    brink,
  }

  const boardSpec = KITCHEN_TABLE.cuttingBoard
  const boardLength = boardSpec.entrySlope + boardSpec.plateauLength + boardSpec.exitSlope
  const board: BoardProfile = {
    from: ((lapSOfPhi(boardSpec.phi) - boardLength / 2) % length + length) % length,
    length: boardLength,
    height: boardSpec.height,
    entrySlope: boardSpec.entrySlope,
    exitSlope: boardSpec.exitSlope,
    exitFrom: boardSpec.entrySlope + boardSpec.plateauLength,
    halfWidth: boardSpec.halfWidth,
    edgeTaper: boardSpec.edgeTaper,
    grip: boardSpec.grip,
  }

  const widthKeys = KITCHEN_TABLE.road.widthKeyframes
    .map((key) => ({ s: lapSOfPhi(key.phi), width: key.width }))
    .sort((left, right) => left.s - right.s)

  return { length, count, spacing, x, z, tx, tz, checkpoints, zones, ramp, board, widthKeys }
}

const TRACK = buildTrack()

/** One lap of the centre line, in world units. */
export const trackLength = TRACK.length

/** Arc length of each checkpoint, in passing order. */
export const checkpoints: readonly number[] = TRACK.checkpoints

const HALF_TABLE_WIDTH = TABLE.width / 2
const HALF_TABLE_DEPTH = TABLE.depth / 2

function normalise(s: number): number {
  const wrapped = s % TRACK.length
  return wrapped < 0 ? wrapped + TRACK.length : wrapped
}

/** Distance travelled from `from` to `s` in the driving direction. */
function offsetInSpan(s: number, from: number): number {
  const raw = (s - from) % TRACK.length
  return raw < 0 ? raw + TRACK.length : raw
}

export function pointAt(s: number): TrackPoint {
  const position = normalise(s) / TRACK.spacing
  const index = Math.floor(position) % TRACK.count
  const next = (index + 1) % TRACK.count
  const fraction = position - Math.floor(position)
  return {
    x: TRACK.x[index] + (TRACK.x[next] - TRACK.x[index]) * fraction,
    z: TRACK.z[index] + (TRACK.z[next] - TRACK.z[index]) * fraction,
  }
}

export function tangentAt(s: number): TrackPoint {
  const position = normalise(s) / TRACK.spacing
  const index = Math.floor(position) % TRACK.count
  const next = (index + 1) % TRACK.count
  const fraction = position - Math.floor(position)
  const dx = TRACK.tx[index] + (TRACK.tx[next] - TRACK.tx[index]) * fraction
  const dz = TRACK.tz[index] + (TRACK.tz[next] - TRACK.tz[index]) * fraction
  const inverse = 1 / Math.hypot(dx, dz)
  return { x: dx * inverse, z: dz * inverse }
}

export function widthAt(s: number): number {
  const keys = TRACK.widthKeys
  if (keys.length === 0) return KITCHEN_TABLE.road.width
  const position = normalise(s)
  if (position <= keys[0].s || position >= keys[keys.length - 1].s) {
    return KITCHEN_TABLE.road.width
  }
  for (let index = 1; index < keys.length; index += 1) {
    const key = keys[index]
    if (position > key.s) continue
    const previous = keys[index - 1]
    const span = key.s - previous.s
    const fraction = span > 0 ? (position - previous.s) / span : 0
    return previous.width + (key.width - previous.width) * fraction
  }
  return KITCHEN_TABLE.road.width
}

/** Squared distance from (x, z) to sample `index`. */
function sampleDistanceSquared(x: number, z: number, index: number): number {
  const dx = x - TRACK.x[index]
  const dz = z - TRACK.z[index]
  return dx * dx + dz * dz
}

/**
 * Nearest sample by a coarse sweep plus a local refinement. The coarse stride
 * is 2.4 units against a smallest corner radius of 9.3 and a track that never
 * comes within 25 units of itself, so the refinement cannot land on the wrong
 * side of the loop for anything within ten units of the road.
 */
function nearestIndexGlobal(x: number, z: number): number {
  const stride = KITCHEN_TABLE.sampling.coarseStride
  let best = 0
  let bestDistance = Infinity
  for (let index = 0; index < TRACK.count; index += stride) {
    const distance = sampleDistanceSquared(x, z, index)
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  }
  let refined = best
  for (let step = -stride; step <= stride; step += 1) {
    const index = (best + step + TRACK.count) % TRACK.count
    const distance = sampleDistanceSquared(x, z, index)
    if (distance < bestDistance) {
      bestDistance = distance
      refined = index
    }
  }
  return refined
}

/**
 * Nearest sample within `window` samples of the hint, or -1 when the best one
 * sits on the window edge — which means the true nearest may well be outside
 * it, and the caller has to fall back to the global search.
 */
function nearestIndexNear(x: number, z: number, centre: number, window: number): number {
  let bestStep = 0
  let bestDistance = Infinity
  for (let step = -window; step <= window; step += 1) {
    const index = (centre + step + TRACK.count) % TRACK.count
    const distance = sampleDistanceSquared(x, z, index)
    if (distance < bestDistance) {
      bestDistance = distance
      bestStep = step
    }
  }
  if (Math.abs(bestStep) >= window) return -1
  return (centre + bestStep + TRACK.count) % TRACK.count
}

/**
 * Exact projection onto the two segments either side of `index`. The samples
 * are 0.15 apart, so the chord error against the real curve is 0.15^2/(8*9.3)
 * = 0.0003 units — three ten-thousandths of a car width.
 */
function projectAtIndex(x: number, z: number, index: number): TrackProjection {
  let bestDistance = Infinity
  let bestS = 0
  let bestLateral = 0
  let bestTangentX = 1
  let bestTangentZ = 0

  for (let step = -1; step <= 0; step += 1) {
    const from = (index + step + TRACK.count) % TRACK.count
    const to = (from + 1) % TRACK.count
    const dx = TRACK.x[to] - TRACK.x[from]
    const dz = TRACK.z[to] - TRACK.z[from]
    const lengthSquared = dx * dx + dz * dz
    const px = x - TRACK.x[from]
    const pz = z - TRACK.z[from]
    let t = lengthSquared > 0 ? (px * dx + pz * dz) / lengthSquared : 0
    if (t < 0) t = 0
    else if (t > 1) t = 1
    const footX = TRACK.x[from] + dx * t
    const footZ = TRACK.z[from] + dz * t
    const distance = (x - footX) * (x - footX) + (z - footZ) * (z - footZ)
    if (distance >= bestDistance) continue

    const inverse = 1 / Math.sqrt(lengthSquared)
    const tangentX = dx * inverse
    const tangentZ = dz * inverse
    bestDistance = distance
    bestS = normalise((from + t) * TRACK.spacing)
    // Positive to the left of travel: the car's own +X axis is (cos h, -sin h)
    // and the tangent is (sin h, cos h), so left is (tz, -tx).
    bestLateral = (x - footX) * tangentZ - (z - footZ) * tangentX
    bestTangentX = tangentX
    bestTangentZ = tangentZ
  }

  return { s: bestS, lateralOffset: bestLateral, tangentX: bestTangentX, tangentZ: bestTangentZ }
}

export function projectToTrack(x: number, z: number, hintS?: number): TrackProjection {
  if (hintS !== undefined) {
    const centre = Math.floor(normalise(hintS) / TRACK.spacing) % TRACK.count
    const near = nearestIndexNear(x, z, centre, KITCHEN_TABLE.sampling.hintWindow)
    if (near >= 0) return projectAtIndex(x, z, near)
  }
  return projectAtIndex(x, z, nearestIndexGlobal(x, z))
}

/** 1 inside the surface, fading to 0 across `taper` outside its edge. */
function edgeFactor(lateral: number, halfWidth: number, taper: number): number {
  const distance = Math.abs(lateral)
  if (distance <= halfWidth) return 1
  if (distance >= halfWidth + taper) return 0
  return (halfWidth + taper - distance) / taper
}

/** Height of whatever stands on the table at (s, lateralOffset). */
export function heightAt(s: number, lateralOffset: number): number {
  const ramp = TRACK.ramp
  const alongRamp = offsetInSpan(s, ramp.from)
  // Inclusive at the brink: the last edge of the plastic belongs to the ramp,
  // so the model's end piece is placed on 3.5 and not on the table.
  if (alongRamp <= ramp.length) {
    const edge = edgeFactor(lateralOffset, ramp.halfWidth, ramp.edgeTaper)
    return edge === 0 ? 0 : ramp.height * (alongRamp / ramp.length) * edge
  }

  const board = TRACK.board
  const alongBoard = offsetInSpan(s, board.from)
  if (alongBoard < board.length) {
    const edge = edgeFactor(lateralOffset, board.halfWidth, board.edgeTaper)
    if (edge === 0) return 0
    if (alongBoard < board.entrySlope) {
      return board.height * (alongBoard / board.entrySlope) * edge
    }
    if (alongBoard >= board.exitFrom) {
      return board.height * (1 - (alongBoard - board.exitFrom) / board.exitSlope) * edge
    }
    return board.height * edge
  }

  return 0
}

export function gripAt(s: number, lateralOffset: number): number {
  const board = TRACK.board
  if (
    offsetInSpan(s, board.from) < board.length &&
    Math.abs(lateralOffset) <= board.halfWidth
  ) {
    // Taken from the board's own footprint, so the grip can never sit beside
    // the plateau it belongs to.
    return board.grip
  }
  for (const zone of TRACK.zones) {
    if (offsetInSpan(s, zone.from) < zone.length && Math.abs(lateralOffset) <= zone.halfWidth) {
      return zone.grip
    }
  }
  return 1
}

export function groundAt(x: number, z: number, hintS?: number): Ground {
  if (Math.abs(x) > HALF_TABLE_WIDTH || Math.abs(z) > HALF_TABLE_DEPTH) {
    // No invisible walls anywhere on this track: the edge is the edge.
    return { y: 0, onTable: false }
  }
  const projection = projectToTrack(x, z, hintS)
  return { y: heightAt(projection.s, projection.lateralOffset), onTable: true }
}

export function sampleSurface(x: number, z: number, hintS?: number): TrackSurface {
  const projection = projectToTrack(x, z, hintS)
  const onTable = Math.abs(x) <= HALF_TABLE_WIDTH && Math.abs(z) <= HALF_TABLE_DEPTH
  return {
    s: projection.s,
    lateralOffset: projection.lateralOffset,
    tangentX: projection.tangentX,
    tangentZ: projection.tangentZ,
    y: onTable ? heightAt(projection.s, projection.lateralOffset) : 0,
    onTable,
    grip: onTable ? gripAt(projection.s, projection.lateralOffset) : 1,
  }
}

/** A pose on the centre line at `s`, shifted `lateral` to the left of travel. */
function poseOnTrack(s: number, lateral: number): TrackPose {
  const position = pointAt(s)
  const tangent = tangentAt(s)
  const x = position.x + tangent.z * lateral
  const z = position.z - tangent.x * lateral
  return {
    x,
    y: heightAt(s, lateral),
    z,
    heading: Math.atan2(tangent.x, tangent.z),
    s: normalise(s),
  }
}

/** Alternating sides, so two cars are never put down on the same spot. */
function lateralForPlayer(player: number, offset: number): number {
  return player % 2 === 0 ? offset : -offset
}

export function startPose(player: number): TrackPose {
  const grid = KITCHEN_TABLE.startGrid
  return poseOnTrack(-grid.behindLine, lateralForPlayer(player, grid.lateral))
}

export function respawnPose(s: number, player: number): TrackPose {
  return poseOnTrack(s, lateralForPlayer(player, KITCHEN_TABLE.respawn.lateral))
}

/** The whole track behind one object, for code that should stay track-agnostic. */
export const kitchenTableTrack: Track = {
  length: trackLength,
  checkpoints,
  respawnDelaySeconds: KITCHEN_TABLE.respawn.delaySeconds,
  pointAt,
  tangentAt,
  widthAt,
  projectToTrack,
  groundAt,
  heightAt,
  gripAt,
  sampleSurface,
  startPose,
  respawnPose,
}

/**
 * Derived spans the view needs to lay the dust ribbon, to stand the ramp on
 * exactly the profile the physics drives on, and to paint the grip zones where
 * they actually bite. Read-only on purpose: the view must never invent its own
 * geometry, and it gets every height from `heightAt`.
 */
export interface TrackLayout {
  readonly ramp: {
    readonly from: number
    readonly brink: number
    readonly length: number
    readonly height: number
    readonly halfWidth: number
  }
  readonly board: {
    readonly from: number
    readonly length: number
    readonly height: number
    readonly halfWidth: number
    readonly edgeTaper: number
  }
  readonly zones: readonly {
    readonly id: string
    readonly from: number
    readonly length: number
    readonly halfWidth: number
    readonly grip: number
  }[]
}

export const TRACK_LAYOUT: TrackLayout = {
  ramp: {
    from: TRACK.ramp.from,
    brink: TRACK.ramp.brink,
    length: TRACK.ramp.length,
    height: TRACK.ramp.height,
    halfWidth: TRACK.ramp.halfWidth,
  },
  board: {
    from: TRACK.board.from,
    length: TRACK.board.length,
    height: TRACK.board.height,
    halfWidth: TRACK.board.halfWidth,
    edgeTaper: TRACK.board.edgeTaper,
  },
  zones: TRACK.zones.map((zone, index) => ({
    id: KITCHEN_TABLE.zones[index].id,
    from: zone.from,
    length: zone.length,
    halfWidth: zone.halfWidth,
    grip: zone.grip,
  })),
}
