// Port of core/src/main/kotlin/dev/arc/ep133/features/Transport.kt
//
// RECORD and PLAY, as on the device: RECORD then PLAY records after a bar's
// count-in, RECORD + PLAY together at once; PLAY while running stops. RECORD
// while playing punches in and out; held, it records only while held. Unlike
// the device, PLAY always starts at bar 1.
//
// Web deltas:
// - Times are MILLISECONDS where the Kotlin uses nanoseconds: LONG_PRESS_NS
//   is LONG_PRESS_MS and recordUp's longPressNs is longPressMs.
// - TransportPhase is a string union of the enum's names; TransportState is a
//   plain readonly interface built by transportState().
// - The sealed TransportAction is a tagged union ({type: 'Start' | 'Stop' |
//   'PunchIn' | 'PunchOut' | 'None', ...}) with Start / Stop / PunchIn /
//   PunchOut / None constructors.

/** Where the pattern transport is: stopped, RECORD armed, counting in, or playing. */
export type TransportPhase = 'STOPPED' | 'ARMED' | 'COUNT_IN' | 'PLAYING'

/** The transport's [phase], and whether pads played go into the pattern ([recording]; while counting in, once it starts). */
export interface TransportState {
  readonly phase: TransportPhase
  readonly recording: boolean
}

export function transportState(phase: TransportPhase = 'STOPPED', recording = false): TransportState {
  return { phase, recording }
}

/** What a press on RECORD or PLAY asks of the sequencer and the recorder. */
export type TransportAction =
  /** Play from bar 1, after [countInBars] bars of count-in (0: at once), recording if [record]. */
  | { readonly type: 'Start'; readonly countInBars: number; readonly record: boolean }
  | { readonly type: 'Stop' }
  | { readonly type: 'PunchIn' }
  | { readonly type: 'PunchOut' }
  | { readonly type: 'None' }

export const Start = (countInBars: number, record: boolean): TransportAction => ({ type: 'Start', countInBars, record })
export const Stop: TransportAction = { type: 'Stop' }
export const PunchIn: TransportAction = { type: 'PunchIn' }
export const PunchOut: TransportAction = { type: 'PunchOut' }
export const None: TransportAction = { type: 'None' }

/** RECORD held this long after punching in records only while held. */
export const LONG_PRESS_MS = 400

export class Transport {
  static readonly LONG_PRESS_MS = LONG_PRESS_MS

  private current: TransportState = transportState()
  // When the RECORD press that punched in went down, while it is held.
  private punchedAt: number | null = null

  get state(): TransportState {
    return this.current
  }

  /** RECORD goes down at [at]. */
  recordDown(at: number): TransportAction {
    this.punchedAt = null
    switch (this.current.phase) {
      case 'STOPPED':
        return this.set('ARMED', false, None)
      case 'ARMED':
        return this.set('STOPPED', false, None)
      // Counting in: the recording of the start is called off (or back on); the count goes on.
      case 'COUNT_IN':
      case 'PLAYING':
        if (this.current.recording) return this.set(this.current.phase, false, PunchOut)
        if (this.current.phase === 'PLAYING') this.punchedAt = at
        return this.set(this.current.phase, true, PunchIn)
    }
  }

  /** RECORD comes up at [at]: held [longPressMs] or more after it punched in, recording stops with it. */
  recordUp(at: number, longPressMs: number = LONG_PRESS_MS): TransportAction {
    const down = this.punchedAt
    if (down === null) return None
    this.punchedAt = null
    if (this.current.phase !== 'PLAYING' || !this.current.recording || at - down < longPressMs) return None
    return this.set('PLAYING', false, PunchOut)
  }

  /** PLAY pressed, with RECORD held down or not; [countIn] is the setting for RECORD then PLAY. */
  play(recordHeld: boolean, countIn: boolean): TransportAction {
    this.punchedAt = null
    switch (this.current.phase) {
      case 'STOPPED':
        return this.start(0, false)
      case 'ARMED':
        return this.start(countIn && !recordHeld ? 1 : 0, true)
      case 'COUNT_IN':
      case 'PLAYING':
        return this.set('STOPPED', false, Stop)
    }
  }

  /** The count-in is over: playing, recording if it was armed. */
  countedIn(): TransportAction {
    if (this.current.phase === 'COUNT_IN') this.current = transportState('PLAYING', this.current.recording)
    return None
  }

  /** Stopped from outside (audio focus lost, the output closed, another project): Stop while it ran. */
  stop(): TransportAction {
    this.punchedAt = null
    const running = this.current.phase === 'COUNT_IN' || this.current.phase === 'PLAYING'
    this.current = transportState()
    return running ? Stop : None
  }

  /** Recording stops and playing goes on (SAMPLE opened); armed is disarmed. */
  punchOut(): TransportAction {
    this.punchedAt = null
    if (this.current.phase === 'ARMED') return this.set('STOPPED', false, None)
    if (!this.current.recording) return None
    return this.set(this.current.phase, false, PunchOut)
  }

  private start(countInBars: number, record: boolean): TransportAction {
    return this.set(countInBars > 0 ? 'COUNT_IN' : 'PLAYING', record, Start(countInBars, record))
  }

  private set(phase: TransportPhase, recording: boolean, a: TransportAction): TransportAction {
    this.current = transportState(phase, recording)
    return a
  }
}
