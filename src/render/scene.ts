import * as THREE from 'three'

import { FLOOR_Y, TABLE } from '../constants'

/**
 * The whole mood of the game in one object. Warm, bright, cartoonish — a
 * sunlit kitchen, not a studio.
 */
export const SCENE_LOOK = {
  /** Background and fog share this colour, so the table ends fade into it. */
  kitchen: 0xf2e3cd,
  /** Fog only bites past the far end of the table. */
  fogNear: 70,
  fogFar: 220,
  /** The "window": low and to the side, so props throw long, readable shadows. */
  sun: {
    color: 0xfff4de,
    intensity: 3.0,
    position: { x: 58, y: 88, z: 38 },
  },
  /** Bounce light, so the shadows are grey-blue toy shadows and not holes. */
  fill: {
    skyColor: 0xfff1d8,
    groundColor: 0xb59273,
    intensity: 1.6,
  },
  shadow: {
    mapSize: 2048,
    /** Slack around the table in the shadow camera, in world units. */
    margin: 4,
    /** How far above the table the shadow volume reaches (cars, props, ramps). */
    heightAbove: 12,
    /** Beats shadow acne on the large, nearly flat table top. */
    normalBias: 0.04,
    /** Blur radius in shadow texels — soft toy shadows, not hard edges. */
    radius: 2.5,
  },
  floor: {
    color: 0xb08a68,
    /** Wide enough that the horizon is fog, never an edge. */
    size: 900,
  },
} as const

export interface GameScene {
  scene: THREE.Scene
  sun: THREE.DirectionalLight
  dispose(): void
}

/**
 * Sizes the shadow camera to exactly cover `box`.
 *
 * A fixed symmetric box would have to be as wide as the table's diagonal to be
 * safe, wasting most of the 2048 map on empty space and making the shadows
 * mushy. Projecting the box corners into the light's own frame gives the
 * tightest orthographic frustum that still covers every corner, so the shadow
 * is equally sharp at both ends of the table.
 */
function fitDirectionalShadow(light: THREE.DirectionalLight, box: THREE.Box3, margin: number): void {
  const target = new THREE.Vector3()
  light.target.updateMatrixWorld()
  light.target.getWorldPosition(target)

  // Roll the shadow camera so its horizontal axis lines up with the table's
  // long (world X) axis. With the default up vector a diagonal light projects
  // the 130 x 70 table as a 138 x 133 diamond and most of the shadow map is
  // spent on air. Three.js aims the shadow camera with `shadowCamera.lookAt`,
  // which honours this `up`.
  const away = new THREE.Vector3().subVectors(light.position, target).normalize()
  const up = new THREE.Vector3().crossVectors(away, new THREE.Vector3(1, 0, 0))
  light.shadow.camera.up.copy(up.lengthSq() > 1e-6 ? up.normalize() : new THREE.Vector3(0, 1, 0))

  // A Camera and not a plain Object3D: `lookAt` points a mesh's +Z at the
  // target but a camera's -Z, and Three.js aims the shadow camera the camera
  // way. Probing with the wrong one flips the frustum and the table ends up
  // behind the near plane, with no shadows at all.
  const probe = new THREE.Camera()
  probe.position.copy(light.position)
  probe.up.copy(light.shadow.camera.up)
  probe.lookAt(target)
  probe.updateMatrixWorld(true)
  const toLightSpace = probe.matrixWorld.clone().invert()

  const corner = new THREE.Vector3()
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity

  for (let index = 0; index < 8; index += 1) {
    corner.set(
      (index & 1) === 0 ? box.min.x : box.max.x,
      (index & 2) === 0 ? box.min.y : box.max.y,
      (index & 4) === 0 ? box.min.z : box.max.z,
    )
    corner.applyMatrix4(toLightSpace)
    minX = Math.min(minX, corner.x)
    maxX = Math.max(maxX, corner.x)
    minY = Math.min(minY, corner.y)
    maxY = Math.max(maxY, corner.y)
    minZ = Math.min(minZ, corner.z)
    maxZ = Math.max(maxZ, corner.z)
  }

  const camera = light.shadow.camera
  camera.left = minX - margin
  camera.right = maxX + margin
  camera.bottom = minY - margin
  camera.top = maxY + margin
  // The shadow camera looks down its own -Z, so everything it can see has a
  // negative z and the nearest corner is the one with the largest z.
  camera.near = Math.max(0.5, -maxZ - margin)
  camera.far = -minZ + margin
  camera.updateProjectionMatrix()
}

export function createScene(): GameScene {
  const scene = new THREE.Scene()
  const kitchen = new THREE.Color(SCENE_LOOK.kitchen)
  scene.background = kitchen
  scene.fog = new THREE.Fog(kitchen, SCENE_LOOK.fogNear, SCENE_LOOK.fogFar)

  const fill = new THREE.HemisphereLight(
    SCENE_LOOK.fill.skyColor,
    SCENE_LOOK.fill.groundColor,
    SCENE_LOOK.fill.intensity,
  )
  scene.add(fill)

  const sun = new THREE.DirectionalLight(SCENE_LOOK.sun.color, SCENE_LOOK.sun.intensity)
  sun.position.set(SCENE_LOOK.sun.position.x, SCENE_LOOK.sun.position.y, SCENE_LOOK.sun.position.z)
  sun.castShadow = true
  sun.shadow.mapSize.set(SCENE_LOOK.shadow.mapSize, SCENE_LOOK.shadow.mapSize)
  sun.shadow.normalBias = SCENE_LOOK.shadow.normalBias
  sun.shadow.radius = SCENE_LOOK.shadow.radius
  scene.add(sun)
  // The target must be in the scene graph, otherwise its world matrix is never
  // updated and the light aims wherever it was last left.
  scene.add(sun.target)

  fitDirectionalShadow(
    sun,
    new THREE.Box3(
      new THREE.Vector3(-TABLE.width / 2, TABLE.surfaceY - TABLE.thickness, -TABLE.depth / 2),
      new THREE.Vector3(TABLE.width / 2, TABLE.surfaceY + SCENE_LOOK.shadow.heightAbove, TABLE.depth / 2),
    ),
    SCENE_LOOK.shadow.margin,
  )

  // The kitchen floor, far below. It is what makes the table edge read as a
  // drop rather than as the end of the world; fog swallows it in the distance.
  const floorGeometry = new THREE.PlaneGeometry(SCENE_LOOK.floor.size, SCENE_LOOK.floor.size)
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: SCENE_LOOK.floor.color,
    roughness: 0.95,
    metalness: 0,
  })
  const floor = new THREE.Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = FLOOR_Y
  scene.add(floor)

  return {
    scene,
    sun,
    dispose(): void {
      floorGeometry.dispose()
      floorMaterial.dispose()
    },
  }
}
