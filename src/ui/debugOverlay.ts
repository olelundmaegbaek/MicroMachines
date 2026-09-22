import type { CarState } from '../car/physics'
import type { FrameStats } from '../core/loop'
import type { TrackCarProgress } from '../track/progress'

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
  update(
    stats: FrameStats,
    cars: readonly Readonly<CarState>[],
    track: readonly Readonly<TrackCarProgress>[],
  ): void
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
    update(stats, cars, track): void {
      sinceUpdate += stats.frameSeconds
      if (!visible || sinceUpdate < interval) return
      sinceUpdate = 0

      const lines = [
        `fps ${format(stats.fps)}   fysik-ticks ${stats.ticks}${stats.droppedTicks > 0 ? ` (${stats.droppedTicks} droppet)` : ''}`,
      ]
      cars.forEach((car, index) => {
        const heading = ((car.heading * 180) / Math.PI).toFixed(0).padStart(4)
        const slip = ((car.slipAngle * 180) / Math.PI).toFixed(0).padStart(4)
        lines.push(
          `spiller ${index + 1}  fart ${format(car.forwardSpeed)}  slip ${slip}°  ${car.airborne ? 'i luften' : 'på bordet'}`,
        )
        lines.push(
          `           x ${format(car.x)}  z ${format(car.z)}  kurs ${heading}°`,
        )
        const lap = track[index]
        if (!lap) return
        const state = lap.falling ? `falder ${lap.respawnIn.toFixed(1)}s` : 'på banen'
        lines.push(
          `           bane ${format(lap.lapS)}  omgang ${(lap.lapProgress * 100).toFixed(0).padStart(3)}%` +
            ` (${lap.laps})  cp ${lap.checkpointsPassed}/8  greb ${lap.surfaceGrip.toFixed(2)}  ${state}`,
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
