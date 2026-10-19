// The drawn EP-133's keys as the device's own combos (web only: Android draws
// no device). Pure: the key layer's state and what each press, release, pad,
// − / + and knob turn on the drawn K.O. II means, for live/DeviceKeys.tsx and
// app.tsx's host to carry out. The grid views and Live's function row keep
// arc's own keys (FunctionRow.tsx); only the drawn device takes these.
//
// - Pages, as the device's modes: MAIN, SOUND (SOUND tapped), EDIT (SHIFT +
//   SOUND), TEMPO, TIMING, FX, OUTPUT (SHIFT + FX) and SIDECHAIN (OUTPUT's
//   +). One at a time; a tap on SOUND, TIMING or FX again (or MAIN, or Esc)
//   goes back to MAIN, and TEMPO tapped on its page taps the tempo. Entering
//   one closes the SAMPLE, STEP and SCENE panels (they share the plate's
//   place); one of them opening goes back to MAIN ([panelOpened]).
// - Held keys ([DeviceKeysState.down], or right-click [latched]): a key used
//   in a combo while held is spent, so its release does nothing more (the
//   pattern of FunctionRow's ProjectHold, for every key). SHIFT clicked is
//   held for the next key that uses it ([shiftOnce]); the computer's Shift
//   (or a press made with it) counts as SHIFT held ([DeviceContext.shift]).
// - SOUND, TEMPO and a group key held take the pads as a number pad ([dial]):
//   let go of (or ENTER), the number is the slot, the tempo or the pattern (a
//   group key held on the computer's keyboard types only once held
//   DEVICE_HOLD_MS, so "b7" typed fast plays pad 7). Held and let go of with
//   nothing done, SOUND and TEMPO open arc's sheets
//   (the pad's, the tempo's), MAIN the project sheet.
// - − / + by what is held or shown, first that applies ([minusPlusRoute]):
//   KEYS held the octave, a group held its pattern, MAIN held the scene,
//   RECORD armed or held the length (SHIFT + + doubles), STEP open its step,
//   SAMPLE the source (hands-free: the bars), then the page (SOUND the slot,
//   ten with SHIFT; EDIT the page; TIMING quantize or free; FX the effect;
//   OUTPUT and SIDECHAIN each other), KEYS the octave, else the group.
// - The device view going lets go of every key, latched ones too ([dropAll]:
//   FX's solos and punch-ins, TIMING's repeat, ERASE held, SHIFT clicked), and
//   the window left lets go of those held down ([DeviceKeys.releaseAll]). No
//   page opens over a SAMPLE take going on (it would close the panel and end
//   the take).
// - What arc can't do on the device's own terms (the system settings, CHOP,
//   cropping a sample, songs, tempo detect, time signatures, deleting a
//   sample, copying sounds, automation) is said on the plate ([NotInArc]) and
//   nothing else happens.
//   Solo (FX + a group), the fader's assignment (FADER + a pad) and its
//   reset (SHIFT + FADER) are the host's hooks on arc's FX bus
//   ([DeviceSoundHooks]); without them the plate says they aren't in arc.
import { signal, type ReadonlySignal } from '@preact/signals'
import { FADER_PARAMS, FX_TYPES, type FaderParam } from '../../core/features/fxSettings'
import { MAX_OCTAVE, MIN_OCTAVE } from '../../core/features/keys'
import { ROWS } from '../../core/features/padNotes'
import { Seq } from '../../core/features/pattern'

/** A key held this long is held: its release is no tap (FunctionRow's FN_HOLD_MS, Compose's long-press time). */
export const DEVICE_HOLD_MS = 450
/** SHIFT + C twice within this long copies the pattern, not the bar. */
export const COPY_TWICE_MS = 1500
/** How long the digits show a page's word or a value set (ms). */
export const FLASH_MS = 1000
/** How long the plate's hit line shows what was just done (ms). */
export const SAID_MS = 1500
/** EDIT's pages (PadEditPages' EDIT_PAGES: SOUND, TRIM, ENV, MIDI, MUTE), and TRIM's place among them. */
export const EDIT_PAGE_COUNT = 5
const TRIM_PAGE = 1

/** The drawn device's pages, as its modes. */
export type DevicePage = 'MAIN' | 'SOUND' | 'EDIT' | 'TEMPO' | 'TIMING' | 'FX' | 'OUTPUT' | 'SIDECHAIN'

/** The drawn keys that can be held. */
export type DeviceKey = 'SHIFT' | 'SOUND' | 'MAIN' | 'TEMPO' | 'KEYS' | 'FX' | 'ERASE' | 'RECORD' | 'FADER' | 'TIMING' | 'SAMPLE' | 'A' | 'B' | 'C' | 'D'

/** The group keys A–D, by group. */
export const GROUP_KEYS: readonly DeviceKey[] = ['A', 'B', 'C', 'D']

/** Group [g]'s key. */
export function groupKey(g: number): DeviceKey {
  return GROUP_KEYS[g] ?? 'A'
}

/** The group a key is, or null. */
export function groupOf(k: DeviceKey | null): number | null {
  const g = k === null ? -1 : GROUP_KEYS.indexOf(k)
  return g < 0 ? null : g
}

/** What FADER + pad [offset] gives the fader: the word printed over that pad (fxSettings' FADER_PARAMS, in the pads' rows: LEVEL over 7, LPF over 4, …). */
export function faderParamAt(offset: number): FaderParam {
  const i = ROWS.flat().indexOf(offset)
  return FADER_PARAMS[i] ?? 'LEVEL'
}

/** The device's combos arc has nothing for: the plate names them. */
export type NotInArc =
  | 'SYSTEM'
  | 'CHOP'
  | 'CROP'
  | 'SONG'
  | 'TEMPO_DETECT'
  | 'TIME_SIGNATURE'
  | 'DELETE_SAMPLE'
  | 'COPY_SOUND'
  | 'AUTOMATION'
  | 'SOLO'
  | 'FADER_RESET'

export interface DeviceKeysState {
  readonly page: DevicePage
  /** The keys down now (a pointer or a computer key on each). */
  readonly down: ReadonlySet<DeviceKey>
  /** The keys a right-click holds until it comes again. */
  readonly latched: ReadonlySet<DeviceKey>
  /** The held keys a combo used: their release does nothing more. */
  readonly spent: ReadonlySet<DeviceKey>
  /** The keys pressed with SHIFT (SHIFT + SOUND held long: SAVED). */
  readonly shifted: ReadonlySet<DeviceKey>
  /** SHIFT clicked: held for the next key that uses it. */
  readonly shiftOnce: boolean
  /** The key the pads type a number for (SOUND, TEMPO, a group), and what they typed. */
  readonly dialKey: DeviceKey | null
  readonly dial: string
  /** When the pads start typing for [dialKey] (null: at once): a group key held on the computer's keyboard waits out DEVICE_HOLD_MS, so a key rolled over into a pad key ("b7") plays the pad. */
  readonly dialFrom: number | null
  /** ERASE was on before ERASE went down (null: it isn't down): a tap latches it, a hold lets go. */
  readonly eraseWas: boolean | null
  /** Note repeat put on by TIMING held (it goes with it). */
  readonly repeat: boolean
  /** FX's punch-ins on (held past the hold time, or latched). */
  readonly punch: boolean
  /** The groups FX soloes: those whose key is held with FX held, or tapped (each tap on, off) with FX latched; all let go with FX. */
  readonly soloing: ReadonlySet<number>
  /** When SHIFT + C last copied a bar (again soon: the pattern). */
  readonly copiedAt: number | null
}

const NONE: ReadonlySet<never> = new Set()

export const DEVICE_KEYS_IDLE: DeviceKeysState = Object.freeze({
  page: 'MAIN',
  down: NONE,
  latched: NONE,
  spent: NONE,
  shifted: NONE,
  shiftOnce: false,
  dialKey: null,
  dial: '',
  dialFrom: null,
  eraseWas: null,
  repeat: false,
  punch: false,
  soloing: NONE,
  copiedAt: null,
})

/** What the app shows now, as the layer reads it. */
export interface DeviceContext {
  /** KEYS (else PADS). */
  readonly keysOn: boolean
  readonly octave: number
  /** The group shown. */
  readonly group: number
  /** The shown group's length, in bars. */
  readonly bars: number
  readonly stepOpen: boolean
  readonly sampleOn: boolean
  /** SAMPLE's LATCH (hands-free): − / + step the bars. */
  readonly handsFree: boolean
  /** A hands-free take goes on (SAMPLE stops it). */
  readonly sampleTaking: boolean
  /** Any take going on (waiting, counting in, recording, going onto the pad): no page opens over it. */
  readonly sampleBusy: boolean
  readonly recordArmed: boolean
  readonly erase: boolean
  /** RPT (note repeat) is on of itself: TIMING held leaves it be. */
  readonly arpOn: boolean
  /** The effect's index in FX_TYPES, and EDIT's page in EDIT_PAGES. */
  readonly fxIndex: number
  readonly editPage: number
  /** TIMING records on its grid (else free time). */
  readonly quantize: boolean
  /** The computer's Shift held, or the press was made with it. */
  readonly shift: boolean
  readonly now: number
}

/** What a press asks of the host (app.tsx carries it out; 'group' is the view's). */
export type DeviceAction =
  | { readonly kind: 'enter'; readonly page: DevicePage }
  | { readonly kind: 'sheet'; readonly sheet: 'SOUND' | 'TEMPO' | 'PROJECT' }
  | { readonly kind: 'keysMode'; readonly on: boolean }
  | { readonly kind: 'group'; readonly group: number }
  | { readonly kind: 'octave'; readonly step: number }
  | { readonly kind: 'pattern'; readonly group: number; readonly step: number }
  | { readonly kind: 'patternPick'; readonly group: number; readonly n: number }
  | { readonly kind: 'nextFree'; readonly group: number }
  | { readonly kind: 'scene'; readonly step: number }
  | { readonly kind: 'sceneCommit' }
  | { readonly kind: 'sceneErase' }
  | { readonly kind: 'length'; readonly group: number; readonly step: number }
  | { readonly kind: 'double'; readonly group: number }
  | { readonly kind: 'stepBy'; readonly step: number }
  | { readonly kind: 'sampleSource'; readonly step: number }
  | { readonly kind: 'sampleBars'; readonly step: number }
  | { readonly kind: 'slot'; readonly step: number }
  | { readonly kind: 'assign'; readonly slot: number }
  | { readonly kind: 'editPage'; readonly step: number }
  | { readonly kind: 'quantize'; readonly on: boolean }
  | { readonly kind: 'fxType'; readonly step: number }
  | { readonly kind: 'tapTempo' }
  | { readonly kind: 'tempo'; readonly bpm: number }
  | { readonly kind: 'keysRoot'; readonly root: number }
  | { readonly kind: 'erase'; readonly on: boolean }
  | { readonly kind: 'clear'; readonly group: number }
  | { readonly kind: 'undo' }
  | { readonly kind: 'copy'; readonly group: number; readonly pattern: boolean }
  | { readonly kind: 'paste'; readonly group: number }
  | { readonly kind: 'correct' }
  | { readonly kind: 'repeat'; readonly on: boolean }
  | { readonly kind: 'sample' }
  | { readonly kind: 'sampleStop' }
  | { readonly kind: 'leaveSample' }
  | { readonly kind: 'handsFree'; readonly group: number; readonly offset: number }
  | { readonly kind: 'punch'; readonly on: boolean }
  | { readonly kind: 'mainHold'; readonly on: boolean }
  | { readonly kind: 'saved' }
  | { readonly kind: 'solo'; readonly groups: ReadonlySet<number> }
  | { readonly kind: 'faderAssign'; readonly group: number; readonly param: FaderParam }
  | { readonly kind: 'faderReset'; readonly group: number }
  | { readonly kind: 'sidechainSource'; readonly group: number; readonly offset: number }
  | { readonly kind: 'sidechainDest'; readonly group: number }
  | { readonly kind: 'notInArc'; readonly what: NotInArc }
  | { readonly kind: 'sampleBusy' }

/**
 * What arc's own sound adds to the combos (app.tsx gives them, on the FX
 * bus): the groups FX soloes now ([solo]: every change, none to end it), the
 * fader given what FADER + a pad names ([assignFader]: false where arc has
 * none of it), and SHIFT + FADER's reset and restore ([resetFader]: what the
 * digits and the plate say, RES or SET). Without one the plate says the combo
 * isn't in arc.
 */
export interface DeviceSoundHooks {
  solo?(groups: ReadonlySet<number>): void
  assignFader?(group: number, param: FaderParam): boolean
  resetFader?(group: number): string
}

/** A press's outcome: the state after it and what the host does. */
export interface DeviceStep {
  readonly state: DeviceKeysState
  readonly actions: readonly DeviceAction[]
}

/** What − / + do now, in [minusPlusRoute]'s order. */
export type MinusPlusRoute =
  | 'octave'
  | 'pattern'
  | 'scene'
  | 'length'
  | 'step'
  | 'sampleSource'
  | 'sampleBars'
  | 'slot'
  | 'editPage'
  | 'timing'
  | 'fx'
  | 'output'
  | 'sidechain'
  | 'group'

/** Whether [k] is held: down or latched. */
export function held(s: DeviceKeysState, k: DeviceKey): boolean {
  return s.down.has(k) || s.latched.has(k)
}

/** SHIFT held on the drawn device: down, latched or clicked for the next key. */
export function shiftHeld(s: DeviceKeysState): boolean {
  return held(s, 'SHIFT') || s.shiftOnce
}

/** The group whose key is held (the one typing a number first), or null. */
export function heldGroup(s: DeviceKeysState): number | null {
  const d = groupOf(s.dialKey)
  if (d !== null && held(s, s.dialKey!)) return d
  for (let g = 0; g < GROUP_KEYS.length; g++) if (held(s, GROUP_KEYS[g]!)) return g
  return null
}

/** Whether a key is lit on the drawn device: held, latched, or SHIFT clicked. */
export function keyLit(s: DeviceKeysState, k: DeviceKey): boolean {
  return k === 'SHIFT' ? shiftHeld(s) : held(s, k)
}

const add = <T>(set: ReadonlySet<T>, v: T): ReadonlySet<T> => (set.has(v) ? set : new Set([...set, v]))
const del = <T>(set: ReadonlySet<T>, v: T): ReadonlySet<T> => {
  if (!set.has(v)) return set
  const out = new Set(set)
  out.delete(v)
  return out
}

/** How many digits a number typed for [k] keeps: a slot 999, a tempo 3 digits, a pattern 99. */
function dialDigits(k: DeviceKey): number {
  return groupOf(k) !== null ? 2 : 3
}

/** One press worked out on a state: the state as it goes, and the host's actions in order. */
class Tx {
  readonly out: DeviceAction[] = []
  constructor(
    public s: DeviceKeysState,
    readonly ctx: DeviceContext,
    /** The press came from the computer's keyboard. */
    readonly keyboard = false,
  ) {}

  get shift(): boolean {
    return shiftHeld(this.s) || this.ctx.shift
  }

  emit(a: DeviceAction): void {
    this.out.push(a)
  }

  /** [keys], those held, used in a combo: their release does nothing more. */
  spend(...keys: DeviceKey[]): void {
    for (const k of keys) if (held(this.s, k)) this.s = { ...this.s, spent: add(this.s.spent, k) }
  }

  /** SHIFT used by a combo: a click's goes, a held one is spent. */
  useShift(): void {
    if (this.s.shiftOnce) this.s = { ...this.s, shiftOnce: false }
    this.spend('SHIFT')
  }

  enter(page: DevicePage): void {
    if (page === this.s.page) return
    // A page would close SAMPLE's panel, and with it a take going on: it waits.
    if (page !== 'MAIN' && this.ctx.sampleBusy) {
      this.emit({ kind: 'sampleBusy' })
      return
    }
    this.s = { ...this.s, page }
    this.emit({ kind: 'enter', page })
  }

  /** Page [page], or back to MAIN when it shows already (a mode key tapped again). */
  toggle(page: DevicePage): void {
    this.enter(this.s.page === page ? 'MAIN' : page)
  }

  /** FX's solos now [groups]. */
  solo(groups: ReadonlySet<number>): void {
    this.s = { ...this.s, soloing: groups }
    this.emit({ kind: 'solo', groups })
  }

  startDial(k: DeviceKey): void {
    const wait = this.keyboard && groupOf(k) !== null
    this.s = { ...this.s, dialKey: k, dial: '', dialFrom: wait ? this.ctx.now + DEVICE_HOLD_MS : null }
  }

  /** The number typed for [k], let go of or ENTERed. */
  commit(k: DeviceKey, digits: string): void {
    const n = Number.parseInt(digits, 10)
    if (!Number.isFinite(n)) return
    const g = groupOf(k)
    if (k === 'SOUND') {
      if (n > 0) this.emit({ kind: 'assign', slot: n })
    } else if (k === 'TEMPO') {
      if (n > 0) this.emit({ kind: 'tempo', bpm: n })
    } else if (g !== null && n >= 1 && n <= Seq.MAX_PATTERNS) {
      this.emit({ kind: 'patternPick', group: g, n })
    }
  }

  done(): DeviceStep {
    return { state: this.s, actions: this.out }
  }
}

/** [k] pressed (down, or latched): what it does as it goes down. */
function press(tx: Tx, k: DeviceKey): void {
  const s = tx.s
  const g = groupOf(k)
  if (g !== null) {
    if (s.page === 'SIDECHAIN' && tx.shift) {
      tx.useShift()
      tx.spend(k)
      tx.emit({ kind: 'sidechainDest', group: g })
    } else if (tx.shift) {
      tx.useShift()
      tx.spend(k)
      const sound = s.page === 'SOUND' || s.page === 'EDIT'
      if (g === 0) tx.emit({ kind: 'nextFree', group: tx.ctx.group })
      else if (g === 1) tx.emit({ kind: 'undo' })
      else if (sound) tx.emit({ kind: 'notInArc', what: 'COPY_SOUND' })
      else if (g === 2) {
        const again = s.copiedAt !== null && tx.ctx.now - s.copiedAt < COPY_TWICE_MS
        tx.s = { ...tx.s, copiedAt: again ? null : tx.ctx.now }
        tx.emit({ kind: 'copy', group: tx.ctx.group, pattern: again })
      } else tx.emit({ kind: 'paste', group: tx.ctx.group })
    } else if (held(s, 'ERASE')) {
      tx.spend('ERASE', k)
      tx.emit({ kind: 'clear', group: g })
    } else if (held(s, 'FX')) {
      // FX held: solo while the key is held (several, several); FX latched: a tap soloes or lets go.
      tx.spend('FX', k)
      const toggles = s.latched.has('FX') && !s.down.has('FX')
      if (toggles) tx.spend(k)
      tx.solo(toggles && s.soloing.has(g) ? del(s.soloing, g) : add(s.soloing, g))
    } else {
      if (g !== tx.ctx.group) tx.emit({ kind: 'group', group: g })
      tx.startDial(k)
    }
    return
  }
  switch (k) {
    case 'SOUND':
      if (held(s, 'ERASE')) {
        tx.spend('ERASE', k)
        tx.emit({ kind: 'notInArc', what: 'DELETE_SAMPLE' })
      } else if (tx.shift) {
        tx.useShift()
        tx.spend(k)
        tx.s = { ...tx.s, shifted: add(tx.s.shifted, k) }
        if (tx.ctx.keysOn) tx.emit({ kind: 'keysMode', on: false })
        tx.enter('EDIT')
      } else {
        tx.startDial(k)
      }
      return
    case 'MAIN':
      if (held(s, 'ERASE')) {
        tx.spend('ERASE', k)
        tx.emit({ kind: 'sceneErase' })
      } else if (held(s, 'TEMPO')) {
        tx.spend('TEMPO', k)
        tx.emit({ kind: 'notInArc', what: 'TIME_SIGNATURE' })
      } else if (tx.shift) {
        tx.useShift()
        tx.spend(k)
        tx.emit({ kind: 'sceneCommit' })
      } else {
        // PROJECT's hold (a pad 1 to 9 picks one), FunctionRow's ProjectHold.
        tx.emit({ kind: 'mainHold', on: true })
      }
      return
    case 'TEMPO':
      if (held(s, 'SAMPLE')) {
        tx.spend('SAMPLE', k)
        tx.emit({ kind: 'notInArc', what: 'TEMPO_DETECT' })
      } else if (held(s, 'MAIN')) {
        tx.spend('MAIN', k)
        tx.emit({ kind: 'notInArc', what: 'TIME_SIGNATURE' })
      } else {
        // On its page each press taps the tempo, as it goes down.
        if (s.page === 'TEMPO') tx.emit({ kind: 'tapTempo' })
        tx.startDial(k)
      }
      return
    case 'FX':
      if (tx.shift) {
        tx.useShift()
        tx.spend(k)
        tx.enter('OUTPUT')
      }
      return
    case 'ERASE':
      if (tx.shift) {
        tx.useShift()
        tx.spend(k)
        tx.emit({ kind: 'notInArc', what: 'SYSTEM' })
      } else {
        // On at once, so a pad pressed with it erases; its release decides whether it stays.
        tx.s = { ...tx.s, eraseWas: tx.ctx.erase }
        if (!tx.ctx.erase) tx.emit({ kind: 'erase', on: true })
      }
      return
    case 'TIMING':
      if (tx.shift) {
        tx.useShift()
        tx.spend(k)
        tx.emit({ kind: 'correct' })
      }
      return
    case 'SAMPLE':
      if (tx.shift) {
        tx.useShift()
        tx.spend(k)
        tx.emit({ kind: 'notInArc', what: 'CHOP' })
      }
      return
    case 'FADER':
      if (held(s, 'ERASE') || held(s, 'RECORD')) {
        tx.spend('ERASE', k)
        tx.emit({ kind: 'notInArc', what: 'AUTOMATION' })
      } else if (tx.shift) {
        tx.useShift()
        tx.spend(k)
        tx.emit({ kind: 'faderReset', group: tx.ctx.group })
      }
      return
    default:
      return
  }
}

/** [k] let go of: [how] by a lift ('up', [long] when held past DEVICE_HOLD_MS), a right-click ('unlatch') or a press taken away ('cancel'). */
function release(tx: Tx, k: DeviceKey, how: 'up' | 'unlatch' | 'cancel', long: boolean): void {
  const s0 = tx.s
  const spent = s0.spent.has(k)
  const tap = how === 'up' && !spent
  const dialing = s0.dialKey === k
  tx.s = {
    ...s0,
    down: del(s0.down, k),
    latched: del(s0.latched, k),
    spent: del(s0.spent, k),
    shifted: del(s0.shifted, k),
    ...(dialing ? { dialKey: null, dial: '' } : {}),
  }
  const digits = dialing && how !== 'cancel' ? s0.dial : ''
  const ctx = tx.ctx
  const g = groupOf(k)
  if (g !== null) {
    // Held with FX held, its solo goes with it (a latched FX's taps stay).
    if (s0.soloing.has(g) && !(s0.latched.has('FX') && !s0.down.has('FX'))) tx.solo(del(s0.soloing, g))
    if (digits !== '') tx.commit(k, digits)
    return
  }
  switch (k) {
    case 'SHIFT':
      // A click holds it for the next key (or lets go of the one clicked before).
      if (tap && !long) tx.s = { ...tx.s, shiftOnce: !s0.shiftOnce }
      return
    case 'SOUND':
      // SHIFT + SOUND held: SAVED (arc keeps every turn); on TRIM it crops the sample file, which arc doesn't.
      if (s0.shifted.has(k) && how === 'up' && long) tx.emit(ctx.editPage === TRIM_PAGE ? { kind: 'notInArc', what: 'CROP' } : { kind: 'saved' })
      else if (digits !== '') tx.commit(k, digits)
      else if (tap && long) tx.emit({ kind: 'sheet', sheet: 'SOUND' })
      else if (tap) {
        if (ctx.keysOn) {
          tx.emit({ kind: 'keysMode', on: false })
          tx.enter('SOUND')
        } else tx.toggle('SOUND')
      }
      return
    case 'MAIN':
      tx.emit({ kind: 'mainHold', on: false })
      if (tap && long) tx.emit({ kind: 'sheet', sheet: 'PROJECT' })
      else if (tap) {
        // As on the device, MAIN leaves SAMPLE too.
        if (ctx.sampleOn) tx.emit({ kind: 'leaveSample' })
        tx.enter('MAIN')
      }
      return
    case 'TEMPO':
      if (digits !== '') tx.commit(k, digits)
      else if (tap && long) tx.emit({ kind: 'sheet', sheet: 'TEMPO' })
      else if (tap) tx.enter('TEMPO')
      return
    case 'KEYS':
      if (tap) tx.emit({ kind: 'keysMode', on: !ctx.keysOn })
      return
    case 'FX':
      // Every solo goes with FX.
      if (s0.soloing.size > 0) tx.solo(NONE)
      if (s0.punch) {
        tx.s = { ...tx.s, punch: false }
        tx.emit({ kind: 'punch', on: false })
      } else if (tap) tx.toggle('FX')
      return
    case 'ERASE':
      if (s0.eraseWas !== null) {
        // A tap latches it on (or off again); a hold, or a combo, leaves it as it was.
        const stays = tap && !long ? !s0.eraseWas : s0.eraseWas
        if (!stays) tx.emit({ kind: 'erase', on: false })
        tx.s = { ...tx.s, eraseWas: null }
      }
      return
    case 'TIMING':
      if (s0.repeat) {
        tx.s = { ...tx.s, repeat: false }
        tx.emit({ kind: 'repeat', on: false })
      }
      if (tap) tx.toggle('TIMING')
      return
    case 'SAMPLE':
      if (tap) tx.emit(ctx.sampleTaking ? { kind: 'sampleStop' } : { kind: 'sample' })
      return
    default:
      return
  }
}

/** [k] goes down ([keyboard]: a computer key holds it). A key latched already is only let go of by this press's release. */
export function keyDown(s: DeviceKeysState, k: DeviceKey, ctx: DeviceContext, keyboard = false): DeviceStep {
  if (s.down.has(k)) return { state: s, actions: [] }
  const tx = new Tx({ ...s, down: add(s.down, k) }, ctx, keyboard)
  if (!s.latched.has(k)) press(tx, k)
  return tx.done()
}

/** [k] comes up ([long]: held past DEVICE_HOLD_MS). A latched key so pressed is let go of, with no tap. */
export function keyUp(s: DeviceKeysState, k: DeviceKey, ctx: DeviceContext, long: boolean): DeviceStep {
  if (!s.down.has(k)) return { state: s, actions: [] }
  const tx = new Tx(s, ctx)
  release(tx, k, s.latched.has(k) ? 'unlatch' : 'up', long)
  return tx.done()
}

/** [k]'s press taken away (the pointer cancelled, the window left): let go of, with no tap and no number typed. */
export function keyCancel(s: DeviceKeysState, k: DeviceKey, ctx: DeviceContext): DeviceStep {
  if (!s.down.has(k) || s.latched.has(k)) return { state: { ...s, down: del(s.down, k) }, actions: [] }
  const tx = new Tx(s, ctx)
  release(tx, k, 'cancel', false)
  return tx.done()
}

/** A right-click on [k]: held (lit) until the next one, which lets it go (no tap). FX latched plays the punch-ins. */
export function keyLatch(s: DeviceKeysState, k: DeviceKey, ctx: DeviceContext): DeviceStep {
  const tx = new Tx(s, ctx)
  if (s.latched.has(k)) {
    release(tx, k, 'unlatch', false)
    return tx.done()
  }
  if (s.down.has(k)) return { state: s, actions: [] }
  tx.s = { ...s, latched: add(s.latched, k) }
  press(tx, k)
  if (k === 'FX' && !tx.s.spent.has('FX')) {
    tx.s = { ...tx.s, punch: true }
    tx.emit({ kind: 'punch', on: true })
  }
  return tx.done()
}

/** [k] held past DEVICE_HOLD_MS: FX plays the punch-ins until it lets go (unless a combo used it). */
export function keyLongHeld(s: DeviceKeysState, k: DeviceKey, ctx: DeviceContext): DeviceStep {
  if (k !== 'FX' || !s.down.has(k) || s.spent.has(k) || s.punch) return { state: s, actions: [] }
  const tx = new Tx({ ...s, punch: true }, ctx)
  tx.emit({ kind: 'punch', on: true })
  return tx.done()
}

/** A pad as the layer reads it: its [offset], the [label] printed on it, and the MIDI [note] it is in KEYS' layout. */
export interface PadPress {
  readonly offset: number
  readonly label: string
  readonly note: number
}

/** A pad pressed: [taken] when a held key takes it (it neither sounds nor is let go of). */
export function padDown(s: DeviceKeysState, pad: PadPress, ctx: DeviceContext): DeviceStep & { readonly taken: boolean } {
  const tx = new Tx(s, ctx)
  const taken = (): DeviceStep & { taken: boolean } => ({ ...tx.done(), taken: true })
  if (held(s, 'KEYS')) {
    tx.spend('KEYS')
    tx.emit({ kind: 'keysRoot', root: ((pad.note % 12) + 12) % 12 })
    return taken()
  }
  if (held(s, 'FADER')) {
    tx.spend('FADER')
    tx.emit({ kind: 'faderAssign', group: ctx.group, param: faderParamAt(pad.offset) })
    return taken()
  }
  if (held(s, 'MAIN')) {
    tx.spend('MAIN')
    if (pad.label !== 'ENTER') return { ...tx.done(), taken: false }
    tx.emit({ kind: 'notInArc', what: 'SONG' })
    return taken()
  }
  const dk = s.dialKey
  if (dk !== null && held(s, dk) && (s.dialFrom === null || ctx.now >= s.dialFrom)) {
    tx.spend(dk)
    const g = groupOf(dk)
    if (g !== null && s.page === 'SIDECHAIN') {
      tx.emit({ kind: 'sidechainSource', group: g, offset: pad.offset })
      return taken()
    }
    if (pad.label === 'ENTER') {
      tx.s = { ...tx.s, dial: '' }
      if (s.dial !== '') tx.commit(dk, s.dial)
    } else if (/^\d$/.test(pad.label)) {
      tx.s = { ...tx.s, dial: (s.dial + pad.label).slice(-dialDigits(dk)) }
    }
    // '.': arc's tempo is whole beats a minute, so the decimals are left out.
    return taken()
  }
  if (held(s, 'TIMING')) {
    tx.spend('TIMING')
    if (!s.repeat && !ctx.arpOn) {
      tx.s = { ...tx.s, repeat: true }
      tx.emit({ kind: 'repeat', on: true })
    }
    return { ...tx.done(), taken: false }
  }
  if (tx.shift && ctx.sampleOn) {
    tx.useShift()
    tx.emit({ kind: 'handsFree', group: ctx.group, offset: pad.offset })
    return taken()
  }
  if (held(s, 'ERASE')) tx.spend('ERASE')
  return { ...tx.done(), taken: false }
}

/** What − / + do now: the first that applies of what is held, the panel open, the page, KEYS, else the group. */
export function minusPlusRoute(s: DeviceKeysState, ctx: DeviceContext): MinusPlusRoute {
  if (held(s, 'KEYS')) return 'octave'
  if (heldGroup(s) !== null) return 'pattern'
  if (held(s, 'MAIN')) return 'scene'
  if (held(s, 'RECORD') || ctx.recordArmed) return 'length'
  if (ctx.stepOpen) return 'step'
  if (ctx.sampleOn) return ctx.handsFree ? 'sampleBars' : 'sampleSource'
  switch (s.page) {
    case 'SOUND':
      return 'slot'
    case 'EDIT':
      return 'editPage'
    case 'TIMING':
      return 'timing'
    case 'FX':
      return 'fx'
    case 'OUTPUT':
      return 'output'
    case 'SIDECHAIN':
      return 'sidechain'
    default:
      return ctx.keysOn ? 'octave' : 'group'
  }
}

const within = (v: number, min: number, max: number): boolean => v >= min && v <= max

/** Whether − ([dir] -1) or + (1) can step now: the LED over it lights. */
export function canStep(s: DeviceKeysState, ctx: DeviceContext, dir: number): boolean {
  switch (minusPlusRoute(s, ctx)) {
    case 'octave':
      return within(ctx.octave + dir, MIN_OCTAVE, MAX_OCTAVE)
    case 'group':
      return within(ctx.group + dir, 0, 3)
    case 'length':
      return dir > 0 && (shiftHeld(s) || ctx.shift) ? ctx.bars * 2 <= Seq.MAX_BARS : within(ctx.bars + dir, 1, Seq.MAX_BARS)
    case 'editPage':
      return within(ctx.editPage + dir, 0, EDIT_PAGE_COUNT - 1)
    case 'timing':
      return dir < 0 ? !ctx.quantize : ctx.quantize
    case 'fx':
      return within(ctx.fxIndex + dir, 0, FX_TYPES.length - 1)
    case 'output':
      return dir > 0
    case 'sidechain':
      return dir < 0
    default:
      return true
  }
}

/** − ([dir] -1) or + (1) pressed: by [minusPlusRoute]; nothing where it can't step. */
export function minusPlus(s: DeviceKeysState, dir: number, ctx: DeviceContext): DeviceStep {
  const tx = new Tx(s, ctx)
  if (!canStep(s, ctx, dir)) return tx.done()
  switch (minusPlusRoute(s, ctx)) {
    case 'octave':
      tx.spend('KEYS')
      tx.emit({ kind: 'octave', step: dir })
      break
    case 'pattern': {
      const g = heldGroup(s)!
      tx.spend(groupKey(g))
      tx.emit({ kind: 'pattern', group: g, step: dir })
      break
    }
    case 'scene':
      tx.spend('MAIN')
      tx.emit({ kind: 'scene', step: dir })
      break
    case 'length':
      tx.spend('RECORD')
      if (dir > 0 && tx.shift) {
        tx.useShift()
        tx.emit({ kind: 'double', group: ctx.group })
      } else tx.emit({ kind: 'length', group: ctx.group, step: dir })
      break
    case 'step':
      tx.emit({ kind: 'stepBy', step: dir })
      break
    case 'sampleSource':
      tx.emit({ kind: 'sampleSource', step: dir })
      break
    case 'sampleBars':
      tx.emit({ kind: 'sampleBars', step: dir })
      break
    case 'slot': {
      const ten = tx.shift
      if (ten) tx.useShift()
      tx.emit({ kind: 'slot', step: dir * (ten ? 10 : 1) })
      break
    }
    case 'editPage':
      tx.emit({ kind: 'editPage', step: dir })
      break
    case 'timing':
      tx.emit({ kind: 'quantize', on: dir < 0 })
      break
    case 'fx':
      tx.emit({ kind: 'fxType', step: dir })
      break
    case 'output':
      tx.enter('SIDECHAIN')
      break
    case 'sidechain':
      tx.enter('OUTPUT')
      break
    case 'group':
      tx.emit({ kind: 'group', group: ctx.group + dir })
      break
  }
  return tx.done()
}

/**
 * SOUND's − / +: the slot [step] from [cur] among the sounds' [slots]
 * (sorted): ±1 the next sound either way, ±10 (SHIFT) the first at least ten
 * slots on (the last there is, short of that); null where there is none.
 */
export function slotStep(slots: readonly number[], cur: number, step: number): number | null {
  if (slots.length === 0 || step === 0) return null
  const up = step > 0
  if (Math.abs(step) === 1) {
    const next = up ? slots.find((s) => s > cur) : [...slots].reverse().find((s) => s < cur)
    return next ?? null
  }
  const target = cur + step
  const at = up ? slots.find((s) => s >= target) : [...slots].reverse().find((s) => s <= target)
  if (at !== undefined) return at
  const end = up ? slots[slots.length - 1]! : slots[0]!
  return (up ? end > cur : end < cur) ? end : null
}

/** A knob turned: KEYS, TEMPO, SOUND and a key typing a number, held, are spent (no tap, no sheet as they let go). */
export function knobTurned(s: DeviceKeysState): DeviceKeysState {
  let spent = s.spent
  const keys: DeviceKey[] = ['KEYS', 'TEMPO', 'SOUND']
  if (s.dialKey !== null) keys.push(s.dialKey)
  for (const k of keys) if (held(s, k)) spent = add(spent, k)
  return spent === s.spent ? s : { ...s, spent }
}

/**
 * Every key let go of, latched ones too, as taken away (no tap, no number):
 * the device view going (another view, a narrow window, another section). So
 * FX's solos and punch-ins end, TIMING's repeat, ERASE held, MAIN's project
 * hold; SHIFT clicked is dropped, and the page goes back to MAIN.
 */
export function dropAll(s: DeviceKeysState, ctx: DeviceContext): DeviceStep {
  const tx = new Tx(s, ctx)
  for (const k of new Set([...s.down, ...s.latched])) release(tx, k, 'cancel', false)
  if (tx.s.soloing.size > 0) tx.solo(NONE)
  if (tx.s.punch) {
    tx.s = { ...tx.s, punch: false }
    tx.emit({ kind: 'punch', on: false })
  }
  tx.s = { ...tx.s, shiftOnce: false, dialKey: null, dial: '', dialFrom: null }
  tx.enter('MAIN')
  return tx.done()
}

/** FX's solos ended from outside (another project): none left. */
export function endSolo(s: DeviceKeysState, ctx: DeviceContext): DeviceStep {
  const tx = new Tx(s, ctx)
  if (s.soloing.size > 0) tx.solo(NONE)
  return tx.done()
}

/** To [page] (Esc and the panels going back to MAIN). */
export function goTo(s: DeviceKeysState, page: DevicePage, ctx: DeviceContext): DeviceStep {
  const tx = new Tx(s, ctx)
  tx.enter(page)
  return tx.done()
}

/** [k] used by a combo the host saw (a pad PROJECT took): spent. */
export function spendKey(s: DeviceKeysState, k: DeviceKey): DeviceKeysState {
  return held(s, k) && !s.spent.has(k) ? { ...s, spent: add(s.spent, k) } : s
}

// ---------- the layer: the state kept, presses timed, pads taken ----------

/** The clock and timers the layer runs on (tests give their own). */
export interface DeviceKeysClock {
  now(): number
  set(fn: () => void, ms: number): unknown
  clear(handle: unknown): void
}

const browserClock: DeviceKeysClock = {
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}

/** What the layer reads of the app, and carries its actions out with (app.tsx). */
export interface DeviceKeysHost {
  /** The app as it is now ([DeviceContext] but the view's group, the Shift of the press, and every group's length). */
  context(): Omit<DeviceContext, 'group' | 'shift' | 'now' | 'bars'> & { readonly bars: readonly number[] }
  run(action: DeviceAction): void
}

/** The device view's own part (MirrorScreen): the group it shows. */
export interface DeviceKeysView {
  group(): number
  setGroup(g: number): void
}

/**
 * The drawn device's key layer (web only): the state ([state], a signal the
 * keys and the display read), presses timed (a hold, FX's punch-ins coming
 * as it is held), the pads a held key took (their release taken too, so
 * nothing lets go of a sound it never started), what the digits and the
 * plate show for a moment ([flash], [said], [lcd]), and the computer's
 * Shift ([shiftKey]).
 */
export class DeviceKeys {
  private readonly _state = signal<DeviceKeysState>(DEVICE_KEYS_IDLE)
  readonly state: ReadonlySignal<DeviceKeysState> = this._state
  private readonly _shiftKey = signal(false)
  /** The computer's Shift held while the device shows: SHIFT, and the knobs five times finer. */
  readonly shiftKey: ReadonlySignal<boolean> = this._shiftKey
  private readonly _flash = signal<string | null>(null)
  /** What the three digits show for a moment (a page's word, a value set), or null. */
  readonly flash: ReadonlySignal<string | null> = this._flash
  private readonly _said = signal<{ readonly text: string; readonly n: number } | null>(null)
  /** What the plate's hit line shows for a moment (the last change: "LEVEL · 72"), each one numbered. */
  readonly said: ReadonlySignal<{ readonly text: string; readonly n: number } | null> = this._said
  private readonly _lcd = signal<'COPY' | 'PASTE' | null>(null)
  /** The display's COPY or PASTE, lit for a moment. */
  readonly lcd: ReadonlySignal<'COPY' | 'PASTE' | null> = this._lcd
  private readonly downAt = new Map<DeviceKey, number>()
  private readonly holds = new Map<DeviceKey, unknown>()
  private readonly timers = new Map<'flash' | 'said' | 'lcd', unknown>()
  private readonly taken = new Set<string>()
  private view: DeviceKeysView | null = null

  constructor(
    private readonly host: DeviceKeysHost,
    private readonly clock: DeviceKeysClock = browserClock,
  ) {}

  /** The device view showing (MirrorScreen); the returned function lets go of it, and of every key held. */
  attach(view: DeviceKeysView): () => void {
    this.view = view
    return () => {
      if (this.view !== view) return
      this.downAt.clear()
      for (const k of [...this.holds.keys()]) this.clearHold(k)
      this._shiftKey.value = false
      this.apply(dropAll(this._state.peek(), this.ctx()))
      this.view = null
    }
  }

  get page(): DevicePage {
    return this._state.peek().page
  }

  private ctx(shift = false, group = this.view?.group() ?? 0): DeviceContext {
    const h = this.host.context()
    return { ...h, group, bars: h.bars[group] ?? Seq.DEFAULT_BARS, shift: shift || this._shiftKey.peek(), now: this.clock.now() }
  }

  private apply(step: DeviceStep): void {
    this._state.value = step.state
    for (const a of step.actions) {
      if (a.kind === 'group') this.view?.setGroup(Math.min(3, Math.max(0, a.group)))
      else this.host.run(a)
    }
  }

  /** [k] goes down at [at] ([shift]: the press was made with Shift held; [keyboard]: a computer key holds it). */
  down(k: DeviceKey, at: number = this.clock.now(), shift = false, keyboard = false): void {
    if (this._state.peek().down.has(k)) return
    this.downAt.set(k, at)
    this.apply(keyDown(this._state.peek(), k, this.ctx(shift), keyboard))
    if (k === 'FX') {
      this.clearHold(k)
      this.holds.set(
        k,
        this.clock.set(() => {
          this.holds.delete(k)
          this.apply(keyLongHeld(this._state.peek(), k, this.ctx()))
        }, DEVICE_HOLD_MS),
      )
    }
  }

  /** [k] comes up at [at]. */
  up(k: DeviceKey, at: number = this.clock.now(), shift = false): void {
    const from = this.downAt.get(k)
    this.downAt.delete(k)
    this.clearHold(k)
    const long = from !== undefined && at - from >= DEVICE_HOLD_MS
    this.apply(keyUp(this._state.peek(), k, this.ctx(shift), long))
  }

  /** [k]'s press taken away: no tap. */
  cancel(k: DeviceKey): void {
    this.downAt.delete(k)
    this.clearHold(k)
    this.apply(keyCancel(this._state.peek(), k, this.ctx()))
  }

  /** A tap with no pointer (Enter, Space, a screen reader's click): down and up at once. */
  tap(k: DeviceKey, shift = false): void {
    const at = this.clock.now()
    this.down(k, at, shift)
    this.up(k, at, shift)
  }

  /** A right-click: [k] held until the next. */
  latch(k: DeviceKey): void {
    this.apply(keyLatch(this._state.peek(), k, this.ctx()))
  }

  /** Whether [k] is held now (read as a signal: the caller re-renders with it). */
  held(k: DeviceKey): boolean {
    return held(this._state.value, k)
  }

  /** SHIFT held (drawn or the computer's), read as a signal. */
  shiftHeld(): boolean {
    return shiftHeld(this._state.value) || this._shiftKey.value
  }

  /** The computer's Shift down or up. */
  setShiftKey(on: boolean): void {
    this._shiftKey.value = on
  }

  /**
   * Pad [offset] (printed [label], [note] in KEYS' layout) pressed by press
   * [id]: true when a held key took it; its release ([padUp]) is then taken too.
   */
  pad(id: string, pad: PadPress, shift = false): boolean {
    const r = padDown(this._state.peek(), pad, this.ctx(shift))
    this.apply(r)
    if (r.taken) this.taken.add(id)
    return r.taken
  }

  /** Press [id] let go of: true when its press was taken. */
  padUp(id: string): boolean {
    return this.taken.delete(id)
  }

  /** − ([dir] -1) or + (1). */
  minusPlus(dir: number, shift = false): void {
    this.apply(minusPlus(this._state.peek(), dir, this.ctx(shift)))
  }

  /**
   * What − / + do now with [group] shown, and whether each can step (read as
   * signals). The group is given, not the view's: a computed over this made
   * before the view attaches reads the same as one made after.
   */
  route(group: number): { readonly route: MinusPlusRoute; readonly minus: boolean; readonly plus: boolean } {
    const s = this._state.value
    const ctx = { ...this.ctx(false, group), shift: this._shiftKey.value }
    return { route: minusPlusRoute(s, ctx), minus: canStep(s, ctx, -1), plus: canStep(s, ctx, 1) }
  }

  /** Knob X or Y turned. */
  turned(): void {
    const s = this._state.peek()
    const next = knobTurned(s)
    if (next !== s) this._state.value = next
  }

  /** [k] used by a combo the host saw. */
  spend(k: DeviceKey): void {
    this._state.value = spendKey(this._state.peek(), k)
  }

  /** Back to MAIN (Esc): true when a page was showing. */
  toMain(): boolean {
    if (this._state.peek().page === 'MAIN') return false
    this.apply(goTo(this._state.peek(), 'MAIN', this.ctx()))
    return true
  }

  /** FX's solos end (another project shows). */
  endSolo(): void {
    this.apply(endSolo(this._state.peek(), this.ctx()))
  }

  /** SAMPLE, STEP or SCENE opened: they have the plate's place, so the page goes back to MAIN. */
  panelOpened(): void {
    this.toMain()
  }

  /** The digits show [text] (three characters) for [ms], then [then] for as long (EDT, then the page's word). */
  show(text: string, ms: number = FLASH_MS, then?: string): void {
    this._flash.value = text
    this.later('flash', ms, () => {
      this._flash.value = null
      if (then !== undefined) this.show(then, ms)
    })
  }

  /** The plate's hit line shows [text] for a moment (and a screen reader hears it). */
  say(text: string): void {
    this._said.value = { text, n: (this._said.peek()?.n ?? 0) + 1 }
    this.later('said', SAID_MS, () => (this._said.value = null))
  }

  /** The display's COPY or PASTE lit for a moment. */
  blink(word: 'COPY' | 'PASTE'): void {
    this._lcd.value = word
    this.later('lcd', SAID_MS, () => (this._lcd.value = null))
  }

  /** Every key held down by a pointer or the keyboard let go of, as taken away (the window left, the page hidden); latched ones stay. */
  releaseAll(): void {
    for (const k of [...this._state.peek().down]) this.cancel(k)
    this._shiftKey.value = false
  }

  private later(which: 'flash' | 'said' | 'lcd', ms: number, fn: () => void): void {
    const t = this.timers.get(which)
    if (t !== undefined) this.clock.clear(t)
    this.timers.set(
      which,
      this.clock.set(() => {
        this.timers.delete(which)
        fn()
      }, ms),
    )
  }

  private clearHold(k: DeviceKey): void {
    const t = this.holds.get(k)
    if (t !== undefined) this.clock.clear(t)
    this.holds.delete(k)
  }
}
