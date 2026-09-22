import './style.css'

import { CAR_CATALOG, assignLiveries } from './car/catalog'
import { createCarView, type CarView } from './car/carView'
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
import { KEY_BINDINGS, createInput } from './core/input'
import { createLoop } from './core/loop'
import { createGame, type MenuAction } from './game/state'
import { ChaseCamera } from './render/chaseCamera'
import { createRenderer } from './render/renderer'
import { createScene } from './render/scene'
import { TRACK_LAYOUT, kitchenTableTrack } from './track/kitchenTable'
import { createTrackProgress } from './track/progress'
import { createTrackView } from './track/trackView'
import type { CarPose, Controls } from './types'
import { createDebugOverlay } from './ui/debugOverlay'
import { createHud, type HudView } from './ui/hud'
import { createPropField } from './world/propCollision'
import { buildProps } from './world/props'
import { createPropsView } from './world/propsView'
import { createTable } from './world/table'

/** Player 1 first. Typed as the literals so `input.controls` takes them. */
const PLAYERS = [0, 1] as const

/** A falling or locked car is a passenger: no throttle, no steering, no handbrake. */
const NO_CONTROLS: Controls = { throttle: 0, brake: 0, steer: 0, handbrake: false }

interface MenuKey {
  code: string
  action: MenuAction
}

/**
 * The menus are driven by the DRIVING keys, per player: steering picks, the
 * accelerator confirms, the brake undoes. Nothing new to learn, both players
 * can work every menu, and there is no mouse anywhere — which is the point in
 * a game played with two hands each.
 */
const MENU_KEYS: readonly (readonly MenuKey[])[] = KEY_BINDINGS.map(
  (binding): readonly MenuKey[] => [
    { code: binding.left, action: 'left' },
    { code: binding.right, action: 'right' },
    { code: binding.throttle, action: 'accept' },
    { code: binding.brake, action: 'back' },
  ],
)

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

const game = createGame({ playerCount: PLAYERS.length, carCount: CAR_CATALOG.length })

// Every car in every livery, loaded up front: choosing a car must never wait
// for a GLB, and two players on the SAME car need two views to be two colours.
const carViews: CarView[][] = CAR_CATALOG.map((spec) =>
  spec.liveries.map((livery) => createCarView(spec, livery)),
)
for (const spec of carViews) {
  for (const view of spec) {
    view.ready.catch((error: unknown) => {
      console.error(`Could not load ${view.object.name}`, error)
    })
  }
}

/** The view each player is currently driving. Swapped by the car select. */
const activeViews: CarView[] = PLAYERS.map((player) => carViews[0][player])
// These have to go in the scene here, not in syncCars. syncCars returns early
// when the selection still matches what is already active, and the opening
// selection matches this line exactly -- so on a fresh load it added nothing
// and the table stood empty until someone happened to change car and change
// back. Adding a view that is already in the scene is a no-op, so the swap
// below stays correct.
for (const view of activeViews) world.scene.add(view.object)

/** Puts the chosen cars in the scene, and only those. */
function syncCars(): void {
  const cars = game.state.selection.map((entry) => entry.car)
  const liveries = assignLiveries(cars)
  const next = PLAYERS.map((player) => carViews[cars[player]][liveries[player]])
  if (next.every((view, player) => view === activeViews[player])) return
  // Remove before adding: the two players can be swapping the very same view
  // between them, and a remove after the add would take it straight out again.
  for (const view of activeViews) {
    if (!next.includes(view)) world.scene.remove(view.object)
  }
  for (let player = 0; player < next.length; player += 1) {
    world.scene.add(next[player].object)
    activeViews[player] = next[player]
  }
}

// The track owns the grid: two cars side by side on the start straight, behind
// the line at phi = 1.20, facing the way the road runs.
const progress = createTrackProgress(track, PLAYERS.length)
const states = [createCarState(track.startPose(0)), createCarState(track.startPose(1))] as const
// The pose the last tick started from; the renderer interpolates from it.
const previous = [createCarState(track.startPose(0)), createCarState(track.startPose(1))] as const
const respawned = [false, false]
for (const player of PLAYERS) progress.place(player, track.startPose(player))
syncCars()

const chase = [new ChaseCamera(), new ChaseCamera()] as const
const poses: [Readonly<CarPose>, Readonly<CarPose>] = [
  activeViews[0].present(states[0], states[0], 1, 0),
  activeViews[1].present(states[1], states[1], 1, 0),
]
chase[0].snapTo(poses[0])
chase[1].snapTo(poses[1])

const overlay = createDebugOverlay(container)
const hud = createHud(container, PLAYERS.length)
const input = createInput()

// Reused every frame, so a running game allocates nothing for its HUD.
const hudSpeeds = [0, 0]
const hudFalling = [false, false]
const hudView: HudView = { state: game.state, speeds: hudSpeeds, falling: hudFalling }

/** Menu keys are edge-triggered: a held accelerator must not confirm twice. */
const heldMenuKeys = new Set<string>()

function pollMenu(): void {
  for (const player of PLAYERS) {
    for (const key of MENU_KEYS[player]) {
      const down = input.isDown(key.code)
      if (down && !heldMenuKeys.has(key.code)) game.menu(player, key.action)
      if (down) heldMenuKeys.add(key.code)
      else heldMenuKeys.delete(key.code)
    }
  }
}

/**
 * Back to the start grid: both cars parked side by side, every lap, checkpoint
 * and time forgotten, the table wiped clean and every prop back where it
 * stood. Run whenever the state machine bumps its `resetId`.
 */
function resetWorld(): void {
  syncCars()
  for (const player of PLAYERS) {
    const pose = track.startPose(player)
    resetCarState(states[player], pose)
    // `resetCarState` parks the car on y = 0; a grid slot could sit higher.
    states[player].y = pose.y
    copyCarState(previous[player], states[player])
    // `reset`, not `place`: a new race starts on zero laps and zero
    // checkpoints, and with the unrolled arc length back at the grid.
    progress.reset(player, pose)
    // No swoop across the kitchen: the car did not drive to the grid.
    respawned[player] = true
  }
  skids.clear()
  propField.resetProps()
}

let lastResetId = game.state.resetId

const loop = createLoop({
  fixedStep: PHYSICS.fixedStep,
  maxStepsPerFrame: PHYSICS.maxStepsPerFrame,
  update(dt): void {
    pollMenu()
    if (game.state.resetId !== lastResetId) {
      lastResetId = game.state.resetId
      resetWorld()
    }
    // While the cars are being chosen, the grid shows what is being chosen.
    if (game.state.phase === 'select') syncCars()

    const locked = game.state.carsLocked
    for (const player of PLAYERS) {
      copyCarState(previous[player], states[player])
      const surface = progress.surface(player)
      const driving = !locked && !progress.cars[player].falling
      stepCar(states[player], driving ? input.controls(player) : NO_CONTROLS, dt, {
        surfaceGrip: surface.surfaceGrip,
        groundY: surface.onTable ? surface.groundY : NO_GROUND,
      })
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

    // Last, and on the track's own lap counter: the race never counts laps of
    // its own (see game/state.ts).
    game.tick(progress.cars)
  },
  render(alpha, frameSeconds): void {
    // Ages the existing marks before this frame's are laid, as `mark` expects.
    skids.update(frameSeconds)
    // Only the props that actually moved get a new instance matrix.
    propsView.update()

    const locked = game.state.carsLocked
    for (const player of PLAYERS) {
      const state = states[player]
      const view = activeViews[player]
      poses[player] = view.present(previous[player], state, alpha, frameSeconds)

      const handbrake = !locked && input.controls(player).handbrake
      const strength = skidStrength(state.slip, state.speed, handbrake, state.airborne)
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

      hudSpeeds[player] = state.forwardSpeed
      hudFalling[player] = progress.cars[player].falling
    }

    renderer.render(world.scene, [chase[0].camera, chase[1].camera])
    hud.update(hudView)
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
  hud.dispose()
  renderer.dispose()
  for (const spec of carViews) {
    for (const view of spec) view.dispose()
  }
  skids.dispose()
  propsView.dispose()
  trackView.dispose()
  table.dispose()
  world.dispose()
}

window.addEventListener('pagehide', dispose, { once: true })
import.meta.hot?.dispose(dispose)
