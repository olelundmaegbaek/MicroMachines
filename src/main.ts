import './style.css'

import { PHYSICS, PLAYER_COLORS } from './constants'
import { createInput } from './core/input'
import { createLoop } from './core/loop'
import { ChaseCamera } from './render/chaseCamera'
import { createRenderer } from './render/renderer'
import { createScene } from './render/scene'
import type { CarPose } from './types'
import { createDebugOverlay } from './ui/debugOverlay'
import { PLACEHOLDER_START_POSES, createPlaceholderCar } from './world/placeholderCar'
import { createTable, createTemporaryLandmarks } from './world/table'

const container = document.querySelector<HTMLDivElement>('#app')
if (!container) throw new Error('Missing #app container in index.html')

const world = createScene()
const renderer = createRenderer(container)
const table = createTable()
const landmarks = createTemporaryLandmarks() // TEMPORARY, see world/table.ts
world.scene.add(table.object, landmarks.object)

const cars = [
  createPlaceholderCar(PLAYER_COLORS[0], PLACEHOLDER_START_POSES[0]),
  createPlaceholderCar(PLAYER_COLORS[1], PLACEHOLDER_START_POSES[1]),
] as const
world.scene.add(cars[0].object, cars[1].object)

const chase = [new ChaseCamera(), new ChaseCamera()] as const
chase[0].snapTo(cars[0].pose)
chase[1].snapTo(cars[1].pose)

const overlay = createDebugOverlay(container)
const input = createInput()

// Filled in every render, read again in onFrame for the overlay.
const poses: [Readonly<CarPose>, Readonly<CarPose>] = [cars[0].pose, cars[1].pose]

const loop = createLoop({
  fixedStep: PHYSICS.fixedStep,
  maxStepsPerFrame: PHYSICS.maxStepsPerFrame,
  update(dt): void {
    cars[0].update(dt, input.controls(0))
    cars[1].update(dt, input.controls(1))
  },
  render(alpha, frameSeconds): void {
    poses[0] = cars[0].present(alpha)
    poses[1] = cars[1].present(alpha)
    // The camera is a visual, not a simulation: smoothing it with the real
    // frame time keeps it silky on a 144 Hz screen instead of stepping at 60 Hz.
    chase[0].update(frameSeconds, poses[0])
    chase[1].update(frameSeconds, poses[1])
    renderer.render(world.scene, [chase[0].camera, chase[1].camera])
  },
  onFrame(stats): void {
    overlay.update(stats, poses)
  },
})

loop.start()

function dispose(): void {
  loop.stop()
  input.dispose()
  overlay.dispose()
  renderer.dispose()
  cars[0].dispose()
  cars[1].dispose()
  landmarks.dispose()
  table.dispose()
  world.dispose()
}

window.addEventListener('pagehide', dispose, { once: true })
import.meta.hot?.dispose(dispose)
