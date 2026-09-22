/**
 * Fixed-timestep game loop. Pure time keeping — it must never learn about
 * Three.js, the DOM beyond rAF, or the game itself.
 */

export interface FrameStats {
  /** Smoothed frames per second. */
  fps: number
  /** Physics ticks run in the frame just rendered. */
  ticks: number
  /** Whole physics ticks thrown away this frame because of the tick cap. */
  droppedTicks: number
  /** Real wall time of the frame just rendered, in seconds. */
  frameSeconds: number
}

export interface LoopOptions {
  /** Seconds per physics tick, e.g. 1/60. */
  fixedStep: number
  /** Hard cap on physics ticks per frame. Defaults to 5. */
  maxStepsPerFrame?: number
  /** Advances the simulation by exactly `fixedStep` seconds. */
  update(dt: number): void
  /**
   * Draws one frame. `alpha` is how far we are between the previous and the
   * current physics state (0..1) and is what the renderer interpolates with.
   * `frameSeconds` is the real elapsed wall time of this frame, for visual-only
   * smoothing (the chase camera) that should not be quantised to 60 Hz.
   */
  render(alpha: number, frameSeconds: number): void
  /** Called once per frame after `render`, with a reused stats object. */
  onFrame?(stats: FrameStats): void
}

export interface Loop {
  start(): void
  stop(): void
}

/** Weight of a single frame in the fps average; ~0.1 settles in a few frames. */
const FPS_SMOOTHING = 0.1

export function createLoop(options: LoopOptions): Loop {
  const { fixedStep, update, render, onFrame } = options
  const maxSteps = options.maxStepsPerFrame ?? 5

  // Reused so a running loop allocates nothing per frame.
  const stats: FrameStats = { fps: 0, ticks: 0, droppedTicks: 0, frameSeconds: 0 }

  let running = false
  let handle = 0
  let previous = 0
  let accumulator = 0

  const frame = (now: number): void => {
    if (!running) return
    handle = requestAnimationFrame(frame)

    const frameSeconds = (now - previous) / 1000
    previous = now
    accumulator += frameSeconds

    let ticks = 0
    while (accumulator >= fixedStep && ticks < maxSteps) {
      update(fixedStep)
      accumulator -= fixedStep
      ticks += 1
    }

    // Spiral of death guard: after an alt-tab the accumulator can hold seconds
    // of backlog. Simulating it would take longer than the frame it delays, so
    // drop the whole steps and keep only the sub-step remainder, which is what
    // `alpha` needs to stay meaningful.
    let dropped = 0
    if (accumulator >= fixedStep) {
      dropped = Math.floor(accumulator / fixedStep)
      accumulator -= dropped * fixedStep
    }

    if (frameSeconds > 0) {
      const instantFps = 1 / frameSeconds
      stats.fps = stats.fps === 0 ? instantFps : stats.fps + (instantFps - stats.fps) * FPS_SMOOTHING
    }
    stats.ticks = ticks
    stats.droppedTicks = dropped
    stats.frameSeconds = frameSeconds

    render(accumulator / fixedStep, frameSeconds)
    onFrame?.(stats)
  }

  return {
    start(): void {
      if (running) return
      running = true
      previous = performance.now()
      accumulator = 0
      handle = requestAnimationFrame(frame)
    },
    stop(): void {
      if (!running) return
      running = false
      cancelAnimationFrame(handle)
    },
  }
}
