/**
 * The race: car select, countdown, three laps, winner screen.
 *
 * A pure state machine. No Three.js, no DOM, and above all no wall clock — it
 * is driven by one `tick` per PHYSICS tick and reads the two cars only as plain
 * numbers, so a whole race can be run from Node and a lap time is the same at
 * 30, 60 or 144 frames per second.
 *
 * It does NOT count laps. `track/progress.ts` already does that from unrolled
 * arc length, with the checkpoint order that closes the shortcut across the
 * table, and this file only watches that counter go up. Position is decided on
 * the same unrolled arc length, which is why it works across laps: the car on
 * lap 3 simply has a bigger `s` than the car on lap 2.
 */

/** Every number the race is made of. Nothing here may be written inline. */
export const RACE = {
  laps: 3,
  /**
   * Physics ticks per second. It mirrors `PHYSICS.fixedStep` (1/60), but this
   * module must not import the renderer's constants to say how long a second
   * is — it counts ticks, and this is only how they are read back out.
   */
  ticksPerSecond: 60,
  /** "Når begge har trykket klar, går der et sekund og så starter nedtællingen." */
  readyTicks: 60,
  /** One second per number: 3, 2, 1. */
  countdownStepTicks: 60,
  countdownSteps: 3,
  /** How long "KØR!" stays up after the cars are released. */
  goTicks: 45,
  /**
   * What the runner-up gets after the winner has crossed. Long enough to come
   * home from the last corner, short enough that nobody sits and waits: the
   * race is already decided, this is only the drive home.
   */
  graceTicks: 300,
  /** "SIDSTE OMGANG" in the player's own half. */
  lastLapNoticeTicks: 120,
  /** "I MÅL!" in the finisher's own half. */
  finishNoticeTicks: 120,
} as const

/** Total length of the countdown phase, from both-ready to "KØR!". */
export const COUNTDOWN_TICKS = RACE.readyTicks + RACE.countdownSteps * RACE.countdownStepTicks

export type RacePhase = 'select' | 'countdown' | 'race' | 'finished'

/** What a menu key press means. The caller edge-triggers these. */
export type MenuAction = 'left' | 'right' | 'accept' | 'back'

/** The winner screen's two choices, in the order they are shown. */
export const FINISH_CHOICES = ['again', 'change-car'] as const
export type FinishChoice = (typeof FINISH_CHOICES)[number]

/**
 * The parts of `TrackCarProgress` the race reads. Structural on purpose, so
 * this module never imports the track (and the verification can feed it hand
 * built numbers).
 */
export interface CarProgressSample {
  /** Completed LEGAL laps: checkpoints in order, line crossed forwards. */
  laps: number
  /** Unrolled arc length. Grows past one lap, which is what ranks the cars. */
  s: number
}

export interface PlayerSelection {
  /** Index into the car catalog. */
  readonly car: number
  readonly ready: boolean
}

export interface PlayerRace {
  /** The lap being driven, 1..RACE.laps. Stays at RACE.laps once finished. */
  readonly lap: number
  /** 1 or 2, from arc length — and from the finishing order once home. */
  readonly position: number
  /** One entry per completed lap, in ticks. They sum to `finishTick`. */
  readonly lapTicks: readonly number[]
  readonly finished: boolean
  /** Race tick the last lap was completed on, else null. */
  readonly finishTick: number | null
  /** Ticks left of the "SIDSTE OMGANG" notice, 0 when it is not showing. */
  readonly lastLapNoticeTicks: number
  /** Ticks left of the "I MÅL!" notice. */
  readonly finishNoticeTicks: number
}

export interface GameState {
  readonly phase: RacePhase
  /** Ticks since this phase began. */
  readonly tick: number
  /** Ticks since the cars were released. 0 before that. */
  readonly raceTick: number
  /**
   * Bumped every time the world must be put back on the grid: a new race, and
   * a return to the car select. `main.ts` watches it and resets the cars, the
   * lap progress, the skid marks and the props.
   */
  readonly resetId: number
  /** While true the controls are ignored and the cars stand still. */
  readonly carsLocked: boolean
  /** 3, 2, 1, then 0 for "KØR!". Null when no countdown is on screen. */
  readonly countdownStep: number | null
  /** 0..1 through the current countdown step, for the pulse. */
  readonly countdownPulse: number
  readonly selection: readonly PlayerSelection[]
  readonly players: readonly PlayerRace[]
  /** The player who took the last lap first. Set the moment they cross. */
  readonly winner: number | null
  /** Ticks the runner-up has left to come home. */
  readonly graceTicks: number
  /** Highlighted choice on the winner screen, an index into FINISH_CHOICES. */
  readonly choice: number
}

export interface Game {
  readonly state: GameState
  /** A menu key press. The caller only sends the press, never the hold. */
  menu(player: number, action: MenuAction): void
  /** One physics tick, with both cars' progress as of the end of that tick. */
  tick(cars: readonly CarProgressSample[]): void
  /** Start (or restart) a race with the current selection. */
  startRace(): void
}

export interface GameOptions {
  playerCount?: number
  /** How many cars the catalog offers, for the left/right wrap. */
  carCount: number
}

interface MutableSelection {
  car: number
  ready: boolean
}

interface MutablePlayer {
  lap: number
  position: number
  lapTicks: number[]
  finished: boolean
  finishTick: number | null
  lastLapNoticeTicks: number
  finishNoticeTicks: number
  /** Laps already booked, so a jump of more than one is still one lap each. */
  seenLaps: number
  /** Race tick the current lap started on. */
  lapStartTick: number
}

interface MutableState {
  phase: RacePhase
  tick: number
  raceTick: number
  resetId: number
  carsLocked: boolean
  countdownStep: number | null
  countdownPulse: number
  selection: MutableSelection[]
  players: MutablePlayer[]
  winner: number | null
  graceTicks: number
  choice: number
}

function freshPlayer(position: number): MutablePlayer {
  return {
    lap: 1,
    position,
    lapTicks: [],
    finished: false,
    finishTick: null,
    lastLapNoticeTicks: 0,
    finishNoticeTicks: 0,
    seenLaps: 0,
    lapStartTick: 0,
  }
}

export function createGame(options: GameOptions): Game {
  const playerCount = options.playerCount ?? 2
  const carCount = Math.max(1, options.carCount)

  const state: MutableState = {
    phase: 'select',
    tick: 0,
    raceTick: 0,
    resetId: 0,
    carsLocked: true,
    countdownStep: null,
    countdownPulse: 0,
    selection: Array.from({ length: playerCount }, () => ({ car: 0, ready: false })),
    players: Array.from({ length: playerCount }, (_, player) => freshPlayer(player + 1)),
    winner: null,
    graceTicks: 0,
    choice: 0,
  }

  const setPhase = (phase: RacePhase): void => {
    state.phase = phase
    state.tick = 0
    // The cars are free in exactly one phase, and that is the whole point of
    // the lock: nothing else in the game has to remember to hold them.
    state.carsLocked = phase !== 'race'
    state.countdownStep = null
    state.countdownPulse = 0
  }

  const resetRace = (): void => {
    state.raceTick = 0
    state.winner = null
    state.graceTicks = 0
    state.choice = 0
    for (let player = 0; player < playerCount; player += 1) {
      state.players[player] = freshPlayer(player + 1)
    }
    state.resetId += 1
  }

  const startRace = (): void => {
    resetRace()
    setPhase('countdown')
  }

  const toSelect = (): void => {
    resetRace()
    for (const selection of state.selection) selection.ready = false
    setPhase('select')
  }

  /** Arc length ranks the cars; once home, the order they came home in does. */
  const rank = (cars: readonly CarProgressSample[]): void => {
    const order = state.players.map((_, player) => player)
    order.sort((a, b) => {
      const first = state.players[a]
      const second = state.players[b]
      if (first.finished && second.finished) {
        return (first.finishTick ?? 0) - (second.finishTick ?? 0)
      }
      if (first.finished !== second.finished) return first.finished ? -1 : 1
      return (cars[b]?.s ?? 0) - (cars[a]?.s ?? 0)
    })
    for (let index = 0; index < order.length; index += 1) {
      state.players[order[index]].position = index + 1
    }
  }

  const countLap = (player: MutablePlayer, index: number): void => {
    player.lapTicks.push(state.raceTick - player.lapStartTick)
    player.lapStartTick = state.raceTick
    player.seenLaps += 1

    if (player.seenLaps >= RACE.laps) {
      player.finished = true
      player.finishTick = state.raceTick
      player.finishNoticeTicks = RACE.finishNoticeTicks
      player.lap = RACE.laps
      if (state.winner === null) {
        state.winner = index
        state.graceTicks = RACE.graceTicks
      }
      return
    }

    player.lap = player.seenLaps + 1
    // The notice fires when the LAST lap begins, not when it ends.
    if (player.lap === RACE.laps) player.lastLapNoticeTicks = RACE.lastLapNoticeTicks
  }

  const updateRace = (cars: readonly CarProgressSample[]): void => {
    state.raceTick += 1

    for (let index = 0; index < playerCount; index += 1) {
      const player = state.players[index]
      const laps = cars[index]?.laps ?? 0
      // A while loop, not an if: a tick that books two laps is impossible on
      // this track, but a lap silently swallowed would be a bug nobody sees.
      while (!player.finished && laps > player.seenLaps) countLap(player, index)
      if (player.lastLapNoticeTicks > 0) player.lastLapNoticeTicks -= 1
      if (player.finishNoticeTicks > 0) player.finishNoticeTicks -= 1
    }

    rank(cars)

    if (state.winner === null) return
    const allHome = state.players.every((player) => player.finished)
    if (state.graceTicks > 0) state.graceTicks -= 1
    if (allHome || state.graceTicks === 0) setPhase('finished')
  }

  const updateCountdown = (): void => {
    const elapsed = state.tick - RACE.readyTicks
    if (elapsed < 0) {
      state.countdownStep = null
      state.countdownPulse = 0
    } else {
      const step = Math.floor(elapsed / RACE.countdownStepTicks)
      state.countdownStep = RACE.countdownSteps - step
      state.countdownPulse = (elapsed % RACE.countdownStepTicks) / RACE.countdownStepTicks
    }
    if (state.tick >= COUNTDOWN_TICKS) {
      setPhase('race')
      // "KØR!" belongs to the racing phase: it is shown at the exact tick the
      // cars are released, not one tick before.
      state.countdownStep = 0
      state.countdownPulse = 0
    }
  }

  const menuSelect = (player: number, action: MenuAction): void => {
    const selection = state.selection[player]
    if (!selection) return
    switch (action) {
      case 'left':
      case 'right':
        if (selection.ready) return
        selection.car = (selection.car + (action === 'right' ? 1 : carCount - 1)) % carCount
        return
      case 'accept':
        selection.ready = true
        if (state.selection.every((entry) => entry.ready)) startRace()
        return
      case 'back':
        selection.ready = false
        return
    }
  }

  const menuFinished = (action: MenuAction): void => {
    switch (action) {
      case 'left':
      case 'right': {
        const step = action === 'right' ? 1 : FINISH_CHOICES.length - 1
        state.choice = (state.choice + step) % FINISH_CHOICES.length
        return
      }
      case 'accept':
        if (FINISH_CHOICES[state.choice] === 'again') startRace()
        else toSelect()
        return
      case 'back':
        toSelect()
        return
    }
  }

  return {
    state: state as GameState,

    startRace,

    menu(player, action): void {
      if (state.phase === 'select') menuSelect(player, action)
      else if (state.phase === 'finished') menuFinished(action)
      // Countdown and race: the keys are the car's, and only the car's.
    },

    tick(cars): void {
      state.tick += 1
      if (state.phase === 'countdown') {
        updateCountdown()
        return
      }
      if (state.phase !== 'race') return
      if (state.countdownStep === 0) {
        state.countdownPulse = state.raceTick / RACE.goTicks
        if (state.raceTick >= RACE.goTicks) {
          state.countdownStep = null
          state.countdownPulse = 0
        }
      }
      updateRace(cars)
    },
  }
}
