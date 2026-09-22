/**
 * Scale, world dimensions and timing. BINDING: the car model (phase 2), the
 * track (phase 3) and the art (phase 4) are all built on these numbers.
 *
 * One world unit is 2 cm, and that is derived rather than chosen: a 1:64 toy
 * car is about 8 cm long and ours is 4.0 units. The 130 x 70 table is then
 * 2.6 x 1.4 m, a large kitchen table. Everything else — grip, camera distance,
 * prop sizes, the width of a board in the table top — has to hold at that
 * scale, and all of it must read this one constant. An earlier 1.75 here was a
 * guess made before anything had to agree with anything else, and it left the
 * props sized against the car while the table top was sized against the guess.
 */
export const WORLD_UNIT_CM = 2

/** Toy car bounding box, in world units. */
export const CAR_SIZE = {
  length: 4.0,
  width: 1.8,
  height: 1.3,
} as const

/** The kitchen table. The driving surface is the plane y = surfaceY. */
export const TABLE = {
  width: 130,
  depth: 70,
  surfaceY: 0,
  /** Visible thickness of the table top, hanging below the surface. */
  thickness: 3,
} as const

/**
 * The kitchen floor, far enough below the table that falling off feels high.
 *
 * It also has to stay clear of a fall in progress. A car respawns 1.5 s after it
 * leaves the table, and at `PHYSICS.gravity` it has dropped about 62 units by
 * then, with the camera following it the whole way. A floor at -60 sat inside
 * that fall, so the last frames clipped the car through the plane. The fog
 * swallows the floor long before the car reaches it.
 */
export const FLOOR_Y = -85

export const PHYSICS = {
  /** 60 Hz. Handling must not change with the monitor's refresh rate. */
  fixedStep: 1 / 60,
  /** A backgrounded tab must not try to catch up a minute of simulation. */
  maxStepsPerFrame: 5,
} as const

/** Retina beyond 2x costs fill rate we would rather spend on frame time. */
export const MAX_PIXEL_RATIO = 2

/** Player identity colours, reused by the cars and the HUD. */
export const PLAYER_COLORS = [0xe8453c, 0x2f7fe8] as const
