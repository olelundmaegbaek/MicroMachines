import * as THREE from 'three'

/**
 * Every puff of dust, flour and coffee in the game, in ONE `Points` object
 * over a ring buffer — the same shape as `car/skidMarks.ts`, and for the same
 * reason: two cars drifting throw a few hundred particles a second, and an
 * object per particle would cost more than the rest of the frame put together.
 *
 * Presentation only. Nothing in this file knows what a car, a lap or a track
 * is; `fx/tyreDust.ts` decides WHEN to spawn and `main.ts` does the spawning.
 *
 * The particles are moved in the PHYSICS tick (`update`) and drawn
 * interpolated (`present`), exactly like the cars, so they neither stutter on
 * a 144 Hz screen nor move faster on one.
 */

export type ParticleKind = 'dust' | 'flour' | 'coffee'

/** The three kinds in buffer order; a particle stores its index into this. */
const KIND_ORDER = ['dust', 'flour', 'coffee'] as const

/** Everything the particles look like. Tune here, nowhere else. */
export const PARTICLES = {
  /**
   * Ring buffer size, and a hard ceiling on the cost of a frame. Worst case
   * measured in the verification: both cars sideways in the flour lay about
   * 400 live particles, so 1024 leaves room for two landing bursts on top.
   * Past that the oldest particle is reused, which is the graceful failure.
   */
  max: 1024,
  /** Above the skid marks (renderOrder 1), which are flat on the table. */
  renderOrder: 2,
  /** How high above the contact patch a puff is born. */
  spawnLift: 0.12,
  /** The soft round blob every particle is drawn with. */
  sprite: {
    /** Texels across. It is a blurred dot; it does not need to be bigger. */
    resolution: 32,
    /** Exponent on the radial falloff. Higher is a tighter, harder core. */
    falloff: 1.7,
  },
  kinds: {
    /** Dry table dust: small, soft, light brown, drifting up and away. */
    dust: {
      color: 0xcbb08a,
      sizeFrom: 0.26,
      sizeTo: 0.48,
      /** Size at death, as a multiple of size at birth: clouds expand. */
      growth: 1.7,
      lifeFrom: 0.5,
      lifeTo: 0.9,
      opacity: 0.4,
      /** Vertical acceleration. Positive rises — dust is lighter than air. */
      lift: 1.6,
      /** Upward speed at birth. */
      rise: 1.1,
      /** Random sideways speed at birth. */
      spread: 1.5,
      /** Air drag as exp(-drag * dt), never a linear subtraction. */
      drag: 2.6,
      /** Share of the life spent fading in, so nothing pops into existence. */
      fadeIn: 0.12,
    },
    /** Spilled flour: clearly brighter, bigger and longer-lived than dust. */
    flour: {
      color: 0xf8f2e6,
      sizeFrom: 0.42,
      sizeTo: 0.82,
      growth: 2.1,
      lifeFrom: 0.9,
      lifeTo: 1.5,
      opacity: 0.75,
      lift: 2.4,
      rise: 1.8,
      spread: 2.2,
      drag: 2.2,
      fadeIn: 0.08,
    },
    /** Coffee: dark droplets that are thrown, fall back and are gone. */
    coffee: {
      color: 0x3a2114,
      sizeFrom: 0.13,
      sizeTo: 0.26,
      growth: 1,
      lifeFrom: 0.28,
      lifeTo: 0.5,
      opacity: 0.85,
      /** Negative: a droplet is not a cloud, it comes back down. */
      lift: -26,
      rise: 3.2,
      spread: 3.4,
      drag: 0.9,
      fadeIn: 0.04,
    },
  },
} as const

/** One kind's look, as `present` reads it back out. */
interface ParticleLook {
  readonly color: number
  readonly sizeFrom: number
  readonly sizeTo: number
  readonly growth: number
  readonly lifeFrom: number
  readonly lifeTo: number
  readonly opacity: number
  readonly lift: number
  readonly rise: number
  readonly spread: number
  readonly drag: number
  readonly fadeIn: number
}

const LOOKS: readonly ParticleLook[] = KIND_ORDER.map((kind) => PARTICLES.kinds[kind])
const KIND_INDEX: Readonly<Record<ParticleKind, number>> = {
  dust: 0,
  flour: 1,
  coffee: 2,
}

export interface ParticleField {
  readonly object: THREE.Object3D
  /** Particles alive right now. Never more than `PARTICLES.max`. */
  readonly live: number
  /** Particles ever spawned. The verification counts emissions with it. */
  readonly emitted: number
  /**
   * One puff off a wheel. `(vx, vz)` is the velocity it inherits — the wake —
   * and `strength` (0..1) is how hard the tyre is working, which decides how
   * big and how opaque it comes out.
   */
  spawn(
    kind: ParticleKind,
    x: number,
    y: number,
    z: number,
    vx: number,
    vz: number,
    strength: number,
  ): void
  /** A ring of particles thrown outwards: a car coming down off the ramp. */
  burst(
    kind: ParticleKind,
    x: number,
    y: number,
    z: number,
    count: number,
    speed: number,
  ): void
  /** Moves every live particle. Call once per PHYSICS tick. */
  update(dt: number): void
  /** Writes the interpolated positions. Call once per FRAME. */
  present(alpha: number): void
  /** Wipes the lot. A new race starts on a clean table, like the skid marks. */
  clear(): void
  dispose(): void
}

/**
 * A round, soft blob built from numbers — no canvas, so the module can be
 * simulated in Node, and no file, so there is nothing to load or to credit.
 */
function createSoftSprite(): THREE.DataTexture {
  const size = PARTICLES.sprite.resolution
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = ((x + 0.5) / size) * 2 - 1
      const dy = ((y + 0.5) / size) * 2 - 1
      const falloff = Math.max(0, 1 - Math.hypot(dx, dy))
      const offset = (y * size + x) * 4
      data[offset] = 255
      data[offset + 1] = 255
      data[offset + 2] = 255
      data[offset + 3] = Math.round(255 * Math.pow(falloff, PARTICLES.sprite.falloff))
    }
  }
  const texture = new THREE.DataTexture(data, size, size)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

export function createParticles(): ParticleField {
  const max = PARTICLES.max

  const positions = new Float32Array(max * 3)
  // Four components so every particle can fade on its own; three.js switches
  // the shader to vec4 vertex colours when the attribute has itemSize 4.
  const colors = new Float32Array(max * 4)
  const sizes = new Float32Array(max)

  const geometry = new THREE.BufferGeometry()
  const positionAttribute = new THREE.BufferAttribute(positions, 3)
  const colorAttribute = new THREE.BufferAttribute(colors, 4)
  const sizeAttribute = new THREE.BufferAttribute(sizes, 1)
  geometry.setAttribute('position', positionAttribute)
  geometry.setAttribute('color', colorAttribute)
  geometry.setAttribute('particleSize', sizeAttribute)
  // The live range of a ring buffer wraps and cannot be expressed as one draw
  // range, so the whole buffer is drawn and dead slots sit at size 0.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4)

  const sprite = createSoftSprite()
  const material = new THREE.PointsMaterial({
    // UNLIT on purpose: a lit particle costs a light loop per fragment and
    // looks wrong on something this small anyway.
    size: 1,
    sizeAttenuation: true,
    map: sprite,
    vertexColors: true,
    transparent: true,
    // Flat, overlapping puffs: writing depth would make them cut each other.
    depthWrite: false,
  })
  // PointsMaterial has ONE size for every point. Multiplying it by a
  // per-particle attribute is the whole patch, and it keeps three's own
  // plumbing (fog, size attenuation, vertex alpha) instead of replacing it
  // with a hand-written shader. If the chunk ever moves, every particle falls
  // back to the material's size — a wrong size, never a broken frame.
  material.onBeforeCompile = (shader): void => {
    shader.vertexShader = `attribute float particleSize;\n${shader.vertexShader}`.replace(
      'gl_PointSize = size;',
      'gl_PointSize = size * particleSize;',
    )
  }

  const points = new THREE.Points(geometry, material)
  points.name = 'particles'
  points.frustumCulled = false
  points.renderOrder = PARTICLES.renderOrder
  points.castShadow = false
  points.receiveShadow = false

  const px = new Float32Array(max)
  const py = new Float32Array(max)
  const pz = new Float32Array(max)
  // Where the particle stood at the START of the tick, for the interpolation.
  const ox = new Float32Array(max)
  const oy = new Float32Array(max)
  const oz = new Float32Array(max)
  const vx = new Float32Array(max)
  const vy = new Float32Array(max)
  const vz = new Float32Array(max)
  const age = new Float32Array(max)
  const life = new Float32Array(max)
  const size0 = new Float32Array(max)
  const alpha0 = new Float32Array(max)
  /** The table under the particle: a droplet lands, it does not sink. */
  const floorY = new Float32Array(max)
  const kinds = new Uint8Array(max)
  const alive = new Uint8Array(max)

  const tint = new THREE.Color()
  let head = 0
  let live = 0
  let emitted = 0
  /** Length of the last tick, so `present` can age a particle sub-tick too. */
  let lastDt = 0

  const kill = (slot: number): void => {
    alive[slot] = 0
    sizes[slot] = 0
    colors[slot * 4 + 3] = 0
  }

  const add = (
    kind: ParticleKind,
    x: number,
    y: number,
    z: number,
    velocityX: number,
    velocityY: number,
    velocityZ: number,
    strength: number,
  ): void => {
    const index = KIND_INDEX[kind]
    const look = LOOKS[index]
    const slot = head
    head = (head + 1) % max
    // Recycling a slot that is still alive keeps the count the same: this is
    // what makes the ceiling a ceiling instead of a wish.
    if (alive[slot] === 0) live += 1
    alive[slot] = 1
    emitted += 1

    px[slot] = x
    py[slot] = y
    pz[slot] = z
    ox[slot] = x
    oy[slot] = y
    oz[slot] = z
    vx[slot] = velocityX
    vy[slot] = velocityY
    vz[slot] = velocityZ
    age[slot] = 0
    life[slot] = look.lifeFrom + (look.lifeTo - look.lifeFrom) * Math.random()
    const scale = 0.55 + 0.45 * strength
    size0[slot] = (look.sizeFrom + (look.sizeTo - look.sizeFrom) * Math.random()) * scale
    alpha0[slot] = look.opacity * (0.5 + 0.5 * strength)
    floorY[slot] = y
    kinds[slot] = index

    tint.setHex(look.color)
    const base = slot * 4
    colors[base] = tint.r
    colors[base + 1] = tint.g
    colors[base + 2] = tint.b
    colors[base + 3] = 0
    sizes[slot] = size0[slot]
  }

  return {
    object: points,
    get live(): number {
      return live
    },
    get emitted(): number {
      return emitted
    },

    spawn(kind, x, y, z, velocityX, velocityZ, strength): void {
      const look = LOOKS[KIND_INDEX[kind]]
      const spread = look.spread
      add(
        kind,
        x,
        y + PARTICLES.spawnLift,
        z,
        velocityX + (Math.random() * 2 - 1) * spread,
        look.rise * (0.6 + 0.8 * Math.random()),
        velocityZ + (Math.random() * 2 - 1) * spread,
        strength,
      )
    },

    burst(kind, x, y, z, count, speed): void {
      for (let index = 0; index < count; index += 1) {
        const angle = Math.random() * Math.PI * 2
        const push = speed * (0.4 + 0.6 * Math.random())
        add(
          kind,
          x,
          y + PARTICLES.spawnLift,
          z,
          Math.cos(angle) * push,
          speed * 0.35 * (0.5 + Math.random()),
          Math.sin(angle) * push,
          1,
        )
      }
    },

    update(dt): void {
      lastDt = dt
      if (live === 0) return
      for (let slot = 0; slot < max; slot += 1) {
        if (alive[slot] === 0) continue
        age[slot] += dt
        if (age[slot] >= life[slot]) {
          kill(slot)
          live -= 1
          continue
        }
        const look = LOOKS[kinds[slot]]
        ox[slot] = px[slot]
        oy[slot] = py[slot]
        oz[slot] = pz[slot]
        vy[slot] += look.lift * dt
        // exp(-drag * dt), so a change of tick rate cannot change the drift.
        const damp = Math.exp(-look.drag * dt)
        vx[slot] *= damp
        vy[slot] *= damp
        vz[slot] *= damp
        px[slot] += vx[slot] * dt
        py[slot] += vy[slot] * dt
        pz[slot] += vz[slot] * dt
        if (py[slot] < floorY[slot]) {
          py[slot] = floorY[slot]
          vy[slot] = 0
        }
      }
    },

    present(alpha): void {
      for (let slot = 0; slot < max; slot += 1) {
        if (alive[slot] === 0) continue
        const look = LOOKS[kinds[slot]]
        const base = slot * 3
        positions[base] = ox[slot] + (px[slot] - ox[slot]) * alpha
        positions[base + 1] = oy[slot] + (py[slot] - oy[slot]) * alpha
        positions[base + 2] = oz[slot] + (pz[slot] - oz[slot]) * alpha
        // The age is a tick behind the drawn position; walking it back by the
        // unspent part of the tick keeps the fade as smooth as the movement.
        const drawnAge = Math.max(0, age[slot] - (1 - alpha) * lastDt)
        const t = Math.min(1, drawnAge / life[slot])
        const fadeIn = look.fadeIn > 0 ? Math.min(1, t / look.fadeIn) : 1
        colors[slot * 4 + 3] = alpha0[slot] * fadeIn * (1 - t)
        sizes[slot] = size0[slot] * (1 + (look.growth - 1) * t)
      }
      positionAttribute.needsUpdate = true
      colorAttribute.needsUpdate = true
      sizeAttribute.needsUpdate = true
    },

    clear(): void {
      for (let slot = 0; slot < max; slot += 1) kill(slot)
      live = 0
      head = 0
      colorAttribute.needsUpdate = true
      sizeAttribute.needsUpdate = true
    },

    dispose(): void {
      geometry.dispose()
      material.dispose()
      sprite.dispose()
    },
  }
}
