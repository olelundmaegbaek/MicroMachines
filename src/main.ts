import './style.css'

import { CAR_MODELS, createCarView } from './car/carView'
import { resolveCarCollision } from './car/collision'
import {
  NO_GROUND,
  copyCarState,
  createCarState,
  refreshCarState,
  resetCarState,
  stepCar,
  type CarStart,
  type CarState,
} from './car/physics'
import { createSkidMarks, skidStrength } from './car/skidMarks'
import { FLOOR_Y, PHYSICS, TABLE } from './constants'
import { createInput } from './core/input'
import { createLoop } from './core/loop'
import { ChaseCamera } from './render/chaseCamera'
import { createRenderer } from './render/renderer'
import { createScene } from './render/scene'
import type { CarPose } from './types'
import { createDebugOverlay } from './ui/debugOverlay'
import { createTable, createTemporaryLandmarks } from './world/table'

/** Player 1 first. Typed as the literals so `input.controls` takes them. */
const PLAYERS = [0, 1] as const

/* ------------------------------------------------------------------------ *
 * TEMPORARY — until the track (phase 3).
 *
 * Two start poses on the empty table, and a respawn that drops a car that fell
 * off the edge back onto its start. The track owns both for real: a start grid,
 * and a respawn at the last passed checkpoint after a short delay.
 * ------------------------------------------------------------------------ */
const START_POSES: readonly [CarStart, CarStart] = [
  { x: -50, z: -11, heading: Math.PI / 2 },
  { x: -50, z: 11, heading: Math.PI / 2 },
]
/** Deep enough that the fall reads as a fall before the car reappears. */
const RESPAWN_BELOW = FLOOR_Y + 5

/**
 * TEMPORARY table edge: the car falls as soon as its centre leaves the table
 * top. Phase 3 replaces this with the track's own surface lookup, which also
 * answers with the ramp height and the grip of coffee and flour.
 */
function groundUnder(state: Readonly<CarState>): number {
  const onTable =
    Math.abs(state.x) <= TABLE.width / 2 && Math.abs(state.z) <= TABLE.depth / 2
  return onTable ? TABLE.surfaceY : NO_GROUND
}

const container = document.querySelector<HTMLDivElement>('#app')
if (!container) throw new Error('Missing #app container in index.html')

const world = createScene()
const renderer = createRenderer(container)
const table = createTable()
const landmarks = createTemporaryLandmarks() // TEMPORARY, see world/table.ts
const skids = createSkidMarks()
world.scene.add(table.object, landmarks.object, skids.object)

const views = [createCarView(CAR_MODELS[0]), createCarView(CAR_MODELS[1])] as const
for (const player of PLAYERS) {
  world.scene.add(views[player].object)
  views[player].ready.catch((error: unknown) => {
    console.error(`Could not load ${CAR_MODELS[player].file}`, error)
  })
}

const states = [createCarState(START_POSES[0]), createCarState(START_POSES[1])] as const
// The pose the last tick started from; the renderer interpolates from it.
const previous = [createCarState(START_POSES[0]), createCarState(START_POSES[1])] as const
const respawned = [false, false]

const chase = [new ChaseCamera(), new ChaseCamera()] as const
const poses: [Readonly<CarPose>, Readonly<CarPose>] = [
  views[0].present(states[0], states[0], 1, 0),
  views[1].present(states[1], states[1], 1, 0),
]
chase[0].snapTo(poses[0])
chase[1].snapTo(poses[1])

const overlay = createDebugOverlay(container)
const input = createInput()

const loop = createLoop({
  fixedStep: PHYSICS.fixedStep,
  maxStepsPerFrame: PHYSICS.maxStepsPerFrame,
  update(dt): void {
    for (const player of PLAYERS) {
      copyCarState(previous[player], states[player])
      stepCar(states[player], input.controls(player), dt, {
        groundY: groundUnder(states[player]),
      })
    }

    // The collision edits velocity and heading behind the model's back, so the
    // derived slip and speed have to be recomputed before anything reads them.
    if (resolveCarCollision(states[0], states[1]) > 0) {
      refreshCarState(states[0])
      refreshCarState(states[1])
    }

    for (const player of PLAYERS) {
      if (states[player].y >= RESPAWN_BELOW) continue
      resetCarState(states[player], START_POSES[player])
      copyCarState(previous[player], states[player])
      respawned[player] = true
    }
  },
  render(alpha, frameSeconds): void {
    // Ages the existing marks before this frame's are laid, as `mark` expects.
    skids.update(frameSeconds)

    for (const player of PLAYERS) {
      const state = states[player]
      const view = views[player]
      poses[player] = view.present(previous[player], state, alpha, frameSeconds)

      const strength = skidStrength(
        state.slip,
        state.speed,
        input.controls(player).handbrake,
        state.airborne,
      )
      for (let side = 0; side < 2; side += 1) {
        const trail = player * 2 + side
        if (strength > 0 && !respawned[player]) {
          skids.mark(trail, view.rearContacts[side].x, view.rearContacts[side].z, strength)
        } else {
          skids.lift(trail)
        }
      }

      if (respawned[player]) {
        // No swoop across the kitchen: the car did not drive there.
        chase[player].snapTo(poses[player])
        respawned[player] = false
      } else {
        // The camera is a visual, not a simulation: smoothing it with the real
        // frame time keeps it silky on a 144 Hz screen instead of stepping at 60 Hz.
        chase[player].update(frameSeconds, poses[player])
      }
    }

    renderer.render(world.scene, [chase[0].camera, chase[1].camera])
  },
  onFrame(stats): void {
    overlay.update(stats, states)
  },
})

loop.start()

function dispose(): void {
  loop.stop()
  input.dispose()
  overlay.dispose()
  renderer.dispose()
  views[0].dispose()
  views[1].dispose()
  skids.dispose()
  landmarks.dispose()
  table.dispose()
  world.dispose()
}

window.addEventListener('pagehide', dispose, { once: true })
import.meta.hot?.dispose(dispose)
