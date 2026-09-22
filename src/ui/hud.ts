/**
 * Everything the player reads: the three numbers in each half, the countdown,
 * the car select and the winner screen.
 *
 * Plain DOM over the canvas, as docs/UI.md requires — sharper than geometry,
 * free to draw, and it can sit in both halves at once, which no camera in the
 * scene can. There is NO game logic in here: the HUD is handed a finished
 * `GameState` and only decides what that looks like. Nothing in this module
 * touches `document` until `createHud` is called, so the pure parts (the clock
 * format, the praise line) can be read straight from Node.
 */

import { CAR_CATALOG, assignLiveries, liveryCss } from '../car/catalog'
import { FINISH_CHOICES, RACE, type FinishChoice, type GameState } from '../game/state'

/** Every number the HUD is drawn from. Sizes live in style.css, in vh. */
export const HUD = {
  /**
   * The speedometer is toy fantasy, not telemetry: docs/UI.md says the number
   * is cosmetic and only has to move. 46 u/s of top speed reads as 200.
   */
  speedScale: 4.35,
  /** A countdown number lands big and settles over its second. */
  numberScaleFrom: 1.5,
  numberScaleTo: 0.95,
  /** "KØR!" does the opposite: it grows out of the screen and fades. */
  goScaleFrom: 1,
  goScaleTo: 1.7,
  /** How much of the "KØR!" step stays fully opaque before it fades. */
  goHoldFraction: 0.45,
} as const

/**
 * Menu hints. The keys themselves are bound in `core/input.ts`; the menus
 * deliberately reuse the driving keys, so there is nothing new to learn and no
 * mouse anywhere — steering picks, the accelerator confirms, the brake undoes.
 */
const MENU_HINTS: readonly { pick: string; accept: string; undo: string }[] = [
  { pick: 'A / D vælger', accept: 'W er klar', undo: 'S fortryder' },
  { pick: '← / → vælger', accept: '↑ er klar', undo: '↓ fortryder' },
]

const CHOICE_LABELS: Readonly<Record<FinishChoice, string>> = {
  again: 'Kør igen',
  'change-car': 'Skift bil',
}

export interface HudView {
  state: GameState
  /** Signed forward speed per player, in world units per second. */
  speeds: readonly number[]
  /** True while that player's car is off the table on its way down. */
  falling: readonly boolean[]
}

export interface Hud {
  update(view: HudView): void
  dispose(): void
}

/** Ticks as a Danish clock: `9,21` and, past a minute, `1:04,55`. */
export function formatRaceTime(ticks: number): string {
  const seconds = Math.max(0, ticks) / RACE.ticksPerSecond
  const minutes = Math.floor(seconds / 60)
  const rest = seconds - minutes * 60
  const text = rest.toFixed(2).replace('.', ',')
  if (minutes === 0) return text
  return `${minutes}:${rest < 10 ? '0' : ''}${text}`
}

/** "1 omgang", "2 omgange" — Danish counts them differently. */
export function lapWord(laps: number): string {
  return laps === 1 ? '1 omgang' : `${laps} omgange`
}

/**
 * The line that praises the runner-up. It is a game for two at the same table:
 * the one who lost still has to be told they drove well.
 */
export function praiseLine(state: GameState, loser: number): string {
  const player = state.players[loser]
  const name = `Spiller ${loser + 1}`
  if (!player) return `${name} kørte flot.`
  const winner = state.winner === null ? null : state.players[state.winner]
  if (player.finishTick !== null && winner != null && winner.finishTick !== null) {
    const gap = formatRaceTime(player.finishTick - winner.finishTick)
    return `${name} kom i mål kun ${gap} sekunder efter. Det var tæt.`
  }
  if (player.lapTicks.length > 0) {
    const best = formatRaceTime(Math.min(...player.lapTicks))
    return `${name} nåede ${lapWord(player.lapTicks.length)} med ${best} som hurtigste — det sidder næste gang.`
  }
  return `${name} gav den gas hele vejen — det sidder næste gang.`
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** Writes only when it changed: the HUD runs every frame. */
function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text
}

function setHidden(node: HTMLElement, hidden: boolean): void {
  if (node.hidden !== hidden) node.hidden = hidden
}

interface HalfElements {
  root: HTMLDivElement
  lapValue: HTMLSpanElement
  lapBanner: HTMLDivElement
  lapBlock: HTMLDivElement
  place: HTMLSpanElement
  speed: HTMLSpanElement
  note: HTMLDivElement
  selectName: HTMLDivElement
  selectSwatch: HTMLSpanElement
  selectColor: HTMLSpanElement
  selectDescription: HTMLDivElement
  selectState: HTMLDivElement
  selectPanel: HTMLDivElement
}

function buildHalf(player: number): HalfElements {
  const root = el('div', `hud-half hud-half--${player + 1}`)

  const corner = el('div', 'hud-corner')
  const row = el('div', 'hud-row')

  const lapBlock = el('div', 'hud-block hud-block--lap')
  const lapValue = el('span', 'hud-big')
  const lapLabel = el('span', 'hud-label', 'OMGANG')
  lapBlock.append(lapValue, lapLabel)
  const lapBanner = el('div', 'hud-banner', 'SIDSTE OMGANG')

  const placeBlock = el('div', 'hud-block hud-block--place')
  const place = el('span', 'hud-big')
  const placeLabel = el('span', 'hud-label', 'PLADS')
  placeBlock.append(place, placeLabel)

  row.append(lapBlock, lapBanner, placeBlock)

  const speedBlock = el('div', 'hud-speed')
  const speed = el('span', 'hud-speed-value')
  const speedLabel = el('span', 'hud-label', 'km/t')
  speedBlock.append(speed, speedLabel)

  corner.append(row, speedBlock)

  const note = el('div', 'hud-note')

  const selectPanel = el('div', 'hud-select')
  const selectPlayer = el('div', 'hud-select-player', `SPILLER ${player + 1}`)
  const picker = el('div', 'hud-picker')
  const leftArrow = el('span', 'hud-arrow', '◀')
  const rightArrow = el('span', 'hud-arrow', '▶')
  const selectCar = el('div', 'hud-select-car')
  const selectName = el('div', 'hud-select-name')
  const colorLine = el('div', 'hud-select-colorline')
  const selectSwatch = el('span', 'hud-swatch')
  const selectColor = el('span', 'hud-select-color')
  colorLine.append(selectSwatch, selectColor)
  selectCar.append(selectName, colorLine)
  picker.append(leftArrow, selectCar, rightArrow)
  const selectDescription = el('div', 'hud-select-desc')
  const selectState = el('div', 'hud-select-state')
  selectPanel.append(selectPlayer, picker, selectDescription, selectState)

  root.append(corner, note, selectPanel)

  return {
    root,
    lapValue,
    lapBanner,
    lapBlock,
    place,
    speed,
    note,
    selectName,
    selectSwatch,
    selectColor,
    selectDescription,
    selectState,
    selectPanel,
  }
}

export function createHud(container: HTMLElement, playerCount = 2): Hud {
  const root = el('div', 'hud')
  const halves: HalfElements[] = []
  for (let player = 0; player < playerCount; player += 1) {
    const half = buildHalf(player)
    halves.push(half)
    root.append(half.root)
  }

  const centre = el('div', 'hud-centre')
  const countdown = el('div', 'hud-countdown')
  const winner = el('div', 'hud-winner')
  const winnerEyebrow = el('div', 'hud-winner-eyebrow')
  const winnerName = el('div', 'hud-winner-name')
  const winnerTime = el('div', 'hud-winner-time')
  const winnerTimeLabel = el('div', 'hud-label', 'SAMLET TID')
  const lapList = el('ul', 'hud-laplist')
  const lapRows: { row: HTMLLIElement; time: HTMLSpanElement }[] = []
  for (let lap = 0; lap < RACE.laps; lap += 1) {
    const row = el('li', 'hud-laprow')
    const index = el('span', 'hud-lapindex', `${lap + 1}.`)
    const time = el('span', 'hud-laptime', '—')
    row.append(index, time)
    lapList.append(row)
    lapRows.push({ row, time })
  }
  const praise = el('div', 'hud-praise')
  const choices = el('div', 'hud-choices')
  const choiceNodes = FINISH_CHOICES.map((choice) =>
    el('div', 'hud-choice', CHOICE_LABELS[choice]),
  )
  choices.append(...choiceNodes)
  const hint = el('div', 'hud-hint', '◀ ▶ vælger · W eller ↑ bekræfter')
  winner.append(winnerEyebrow, winnerName, winnerTime, winnerTimeLabel, lapList, praise, choices, hint)
  centre.append(countdown, winner)
  root.append(centre)

  container.append(root)

  const updateHalf = (view: HudView, player: number, livery: number): void => {
    const half = halves[player]
    const state = view.state
    const selection = state.selection[player]
    const spec = CAR_CATALOG[selection.car]
    const paint = spec.liveries[livery]
    half.root.style.setProperty('--player-color', liveryCss(paint))

    const race = state.players[player]
    const showBanner = race.lastLapNoticeTicks > 0
    setHidden(half.lapBlock, showBanner)
    setHidden(half.lapBanner, !showBanner)
    setText(half.lapValue, `${race.lap}/${RACE.laps}`)
    setText(half.place, `${race.position}.`)
    const speed = Math.abs(view.speeds[player] ?? 0) * HUD.speedScale
    setText(half.speed, `${Math.round(speed)}`)

    // One slot, three messages, in the order they matter: a car in mid-air
    // has more to say than a lap counter.
    let note = ''
    if (view.falling[player]) note = 'Hovsa!'
    else if (race.finishNoticeTicks > 0) note = 'I MÅL!'
    setText(half.note, note)
    setHidden(half.note, note === '')

    setText(half.selectName, spec.name)
    setText(half.selectColor, paint.name)
    half.selectSwatch.style.background = liveryCss(paint)
    setText(half.selectDescription, spec.description)
    const hints = MENU_HINTS[player] ?? MENU_HINTS[0]
    setText(
      half.selectState,
      selection.ready ? `KLAR! · ${hints.undo}` : `${hints.pick} · ${hints.accept}`,
    )
    half.selectPanel.classList.toggle('hud-select--ready', selection.ready)
  }

  const updateCountdown = (state: GameState): void => {
    const step = state.countdownStep
    setHidden(countdown, step === null)
    if (step === null) return

    const pulse = Math.min(1, Math.max(0, state.countdownPulse))
    if (step === 0) {
      setText(countdown, 'KØR!')
      const scale = lerp(HUD.goScaleFrom, HUD.goScaleTo, pulse)
      countdown.style.transform = `scale(${scale.toFixed(3)})`
      const fade = Math.max(0, (pulse - HUD.goHoldFraction) / (1 - HUD.goHoldFraction))
      countdown.style.opacity = (1 - fade).toFixed(3)
      countdown.classList.add('hud-countdown--go')
      return
    }
    setText(countdown, `${step}`)
    const scale = lerp(HUD.numberScaleFrom, HUD.numberScaleTo, pulse)
    countdown.style.transform = `scale(${scale.toFixed(3)})`
    countdown.style.opacity = '1'
    countdown.classList.remove('hud-countdown--go')
  }

  const updateWinner = (state: GameState, liveries: readonly number[]): void => {
    const index = state.winner
    if (index === null) return
    const race = state.players[index]
    const spec = CAR_CATALOG[state.selection[index].car]
    const paint = spec.liveries[liveries[index]]
    winner.style.setProperty('--player-color', liveryCss(paint))

    setText(winnerEyebrow, `SPILLER ${index + 1} VINDER`)
    setText(winnerName, spec.name)
    setText(winnerTime, formatRaceTime(race.finishTick ?? 0))

    const best = race.lapTicks.length > 0 ? Math.min(...race.lapTicks) : null
    lapRows.forEach((row, lap) => {
      const ticks = race.lapTicks[lap]
      setText(row.time, ticks === undefined ? '—' : formatRaceTime(ticks))
      row.row.classList.toggle('hud-laprow--best', ticks !== undefined && ticks === best)
    })

    const loser = state.players.findIndex((_, player) => player !== index)
    setText(praise, loser < 0 ? '' : praiseLine(state, loser))

    choiceNodes.forEach((node, choice) => {
      node.classList.toggle('hud-choice--active', choice === state.choice)
    })
  }

  return {
    update(view): void {
      const state = view.state
      if (root.dataset.phase !== state.phase) root.dataset.phase = state.phase
      const liveries = assignLiveries(state.selection.map((entry) => entry.car))
      for (let player = 0; player < halves.length; player += 1) {
        updateHalf(view, player, liveries[player])
      }
      updateCountdown(state)
      if (state.phase === 'finished') updateWinner(state, liveries)
    },
    dispose(): void {
      root.remove()
    },
  }
}
