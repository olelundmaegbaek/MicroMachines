import * as THREE from 'three'

import { TABLE, WORLD_UNIT_CM } from '../constants'

/**
 * The table's finish: Poly Haven "kitchen_wood" (CC0) as colour, normal and
 * roughness. Every number that decides how the wood reads lives here.
 */
export const TABLE_LOOK = {
  textures: {
    folder: 'assets/textures/',
    color: 'kitchen_wood_diff_1k.jpg',
    /** OpenGL convention (+Y up), which is what three expects. Never flipped. */
    normal: 'kitchen_wood_nor_1k.jpg',
    roughness: 'kitchen_wood_rough_1k.jpg',
  },
  board: {
    /**
     * Boards in one tile of the colour map, counted off the map itself. The
     * 1024 px tile holds somewhere between eight and fourteen depending on
     * whether a hard grain line counts as a seam; ten is the middle of that,
     * and the whole range lands a board between 8.6 and 15 cm — inside what a
     * kitchen table is made of either way.
     */
    perTile: 10,
    /**
     * Width of one board. A real kitchen-table board is 10-15 cm, and at
     * 1.75 cm to the unit (WORLD_UNIT_CM) 12 cm is 6.9 units, so one tile
     * covers 68.6 units and the 130-unit table reads as 19 boards. The cars
     * are 1:64 toys, so a board being wider than a 4-unit car is long is the
     * point; a board the width of a car would turn the table into parquet.
     */
    widthCm: 12,
  },
  /**
   * Multiplies the colour map, and stays at 1: this map needs no help.
   *
   * The first wood here was "wood_table_001", a dark walnut with a mean linear
   * albedo of (0.049, 0.010, 0.003). Two things were wrong with it. It was 26
   * times darker than the flat beige the scene had been lit against, so it had
   * to be multiplied by up to 4.4 — an albedo above 1, which no real surface
   * has. And its hue is 17 degrees at 0.72 saturation, which is the same hue as
   * Soba Supreme's paint at 16 degrees: an orange-red car on an orange-red
   * table, separated by brightness alone.
   *
   * "kitchen_wood" is (0.164, 0.114, 0.070) linear, a luminance of 0.121. That
   * is almost exactly what the tinted walnut ended up at, so the exposure
   * RENDER_LOOK was balanced to still holds, but the hue is 31 degrees at 0.21
   * saturation. Both cars now separate from the table by hue and by value
   * rather than by value alone.
   */
  tint: { r: 1, g: 1, b: 1 },
  /** The sides sit a shade under the top, so the thickness reads as an edge. */
  edgeShade: 0.86,
  /**
   * Multiplies the roughness map. At toy scale a mirror-finish table reads as
   * plastic, so this lifts the map towards a satin finish while keeping its own
   * variation.
   */
  roughness: 1.6,
  metalness: 0,
  normalScale: 1,
  /**
   * The camera looks a long way down a table seen at a very flat angle, and
   * without anisotropic filtering the far half turns to mush. Used only until
   * `main.ts` hands `createTable` the renderer's real maximum.
   */
  fallbackAnisotropy: 8,
} as const

/** World units covered by one tile of the wood maps. */
const TILE_UNITS = (TABLE_LOOK.board.perTile * TABLE_LOOK.board.widthCm) / WORLD_UNIT_CM

/**
 * A quarter turn on the UVs. The boards run UP the maps, and BoxGeometry sends
 * the top face's v along the table's 70-unit depth — without the turn the
 * boards would lie across the table instead of down its 130-unit length.
 * Rotating the UVs rotates the tangent frame with them (three derives it from
 * the UV derivatives), so the normal map follows and needs no correction.
 */
const GRAIN_TURN = Math.PI / 2

export interface Table {
  object: THREE.Object3D
  dispose(): void
}

interface WoodMaps {
  color: THREE.Texture
  normal: THREE.Texture
  roughness: THREE.Texture
}

interface Wood {
  /**
   * The three maps for one face, scaled to it: `acrossGrain` and `alongGrain`
   * are how many world units that face spans across the boards and along them.
   */
  face(acrossGrain: number, alongGrain: number): WoodMaps
  dispose(): void
}

/**
 * Loads the three maps ONCE and hands out copies. A `clone()` shares the
 * original's `source`, so the pixels reach the GPU a single time however many
 * faces ask for them — but each copy carries its own repeat, which is the
 * whole reason for the copies: a face keeps the grain at the right size only
 * when its repeat matches its own size in world units.
 */
function createWood(anisotropy: number): Wood {
  const loader = new THREE.TextureLoader().setPath(
    `${import.meta.env.BASE_URL}${TABLE_LOOK.textures.folder}`,
  )
  const originals: THREE.Texture[] = []
  const copies: THREE.Texture[] = []

  const load = (file: string, colorSpace: THREE.ColorSpace): THREE.Texture => {
    const texture = loader.load(file, () => {
      // The copies are made before the pixels exist, and they share this
      // texture's source but keep their own version counter. Marking them the
      // moment the image lands is what gets the wood onto the GPU.
      for (const copy of copies) copy.needsUpdate = true
    })
    // The colour map is painted in sRGB; the normal and the roughness maps are
    // raw data and stay linear (NoColorSpace). Swap the two and the wood comes
    // out either washed out or nearly black.
    texture.colorSpace = colorSpace
    originals.push(texture)
    return texture
  }

  const color = load(TABLE_LOOK.textures.color, THREE.SRGBColorSpace)
  const normal = load(TABLE_LOOK.textures.normal, THREE.NoColorSpace)
  const roughness = load(TABLE_LOOK.textures.roughness, THREE.NoColorSpace)

  const copy = (texture: THREE.Texture, acrossGrain: number, alongGrain: number): THREE.Texture => {
    const clone = texture.clone()
    clone.wrapS = THREE.RepeatWrapping
    clone.wrapT = THREE.RepeatWrapping
    clone.rotation = GRAIN_TURN
    // All three maps carry the SAME repeat, or the normal and the roughness
    // slide across the colour. After the quarter turn the repeat's x rides the
    // face's across-grain axis and its y the along-grain one.
    clone.repeat.set(acrossGrain / TILE_UNITS, alongGrain / TILE_UNITS)
    clone.anisotropy = anisotropy
    copies.push(clone)
    return clone
  }

  return {
    face(acrossGrain, alongGrain): WoodMaps {
      return {
        color: copy(color, acrossGrain, alongGrain),
        normal: copy(normal, acrossGrain, alongGrain),
        roughness: copy(roughness, acrossGrain, alongGrain),
      }
    },
    dispose(): void {
      for (const texture of copies) texture.dispose()
      for (const texture of originals) texture.dispose()
    },
  }
}

/**
 * The kitchen table.
 *
 * `maxAnisotropy` is `renderer.maxAnisotropy`; the fallback only exists so a
 * table can be built without a renderer at hand.
 */
export function createTable(maxAnisotropy: number = TABLE_LOOK.fallbackAnisotropy): Table {
  const wood = createWood(maxAnisotropy)
  const materials: THREE.MeshStandardMaterial[] = []

  const surface = (
    shade: number,
    acrossGrain: number,
    alongGrain: number,
  ): THREE.MeshStandardMaterial => {
    const maps = wood.face(acrossGrain, alongGrain)
    const material = new THREE.MeshStandardMaterial({
      map: maps.color,
      normalMap: maps.normal,
      normalScale: new THREE.Vector2(TABLE_LOOK.normalScale, TABLE_LOOK.normalScale),
      roughnessMap: maps.roughness,
      roughness: TABLE_LOOK.roughness,
      metalness: TABLE_LOOK.metalness,
    })
    material.color.setRGB(
      TABLE_LOOK.tint.r * shade,
      TABLE_LOOK.tint.g * shade,
      TABLE_LOOK.tint.b * shade,
    )
    materials.push(material)
    return material
  }

  // Three materials, not one. The top is 130 x 70, the long sides are 130 x 3
  // and the short ones 70 x 3: one shared repeat would smear the grain up the
  // edge into a stretched copy of the top. Every face gets its own instead,
  // and all of them keep the boards at the same 6.9 units.
  const top = surface(1, TABLE.depth, TABLE.width)
  const longSide = surface(TABLE_LOOK.edgeShade, TABLE.thickness, TABLE.width)
  const shortSide = surface(TABLE_LOOK.edgeShade, TABLE.thickness, TABLE.depth)

  // A box, not a plane: the point is to see that the table has a top with a
  // thickness you can fall off, not a floating sheet.
  const geometry = new THREE.BoxGeometry(TABLE.width, TABLE.thickness, TABLE.depth)
  // BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z. The underside is only
  // ever glimpsed on the way down, and its UVs are laid out like the top's.
  const mesh = new THREE.Mesh(geometry, [shortSide, shortSide, top, top, longSide, longSide])
  mesh.position.y = TABLE.surfaceY - TABLE.thickness / 2
  mesh.receiveShadow = true
  mesh.name = 'table'

  return {
    object: mesh,
    dispose(): void {
      geometry.dispose()
      for (const material of materials) material.dispose()
      wood.dispose()
    },
  }
}
