// The drawn EP-133's key layer (web only: ui/live/deviceKeys.ts): pages, keys held and spent,
// right-click latches, SHIFT clicked for the next key, numbers typed on the pads, − / + by what is held
// or shown, and the layer that times the presses and takes the pads.
import { describe, expect, it, vi } from 'vitest'
import { FX_TYPES } from '../../src/core/features/fxSettings'
import { MAX_OCTAVE } from '../../src/core/features/keys'
import { EDIT_PAGES } from '../../src/ui/sheets/PadEditPages'
import { FN_HOLD_MS } from '../../src/ui/live/FunctionRow'
import {
  canStep,
  DEVICE_HOLD_MS,
  DEVICE_KEYS_IDLE,
  DeviceKeys,
  EDIT_PAGE_COUNT,
  faderParamAt,
  dropAll,
  keyCancel,
  keyDown,
  keyLatch,
  keyLongHeld,
  keyUp,
  knobTurned,
  minusPlus,
  minusPlusRoute,
  padDown,
  shiftHeld,
  slotStep,
  type DeviceAction,
  type DeviceContext,
  type DeviceKey,
  type DeviceKeysClock,
  type DeviceKeysState,
  type PadPress,
} from '../../src/ui/live/deviceKeys'

/** PADS, group A shown, nothing open, stopped, quantized, no effect. */
const CTX: DeviceContext = {
  keysOn: false,
  octave: 4,
  group: 0,
  bars: 1,
  stepOpen: false,
  sampleOn: false,
  handsFree: false,
  sampleTaking: false,
  sampleBusy: false,
  recordArmed: false,
  erase: false,
  arpOn: false,
  fxIndex: 0,
  editPage: 0,
  quantize: true,
  shift: false,
  now: 0,
}
const ctx = (over: Partial<DeviceContext> = {}): DeviceContext => ({ ...CTX, ...over })

/** Runs presses one after another from [s], gathering the actions. */
class Run {
  actions: DeviceAction[] = []
  constructor(
    public s: DeviceKeysState = DEVICE_KEYS_IDLE,
    public c: DeviceContext = CTX,
  ) {}
  take(r: { state: DeviceKeysState; actions: readonly DeviceAction[] }): this {
    this.s = r.state
    this.actions.push(...r.actions)
    return this
  }
  down(k: DeviceKey, keyboard = false): this {
    return this.take(keyDown(this.s, k, this.c, keyboard))
  }
  up(k: DeviceKey, long = false): this {
    return this.take(keyUp(this.s, k, this.c, long))
  }
  tap(k: DeviceKey): this {
    return this.down(k).up(k)
  }
  latch(k: DeviceKey): this {
    return this.take(keyLatch(this.s, k, this.c))
  }
  pad(label: string, note = 60): boolean {
    const offset = ['.', '0', 'ENTER', '1', '2', '3', '4', '5', '6', '7', '8', '9'].indexOf(label)
    const r = padDown(this.s, { offset, label, note }, this.c)
    this.take(r)
    return r.taken
  }
  mp(dir: number): this {
    return this.take(minusPlus(this.s, dir, this.c))
  }
  /** The actions so far, then none. */
  out(): DeviceAction[] {
    const a = this.actions
    this.actions = []
    return a
  }
}

describe('pages', () => {
  it('SOUND, TIMING and FX tapped open their page, tapped again go back to MAIN; MAIN tapped goes back too', () => {
    const r = new Run()
    r.tap('SOUND')
    expect(r.s.page).toBe('SOUND')
    expect(r.out()).toEqual([{ kind: 'enter', page: 'SOUND' }])
    r.tap('SOUND')
    expect(r.s.page).toBe('MAIN')
    r.tap('TIMING').tap('FX')
    expect(r.s.page).toBe('FX')
    r.tap('FX')
    expect(r.s.page).toBe('MAIN')
    r.tap('TIMING')
    r.out()
    r.tap('MAIN')
    expect(r.s.page).toBe('MAIN')
    expect(r.out()).toEqual([{ kind: 'mainHold', on: true }, { kind: 'mainHold', on: false }, { kind: 'enter', page: 'MAIN' }])
  })

  it('MAIN leaves SAMPLE as it goes to MAIN, and SOUND from KEYS goes back to the pads', () => {
    const r = new Run(DEVICE_KEYS_IDLE, ctx({ sampleOn: true }))
    r.tap('MAIN')
    expect(r.out()).toContainEqual({ kind: 'leaveSample' })
    const k = new Run(DEVICE_KEYS_IDLE, ctx({ keysOn: true }))
    k.tap('SOUND')
    expect(k.out()).toEqual([{ kind: 'keysMode', on: false }, { kind: 'enter', page: 'SOUND' }])
    expect(k.s.page).toBe('SOUND')
  })

  it('TEMPO tapped opens its page; on it each press taps the tempo as it goes down', () => {
    const r = new Run()
    r.tap('TEMPO')
    expect(r.out()).toEqual([{ kind: 'enter', page: 'TEMPO' }])
    r.down('TEMPO')
    expect(r.out()).toEqual([{ kind: 'tapTempo' }])
    r.up('TEMPO')
    expect(r.out()).toEqual([])
    expect(r.s.page).toBe('TEMPO')
  })

  it('SHIFT + SOUND is EDIT (from KEYS too); SHIFT + FX is OUTPUT, its + SIDECHAIN and back with −', () => {
    const r = new Run(DEVICE_KEYS_IDLE, ctx({ keysOn: true }))
    r.down('SHIFT').down('SOUND')
    expect(r.s.page).toBe('EDIT')
    expect(r.out()).toEqual([{ kind: 'keysMode', on: false }, { kind: 'enter', page: 'EDIT' }])
    // Both spent: letting go is nothing more (SHIFT isn't clicked on, SOUND opens no page).
    r.up('SOUND').up('SHIFT')
    expect(r.out()).toEqual([])
    expect(shiftHeld(r.s)).toBe(false)
    const f = new Run(DEVICE_KEYS_IDLE, ctx({ shift: true }))
    f.tap('FX')
    expect(f.s.page).toBe('OUTPUT')
    f.c = CTX
    expect(canStep(f.s, f.c, -1)).toBe(false)
    f.mp(1)
    expect(f.s.page).toBe('SIDECHAIN')
    expect(canStep(f.s, f.c, 1)).toBe(false)
    f.mp(-1)
    expect(f.s.page).toBe('OUTPUT')
  })

  it('SHIFT + SOUND held long says SAVED (arc keeps every turn); on TRIM, crop is not in arc', () => {
    const r = new Run(DEVICE_KEYS_IDLE, ctx({ shift: true }))
    r.down('SOUND')
    r.out()
    r.up('SOUND', true)
    expect(r.out()).toEqual([{ kind: 'saved' }])
    // On TRIM it would crop the sample file: not in arc.
    r.c = ctx({ shift: true, editPage: EDIT_PAGES.indexOf('TRIM') })
    r.down('SOUND').up('SOUND', true)
    expect(r.out()).toEqual([{ kind: 'notInArc', what: 'CROP' }])
  })
})

describe('keys held, spent, latched', () => {
  it('KEYS tapped switches pads and keys; held, − / + are the octave and its release is no tap', () => {
    const r = new Run()
    r.tap('KEYS')
    expect(r.out()).toEqual([{ kind: 'keysMode', on: true }])
    r.down('KEYS').mp(1)
    expect(r.out()).toEqual([{ kind: 'octave', step: 1 }])
    r.up('KEYS')
    expect(r.out()).toEqual([])
  })

  it('KEYS held takes a pad as the key (its note class), and a knob turned spends it', () => {
    const r = new Run()
    r.down('KEYS')
    expect(r.pad('5', 67)).toBe(true)
    expect(r.out()).toEqual([{ kind: 'keysRoot', root: 7 }])
    r.up('KEYS')
    expect(r.out()).toEqual([])
    const t = new Run()
    t.down('KEYS')
    t.s = knobTurned(t.s)
    t.up('KEYS')
    expect(t.out()).toEqual([])
  })

  it('a right-click holds a key until the next: KEYS latched steps the octave, let go of with no tap', () => {
    const r = new Run()
    r.latch('KEYS')
    expect(r.s.latched.has('KEYS')).toBe(true)
    r.mp(-1)
    expect(r.out()).toEqual([{ kind: 'octave', step: -1 }])
    r.latch('KEYS')
    expect(r.s.latched.has('KEYS')).toBe(false)
    expect(r.out()).toEqual([])
    // A left press on a latched key lets it go too, with no tap.
    r.latch('KEYS').down('KEYS').up('KEYS')
    expect(r.s.latched.has('KEYS')).toBe(false)
    expect(r.out()).toEqual([])
  })

  it('FX latched plays the punch-ins until the next right-click; held past the hold time too', () => {
    const r = new Run()
    r.latch('FX')
    expect(r.out()).toEqual([{ kind: 'punch', on: true }])
    r.latch('FX')
    expect(r.out()).toEqual([{ kind: 'punch', on: false }])
    expect(r.s.page).toBe('MAIN')
    r.down('FX')
    r.take(keyLongHeld(r.s, 'FX', CTX))
    expect(r.out()).toEqual([{ kind: 'punch', on: true }])
    r.up('FX', true)
    expect(r.out()).toEqual([{ kind: 'punch', on: false }])
    expect(r.s.page).toBe('MAIN')
  })

  it('SHIFT clicked is held for the next key that uses it, or let go of by another click', () => {
    const r = new Run()
    r.tap('SHIFT')
    expect(r.s.shiftOnce).toBe(true)
    r.tap('SHIFT')
    expect(r.s.shiftOnce).toBe(false)
    r.tap('SHIFT').tap('B')
    expect(r.out()).toEqual([{ kind: 'undo' }])
    expect(r.s.shiftOnce).toBe(false)
  })

  it('a press taken away does nothing, not even its number', () => {
    const r = new Run()
    r.down('SOUND')
    r.pad('4')
    r.out()
    r.s = keyCancel(r.s, 'SOUND', CTX).state
    expect(r.s.down.size).toBe(0)
    expect(r.s.dialKey).toBeNull()
  })
})

describe('numbers typed on the pads', () => {
  it('SOUND held: the pads type a slot, put on the pad as SOUND lets go (or at ENTER)', () => {
    const r = new Run()
    r.down('SOUND')
    expect(r.pad('1')).toBe(true)
    expect(r.pad('2')).toBe(true)
    expect(r.s.dial).toBe('12')
    r.up('SOUND')
    expect(r.out()).toEqual([{ kind: 'assign', slot: 12 }])
    expect(r.s.page).toBe('MAIN')
    r.down('SOUND')
    r.pad('3')
    r.pad('ENTER')
    expect(r.out()).toEqual([{ kind: 'assign', slot: 3 }])
    r.up('SOUND')
    expect(r.out()).toEqual([])
  })

  it('held and let go with nothing done, SOUND opens the pad sheet, TEMPO the tempo sheet, MAIN the project sheet', () => {
    const r = new Run()
    r.down('SOUND').up('SOUND', true).down('TEMPO').up('TEMPO', true)
    expect(r.out()).toEqual([
      { kind: 'sheet', sheet: 'SOUND' },
      { kind: 'sheet', sheet: 'TEMPO' },
    ])
    r.down('MAIN').up('MAIN', true)
    expect(r.out()).toEqual([{ kind: 'mainHold', on: true }, { kind: 'mainHold', on: false }, { kind: 'sheet', sheet: 'PROJECT' }])
  })

  it('TEMPO held types the tempo (the decimals left out); a group held its pattern, 1 to 99', () => {
    const r = new Run()
    r.down('TEMPO')
    for (const l of ['1', '2', '8', '.', '5']) expect(r.pad(l)).toBe(true)
    r.up('TEMPO')
    expect(r.out()).toEqual([{ kind: 'tempo', bpm: 285 }])
    r.down('C')
    expect(r.out()).toEqual([{ kind: 'group', group: 2 }])
    r.pad('1')
    r.pad('0')
    r.pad('7')
    r.up('C')
    expect(r.out()).toEqual([{ kind: 'patternPick', group: 2, n: 7 }])
  })

  it('MAIN held lets PROJECT take 1 to 9 (spending MAIN); its ENTER is a song, not in arc', () => {
    const r = new Run()
    r.down('MAIN')
    r.out()
    expect(r.pad('3')).toBe(false)
    expect(r.pad('ENTER')).toBe(true)
    expect(r.out()).toEqual([{ kind: 'notInArc', what: 'SONG' }])
    r.up('MAIN')
    expect(r.out()).toEqual([{ kind: 'mainHold', on: false }])
  })

  it('FADER held gives the fader the pad\'s print (LEVEL over 7)', () => {
    const r = new Run()
    r.down('FADER')
    expect(r.pad('7')).toBe(true)
    expect(r.out()).toEqual([{ kind: 'faderAssign', group: 0, param: 'LEVEL' }])
    // Each pad gives what is printed over it: 7 8 9 / 4 5 6 / 1 2 3 / . 0 ENTER.
    expect([9, 10, 11, 6, 7, 8, 3, 4, 5, 0, 1, 2].map(faderParamAt)).toEqual(['LEVEL', 'PITCH', 'TIME', 'LPF', 'HPF', 'FX', 'ATK', 'REL', 'PAN', 'TUNE', 'VEL', 'MOD'])
  })

  it('TIMING held: the pad repeats (RPT on while it is held), unless RPT is on already', () => {
    const r = new Run()
    r.down('TIMING')
    expect(r.pad('1')).toBe(false)
    expect(r.out()).toEqual([{ kind: 'repeat', on: true }])
    r.pad('2')
    expect(r.out()).toEqual([])
    r.up('TIMING')
    expect(r.out()).toEqual([{ kind: 'repeat', on: false }])
    expect(r.s.page).toBe('MAIN')
    const on = new Run(DEVICE_KEYS_IDLE, ctx({ arpOn: true }))
    on.down('TIMING')
    on.pad('1')
    on.up('TIMING')
    expect(on.out()).toEqual([])
  })

  it('in SAMPLE, SHIFT + a pad records into it hands-free', () => {
    const r = new Run(DEVICE_KEYS_IDLE, ctx({ sampleOn: true, group: 1 }))
    r.tap('SHIFT')
    expect(r.pad('9')).toBe(true)
    expect(r.out()).toEqual([{ kind: 'handsFree', group: 1, offset: 11 }])
    expect(r.s.shiftOnce).toBe(false)
  })

  it('on SIDECHAIN a group held and a pad is the source; SHIFT + a group a destination', () => {
    const r = new Run({ ...DEVICE_KEYS_IDLE, page: 'SIDECHAIN' })
    r.down('B')
    r.out()
    expect(r.pad('0')).toBe(true)
    r.up('B')
    expect(r.out()).toEqual([{ kind: 'sidechainSource', group: 1, offset: 1 }])
    r.tap('SHIFT').tap('D')
    expect(r.out()).toEqual([{ kind: 'sidechainDest', group: 3 }])
  })
})

describe('the device view going, a take going on, a knob turned', () => {
  it('lets go of every key, latched ones too: solos, punch-ins, repeat, SHIFT clicked, the page', () => {
    const r = new Run()
    r.latch('FX')
    r.tap('B')
    r.latch('TIMING')
    r.pad('1')
    r.latch('ERASE')
    r.tap('SHIFT')
    r.s = { ...r.s, page: 'TIMING' }
    r.out()
    r.take(dropAll(r.s, ctx({ arpOn: false })))
    const out = r.out()
    expect(out).toContainEqual({ kind: 'solo', groups: new Set() })
    expect(out).toContainEqual({ kind: 'punch', on: false })
    expect(out).toContainEqual({ kind: 'repeat', on: false })
    expect(out).toContainEqual({ kind: 'erase', on: false })
    expect(out).toContainEqual({ kind: 'enter', page: 'MAIN' })
    expect(r.s.latched.size + r.s.down.size).toBe(0)
    expect(r.s.shiftOnce).toBe(false)
  })

  it("a group key held on the computer's keyboard types only once held: a key rolled into a pad key plays it", () => {
    const r = new Run(DEVICE_KEYS_IDLE, ctx({ now: 1000 }))
    r.down('B', true)
    r.c = ctx({ now: 1000 + DEVICE_HOLD_MS - 1, group: 1 })
    expect(r.pad('7')).toBe(false)
    r.c = ctx({ now: 1000 + DEVICE_HOLD_MS, group: 1 })
    expect(r.pad('7')).toBe(true)
    r.up('B')
    expect(r.out()).toContainEqual({ kind: 'patternPick', group: 1, n: 7 })
    // A pointer's hold types at once.
    r.c = ctx({ now: 5000, group: 1 })
    r.down('C')
    expect(r.pad('2')).toBe(true)
  })

  it('no page opens over a take going on (it would end it): the plate says so', () => {
    const r = new Run(DEVICE_KEYS_IDLE, ctx({ sampleBusy: true, sampleOn: true }))
    r.tap('SOUND').tap('TEMPO')
    expect(r.s.page).toBe('MAIN')
    expect(r.out()).toEqual([{ kind: 'sampleBusy' }, { kind: 'sampleBusy' }])
  })

  it('a knob turned with SOUND or a group held spends them: no sheet, no number', () => {
    const r = new Run()
    r.down('SOUND')
    r.s = knobTurned(r.s)
    r.up('SOUND', true)
    expect(r.out()).toEqual([])
    r.down('D')
    r.out()
    r.s = knobTurned(r.s)
    expect(r.s.spent.has('D')).toBe(true)
  })
})

describe('ERASE, SHIFT and the group keys', () => {
  it('ERASE tapped latches on and off; held it erases while held and lets go', () => {
    const r = new Run()
    r.tap('ERASE')
    expect(r.out()).toEqual([{ kind: 'erase', on: true }])
    r.c = ctx({ erase: true })
    r.tap('ERASE')
    expect(r.out()).toEqual([{ kind: 'erase', on: false }])
    r.c = CTX
    r.down('ERASE')
    r.pad('1')
    r.up('ERASE')
    expect(r.out()).toEqual([{ kind: 'erase', on: true }, { kind: 'erase', on: false }])
    r.down('ERASE').up('ERASE', true)
    expect(r.out()).toEqual([{ kind: 'erase', on: true }, { kind: 'erase', on: false }])
  })

  it('ERASE + a group clears its pattern; + MAIN the scene; SHIFT + ERASE is the system settings', () => {
    const r = new Run()
    r.down('ERASE').down('B').up('B').up('ERASE')
    expect(r.out()).toEqual([{ kind: 'erase', on: true }, { kind: 'clear', group: 1 }, { kind: 'erase', on: false }])
    r.down('ERASE').down('MAIN').up('MAIN').up('ERASE')
    expect(r.out()).toEqual([{ kind: 'erase', on: true }, { kind: 'sceneErase' }, { kind: 'mainHold', on: false }, { kind: 'erase', on: false }])
    r.tap('SHIFT').tap('ERASE')
    expect(r.out()).toEqual([{ kind: 'notInArc', what: 'SYSTEM' }])
  })

  it('SHIFT + A the next free pattern, + B undo, + C copies (twice: the pattern), + D pastes; not on SOUND', () => {
    const r = new Run(DEVICE_KEYS_IDLE, ctx({ shift: true, group: 2 }))
    r.tap('A').tap('B').tap('C')
    r.c = ctx({ shift: true, group: 2, now: 500 })
    r.tap('C').tap('D')
    expect(r.out()).toEqual([
      { kind: 'nextFree', group: 2 },
      { kind: 'undo' },
      { kind: 'copy', group: 2, pattern: false },
      { kind: 'copy', group: 2, pattern: true },
      { kind: 'paste', group: 2 },
    ])
    r.s = { ...r.s, page: 'SOUND' }
    r.tap('C')
    expect(r.out()).toEqual([{ kind: 'notInArc', what: 'COPY_SOUND' }])
  })

  it('SHIFT + MAIN commits the scene; SHIFT + TIMING is timing correct; SHIFT + SAMPLE is CHOP', () => {
    const r = new Run(DEVICE_KEYS_IDLE, ctx({ shift: true }))
    r.tap('MAIN').tap('TIMING').tap('SAMPLE')
    expect(r.out()).toEqual([{ kind: 'sceneCommit' }, { kind: 'mainHold', on: false }, { kind: 'correct' }, { kind: 'notInArc', what: 'CHOP' }])
  })

  it('FX + group keys solo them while held (several, several); SAMPLE + TEMPO and MAIN + TEMPO are not in arc', () => {
    const r = new Run()
    r.down('FX').down('C').down('A').up('C').up('A').up('FX')
    expect(r.out()).toEqual([
      { kind: 'solo', groups: new Set([2]) },
      { kind: 'solo', groups: new Set([2, 0]) },
      { kind: 'solo', groups: new Set([0]) },
      { kind: 'solo', groups: new Set() },
    ])
    expect(r.s.page).toBe('MAIN')
    // FX let go first: every solo goes with it.
    r.down('FX').down('B').up('FX')
    expect(r.out()).toEqual([{ kind: 'solo', groups: new Set([1]) }, { kind: 'solo', groups: new Set() }])
    r.up('B')
    expect(r.out()).toEqual([])
    r.down('SAMPLE').down('TEMPO').up('TEMPO').up('SAMPLE')
    expect(r.out()).toEqual([{ kind: 'notInArc', what: 'TEMPO_DETECT' }])
  })

  it('FX latched: a group tap soloes it, again lets it go; FX let go of ends them all', () => {
    const r = new Run()
    r.latch('FX')
    r.out()
    r.tap('B').tap('D')
    expect(r.out()).toEqual([
      { kind: 'solo', groups: new Set([1]) },
      { kind: 'solo', groups: new Set([1, 3]) },
    ])
    // The taps select no group.
    r.tap('B')
    expect(r.out()).toEqual([{ kind: 'solo', groups: new Set([3]) }])
    r.latch('FX')
    expect(r.out()).toEqual([{ kind: 'solo', groups: new Set() }, { kind: 'punch', on: false }])
  })

  it('SHIFT + FADER resets (and restores) the shown group, ERASE + FADER is automation, not in arc', () => {
    const r = new Run(DEVICE_KEYS_IDLE, ctx({ group: 3 }))
    r.tap('SHIFT').tap('FADER')
    expect(r.out()).toEqual([{ kind: 'faderReset', group: 3 }])
    r.down('ERASE').down('FADER').up('FADER').up('ERASE')
    expect(r.out()).toContainEqual({ kind: 'notInArc', what: 'AUTOMATION' })
  })

  it('SAMPLE tapped opens or closes its panel; during a hands-free take it stops it', () => {
    expect(new Run().tap('SAMPLE').out()).toEqual([{ kind: 'sample' }])
    expect(new Run(DEVICE_KEYS_IDLE, ctx({ sampleTaking: true })).tap('SAMPLE').out()).toEqual([{ kind: 'sampleStop' }])
  })
})

describe('− and +', () => {
  it('step what is held, then what is open, then the page, then KEYS, else the group', () => {
    const s = DEVICE_KEYS_IDLE
    const held = (...k: DeviceKey[]): DeviceKeysState => ({ ...s, down: new Set(k) })
    expect(minusPlusRoute(held('KEYS', 'A', 'MAIN', 'RECORD'), CTX)).toBe('octave')
    expect(minusPlusRoute(held('A', 'MAIN', 'RECORD'), CTX)).toBe('pattern')
    expect(minusPlusRoute(held('MAIN', 'RECORD'), CTX)).toBe('scene')
    expect(minusPlusRoute(held('RECORD'), CTX)).toBe('length')
    expect(minusPlusRoute(s, ctx({ recordArmed: true, stepOpen: true }))).toBe('length')
    expect(minusPlusRoute(s, ctx({ stepOpen: true, sampleOn: true }))).toBe('step')
    expect(minusPlusRoute(s, ctx({ sampleOn: true }))).toBe('sampleSource')
    expect(minusPlusRoute(s, ctx({ sampleOn: true, handsFree: true }))).toBe('sampleBars')
    const pages = { SOUND: 'slot', EDIT: 'editPage', TIMING: 'timing', FX: 'fx', OUTPUT: 'output', SIDECHAIN: 'sidechain' } as const
    for (const [page, route] of Object.entries(pages)) expect(minusPlusRoute({ ...s, page: page as keyof typeof pages }, CTX)).toBe(route)
    expect(minusPlusRoute({ ...s, page: 'TEMPO' }, ctx({ keysOn: true }))).toBe('octave')
    expect(minusPlusRoute(s, CTX)).toBe('group')
  })

  it("light where they can step: the group's and the octave's ends, the length, EDIT's pages, the effects, quantize or free", () => {
    const s = DEVICE_KEYS_IDLE
    expect([canStep(s, CTX, -1), canStep(s, CTX, 1)]).toEqual([false, true])
    expect(canStep(s, ctx({ keysOn: true, octave: MAX_OCTAVE }), 1)).toBe(false)
    expect(canStep(s, ctx({ recordArmed: true, bars: 1 }), -1)).toBe(false)
    expect(canStep(s, ctx({ recordArmed: true, bars: 64, shift: true }), 1)).toBe(false)
    expect(canStep({ ...s, page: 'EDIT' }, ctx({ editPage: EDIT_PAGE_COUNT - 1 }), 1)).toBe(false)
    expect(EDIT_PAGE_COUNT).toBe(EDIT_PAGES.length)
    expect(DEVICE_HOLD_MS).toBe(FN_HOLD_MS)
    expect(canStep({ ...s, page: 'FX' }, ctx({ fxIndex: FX_TYPES.length - 1 }), 1)).toBe(false)
    expect([canStep({ ...s, page: 'TIMING' }, CTX, -1), canStep({ ...s, page: 'TIMING' }, CTX, 1)]).toEqual([false, true])
  })

  it('carry the group, the pattern, the scene, the length (SHIFT + + doubles), the slot (SHIFT: ten)', () => {
    const r = new Run()
    r.mp(1)
    expect(r.out()).toEqual([{ kind: 'group', group: 1 }])
    r.down('B').mp(-1).up('B')
    expect(r.out()).toEqual([{ kind: 'group', group: 1 }, { kind: 'pattern', group: 1, step: -1 }])
    r.down('MAIN').mp(1).up('MAIN')
    expect(r.out()).toEqual([{ kind: 'mainHold', on: true }, { kind: 'scene', step: 1 }, { kind: 'mainHold', on: false }])
    r.down('RECORD').mp(1)
    expect(r.s.spent.has('RECORD')).toBe(true)
    r.up('RECORD')
    r.c = ctx({ recordArmed: true, shift: true, bars: 2 })
    r.mp(1)
    expect(r.out()).toEqual([{ kind: 'length', group: 0, step: 1 }, { kind: 'double', group: 0 }])
    r.c = CTX
    r.s = { ...r.s, page: 'SOUND' }
    r.mp(1)
    r.tap('SHIFT')
    r.mp(-1)
    expect(r.out()).toEqual([{ kind: 'slot', step: 1 }, { kind: 'slot', step: -10 }])
    r.s = { ...r.s, page: 'TIMING' }
    r.mp(1)
    r.c = ctx({ quantize: false })
    r.mp(-1)
    expect(r.out()).toEqual([{ kind: 'quantize', on: false }, { kind: 'quantize', on: true }])
  })
})

describe('slotStep', () => {
  const slots = [1, 2, 5, 9, 14, 40, 101]
  it('one steps to the next sound either way; none past the ends', () => {
    expect(slotStep(slots, 2, 1)).toBe(5)
    expect(slotStep(slots, 2, -1)).toBe(1)
    expect(slotStep(slots, 3, 1)).toBe(5)
    expect(slotStep(slots, 101, 1)).toBeNull()
    expect(slotStep(slots, 1, -1)).toBeNull()
    expect(slotStep(slots, 0, 1)).toBe(1)
    expect(slotStep([], 0, 1)).toBeNull()
  })
  it('ten (SHIFT) goes to the first sound ten slots on, or the last there is', () => {
    expect(slotStep(slots, 2, 10)).toBe(14)
    expect(slotStep(slots, 40, 10)).toBe(101)
    expect(slotStep(slots, 40, -10)).toBe(14)
    expect(slotStep(slots, 5, -10)).toBe(1)
    expect(slotStep(slots, 101, 10)).toBeNull()
  })
})

describe('DeviceKeys, the layer', () => {
  /** A clock the test moves on by hand. */
  function clock(): DeviceKeysClock & { t: number; run(ms: number): void } {
    let timers: { at: number; fn: () => void; id: number }[] = []
    let id = 0
    return {
      t: 0,
      now() {
        return this.t
      },
      set(fn, ms) {
        timers.push({ at: this.t + ms, fn, id: ++id })
        return id
      },
      clear(h) {
        timers = timers.filter((x) => x.id !== h)
      },
      run(ms) {
        this.t += ms
        const due = timers.filter((x) => x.at <= this.t)
        timers = timers.filter((x) => x.at > this.t)
        for (const x of due) x.fn()
      },
    }
  }
  function layer(over: Partial<DeviceContext> = {}) {
    const run = vi.fn<(a: DeviceAction) => void>()
    const ck = clock()
    const host = { context: () => ({ ...CTX, ...over, bars: [1, 2, 4, 8] }), run }
    const l = new DeviceKeys(host, ck)
    let group = 0
    const setGroup = vi.fn((g: number) => (group = g))
    const detach = l.attach({ group: () => group, setGroup })
    return { l, run, ck, setGroup, detach }
  }

  it('times a hold by its press: past DEVICE_HOLD_MS a release is a hold (the sheet), short of it a tap', () => {
    const { l, run } = layer()
    l.down('SOUND', 100)
    l.up('SOUND', 100 + DEVICE_HOLD_MS)
    expect(run).toHaveBeenLastCalledWith({ kind: 'sheet', sheet: 'SOUND' })
    l.down('SOUND', 1000)
    l.up('SOUND', 1100)
    expect(run).toHaveBeenLastCalledWith({ kind: 'enter', page: 'SOUND' })
    expect(l.page).toBe('SOUND')
  })

  it("FX held past the hold time plays the punch-ins as it is held", () => {
    const { l, run, ck } = layer()
    l.down('FX', 0)
    ck.run(DEVICE_HOLD_MS)
    expect(run).toHaveBeenLastCalledWith({ kind: 'punch', on: true })
    l.up('FX', DEVICE_HOLD_MS + 10)
    expect(run).toHaveBeenLastCalledWith({ kind: 'punch', on: false })
    expect(l.page).toBe('MAIN')
  })

  it('takes the pads a held key takes, and their releases with them', () => {
    const { l } = layer()
    const pad: PadPress = { offset: 3, label: '1', note: 63 }
    expect(l.pad('pad:3', pad)).toBe(false)
    expect(l.padUp('pad:3')).toBe(false)
    l.down('SOUND')
    expect(l.pad('pad:3', pad)).toBe(true)
    l.up('SOUND')
    expect(l.padUp('pad:3')).toBe(true)
    expect(l.padUp('pad:3')).toBe(false)
  })

  it("sets the view's group (clamped), reads its length, and goes back to MAIN as the view goes", () => {
    const { l, run, setGroup, detach } = layer()
    l.minusPlus(1)
    expect(setGroup).toHaveBeenLastCalledWith(1)
    expect(run).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'group' }))
    l.down('RECORD')
    l.minusPlus(1)
    expect(run).toHaveBeenLastCalledWith({ kind: 'length', group: 1, step: 1 })
    l.up('RECORD')
    l.tap('TIMING')
    expect(l.page).toBe('TIMING')
    detach()
    expect(l.page).toBe('MAIN')
  })

  it("the computer's Shift is SHIFT: a press with it takes SHIFT's meaning", () => {
    const { l } = layer()
    l.setShiftKey(true)
    expect(l.shiftHeld()).toBe(true)
    l.tap('SOUND')
    expect(l.page).toBe('EDIT')
    l.setShiftKey(false)
    l.tap('SOUND')
    expect(l.page).toBe('SOUND')
    // A press made with Shift held counts too.
    l.toMain()
    l.tap('FX', true)
    expect(l.page).toBe('OUTPUT')
  })

  it('shows a value on the digits and the plate for a moment, a word then the next', () => {
    const { l, ck } = layer()
    l.show('EDT', 1000, 'TRM')
    expect(l.flash.value).toBe('EDT')
    ck.run(1000)
    expect(l.flash.value).toBe('TRM')
    ck.run(1000)
    expect(l.flash.value).toBeNull()
    l.say('LENGTH · 2 BARS')
    l.say('LENGTH · 4 BARS')
    expect(l.said.value).toEqual({ text: 'LENGTH · 4 BARS', n: 2 })
    ck.run(2000)
    expect(l.said.value).toBeNull()
    l.blink('COPY')
    expect(l.lcd.value).toBe('COPY')
  })

  it('the view going lets go of latched keys too, ending the solos; another project ends them as well', () => {
    const { l, run, detach } = layer()
    l.latch('FX')
    l.tap('C')
    expect(run).toHaveBeenLastCalledWith({ kind: 'solo', groups: new Set([2]) })
    l.endSolo()
    expect(run).toHaveBeenLastCalledWith({ kind: 'solo', groups: new Set() })
    l.tap('A')
    detach()
    expect(run).toHaveBeenCalledWith({ kind: 'punch', on: false })
    expect(l.state.value.latched.size).toBe(0)
    expect(l.state.value.soloing.size).toBe(0)
  })

  it('Esc and a panel opening go back to MAIN; releaseAll lets go of what is down, not what is latched', () => {
    const { l } = layer()
    expect(l.toMain()).toBe(false)
    l.tap('FX')
    expect(l.toMain()).toBe(true)
    l.tap('TIMING')
    l.panelOpened()
    expect(l.page).toBe('MAIN')
    l.latch('KEYS')
    l.down('FADER')
    l.releaseAll()
    expect(l.state.value.down.size).toBe(0)
    expect(l.state.value.latched.has('KEYS')).toBe(true)
  })
})
