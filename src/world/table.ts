import * as THREE from 'three'

import { TABLE } from '../constants'

/**
 * Placeholder table finish. Phase 4 swaps this for a real CC0 wood texture —
 * keep the material in this one factory so that is a one-file change.
 */
export const TABLE_LOOK = {
  topColor: 0xdcb383,
  /** The edge is a shade darker so the thickness reads as an edge. */
  edgeColor: 0xc0925f,
  roughness: 0.78,
  metalness: 0,
} as const

export interface Table {
  object: THREE.Object3D
  dispose(): void
}

export function createTable(): Table {
  const top = new THREE.MeshStandardMaterial({
    color: TABLE_LOOK.topColor,
    roughness: TABLE_LOOK.roughness,
    metalness: TABLE_LOOK.metalness,
  })
  const edge = new THREE.MeshStandardMaterial({
    color: TABLE_LOOK.edgeColor,
    roughness: TABLE_LOOK.roughness,
    metalness: TABLE_LOOK.metalness,
  })

  // A box, not a plane: the point is to see that the table has a top with a
  // thickness you can fall off, not a floating sheet.
  const geometry = new THREE.BoxGeometry(TABLE.width, TABLE.thickness, TABLE.depth)
  // BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z.
  const mesh = new THREE.Mesh(geometry, [edge, edge, top, edge, edge, edge])
  mesh.position.y = TABLE.surfaceY - TABLE.thickness / 2
  mesh.receiveShadow = true
  mesh.name = 'table'

  return {
    object: mesh,
    dispose(): void {
      geometry.dispose()
      top.dispose()
      edge.dispose()
    },
  }
}

/* ------------------------------------------------------------------------ *
 * TEMPORARY — phase 1 only.
 *
 * A grid and a handful of low-poly blocks so the chase camera has something to
 * move past. Without reference points on a flat tabletop it is impossible to
 * tell whether the camera is turning, lagging or standing still. Phase 3
 * replaces all of it with the real track and props; delete this whole section
 * then, together with its entry in main.ts.
 * ------------------------------------------------------------------------ */

const LANDMARKS = {
  gridSpacing: 10,
  gridColor: 0x8a6a45,
  gridOpacity: 0.35,
  /** Lifted off the surface, otherwise the lines z-fight with the table top. */
  gridY: 0.03,
  blockCount: 26,
  blockColors: [0xe8d44d, 0x4dbfa0, 0xe87f4d, 0x8d6ce8],
  /** Keeps blocks off the table edge. */
  edgeInset: 8,
  /** Blocks start here, so the left end of the table stays a clear start straight. */
  startClearX: -34,
  /** Fixed seed: the same layout every reload, so the camera can be judged. */
  seed: 0x5eed1234,
} as const

/** Mulberry32 — tiny, deterministic, good enough for scattering blocks. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface TemporaryLandmarks {
  object: THREE.Object3D
  dispose(): void
}

export function createTemporaryLandmarks(): TemporaryLandmarks {
  const group = new THREE.Group()
  group.name = 'temporary-landmarks'

  const halfWidth = TABLE.width / 2
  const halfDepth = TABLE.depth / 2
  const points: number[] = []
  for (let x = -halfWidth; x <= halfWidth + 0.001; x += LANDMARKS.gridSpacing) {
    points.push(x, LANDMARKS.gridY, -halfDepth, x, LANDMARKS.gridY, halfDepth)
  }
  for (let z = -halfDepth; z <= halfDepth + 0.001; z += LANDMARKS.gridSpacing) {
    points.push(-halfWidth, LANDMARKS.gridY, z, halfWidth, LANDMARKS.gridY, z)
  }

  const gridGeometry = new THREE.BufferGeometry()
  gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  const gridMaterial = new THREE.LineBasicMaterial({
    color: LANDMARKS.gridColor,
    transparent: true,
    opacity: LANDMARKS.gridOpacity,
  })
  group.add(new THREE.LineSegments(gridGeometry, gridMaterial))

  const blockGeometry = new THREE.BoxGeometry(1, 1, 1)
  const blockMaterials = LANDMARKS.blockColors.map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0 }),
  )
  const random = createRandom(LANDMARKS.seed)
  for (let index = 0; index < LANDMARKS.blockCount; index += 1) {
    const material = blockMaterials[index % blockMaterials.length]
    const block = new THREE.Mesh(blockGeometry, material)
    const width = 1.5 + random() * 2.5
    const height = 1.5 + random() * 4
    const depth = 1.5 + random() * 2.5
    block.scale.set(width, height, depth)
    const spreadX = halfWidth - LANDMARKS.edgeInset - LANDMARKS.startClearX
    block.position.set(
      LANDMARKS.startClearX + random() * spreadX,
      TABLE.surfaceY + height / 2,
      (random() * 2 - 1) * (halfDepth - LANDMARKS.edgeInset),
    )
    block.rotation.y = random() * Math.PI * 2
    block.castShadow = true
    block.receiveShadow = true
    group.add(block)
  }

  return {
    object: group,
    dispose(): void {
      gridGeometry.dispose()
      gridMaterial.dispose()
      blockGeometry.dispose()
      for (const material of blockMaterials) material.dispose()
    },
  }
}
