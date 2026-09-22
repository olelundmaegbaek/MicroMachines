/**
 * Where each car is on the track: arc-length position, checkpoints, laps, and
 * falling off the table.
 *
 * Track-agnostic (it only ever sees the `Track` interface) and physics-free:
 * the car is taken as a structural `TrackCarBody`, so this module imports
 * neither `kitchenTable.ts` nor `car/physics.ts` and can be simulated straight
 * from Node. `main.ts` is what wires the three together.
 *
 * Progress is measured as arc length and never as "did the car cross a line":
 * a line test misses at 46 u/s when the tick is long, fires twice when the car
 * wobbles on the line, and cannot tell forwards from backwards. Arc length can
 * do all three.
 */

import type { Track, TrackPose, TrackSurface } from './types'

export const TRACK_PROGRESS = {
  /**
   * A single tick may not move the car more than a quarter of a lap. At 46 u/s
   * a 1/60 s tick covers 0.77 units, so anything near 68 is either a
   * projection flipping to the other side of the table or a car cutting
   * straight across it. Neither is progress.
   */
  maxTickFraction: 0.25,
  /**
   * Steepest slope a take-off may be credited with, as rise over travel. The
   * ramp itself is 3.5 over 12, i.e. 0.29, so the cap never touches a real
   * jump — but a car that drifts sideways onto the ramp climbs its edge taper
   * in a couple of ticks, and uncapped that reads as a 50 u/s climb and fires
   * the car 24 units into the air.
   */
  maxLaunchSlope: 0.45,
} as const

/**
 * The parts of a car this module reads, plus the one field it writes (`vy`,
 * on take-off). Structural on purpose — see the file comment.
 */
export interface TrackCarBody {
  x: number
  z: number
  /** Horizontal speed, which is what caps the take-off. */
  speed: number
  /** Written on take-off, and only then: see `climbRate` below. */
  vy: number
  airborne: boolean
}

/** One car's standing on the track. Phase 5 builds the HUD on this. */
export interface TrackCarProgress {
  /** Unrolled arc length: grows past `length` instead of snapping back to 0. */
  s: number
  /** Position within the lap, 0 at the finish line. */
  lapS: number
  /** 0..1 through the current lap. */
  lapProgress: number
  /** Completed laps. Only a lap with all checkpoints, in order, counts. */
  laps: number
  /** 0..checkpoints.length, reset when a lap is completed. */
  checkpointsPassed: number
  /** Signed distance from the centre line, positive to the left of travel. */
  lateralOffset: number
  /** Grip multiplier under the car right now. */
  surfaceGrip: number
  /** Height of the surface under the car; meaningless when `onTable` is false. */
  groundY: number
  onTable: boolean
  /** Off the table and on the way down. The car cannot steer out of this. */
  falling: boolean
  /** Seconds left of the fall before the car is put back. 0 when not falling. */
  respawnIn: number
  /** True for the single tick the car was put back on the road. */
  justRespawned: boolean
}

/** What the physics step needs to know about the ground under the car. */
export interface SurfaceInput {
  surfaceGrip: number
  groundY: number
  onTable: boolean
}

export interface TrackProgress {
  readonly cars: readonly Readonly<TrackCarProgress>[]
  /** Put a car down (start grid, or after a fall) and re-seed its progress. */
  place(player: number, pose: TrackPose): void
  /**
   * Put a car on the grid for a NEW RACE: everything `place` does, plus the
   * lap counter, the checkpoints and the unrolled arc length back to zero.
   * A respawn after a fall must NOT use this — that car keeps its race.
   */
  reset(player: number, pose: TrackPose): void
  /** What `stepCar` should be given this tick. Call BEFORE the step. */
  surface(player: number): Readonly<SurfaceInput>
  /**
   * Fold this tick's movement into the car's progress. Call AFTER the step and
   * after the car-to-car collision, since both move the car. Returns the pose
   * the caller must put the car back on when a fall is over, else null.
   */
  advance(player: number, car: TrackCarBody, dt: number): TrackPose | null
}

interface Slot {
  progress: TrackCarProgress
  surface: SurfaceInput
  /** Where along the track the previous tick left the car. */
  previousLapS: number
  /** Whole laps of continuity, so `s` runs on across the line in both ways. */
  lapIndex: number
  /** Arc length of the last checkpoint (or line) the car legally passed. */
  lastGateS: number
  fallSeconds: number
  /** Ground height under the car on the previous tick, for the climb rate. */
  lastGroundY: number
  /**
   * How fast the ground was rising under the car, in units per second. The
   * car model has no notion of driving up a slope — it clamps the car to the
   * ground height and zeroes vy — so this is the vertical speed the wheels
   * already had when the ramp ends, and it is what turns the brink into a
   * jump instead of a drop.
   */
  climbRate: number
  wasAirborne: boolean
}

/** Folds a difference in arc length into (-length/2, length/2]. */
function shortestDelta(delta: number, length: number): number {
  const wrapped = ((delta % length) + length) % length
  return wrapped > length / 2 ? wrapped - length : wrapped
}

/** Did the walk from `from` to `to` pass `target` going forwards? */
function crossedForward(from: number, to: number, target: number, length: number): boolean {
  for (let lap = -1; lap <= 1; lap += 1) {
    const gate = target + lap * length
    if (from < gate && gate <= to) return true
  }
  return false
}

export function createTrackProgress(track: Track, playerCount: number): TrackProgress {
  const slots: Slot[] = []
  const gateCount = track.checkpoints.length

  const readSurface = (slot: Slot, sample: TrackSurface): void => {
    slot.surface.surfaceGrip = sample.grip
    slot.surface.groundY = sample.y
    slot.surface.onTable = sample.onTable
    slot.progress.surfaceGrip = sample.grip
    slot.progress.groundY = sample.y
    slot.progress.onTable = sample.onTable
    slot.progress.lateralOffset = sample.lateralOffset
  }

  for (let player = 0; player < playerCount; player += 1) {
    const slot: Slot = {
      progress: {
        s: 0,
        lapS: 0,
        lapProgress: 0,
        laps: 0,
        checkpointsPassed: 0,
        lateralOffset: 0,
        surfaceGrip: 1,
        groundY: 0,
        onTable: true,
        falling: false,
        respawnIn: 0,
        justRespawned: false,
      },
      surface: { surfaceGrip: 1, groundY: 0, onTable: true },
      previousLapS: 0,
      lapIndex: 0,
      lastGateS: 0,
      fallSeconds: 0,
      lastGroundY: 0,
      climbRate: 0,
      wasAirborne: false,
    }
    slots.push(slot)
  }

  const place = (player: number, pose: TrackPose): void => {
    const slot = slots[player]
    const sample = track.sampleSurface(pose.x, pose.z, pose.s)
    readSurface(slot, sample)
    slot.progress.lapS = pose.s
    slot.progress.lapProgress = pose.s / track.length
    slot.progress.s = slot.lapIndex * track.length + pose.s
    slot.progress.falling = false
    slot.progress.respawnIn = 0
    slot.previousLapS = pose.s
    slot.fallSeconds = 0
    slot.lastGroundY = sample.y
    slot.climbRate = 0
    slot.wasAirborne = false
  }

  const placeOnGrid = (player: number, pose: TrackPose): void => {
    place(player, pose)
    // A car put down behind the line starts the lap it is about to enter, not
    // the one it would look like it is finishing.
    const slot = slots[player]
    slot.lastGateS = pose.s
    slot.progress.justRespawned = false
  }

  return {
    cars: slots.map((slot) => slot.progress),

    place: placeOnGrid,

    reset(player, pose): void {
      const slot = slots[player]
      // Before `placeOnGrid`, which derives the unrolled `s` from the index.
      slot.lapIndex = 0
      slot.progress.laps = 0
      slot.progress.checkpointsPassed = 0
      placeOnGrid(player, pose)
    },

    surface(player): Readonly<SurfaceInput> {
      return slots[player].surface
    },

    advance(player, car, dt): TrackPose | null {
      const slot = slots[player]
      const progress = slot.progress
      progress.justRespawned = false

      const sample = track.sampleSurface(car.x, car.z, progress.lapS)
      readSurface(slot, sample)

      // Take-off: hand the car the vertical speed the rising ground gave it.
      if (car.airborne && !slot.wasAirborne && slot.climbRate > 0) {
        car.vy = Math.max(car.vy, slot.climbRate)
      }
      if (!car.airborne) {
        const rate = (sample.y - slot.lastGroundY) / dt
        // Ground FALLING away is the brink, not the car diving: keep the rate
        // the climb built up, because the very next tick is the take-off and
        // that rate is the whole jump. Flat ground (rate 0) does clear it, so
        // rolling off the cutting board drops the car instead of firing it.
        if (rate >= 0) {
          slot.climbRate = Math.min(rate, car.speed * TRACK_PROGRESS.maxLaunchSlope)
        }
        slot.lastGroundY = sample.y
      }
      slot.wasAirborne = car.airborne

      if (sample.onTable) {
        const delta = shortestDelta(sample.s - slot.previousLapS, track.length)
        if (Math.abs(delta) <= track.length * TRACK_PROGRESS.maxTickFraction) {
          const from = slot.previousLapS
          const to = from + delta

          if (delta > 0) {
            if (crossedForward(from, to, 0, track.length)) {
              slot.lapIndex += 1
              // The finish line only ends a lap when every checkpoint of that
              // lap has been taken, in order. That is what closes the shortcut
              // straight across the middle of the table.
              if (progress.checkpointsPassed >= gateCount) {
                progress.laps += 1
                progress.checkpointsPassed = 0
              }
              slot.lastGateS = 0
            }
            while (progress.checkpointsPassed < gateCount) {
              const gate = track.checkpoints[progress.checkpointsPassed]
              if (!crossedForward(from, to, gate, track.length)) break
              progress.checkpointsPassed += 1
              slot.lastGateS = gate
            }
          } else if (delta < 0 && crossedForward(to, from, 0, track.length)) {
            // Reversed back over the line: keep `s` continuous, but never let
            // the lap counter climb — the lap has to be driven again.
            slot.lapIndex -= 1
          }

          slot.previousLapS = sample.s
          progress.lapS = sample.s
          progress.lapProgress = sample.s / track.length
          progress.s = slot.lapIndex * track.length + sample.s
        } else {
          // Rejected: a jump this big is a projection flipping to the far side
          // of the table or a car cutting across it. Follow the car so the
          // next tick has a sane reference, but book no progress for it.
          slot.previousLapS = sample.s
          progress.lapS = sample.s
          progress.lapProgress = sample.s / track.length
        }
      }

      if (sample.onTable) {
        slot.fallSeconds = 0
        progress.falling = false
        progress.respawnIn = 0
        return null
      }

      // Off the table. The car model gives it no thrust and no steering grip
      // in the air, so it cannot fly back: all that is left is the clock.
      slot.fallSeconds += dt
      progress.falling = true
      progress.respawnIn = Math.max(0, track.respawnDelaySeconds - slot.fallSeconds)
      if (slot.fallSeconds < track.respawnDelaySeconds) return null

      const pose = track.respawnPose(slot.lastGateS, player)
      place(player, pose)
      progress.justRespawned = true
      return pose
    },
  }
}
