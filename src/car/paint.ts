/**
 * Body paint for the two cars.
 *
 * Every model in a Kenney kit samples ONE shared `colormap.png`, so a plain
 * `material.color = orange` would not paint a car — it would tint the windows,
 * the lights, the tyres and, because the material instance is shared, the other
 * car as well. What this module does instead is repaint a private copy of the
 * atlas per car: the body panels are the only green in the kit's palette, so
 * the green band is moved to the car's own hue and every other texel is left
 * exactly as it was.
 *
 * Pure colour maths, no Three.js and no imports — `carView` hands it a canvas
 * pixel buffer, and the Node verification runs the same function over the real
 * PNG.
 */

export interface CarPaint {
  /** Target hue, 0..1. */
  hue: number
  /** Target saturation, 0..1. */
  saturation: number
  /** Added to the texel's own lightness, so the baked-in shading survives. */
  lightnessShift: number
}

/**
 * The green band in the car atlas, measured from the two bodies' own UVs: every
 * body texel lands in hue 0.39..0.47 with saturation 0.41..0.62, while the
 * windows sit at hue ~0.65 with saturation below 0.25 and the lights at hue
 * ~0.10. The band is widened a little for safety and floored on saturation, so
 * a grey or a cream texel can never be caught by it.
 */
export const PAINT_SOURCE = {
  hueMin: 0.36,
  hueMax: 0.5,
  minSaturation: 0.25,
} as const

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/** sRGB bytes to HSL, all components 0..1. */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2
  const delta = max - min
  if (delta === 0) return [0, 0, lightness]

  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let hue: number
  if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0)
  else if (max === green) hue = (blue - red) / delta + 2
  else hue = (red - green) / delta + 4
  return [hue / 6, saturation, lightness]
}

function hueToChannel(p: number, q: number, t: number): number {
  let time = t
  if (time < 0) time += 1
  if (time > 1) time -= 1
  if (time < 1 / 6) return p + (q - p) * 6 * time
  if (time < 1 / 2) return q
  if (time < 2 / 3) return p + (q - p) * (2 / 3 - time) * 6
  return p
}

/** HSL back to sRGB bytes. */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const grey = Math.round(l * 255)
    return [grey, grey, grey]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [
    Math.round(hueToChannel(p, q, h + 1 / 3) * 255),
    Math.round(hueToChannel(p, q, h) * 255),
    Math.round(hueToChannel(p, q, h - 1 / 3) * 255),
  ]
}

/**
 * Repaints the body-panel texels of an RGBA pixel buffer in place. Alpha and
 * every texel outside the paint band are untouched. Returns how many texels
 * were repainted, which is what the verification asserts on.
 */
export function repaintPixels(pixels: Uint8ClampedArray, paint: CarPaint): number {
  let repainted = 0
  for (let index = 0; index < pixels.length; index += 4) {
    const [hue, saturation, lightness] = rgbToHsl(pixels[index], pixels[index + 1], pixels[index + 2])
    if (hue < PAINT_SOURCE.hueMin || hue > PAINT_SOURCE.hueMax) continue
    if (saturation < PAINT_SOURCE.minSaturation) continue

    const [r, g, b] = hslToRgb(paint.hue, paint.saturation, clamp01(lightness + paint.lightnessShift))
    pixels[index] = r
    pixels[index + 1] = g
    pixels[index + 2] = b
    repainted += 1
  }
  return repainted
}
