/**
 * The two cars as DATA: the file, the invented name, the line the car select
 * shows, and the liveries each one can be painted in.
 *
 * Three-free and DOM-free on purpose. `carView.ts` turns a spec into a mesh and
 * `ui/hud.ts` writes the same name on the screen, but neither of them owns the
 * list — a third car is one entry here and nothing else.
 */

import type { CarSound } from '../audio/carSound'
import type { CarPaint } from './paint'

export interface CarLivery {
  /** Danish colour name, shown under the car in the select screen. */
  name: string
  paint: CarPaint
}

export interface CarSpec {
  /** File name under public/assets/cars/. */
  file: string
  /** In-game name. Look-alikes with invented names — never a real badge. */
  name: string
  /** The smile in the car select, verbatim from docs/UI.md. */
  description: string
  /**
   * Two paints, because both players may pick the SAME car and still have to
   * read apart in a splitscreen half. Index 0 is the car's own colour, the one
   * docs/UI.md names; index 1 is the spare, and it differs in hue AND in
   * lightness so the two cars are told apart on a small, bright picture.
   */
  liveries: readonly [CarLivery, CarLivery]
  /**
   * How the car sounds. The two cars DRIVE identically and always will (see
   * docs/UI.md), but two engines on one set of speakers have to be told apart
   * by ear, or the splitscreen is one undifferentiated drone.
   */
  sound: CarSound
}

export const CAR_CATALOG: readonly [CarSpec, CarSpec] = [
  {
    file: 'hatchback-sports.glb',
    name: 'Soba Supreme',
    description:
      'Lang næse, stor vinge, og en bagende der gerne vil ud at køre for sig selv.',
    liveries: [
      { name: 'orange-rød', paint: { hue: 0.035, saturation: 0.82, lightnessShift: 0 } },
      { name: 'turkis', paint: { hue: 0.5, saturation: 0.72, lightnessShift: 0.12 } },
    ],
    // The turbo four: high, thin and raspy, with a fifth on top that makes it
    // sound busy. A saw through an open filter is the nearest a synthesised
    // engine gets to a small motor with too few gears.
    sound: {
      idleHz: 64,
      topHz: 330,
      revCurve: 0.78,
      wave: 'sawtooth',
      overtone: 1.5,
      overtoneWave: 'square',
      overtoneMix: 0.35,
      toneHz: 540,
      brightHz: 3200,
      wobbleHz: 6.3,
      squealTilt: 1.08,
    },
  },
  {
    file: 'sedan-sports.glb',
    name: 'Porcini 911',
    description:
      'Kort, bred og stædig. Motoren sidder bagi, og det kan mærkes i svingene.',
    liveries: [
      { name: 'sandfarvet', paint: { hue: 0.105, saturation: 0.5, lightnessShift: 0.3 } },
      { name: 'blå', paint: { hue: 0.6, saturation: 0.7, lightnessShift: -0.08 } },
    ],
    // The engine sits in the back and it is a bigger one: a fifth lower, an
    // octave instead of a fifth on top, and a filter kept shut, so it rumbles
    // where the other car rasps.
    sound: {
      idleHz: 46,
      topHz: 232,
      revCurve: 0.66,
      wave: 'square',
      overtone: 2,
      overtoneWave: 'sawtooth',
      overtoneMix: 0.42,
      toneHz: 380,
      brightHz: 2400,
      wobbleHz: 4.7,
      squealTilt: 0.92,
    },
  },
]

/**
 * Which livery each player drives, from what everyone picked. The nth player on
 * a car gets the nth livery, so two players on the same car never share a
 * colour — and a player on a car of their own always gets its own colour.
 */
export function assignLiveries(cars: readonly number[]): number[] {
  const taken = new Map<number, number>()
  return cars.map((car) => {
    const used = taken.get(car) ?? 0
    taken.set(car, used + 1)
    const spec = CAR_CATALOG[car]
    const last = spec ? spec.liveries.length - 1 : 0
    return Math.min(used, last)
  })
}

/**
 * The same paint as a CSS colour, so the HUD accent cannot drift away from the
 * car it belongs to: both come from the one `CarPaint`.
 */
export function liveryCss(livery: CarLivery): string {
  const { hue, saturation, lightnessShift } = livery.paint
  const lightness = Math.min(1, Math.max(0, 0.5 + lightnessShift))
  return `hsl(${Math.round(hue * 360)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%)`
}
