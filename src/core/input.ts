import type { Controls, PlayerId } from '../types'

export type { Controls } from '../types'

/**
 * One player's key bindings, as `KeyboardEvent.code` values.
 *
 * `code` and not `key`: `code` is the physical key, so it survives a Danish or
 * Dvorak layout, and — the reason it matters here — it tells ShiftLeft from
 * ShiftRight, which `key` reports as plain "Shift" for both. Nothing in this
 * module normalises the code, so the two handbrakes stay distinct.
 */
export interface KeyBinding {
  throttle: string
  brake: string
  left: string
  right: string
  handbrake: string
}

/** The single place bindings are defined. Player 1 first. */
export const KEY_BINDINGS: readonly [KeyBinding, KeyBinding] = [
  { throttle: 'KeyW', brake: 'KeyS', left: 'KeyA', right: 'KeyD', handbrake: 'ShiftLeft' },
  { throttle: 'ArrowUp', brake: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', handbrake: 'ShiftRight' },
]

/** Keys the browser would otherwise use to scroll the page. */
const PREVENTED_CODES: ReadonlySet<string> = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
])

export interface Input {
  /** True while the physical key is held. */
  isDown(code: string): boolean
  /**
   * The player's control state. The returned object is reused between calls,
   * so read it, do not store it.
   */
  controls(player: PlayerId): Readonly<Controls>
  dispose(): void
}

export function createInput(target: Window = window): Input {
  const pressed = new Set<string>()
  const states: [Controls, Controls] = [
    { throttle: 0, brake: 0, steer: 0, handbrake: false },
    { throttle: 0, brake: 0, steer: 0, handbrake: false },
  ]

  const onKeyDown = (event: KeyboardEvent): void => {
    if (PREVENTED_CODES.has(event.code)) event.preventDefault()
    pressed.add(event.code)
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    if (PREVENTED_CODES.has(event.code)) event.preventDefault()
    pressed.delete(event.code)
  }

  // Without this an alt-tab mid-corner leaves the key "held" forever: the
  // keyup lands on the other window and the car drives off on its own.
  const onBlur = (): void => {
    pressed.clear()
  }

  target.addEventListener('keydown', onKeyDown)
  target.addEventListener('keyup', onKeyUp)
  target.addEventListener('blur', onBlur)

  return {
    isDown(code: string): boolean {
      return pressed.has(code)
    },
    controls(player: PlayerId): Readonly<Controls> {
      const binding = KEY_BINDINGS[player]
      const state = states[player]
      state.throttle = pressed.has(binding.throttle) ? 1 : 0
      state.brake = pressed.has(binding.brake) ? 1 : 0
      state.steer = (pressed.has(binding.right) ? 1 : 0) - (pressed.has(binding.left) ? 1 : 0)
      state.handbrake = pressed.has(binding.handbrake)
      return state
    },
    dispose(): void {
      target.removeEventListener('keydown', onKeyDown)
      target.removeEventListener('keyup', onKeyUp)
      target.removeEventListener('blur', onBlur)
      pressed.clear()
    },
  }
}
