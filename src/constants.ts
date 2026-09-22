/**
 * Scale, world dimensions and timing. BINDING: the car model (phase 2), the
 * track (phase 3) and the art (phase 4) are all built on these numbers.
 *
 * The cars are 1:64 toys, so one world unit is about 1.75 cm: a 4-unit car is
 * 7 cm long, and the 130 x 70 table is 2.3 x 1.2 m. Everything else — grip,
 * camera distance, prop sizes — has to feel right at that scale.
 */
export const WORLD_UNIT_CM = 1.75

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

/** The kitchen floor, far enough below the table that falling off feels high. */
export const FLOOR_Y = -60

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
