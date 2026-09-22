import type { ViewportRect } from '../types'

/**
 * Horizontal splitscreen geometry, in CSS pixels (Three.js multiplies by the
 * pixel ratio itself in `setViewport`/`setScissor`).
 *
 * WebGL's viewport origin is the BOTTOM-left corner of the drawing buffer, so
 * the player shown at the TOP of the screen is the one with the HIGHER y.
 * Player 1 therefore gets `y = <height of the bottom half>` and player 2 gets
 * `y = 0`. Getting this backwards silently swaps the two players.
 */
export function splitscreenViewports(
  canvasWidth: number,
  canvasHeight: number,
): [ViewportRect, ViewportRect] {
  const width = Math.max(1, Math.floor(canvasWidth))
  const height = Math.max(2, Math.floor(canvasHeight))

  const bottomHeight = Math.floor(height / 2)
  // The odd pixel goes to the top half so the two halves always add up to the
  // full canvas and no uncleared row is left between them.
  const topHeight = height - bottomHeight

  return [
    { x: 0, y: bottomHeight, width, height: topHeight, aspect: width / topHeight },
    { x: 0, y: 0, width, height: bottomHeight, aspect: width / bottomHeight },
  ]
}
