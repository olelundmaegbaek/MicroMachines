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
} from './car/physics'
import { createSkidMarks, skidStrength } from './car/skidMarks'
import { PHYSICS, TABLE } from './constants'
import { createInput } from './core/input'
import { createLoop } from './core/loop'
import { ChaseCamera } from './render/chaseCamera'
import { createRenderer } from './render/renderer'
import { createScene } from './render/scene'
import { TRACK_LAYOUT, kitchenTableTrack } from './track/kitchenTable'
import { createTrackProgress } from './track/progress'
import { createTrackView } from './track/trackView'
import type { CarPose, Controls } from './types'
import { createDebugOverlay } from './ui/debugOverlay'
import { createPropField } from './world/propCollision'
import { buildProps } from './world/props'
import { createPropsView } from './world/propsView'
import { createTable } from './world/table'

/** Player 1 first. Typed as the literals so `input.controls` takes them. */
const PLAYERS = [0, 1] as const

/** A falling car is a passenger: no throttle, no steering, no handbrake. */
const NO_CONTROLS: Controls = { throttle: 0, brake: 0, steer: 0, handbrake: false }

const container = document.querySelector<HTMLDivElement>('#app')
if (!container) throw new Error('Missing #app container in index.html')

const world = createScene()
const renderer = createRenderer(container)
const table = createTable(renderer.maxAnisotropy)
const track = kitchenTableTrack
const trackView = createTrackView(track, TRACK_LAYOUT)
const skids = createSkidMarks()
// The props are placed FROM the track — arc length and lateral offset, never
// a hand-written x/z — so they have to be built after it, and the collision
// and the view are handed the very same instances the placement produced.
const props = buildProps(track)
const propField = createPropField(props, {
  halfWidth: TABLE.width / 2,
  halfDepth: TABLE.depth / 2,
})
const propsView = createPropsView(props)
world.scene.add(table.object, trackView.object, skids.object, propsView.object)
trackView.ready.catch((error: unknown) => {
  console.error('Could not load the track models', error)
})
propsView.ready.catch((error: unknown) => {
  console.error('Could not load the prop models', error)
})

const views = [createCarView(CAR_MODELS[0]), createCarView(CAR_MODELS[1])] as const
for (const player of PLAYERS) {
  world.scene.add(views[player].object)
  views[player].ready.catch((error: unknown) => {
    console.error(`Could not load ${CAR_MODELS[player].file}`, error)
  })
}

// The track owns the grid now: two cars side by side on the start straight,
// behind the line at phi = 1.20, facing the way the road runs.
const progress = createTrackProgress(track, PLAYERS.length)
const states = [createCarState(track.startPose(0)), createCarState(track.startPose(1))] as const
// The pose the last tick started from; the renderer interpolates from it.
const previous = [createCarState(track.startPose(0)), createCarState(track.startPose(1))] as const
const respawned = [false, false]
for (const player of PLAYERS) progress.place(player, track.startPose(player))

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
      const surface = progress.surface(player)
      stepCar(
        states[player],
        progress.cars[player].falling ? NO_CONTROLS : input.controls(player),
        dt,
        {
          surfaceGrip: surface.surfaceGrip,
          groundY: surface.onTable ? surface.groundY : NO_GROUND,
        },
      )
    }

    // The collision edits velocity and heading behind the model's back, so the
    // derived slip and speed have to be recomputed before anything reads them.
    if (resolveCarCollision(states[0], states[1]) > 0) {
      refreshCarState(states[0])
      refreshCarState(states[1])
    }

    // Props AFTER the cars have been pushed apart, so a car shoved into the
    // pot is put back on the table by the pot instead of being left inside
    // it — and before `progress.advance`, for the same reason the car-to-car
    // collision runs before it: the track has to see the final position.
    for (const player of PLAYERS) {
      if (propField.resolve(states[player]) > 0) refreshCarState(states[player])
    }
    // The knocked props roll on once per tick, not once per car.
    propField.update(dt)

    for (const player of PLAYERS) {
      // After the collision on purpose: that moved the cars too, and the track
      // has to see where they actually ended up.
      const respawn = progress.advance(player, states[player], dt)
      if (!respawn) continue
      resetCarState(states[player], respawn)
      // `resetCarState` parks the car on y = 0, but a checkpoint on the
      // cutting board sits a unit up; without this the car starts buried.
      states[player].y = respawn.y
      copyCarState(previous[player], states[player])
      respawned[player] = true
    }
  },
  render(alpha, frameSeconds): void {
    // Ages the existing marks before this frame's are laid, as `mark` expects.
    skids.update(frameSeconds)
    // Only the props that actually moved get a new instance matrix.
    propsView.update()

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
    overlay.update(stats, states, progress.cars)
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
  propsView.dispose()
  trackView.dispose()
  table.dispose()
  world.dispose()
}

window.addEventListener('pagehide', dispose, { once: true })
import.meta.hot?.dispose(dispose)
