/**
 * The contract between a track and the rest of the game. Engine-agnostic:
 * nothing in here may import Three.js, and nothing in here may import the car
 * model — `main.ts` is what ties a track to the physics.
 *
 * A track file (e.g. `kitchenTable.ts`) implements `Track`; `progress.ts`
 * consumes it. Adding a second track is a new file implementing this interface,
 * nothing else.
 */

/** A point in the XZ plane. Y comes from the height map, never from here. */
export interface TrackPoint {
  x: number
  z: number
}

/** Where a world position sits relative to the centre line. */
export interface TrackProjection {
  /** Arc length along the centre line, 0 at the finish line, in [0, length). */
  s: number
  /**
   * Signed distance from the centre line, positive to the LEFT of the driving
   * direction — the same side as the car's own +X axis in types.ts.
   */
  lateralOffset: number
  /** Unit tangent at `s`, pointing in the driving direction. */
  tangentX: number
  tangentZ: number
}

/** What is under the car. `y` is meaningless when `onTable` is false. */
export interface Ground {
  y: number
  onTable: boolean
}

/** One projection plus everything the physics step needs, from one lookup. */
export interface TrackSurface extends TrackProjection, Ground {
  /** Multiplier on the car's lateral grip: 1 on bare table, 0.4 in flour. */
  grip: number
}

/** A place to put a car: on the grid, or back on the road after a fall. */
export interface TrackPose {
  x: number
  y: number
  z: number
  /** Yaw in radians, 0 along +Z, growing counter-clockwise (see types.ts). */
  heading: number
  /** Arc length this pose sits at, so progress can be re-seeded with it. */
  s: number
}

export interface Track {
  /** One lap of the centre line, in world units. */
  readonly length: number
  /** Arc length of each checkpoint, in passing order, relative to the line. */
  readonly checkpoints: readonly number[]
  /** How long a car lies on the kitchen floor before it is put back. */
  readonly respawnDelaySeconds: number
  pointAt(s: number): TrackPoint
  tangentAt(s: number): TrackPoint
  /** Road width at `s`. Constant on this track apart from the ramp. */
  widthAt(s: number): number
  /**
   * Nearest point on the centre line. `hintS` is the car's previous `s` and
   * turns the search into a local one — pass it on the per-tick path.
   */
  projectToTrack(x: number, z: number, hintS?: number): TrackProjection
  groundAt(x: number, z: number, hintS?: number): Ground
  /**
   * The height map in track coordinates: what stands on the table at
   * (s, lateralOffset). The view builds its meshes from this very function, so
   * a model can never drift away from the surface the car drives on.
   */
  heightAt(s: number, lateralOffset: number): number
  gripAt(s: number, lateralOffset: number): number
  /** Projection + ground + grip in a single lookup. The per-tick path. */
  sampleSurface(x: number, z: number, hintS?: number): TrackSurface
  /** Start grid pose for a player, behind the finish line. */
  startPose(player: number): TrackPose
  /** Back on the road at `s`, offset across so two cars never overlap. */
  respawnPose(s: number, player: number): TrackPose
}
