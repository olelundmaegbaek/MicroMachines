# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**MicroMachines** — a small browser racing game in the spirit of the old
*Micro Machines*: two toy cars drifting around a **kitchen table**, seen from a
high, tilted chase camera. Local 2-player on **one keyboard**, **horizontal
splitscreen** (player 1 on top, player 2 below). One track, no AI opponents.

Look and feel: **cartoonish and playful**. Chunky low-poly toy cars, saturated
colours, soft shadows, dust and flour puffs. Nothing photoreal.

## Stack

Vite + TypeScript + Three.js. No UI framework — the HUD is plain DOM over the
canvas. No physics engine: the car model is a hand-written arcade drift model
(see below). Deployed as a static build to GitHub Pages.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build into dist/
npm run preview
```

## Hard rules

- **One renderer, two viewports.** Splitscreen is done with
  `renderer.setScissorTest(true)` + `setViewport`/`setScissor` per player, NOT
  two `WebGLRenderer` instances. Two renderers double every GL state change and
  cost far more than the scissor approach.
- **Fixed timestep.** Physics runs at a fixed 60 Hz accumulator; rendering
  interpolates between the previous and current physics state. Never integrate
  physics with the raw rAF delta — the handling would change with refresh rate,
  and a 144 Hz machine would drift differently from a 60 Hz one.
- **Collision is 2D.** The table is flat, so all collision runs in the XZ plane
  (circles for cars and props, a polyline for the track edge). Y is used only
  for ramps and for falling off the table.
- **Track data lives in one file** (`src/track/kitchenTable.ts`): a centre-line
  spline, road width, checkpoints, surface zones and prop placements. Adding a
  second track later must not require touching the renderer or the car model.
- **No trademarks.** The two cars are *look-alikes* with invented names, see
  below. Never put a real manufacturer's name, badge or model designation in
  code, assets or UI.
- **Assets must be CC0.** Everything bundled is CC0 or written by us. Record the
  source of every asset in `public/assets/CREDITS.md` even though CC0 requires
  no attribution.

## Game design

- **Cars:** `soba-supreme` (a 90s Japanese turbo coupé silhouette: long nose,
  fastback, big rear wing) and `porcini-911` (a rear-engined German silhouette:
  round headlights, sloping tail, ducktail spoiler).
- **Race:** 3 laps, countdown, first car across the line wins. HUD shows lap,
  position and lap time. Winner screen with a "kør igen" button.
- **Cars collide with each other** and can shove the opponent off the table.
- **Falling off the table** respawns the car at its last passed checkpoint after
  a short delay.
- **Surface zones** change grip: spilled coffee and flour are slippery.
- **Audio** is generated in Web Audio (engine tone follows speed, tyre squeal on
  slip, thump on impact). No audio files.

## Controls

| | Speeder | Bremse/bak | Venstre | Højre | Håndbremse |
|---|---|---|---|---|---|
| Spiller 1 | `W` | `S` | `A` | `D` | `Left Shift` |
| Spiller 2 | `↑` | `↓` | `←` | `→` | `Right Shift` |

WASD plus the arrow cluster is the pairing least likely to hit keyboard
ghosting on cheap membrane keyboards. Do not move either player onto the number
row or onto `IJKL`.

## Language

UI text is **Danish**. Code, comments, file names and commit messages are
English.

## Conventions established while building (do not rediscover these)

### Heading

`heading` is a yaw in radians. **Zero points along +Z**, and it **increases
counter-clockwise seen from above**, which is a left turn. Forward is
`(sin h, 0, cos h)`, which is exactly what `object.rotation.y = heading` gives a
mesh whose nose points down its own +Z. Both Kenney car models do point +Z,
confirmed from the `wheel-front-*` node positions and, on `sedan-sports`, the
`spoiler` node at −Z. No yaw correction is applied anywhere.

Any interpolation of a heading must take the **short way around ±π**. A naive
lerp between 3.1 and −3.1 sends the camera the whole way round.

### Scale

One world unit is about 1.75 cm. A car is 4.0 long, 1.8 wide, 1.3 tall. The
table is 130 × 70 with its surface at `y = 0`. The floor far below is at
`FLOOR_Y`, so driving off the edge reads as a fall rather than as the end of the
world.

Uniform scaling to a 4.0 length makes the two Kenney bodies slightly different
widths, because they are equally wide in their own space but differently long.
The physics is shared, so this is cosmetic, not unfair.

### Where the feel is tuned

| what | object | file |
|---|---|---|
| handling | `CAR_TUNING` | `src/car/physics.ts` |
| car-to-car shoving | `CAR_COLLISION` | `src/car/collision.ts` |
| skid marks | `SKID_MARKS` | `src/car/skidMarks.ts` |
| camera | `CHASE_CAMERA` | `src/render/chaseCamera.ts` |
| lights, fog, shadow | `SCENE_LOOK` | `src/render/scene.ts` |
| exposure, tone mapping | `RENDER_LOOK` | `src/render/renderer.ts` |
| the circuit | see `docs/TRACK.md` | `src/track/kitchenTable.ts` |

Nothing that changes how the game feels may be written inline. It goes in one of
these objects.

### Framerate independence

Physics runs on a fixed 1/60 s accumulator, capped at five ticks per frame.
Anything that decays over time uses `exp(-rate * dt)`, never a linear
subtraction, so a change of tick rate cannot change the handling. This is
measured, not assumed: a fourfold change in tick rate moves the result by 0.02
percent.

The chase camera is the one exception. It smooths on real frame time, because it
is purely visual and would otherwise stutter on a display faster than 60 Hz.

### three r186 gotchas

- **`PCFSoftShadowMap` was removed.** Setting it logs a warning and silently
  falls back, and `shadow.radius` becomes a dead control. `PCFShadowMap` is the
  soft one now.
- **Kenney GLB files reference their texture as an external relative URI**
  (`Textures/colormap.png`), not as embedded data. Each kit keeps its own
  `Textures/` folder beside its models, and moving a `.glb` without it renders
  the model untextured white.
- **A Kenney kit shares one colormap atlas across every model in it**, so
  `material.color` cannot recolour one car: the atlas paint is green, and green
  times orange is muddy olive. Each car gets a private hue-shifted copy of the
  atlas instead, touching only the paint band so windows and headlights survive.
  See `src/car/paint.ts`.

### Verification without a browser

There is no browser available in the build environment, so nothing here has been
judged by eye. Every phase is verified numerically in Node against the real
modules: physics is stepped and measured, GLB files are parsed for their actual
bounding boxes and node names, and geometry is checked for self-intersection and
minimum radius. Do the same. A claim that something "should look right" is not
verification.
