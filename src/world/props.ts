import { WORLD_UNIT_CM } from '../constants'

/**
 * Everything that stands on the kitchen table, in ONE table of data.
 *
 * Three-free, like the track: it is pure numbers plus the track's own geometry
 * functions, so it runs from Node and every placement can be MEASURED (road
 * clearance, table clearance, how much room is left beside the dinner plate).
 *
 * Adding a prop is ONE line in `PROP_PLACEMENTS`. Adding a new model is one
 * line in `PROP_MODELS` first, because a model needs its measured box.
 *
 * Placement is in TRACK coordinates — a section, an arc-length offset from
 * that section's checkpoint, and a lateral offset — never a hand-written x/z.
 * Retune the centre line and the pot stays in the chicane.
 *
 *   lateral > 0 is LEFT of the driving direction, which on this loop is the
 *   OUTSIDE, towards the table edge; lateral < 0 is the roomy inside.
 *
 * `yaw` is likewise relative to the track tangent: 0 faces the way the cars
 * drive, +pi/2 faces the outside. A pan whose handle points off the road keeps
 * pointing off the road.
 */

import type { Track } from '../track/types'
import type { PropBody, PropRole } from './propCollision'

export const PROP_SCALE = {
  /**
   * Centimetres per world unit. Props are judged against the car, because the
   * car is the only thing on screen to judge them by, and that is exactly what
   * `WORLD_UNIT_CM` now means: a 1:64 toy car is about 8 cm long and ours is
   * 4.0 units. This used to hold its own 2 while the shared constant said 1.75,
   * which sized the props against the car and the table top against something
   * else. One number now, and it is this one.
   */
  cmPerUnit: WORLD_UNIT_CM,
} as const

/**
 * A model, with the bounding box MEASURED from the GLB (every model in the
 * Kenney Food Kit stands on its own y = 0 and is centred on x/z, apart from
 * the handles of the pan, the mug and the cup).
 *
 * `cm` is what the real thing measures along `fit`, and that — divided by the
 * box — is the scale factor. Never a guessed scale: Kenney's food is modelled
 * against Kenney's own cars, and ours are four units long.
 */
interface PropModel {
  readonly file: string
  /** Measured GLB bounding box, in the model's own units. */
  readonly box: { readonly x: number; readonly y: number; readonly z: number }
  readonly fit: 'x' | 'y' | 'z'
  /** The real object's size along `fit`, in centimetres. */
  readonly cm: number
  /** Collision circle, in centimetres — the footprint, not the bounding box. */
  readonly radiusCm: number
  /** How high the car has to be to pass over it, in centimetres. */
  readonly clearCm: number
  /**
   * How hard it hits back, 0..1. A pot is a wall; a fork is a rattle that
   * tugs the steering without stopping the car. Only `obstacle` props use it.
   */
  readonly kick: number
}

export const PROP_MODELS = {
  // --- on the racing line ---------------------------------------------------
  plateDinner: {
    file: 'plate-dinner.glb',
    box: { x: 0.8918, y: 0.2214, z: 0.8918 },
    fit: 'x',
    cm: 26,
    radiusCm: 13,
    // The rim, not the food: a plate is LOW, and clearing it on the way down
    // from the ramp is the whole point of having a height at all.
    clearCm: 3,
    kick: 0.8,
  },
  pot: {
    file: 'pot.glb',
    box: { x: 0.6574, y: 0.3608, z: 0.8221 },
    fit: 'x',
    cm: 20,
    /** 10 cm of pot plus a bite of the two handles. */
    radiusCm: 11,
    clearCm: 11,
    kick: 1,
  },
  fryingPan: {
    file: 'frying-pan.glb',
    box: { x: 0.6574, y: 0.1206, z: 1.022 },
    fit: 'x',
    cm: 22,
    /** The bowl only. The handle sticks out of the circle, off the road. */
    radiusCm: 11,
    clearCm: 4,
    kick: 1,
  },
  cuttingBoard: {
    file: 'cutting-board.glb',
    box: { x: 0.58, y: 0.06, z: 0.82 },
    fit: 'z',
    /** A small chopping board: a 45 cm one is 22 units long and crowds the corner. */
    cm: 32,
    /** Half the SHORT side: a circle on a rectangle has to forgive its corners. */
    radiusCm: 11,
    clearCm: 2.3,
    kick: 1,
  },
  bottleOil: {
    file: 'bottle-oil.glb',
    box: { x: 0.14, y: 0.6218, z: 0.14 },
    fit: 'y',
    cm: 25,
    radiusCm: 2.8,
    clearCm: 25,
    kick: 1,
  },
  bottleKetchup: {
    file: 'bottle-ketchup.glb',
    box: { x: 0.1441, y: 0.3931, z: 0.1664 },
    fit: 'y',
    cm: 22,
    radiusCm: 4.7,
    clearCm: 22,
    kick: 1,
  },
  utensilFork: {
    file: 'utensil-fork.glb',
    box: { x: 0.5035, y: 0.0178, z: 0.084 },
    fit: 'x',
    cm: 19,
    /** Half the handle, not the whole fork: a fork is mostly air. */
    radiusCm: 4,
    clearCm: 0.7,
    kick: 0.25,
  },
  utensilKnife: {
    file: 'utensil-knife.glb',
    box: { x: 0.6008, y: 0.0178, z: 0.0778 },
    fit: 'x',
    cm: 21,
    radiusCm: 4,
    clearCm: 0.6,
    kick: 0.25,
  },
  utensilSpoon: {
    file: 'utensil-spoon.glb',
    box: { x: 0.4796, y: 0.0278, z: 0.12 },
    fit: 'x',
    cm: 18,
    radiusCm: 4,
    clearCm: 1,
    kick: 0.25,
  },

  // --- knocked about --------------------------------------------------------
  cupCoffee: {
    file: 'cup-coffee.glb',
    box: { x: 0.2163, y: 0.14, z: 0.2866 },
    fit: 'x',
    cm: 9,
    radiusCm: 4.5,
    clearCm: 5.8,
    kick: 0.3,
  },
  apple: {
    file: 'apple.glb',
    box: { x: 0.1963, y: 0.1908, z: 0.1963 },
    fit: 'x',
    cm: 8,
    radiusCm: 4,
    clearCm: 7.8,
    kick: 0.2,
  },
  carrot: {
    file: 'carrot.glb',
    box: { x: 0.3431, y: 0.7163, z: 0.3431 },
    fit: 'y',
    cm: 18,
    radiusCm: 4.3,
    clearCm: 8.6,
    kick: 0.2,
  },
  broccoli: {
    file: 'broccoli.glb',
    box: { x: 0.3752, y: 0.4217, z: 0.3752 },
    fit: 'y',
    cm: 16,
    radiusCm: 7,
    clearCm: 16,
    kick: 0.2,
  },
  banana: {
    file: 'banana.glb',
    box: { x: 0.1376, y: 0.1958, z: 0.6299 },
    fit: 'z',
    cm: 18,
    radiusCm: 6,
    clearCm: 5.6,
    kick: 0.2,
  },
  donut: {
    file: 'donut.glb',
    box: { x: 0.2451, y: 0.0889, z: 0.283 },
    fit: 'z',
    cm: 11,
    radiusCm: 5,
    clearCm: 3.5,
    kick: 0.2,
  },

  // --- scenery --------------------------------------------------------------
  plate: {
    file: 'plate.glb',
    box: { x: 0.8918, y: 0.09, z: 0.8918 },
    fit: 'x',
    cm: 24,
    radiusCm: 12,
    clearCm: 2.4,
    kick: 0.8,
  },
  pan: {
    file: 'pan.glb',
    box: { x: 0.6574, y: 0.1753, z: 0.7621 },
    fit: 'x',
    cm: 20,
    radiusCm: 10,
    clearCm: 5.3,
    kick: 1,
  },
  bowl: {
    file: 'bowl.glb',
    box: { x: 0.5022, y: 0.2138, z: 0.5798 },
    fit: 'z',
    cm: 18,
    radiusCm: 9,
    clearCm: 6.6,
    kick: 1,
  },
  cake: {
    file: 'cake.glb',
    box: { x: 0.6392, y: 0.2731, z: 0.6392 },
    fit: 'x',
    cm: 22,
    radiusCm: 11,
    clearCm: 9.4,
    kick: 0.8,
  },
  mug: {
    file: 'mug.glb',
    box: { x: 0.3437, y: 0.2734, z: 0.2851 },
    fit: 'y',
    cm: 9,
    radiusCm: 5,
    clearCm: 9,
    kick: 0.5,
  },
  glass: {
    file: 'glass.glb',
    box: { x: 0.1596, y: 0.2851, z: 0.1843 },
    fit: 'y',
    cm: 10,
    radiusCm: 3.2,
    clearCm: 10,
    kick: 0.5,
  },
  pizzaBox: {
    file: 'pizza-box.glb',
    box: { x: 0.9418, y: 0.8816, z: 0.9518 },
    fit: 'x',
    cm: 33,
    radiusCm: 17,
    /** The box is open: 31 cm of it is lid standing in the air. */
    clearCm: 31,
    kick: 1,
  },
  pepperMill: {
    file: 'pepper-mill.glb',
    box: { x: 0.1581, y: 0.5481, z: 0.1581 },
    fit: 'y',
    cm: 20,
    radiusCm: 2.9,
    clearCm: 20,
    kick: 1,
  },
  eggCup: {
    file: 'egg-cup.glb',
    box: { x: 0.1581, y: 0.15, z: 0.1826 },
    fit: 'y',
    cm: 7,
    radiusCm: 3.7,
    clearCm: 7,
    kick: 0.5,
  },
} as const satisfies Record<string, PropModel>

export type PropModelId = keyof typeof PROP_MODELS

/**
 * The eight sections of docs/TRACK.md, as indices into `track.checkpoints` —
 * the track's own definition of where a section is. A prop is placed relative
 * to its section, so it follows the track rather than a remembered x/z.
 */
export const PROP_SECTION = {
  startStraight: 0,
  cutlery: 1,
  potChicane: 2,
  flour: 3,
  ramp: 4,
  coffee: 5,
  cuttingBoard: 6,
  plateCorner: 7,
} as const

export type PropSection = keyof typeof PROP_SECTION

interface PropPlacement {
  readonly model: PropModelId
  readonly at: PropSection
  /** Arc length from that section's checkpoint; + is further round the lap. */
  readonly ds: number
  /** Across the road: + is left of the driving direction, i.e. the outside. */
  readonly lateral: number
  /** Yaw relative to the track tangent; +pi/2 turns the model's nose outwards. */
  readonly yaw: number
  readonly role: PropRole
  /** A fixed lean about the model's own X axis: the tipped coffee cup. */
  readonly roll?: number
  /** Raised above the surface: a cake on a plate, a knife on a board. */
  readonly lift?: number
}

/**
 * ONE line per prop. The road is 10 units wide, so a lateral of ±5 is the
 * edge of it: anything with `role: 'decor'` stands clear of that (measured,
 * see the phase 4 report), anything with `role: 'obstacle'` is allowed to
 * reach over it, and that reach is the whole point of the section.
 */
export const PROP_PLACEMENTS: readonly PropPlacement[] = [
  // 1. Startstrækningen — nothing may stand on it: a race has to begin calm.
  { model: 'pizzaBox', at: 'startStraight', ds: 4, lateral: -24, yaw: 0.5, role: 'decor' },
  { model: 'mug', at: 'startStraight', ds: -12, lateral: -14, yaw: -0.7, role: 'decor' },
  { model: 'banana', at: 'startStraight', ds: 14, lateral: -10, yaw: 1.1, role: 'light' },

  // 2. Bestik-sliden: cutlery scattered across the road. LIGHT, not fixed.
  //    docs/TRACK.md wanted small fixed bumps, but a fixed circle is a wall
  //    that keeps pushing: measured, a head-on into a 2-unit "fork" zeroed a
  //    35 u/s car over five ticks, because each tick of contact cancels more
  //    of the closing speed whatever the bounce is scaled to. A fork you send
  //    skidding across the table costs the car nothing and reads far better.
  { model: 'utensilFork', at: 'cutlery', ds: -5, lateral: 2.6, yaw: 0.9, role: 'light' },
  { model: 'utensilKnife', at: 'cutlery', ds: 0, lateral: -2.6, yaw: -0.5, role: 'light' },
  { model: 'utensilSpoon', at: 'cutlery', ds: 6, lateral: 3.6, yaw: 1.4, role: 'light' },
  { model: 'plate', at: 'cutlery', ds: 0, lateral: -19, yaw: 0, role: 'decor' },
  { model: 'cake', at: 'cutlery', ds: 0, lateral: -19, yaw: 0.6, role: 'decor', lift: 1.3 },
  { model: 'apple', at: 'cutlery', ds: 10, lateral: -9, yaw: 0, role: 'light' },

  // 3. Gryde-chikanen: pan on the outside first, then the pot on the inside.
  //    The pan's handle is its own -Z and it is 17 units long all told, so
  //    its yaw is what keeps it on the table: the left end of the table is
  //    9 units past the road edge here, and every yaw that points the handle
  //    straight out hangs it over the drop (measured, phase 4).
  { model: 'fryingPan', at: 'potChicane', ds: -11, lateral: 8.1, yaw: -0.8, role: 'obstacle' },
  { model: 'pot', at: 'potChicane', ds: 4, lateral: -7, yaw: 0.6, role: 'obstacle' },
  { model: 'broccoli', at: 'potChicane', ds: 20, lateral: -11, yaw: 0, role: 'light' },

  // 4. Melsporet: markers on the INSIDE only — the outside is the table edge.
  { model: 'bottleOil', at: 'flour', ds: -13, lateral: -8.5, yaw: 0, role: 'obstacle' },
  { model: 'bottleKetchup', at: 'flour', ds: 13, lateral: -8.5, yaw: 0.8, role: 'obstacle' },
  { model: 'glass', at: 'flour', ds: 8, lateral: -16, yaw: 0, role: 'decor' },
  { model: 'eggCup', at: 'flour', ds: -6, lateral: -20, yaw: 0, role: 'decor' },

  // 5. Rampen: the landing zone stays clear; the scenery sits well inside.
  { model: 'bowl', at: 'ramp', ds: 0, lateral: -19, yaw: 0, role: 'decor' },
  { model: 'plate', at: 'ramp', ds: -14, lateral: -13.5, yaw: 0, role: 'decor' },
  { model: 'donut', at: 'ramp', ds: -14, lateral: -13.5, yaw: 0.9, role: 'decor', lift: 1.3 },
  { model: 'carrot', at: 'ramp', ds: 15, lateral: -10, yaw: 0.4, role: 'light' },

  // 6. Kaffesøen: the tipped cup the puddle ran out of, and a dropped donut.
  { model: 'cupCoffee', at: 'coffee', ds: -2, lateral: 9, yaw: 2.4, role: 'light', roll: -1.5708, lift: 2.25 },
  { model: 'donut', at: 'coffee', ds: 0, lateral: 9.5, yaw: 0, role: 'light' },
  { model: 'pepperMill', at: 'coffee', ds: -8, lateral: -14, yaw: 0, role: 'decor' },

  // 7. Skærebræts-plateauet: the road climbs a raised board of its own (that
  //    one is the track's height map, see kitchenTable.ts), so this is a
  //    SECOND board on the plateau's outer shoulder, with a knife and a
  //    carrot on it. Not on the plateau itself: a 1.2-unit slab standing on
  //    the racing line would be a wall, and there is no room for one beside
  //    the dinner plate on the inside.
  { model: 'cuttingBoard', at: 'cuttingBoard', ds: -2, lateral: 11, yaw: 0.15, role: 'obstacle' },
  { model: 'utensilKnife', at: 'cuttingBoard', ds: -0.5, lateral: 11, yaw: 1.5, role: 'decor', lift: 1.3 },
  { model: 'carrot', at: 'cuttingBoard', ds: -3.5, lateral: 12.5, yaw: 0, role: 'decor', lift: 1.3 },
  { model: 'glass', at: 'cuttingBoard', ds: 13, lateral: 9, yaw: 0, role: 'decor' },

  // 8. Tallerken-svinget: the plate hangs over the INSIDE of the corner, so
  //    it narrows the line instead of closing it (see the phase 4 report).
  { model: 'plateDinner', at: 'plateCorner', ds: 0, lateral: -8, yaw: 0.35, role: 'obstacle' },
  { model: 'bottleKetchup', at: 'plateCorner', ds: -16, lateral: 9.5, yaw: 0, role: 'decor' },
  { model: 'pan', at: 'plateCorner', ds: 4, lateral: 13, yaw: 1.2, role: 'decor' },
  // The run out of the corner and over the line, still measured from the
  // corner because that is the section these belong to.
  { model: 'apple', at: 'plateCorner', ds: 29, lateral: -9, yaw: 0, role: 'light' },
  { model: 'broccoli', at: 'plateCorner', ds: 36, lateral: -14, yaw: 0, role: 'decor' },
]

/** One placed prop: its body for the collision, its transform for the view. */
export interface PropInstance extends PropBody {
  readonly model: PropModelId
  readonly file: string
  /** Uniform scale from the model's own units to world units. */
  readonly scale: number
  /** The fixed lean from the table, applied before the tumble. */
  readonly roll: number
  /** Where it sits on the track — reported and checked, never used to draw. */
  readonly s: number
  readonly lateral: number
  /**
   * Distance from the prop's circle to the nearest road edge; negative means
   * it reaches over the road, which only an obstacle may do. The view uses it
   * to decide which props are worth a shadow.
   */
  readonly roadClearance: number
}

/** Scale factor from the measured box and the real-world size. */
function scaleOf(model: PropModel): number {
  return model.cm / PROP_SCALE.cmPerUnit / model.box[model.fit]
}

/** Places every row of `PROP_PLACEMENTS` in the world, using the track's own maths. */
export function buildProps(track: Track): PropInstance[] {
  return PROP_PLACEMENTS.map((placement) => {
    const model = PROP_MODELS[placement.model]
    const anchor = track.checkpoints[PROP_SECTION[placement.at]]
    const s = (((anchor + placement.ds) % track.length) + track.length) % track.length
    const centre = track.pointAt(s)
    const tangent = track.tangentAt(s)
    // Left of travel is (tz, -tx) — the same convention as `lateralOffset`.
    const x = centre.x + tangent.z * placement.lateral
    const z = centre.z - tangent.x * placement.lateral
    const y = track.heightAt(s, placement.lateral) + (placement.lift ?? 0)
    const yaw = Math.atan2(tangent.x, tangent.z) + placement.yaw
    const radius = model.radiusCm / PROP_SCALE.cmPerUnit

    // The nearest road, which for a prop deep inside the loop need not be the
    // section it was placed from — so measure it, do not assume the lateral.
    const nearest = track.projectToTrack(x, z)
    const roadClearance =
      Math.abs(nearest.lateralOffset) - track.widthAt(nearest.s) / 2 - radius

    return {
      model: placement.model,
      file: model.file,
      scale: scaleOf(model),
      role: placement.role,
      radius,
      height: model.clearCm / PROP_SCALE.cmPerUnit,
      kick: model.kick,
      homeX: x,
      homeZ: z,
      homeYaw: yaw,
      x,
      y,
      z,
      yaw,
      vx: 0,
      vz: 0,
      tumbleAngle: 0,
      tumbleAxisX: 1,
      tumbleAxisZ: 0,
      awake: false,
      version: 0,
      roll: placement.roll ?? 0,
      s,
      lateral: placement.lateral,
      roadClearance,
    }
  })
}
