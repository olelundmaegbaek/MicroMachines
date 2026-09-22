import * as THREE from 'three'

import { MAX_PIXEL_RATIO } from '../constants'
import { splitscreenViewports } from '../core/viewport'
import type { ViewportRect } from '../types'

/** Everything that decides how bright and how contrasty the picture reads. */
export const RENDER_LOOK = {
  /** Cartoon, not cinema: a touch over 1 keeps the table bright. */
  toneMappingExposure: 1.15,
  antialias: true,
} as const

export interface GameRenderer {
  readonly renderer: THREE.WebGLRenderer
  /** Current splitscreen rectangles, index 0 = player 1 (top). */
  readonly viewports: readonly [ViewportRect, ViewportRect]
  render(
    scene: THREE.Scene,
    cameras: readonly [THREE.PerspectiveCamera, THREE.PerspectiveCamera],
  ): void
  dispose(): void
}

/**
 * ONE WebGLRenderer for both halves. Two renderers would double every GL state
 * change; the scissor test costs nothing.
 */
export function createRenderer(container: HTMLElement): GameRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: RENDER_LOOK.antialias })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = RENDER_LOOK.toneMappingExposure
  renderer.shadowMap.enabled = true
  // three r186 REMOVED PCFSoftShadowMap: setting it only logs a warning and
  // falls back to this. PCFShadowMap is the soft one now — a 5-tap Vogel disk
  // that honours `light.shadow.radius` (SCENE_LOOK.shadow.radius).
  renderer.shadowMap.type = THREE.PCFShadowMap
  // We clear once per scissor rectangle instead, so drawing the bottom half
  // cannot wipe the top half that was drawn a moment earlier.
  renderer.autoClear = false
  renderer.domElement.classList.add('game-canvas')
  container.appendChild(renderer.domElement)

  // A DOM rule, not geometry: geometry would have to be drawn in both cameras
  // and would still be a pixel off after a resize.
  const splitLine = document.createElement('div')
  splitLine.className = 'split-line'
  container.appendChild(splitLine)

  let viewports = splitscreenViewports(1, 2)

  const resize = (): void => {
    const width = container.clientWidth || window.innerWidth
    const height = container.clientHeight || window.innerHeight
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))
    renderer.setSize(width, height)
    viewports = splitscreenViewports(width, height)
  }

  resize()
  window.addEventListener('resize', resize)

  return {
    renderer,
    get viewports(): readonly [ViewportRect, ViewportRect] {
      return viewports
    },
    render(scene, cameras): void {
      renderer.setScissorTest(true)
      for (let index = 0; index < viewports.length; index += 1) {
        const view = viewports[index]
        const camera = cameras[index]
        // Each half is only half as tall as the canvas, so its aspect is
        // width / (height / 2).
        if (camera.aspect !== view.aspect) {
          camera.aspect = view.aspect
          camera.updateProjectionMatrix()
        }
        renderer.setViewport(view.x, view.y, view.width, view.height)
        renderer.setScissor(view.x, view.y, view.width, view.height)
        renderer.clear()
        renderer.render(scene, camera)
      }
    },
    dispose(): void {
      window.removeEventListener('resize', resize)
      renderer.dispose()
      renderer.domElement.remove()
      splitLine.remove()
    },
  }
}
