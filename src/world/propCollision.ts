/**
 * Car-against-prop collision: circles in the XZ plane with a height, plus the
 * little tumble physics that lets an apple roll away when it is hit.
 *
 * NO Three.js in here — like `car/collision.ts` and `car/physics.ts` this file
 * is pure maths and runs straight from Node, so the push-out, the bounce and
 * the settling of a knocked prop are MEASURED, not eyeballed.
 *
 * The maths is the one in `car/collision.ts`, not a second copy of it: the
 * tuned constants come from `CAR_COLLISION` and the yaw twist is that file's
 * own `twistFor`. The one difference is mass. Two cars are equal masses and
 * split everything in half; a pot on a table is immovable, so the car takes
 * the WHOLE push-out and the whole impulse.
 *
 * Three roles, from `props.ts`:
 *  - `obstacle` — immovable. Pushes the car out and bounces it.
 *  - `light`    — gets shoved, tumbles, rolls to a stop. It can NEVER move the
 *                 car: a donut does not stop a car, and a prop that could push
 *                 back would be a second, untuned handling model.
 *  - `decor`    — never in the grid at all, so it costs nothing per tick.
 *                 ONLY for something stacked on a prop that already collides:
 *                 the cake on its plate, the knife on the cutting board. The
 *                 host's circle already covers it, and giving the topping its
 *                 own would put a second collider inside the first.
 *
 * `decor` used to mean "standing off the racing line", which is why half the
 * table could be driven straight through. Where a prop stands is a separate
 * question from whether it is solid, and it is answered by its placement.
 */

import { CAR_COLLISION, twistFor } from '../car/collision'
import type { CarState } from '../car/physics'

export const PROP_PHYSICS = {
  /**
   * A pot of water is deader than a plastic car shell, so props bounce a shade
   * less than the cars do off each other (`CAR_COLLISION.restitution` 0.45).
   */
  restitution: 0.35,
  /**
   * Grid cell size. A lookup only ever reads the ONE cell the car is in (see
   * `insert`), so this only decides how many cells a prop is filed under: the
   * widest is the dinner plate, 6.5 plus the car's 1.1, which is 15.2 across
   * and touches at most 3x3 cells of 12. The table is 130 x 70, i.e. 11 x 6
   * cells in all.
   */
  cellSize: 12,
  /** Share of the car's closing speed a light prop runs off with. */
  pushGain: 1.0,
  /**
   * Rolling friction, as `exp(-friction * dt)` — never a linear subtraction,
   * so the roll is identical at 60 and 144 Hz (CLAUDE.md). A prop kicked at
   * 30 u/s travels 30/3 = 10 units and is asleep 1.3 s later.
   */
  friction: 3.0,
  /** Below this a light prop is at rest and leaves the update loop. */
  restSpeed: 0.6,
  /**
   * Cap on a prop's speed — per hit AND cumulatively, because a car that
   * keeps driving adds a push every tick it stays in contact and would
   * otherwise dribble a donut the length of the table.
   */
  maxPushSpeed: 45,
  /**
   * A FLAT prop (a fork, a donut: lower than it is wide) does not roll, it
   * slides and spins. Radians of spin per unit slid.
   */
  slideSpin: 0.35,
  /** Nudge past the touching distance, so one hit cannot re-trigger next tick. */
  clearance: 0.05,
  /**
   * A light prop stops this far inside the table edge instead of sliding off
   * into the air. Props do not fall: only cars do, and a prop on the kitchen
   * floor is out of the race for good.
   */
  edgeMargin: 1.0,
} as const

export type PropRole = 'obstacle' | 'light' | 'decor'

/**
 * One prop as the collision sees it. `props.ts` builds these; `propsView.ts`
 * reads the transform back out. The `home*` fields are what `resetProps` puts
 * it back on — phase 5 calls that between races.
 */
export interface PropBody {
  readonly role: PropRole
  /** Collision circle in the XZ plane, in world units. */
  readonly radius: number
  /**
   * How high the car's wheels have to be to pass over it. A car coming down
   * from the ramp clears a fork or a plate rim; nothing clears a pot.
   */
  readonly height: number
  /**
   * How hard it hits back, 0..1, straight from the model table: a pot is a
   * wall (1), a fork is a rattle (0.25) that pulls the steering without
   * stopping the car. It scales the bounce, never the push-out — a car has to
   * come out of a prop whatever the prop is, or it sticks in it.
   */
  readonly kick: number
  readonly homeX: number
  readonly homeZ: number
  readonly homeYaw: number
  x: number
  /** Base height: the table, or the top of the cutting-board plateau. */
  y: number
  z: number
  yaw: number
  /** Horizontal velocity. Only a `light` prop ever has one. */
  vx: number
  vz: number
  /** Tumble: `tumbleAngle` radians about the horizontal axis below. */
  tumbleAngle: number
  tumbleAxisX: number
  tumbleAxisZ: number
  /** Still moving, i.e. still worth integrating and re-drawing. */
  awake: boolean
  /** Bumped on every transform change, so the view redraws only what moved. */
  version: number
}

/** The rectangle a light prop may roll around in — the table top. */
export interface PropBounds {
  halfWidth: number
  halfDepth: number
}

export interface PropField {
  readonly bodies: readonly PropBody[]
  /**
   * Pushes one car out of every prop it overlaps. Mutates position, velocity
   * and heading, so the caller must `refreshCarState` when this returns > 0 —
   * exactly as after `resolveCarCollision`.
   *
   * Returns the hardest impact speed of the tick, for the thump and the sound.
   */
  resolve(car: CarState): number
  /** Rolls the knocked props on by `dt`. Call once per tick, not per car. */
  update(dt: number): void
  /** Every prop back where it started, dead still. Phase 5 calls this. */
  resetProps(): void
  /** How many props the last `resolve` actually tested. For the grid's sake. */
  readonly stats: { tested: number }
}

/** Folds an angle back into (-pi, pi]. */
function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

export function createPropField(bodies: readonly PropBody[], bounds: PropBounds): PropField {
  const cell = PROP_PHYSICS.cellSize
  const columns = Math.max(1, Math.ceil((bounds.halfWidth * 2) / cell))
  const rows = Math.max(1, Math.ceil((bounds.halfDepth * 2) / cell))
  const grid: number[][] = Array.from({ length: columns * rows }, () => [])
  /** Which cells each body currently sits in, so a mover can be re-bucketed. */
  const cellsOf: number[][] = bodies.map(() => [])
  const stats = { tested: 0 }

  const clampColumn = (value: number): number =>
    value < 0 ? 0 : value >= columns ? columns - 1 : value
  const clampRow = (value: number): number => (value < 0 ? 0 : value >= rows ? rows - 1 : value)

  /**
   * A body goes into every cell its circle GROWN BY THE CAR'S RADIUS touches.
   * That is what makes a lookup a single cell: if the car's centre is close
   * enough to touch, its centre is inside the grown circle, and the grown
   * circle owns that cell.
   */
  const insert = (index: number): void => {
    const body = bodies[index]
    if (body.role === 'decor') return
    const reach = body.radius + CAR_COLLISION.radius
    const fromColumn = clampColumn(Math.floor((body.x - reach + bounds.halfWidth) / cell))
    const toColumn = clampColumn(Math.floor((body.x + reach + bounds.halfWidth) / cell))
    const fromRow = clampRow(Math.floor((body.z - reach + bounds.halfDepth) / cell))
    const toRow = clampRow(Math.floor((body.z + reach + bounds.halfDepth) / cell))
    const owned = cellsOf[index]
    for (let row = fromRow; row <= toRow; row += 1) {
      for (let column = fromColumn; column <= toColumn; column += 1) {
        const key = row * columns + column
        grid[key].push(index)
        owned.push(key)
      }
    }
  }

  const remove = (index: number): void => {
    const owned = cellsOf[index]
    for (const key of owned) {
      const bucket = grid[key]
      const at = bucket.indexOf(index)
      if (at >= 0) {
        bucket[at] = bucket[bucket.length - 1]
        bucket.pop()
      }
    }
    owned.length = 0
  }

  for (let index = 0; index < bodies.length; index += 1) insert(index)

  /** The car takes the whole push-out and the whole impulse: the prop cannot. */
  const hitObstacle = (
    car: CarState,
    kick: number,
    nx: number,
    nz: number,
    overlap: number,
  ): number => {
    if (overlap > CAR_COLLISION.slop) {
      const push = (overlap - CAR_COLLISION.slop) * CAR_COLLISION.separation
      car.x += nx * push
      car.z += nz * push
    }
    // Closing speed along the normal, which points OUT of the prop.
    const closing = -(car.vx * nx + car.vz * nz)
    if (closing <= 0) return 0
    if (closing < CAR_COLLISION.minImpactSpeed) return closing
    const push = (1 + PROP_PHYSICS.restitution) * closing * kick
    car.vx += nx * push
    car.vz += nz * push
    // twistFor wants the normal pointing TOWARDS the impact, as in collision.ts.
    car.heading = wrapAngle(car.heading + twistFor(car, -nx, -nz, closing * kick))
    return closing
  }

  /** The prop runs off; the car drives on as if nothing happened. */
  const hitLight = (car: CarState, index: number, nx: number, nz: number, overlap: number): void => {
    const body = bodies[index]
    body.x -= nx * (overlap + PROP_PHYSICS.clearance)
    body.z -= nz * (overlap + PROP_PHYSICS.clearance)

    const closing = -(car.vx * nx + car.vz * nz)
    if (closing > 0) {
      const speed = Math.min(closing * PROP_PHYSICS.pushGain, PROP_PHYSICS.maxPushSpeed)
      body.vx -= nx * speed
      body.vz -= nz * speed
      const total = Math.hypot(body.vx, body.vz)
      if (total > PROP_PHYSICS.maxPushSpeed) {
        const trim = PROP_PHYSICS.maxPushSpeed / total
        body.vx *= trim
        body.vz *= trim
      }
    }
    body.awake = true
    body.version += 1
    remove(index)
    insert(index)
  }

  return {
    bodies,
    stats,

    resolve(car): number {
      stats.tested = 0
      const column = Math.floor((car.x + bounds.halfWidth) / cell)
      const row = Math.floor((car.z + bounds.halfDepth) / cell)
      // Off the table: the car is falling, and there is nothing out there.
      if (column < 0 || column >= columns || row < 0 || row >= rows) return 0

      const bucket = grid[row * columns + column]
      let hardest = 0
      // Backwards, because `hitLight` re-buckets the prop it just shoved and
      // that rewrites this very bucket. Walking down means a re-inserted index
      // lands behind us; a slot emptied under us reads as undefined and is
      // skipped, and a prop seen twice is already out of contact the second
      // time, so neither case can do any harm.
      for (let slot = bucket.length - 1; slot >= 0; slot -= 1) {
        const index = bucket[slot]
        if (index === undefined) continue
        const body = bodies[index]
        stats.tested += 1
        // Airborne over the top of it: a plate and a fork are cleared on the
        // way down from the ramp, a pot never is.
        if (car.y >= body.y + body.height) continue

        const contact = body.radius + CAR_COLLISION.radius
        let dx = car.x - body.x
        let dz = car.z - body.z
        let distance = Math.hypot(dx, dz)
        if (distance >= contact) continue
        if (distance < 1e-6) {
          // Dead centre on the prop: pick a fixed axis, stay deterministic.
          dx = 1
          dz = 0
          distance = 1e-6
        }
        const nx = dx / distance
        const nz = dz / distance
        const overlap = contact - distance
        if (body.role === 'light') hitLight(car, index, nx, nz, overlap)
        else hardest = Math.max(hardest, hitObstacle(car, body.kick, nx, nz, overlap))
      }
      return hardest
    },

    update(dt): void {
      const decay = Math.exp(-PROP_PHYSICS.friction * dt)
      const limitX = bounds.halfWidth - PROP_PHYSICS.edgeMargin
      const limitZ = bounds.halfDepth - PROP_PHYSICS.edgeMargin
      for (let index = 0; index < bodies.length; index += 1) {
        const body = bodies[index]
        if (!body.awake) continue
        const speed = Math.hypot(body.vx, body.vz)
        if (speed < PROP_PHYSICS.restSpeed) {
          body.vx = 0
          body.vz = 0
          body.awake = false
          body.version += 1
          continue
        }
        if (body.height < body.radius) {
          // Flat on the table: a knife slides and spins, it does not roll.
          body.yaw += PROP_PHYSICS.slideSpin * speed * dt
        } else {
          // Roll without slipping: the tumble axis is across the direction of
          // travel, and a full turn takes 2*pi*radius of ground.
          body.tumbleAxisX = body.vz / speed
          body.tumbleAxisZ = -body.vx / speed
          body.tumbleAngle += (speed * dt) / Math.max(body.radius, 0.2)
        }

        body.x += body.vx * dt
        body.z += body.vz * dt
        if (body.x < -limitX) body.x = -limitX
        else if (body.x > limitX) body.x = limitX
        if (body.z < -limitZ) body.z = -limitZ
        else if (body.z > limitZ) body.z = limitZ

        body.vx *= decay
        body.vz *= decay
        body.version += 1
        remove(index)
        insert(index)
      }
    },

    resetProps(): void {
      for (let index = 0; index < bodies.length; index += 1) {
        const body = bodies[index]
        if (body.x === body.homeX && body.z === body.homeZ && !body.awake) continue
        body.x = body.homeX
        body.z = body.homeZ
        body.yaw = body.homeYaw
        body.vx = 0
        body.vz = 0
        body.tumbleAngle = 0
        body.tumbleAxisX = 1
        body.tumbleAxisZ = 0
        body.awake = false
        body.version += 1
        remove(index)
        insert(index)
      }
    },
  }
}
