import type { FrameStats } from '../core/loop'
import type { CarPose } from '../types'

export const DEBUG_OVERLAY = {
  /** The readout is for eyeballing, and 60 Hz text just flickers. */
  updatesPerSecond: 10,
  /** Either key toggles the panel. */
  toggleCodes: ['F3', 'Backquote'],
  visibleByDefault: true,
} as const

// `includes` on an `as const` tuple would only accept its own two literals.
const TOGGLE_CODES: readonly string[] = DEBUG_OVERLAY.toggleCodes

export interface DebugOverlay {
  update(stats: FrameStats, poses: readonly Readonly<CarPose>[]): void
  dispose(): void
}

function format(value: number, decimals = 1): string {
  return value.toFixed(decimals).padStart(7)
}

export function createDebugOverlay(container: HTMLElement): DebugOverlay {
  const element = document.createElement('pre')
  element.className = 'debug-overlay'
  let visible: boolean = DEBUG_OVERLAY.visibleByDefault
  element.hidden = !visible
  container.appendChild(element)

  const interval = 1 / DEBUG_OVERLAY.updatesPerSecond
  let sinceUpdate = interval

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!TOGGLE_CODES.includes(event.code)) return
    event.preventDefault()
    visible = !visible
    element.hidden = !visible
  }
  window.addEventListener('keydown', onKeyDown)

  return {
    update(stats, poses): void {
      sinceUpdate += stats.frameSeconds
      if (!visible || sinceUpdate < interval) return
      sinceUpdate = 0

      const lines = [
        `fps ${format(stats.fps)}   fysik-ticks ${stats.ticks}${stats.droppedTicks > 0 ? ` (${stats.droppedTicks} droppet)` : ''}`,
      ]
      poses.forEach((pose, index) => {
        const heading = ((pose.heading * 180) / Math.PI).toFixed(0).padStart(4)
        lines.push(
          `spiller ${index + 1}  x ${format(pose.x)}  z ${format(pose.z)}  fart ${format(pose.speed)}  kurs ${heading}°`,
        )
      })
      lines.push('F3 / ´ skjuler panelet')
      element.textContent = lines.join('\n')
    },
    dispose(): void {
      window.removeEventListener('keydown', onKeyDown)
      element.remove()
    },
  }
}
