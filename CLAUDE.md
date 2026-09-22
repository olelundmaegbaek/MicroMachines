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
