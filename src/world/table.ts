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
