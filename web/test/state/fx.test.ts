// Port of app/src/test/kotlin/dev/arc/ep133/controller/FxPlanTest.kt (FxDesk, punchSlotForPad,
// punchDepth, sidechainIndex, duckSource), plus the web's FxKeeper (the library's kv row "fx",
// written once the knobs rest) and the controller's FX: the voices' bus, the tempo, the project.
import 'fake-indexeddb/auto'
import { effect } from '@preact/signals'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FADER_ENV_MS, FxBook, FxSettings, FxType, levelGain } from '../../src/core/features/fxSettings'
import { physicalPad } from '../../src/core/features/padNotes'
import { FxControl } from '../../src/core/formats/fx/fxBus'
import { memoryStorage } from '../../src/platform/storage/settings'
import {
  FADER_DEFAULTS,
  FADER_PARAMS,
  FIRST_SEND,
  FX_SAVE_MS,
  faderParamSupported,
  silencedGroup,
  FxDesk,
  FxKeeper,
  PUNCH_MIN_DEPTH,
  duckSource,
  punchDepth,
  punchSlotForPad,
  sidechainIndex,
  type FxStore,
} from '../../src/state/fx'
import { disposeAll, liveHarness, until, type LiveHarness } from './liveHarness'

afterEach(() => disposeAll())

type Sent = [number, number, number, number]

function desk(): { d: FxDesk; sent: Sent[]; edits: number[] } {
  const sent: Sent[] = []
  const edits = [0]
  const d = new FxDesk((w, i, x, y) => sent.push([w, i, x, y]), () => edits[0]!++)
  return { d, sent, edits }
}

describe('punch-ins', () => {
  it("each pad's slot is the one printed on it", () => {
    // Offsets: '.', 0, ENTER, 1..9.
    expect([0, 1, 2, 3, 9, 11].map(punchSlotForPad)).toEqual([0, 1, 2, 3, 9, 11])
    expect(punchSlotForPad(12)).toBe(-1)
    expect(punchSlotForPad(-1)).toBe(-1)
  })

  it('depth: never 0 while held, never past 1', () => {
    expect(punchDepth(0)).toBe(PUNCH_MIN_DEPTH)
    expect(punchDepth(Number.NaN)).toBe(PUNCH_MIN_DEPTH)
    expect(punchDepth(0.4)).toBe(0.4)
    expect(punchDepth(3)).toBe(1)
  })

  it('down, deeper, up; all up lets go of what is held', () => {
    const { d, sent } = desk()
    d.punchDown(4, 0.5)
    d.punchDown(9, 0)
    d.punchMove(4, 0.8)
    d.punchMove(7, 0.8) // not held: nothing
    expect([...d.punches.value]).toEqual([4, 9])
    d.punchUp(4)
    d.punchUp(4)
    d.punchAllUp()
    expect(sent).toEqual([
      [FxControl.PUNCH, 4, 0.5, 0],
      [FxControl.PUNCH, 9, PUNCH_MIN_DEPTH, 0],
      [FxControl.PUNCH, 4, 0.8, 0],
      [FxControl.PUNCH, 4, 0, 0],
      [FxControl.PUNCH, 9, 0, 0],
    ])
    expect(d.punches.value.size).toBe(0)
    d.punchDown(FxControl.SLOTS, 1)
    expect(sent).toHaveLength(5)
  })
})

describe('sidechain', () => {
  it('ducks its groups only while on; its source is one pad', () => {
    const on = FxSettings.withSidechain(FxSettings.DEFAULT, { ...FxSettings.DEFAULT.sidechain, on: true, group: 1, pad: 3, dests: 0b0101 })
    expect(sidechainIndex(on.sidechain)).toBe(0b0101)
    expect(sidechainIndex({ ...on.sidechain, on: false })).toBe(0)
    expect(duckSource(on, physicalPad(1, 3))).toBe(true)
    expect(duckSource(on, physicalPad(0, 3))).toBe(false)
    expect(duckSource(FxSettings.withSidechain(on, { ...on.sidechain, on: false }), physicalPad(1, 3))).toBe(false)
  })
})

describe('FxDesk', () => {
  it('an effect put on with no send gets the pad group heard; tapped again, it goes off', () => {
    const { d, sent, edits } = desk()
    d.load(null)
    sent.length = 0
    d.setType('REVERB', 2)
    expect(d.fx.value.type).toBe('REVERB')
    expect(d.fx.value.sends).toEqual([0, 0, FIRST_SEND, 0])
    expect(sent).toEqual([
      [FxControl.FX_TYPE, 2, 0.5, 0.5],
      [FxControl.SEND, 2, FIRST_SEND, 0],
    ])
    d.setType('DELAY', 0)
    // A group already sends: none added.
    expect(d.fx.value.sends).toEqual([0, 0, FIRST_SEND, 0])
    d.setType('DELAY')
    expect(d.fx.value.type).toBe('NONE')
    expect(edits[0]).toBe(4)
  })

  it('a change that changes nothing sends nothing', () => {
    const { d, sent, edits } = desk()
    d.load(null)
    sent.length = 0
    d.setXY(0.5, 0.5)
    d.setComp({})
    d.setSend(7, 1)
    expect(sent).toEqual([])
    expect(edits[0]).toBe(0)
  })

  it("keeps each project's settings, sends the one shown whole, and leaves the defaults out", () => {
    const { d, sent } = desk()
    d.load(null)
    d.switchTo(1)
    d.setXY(0.2, 0.9)
    d.switchTo(2)
    expect(d.fx.value).toEqual(FxSettings.DEFAULT)
    sent.length = 0
    d.switchTo(1)
    expect(d.fx.value.x).toBeCloseTo(0.2)
    // Whole: the effect, four sends, the compressor, the sidechain (and the web's four levels, then each group's faders).
    const faders = [FxControl.GROUP_FILTER, FxControl.GROUP_PAN, FxControl.GROUP_PITCH, FxControl.GROUP_ENV]
    expect(sent.map((s) => s[0])).toEqual([
      FxControl.FX_TYPE,
      FxControl.SEND,
      FxControl.SEND,
      FxControl.SEND,
      FxControl.SEND,
      FxControl.COMP,
      FxControl.SIDECHAIN,
      FxControl.GROUP_LEVEL,
      FxControl.GROUP_LEVEL,
      FxControl.GROUP_LEVEL,
      FxControl.GROUP_LEVEL,
      ...faders,
      ...faders,
      ...faders,
      ...faders,
    ])
    expect([...d.kept().keys()]).toEqual([1])
    d.setXY(0.5, 0.5)
    expect(d.json()).toBeNull()
  })

  it("(web) a group's level goes to the bus as its gain, is kept with the project, and leaves the others alone", () => {
    const { d, sent, edits } = desk()
    d.load(null)
    d.switchTo(1)
    sent.length = 0
    d.setGroupLevel(1, 0.5)
    expect(sent).toEqual([[FxControl.GROUP_LEVEL, 1, levelGain(0.5), 0]])
    expect(d.fx.value.levels).toEqual([1, 0.5, 1, 1])
    expect(edits[0]).toBe(1)
    // The same again, or no such group: nothing.
    d.setGroupLevel(1, 0.5)
    d.setGroupLevel(4, 0)
    d.setGroupLevel(-1, 0)
    expect(sent).toHaveLength(1)
    // Held to 0..1.
    d.setGroupLevel(2, 3)
    expect(d.fx.value.levels[2]).toBe(1)
    // Kept, and back when the project is shown again; another project has its own.
    expect([...d.kept().keys()]).toEqual([1])
    d.switchTo(2)
    expect(d.fx.value.levels).toEqual([1, 1, 1, 1])
    expect(sent.filter((c) => c[0] === FxControl.GROUP_LEVEL).slice(-4)).toEqual([0, 1, 2, 3].map((g) => [FxControl.GROUP_LEVEL, g, 1, 0]))
    d.switchTo(1)
    expect(sent.filter((c) => c[0] === FxControl.GROUP_LEVEL).slice(-4)).toEqual([0, 1, 2, 3].map((g) => [FxControl.GROUP_LEVEL, g, g === 1 ? levelGain(0.5) : 1, 0]))
    expect(FxBook.fromJson(d.json()!)?.get(1)?.levels).toEqual([1, 0.5, 1, 1])
    // Back at 1: nothing left to keep.
    d.setGroupLevel(1, 1)
    expect(d.json()).toBeNull()
  })

  it('edits made before the settings are read win over them', () => {
    const { d } = desk()
    d.switchTo(1)
    d.setComp({ on: true })
    const read = new Map([
      [1, FxSettings.withXY(FxSettings.DEFAULT, 0.1, 0.1)],
      [2, FxSettings.withXY(FxSettings.DEFAULT, 0.3, 0.3)],
    ])
    expect(d.load(read)).toBe(true)
    expect(d.fx.value.comp.on).toBe(true)
    expect(d.fx.value.x).toBe(0.5)
    d.switchTo(2)
    expect(d.fx.value.x).toBeCloseTo(0.3)
    // Read once.
    expect(d.load(new Map())).toBe(false)
  })

  it("(web) a project's FX replaced whole: the one shown is sent, another kept for when it is shown", () => {
    const { d, sent, edits } = desk()
    d.load(null)
    d.switchTo(1)
    sent.length = 0
    const reverb = FxSettings.of({ type: FxType.REVERB, sends: [0.4, 0, 0, 0] })
    d.replace(1, reverb)
    expect(d.of(1)).toEqual(reverb)
    expect(d.fx.value).toEqual(reverb)
    expect(sent.some((c) => c[0] === FxControl.FX_TYPE)).toBe(true)
    expect(edits[0]).toBe(1)
    // The same again: nothing.
    d.replace(1, reverb)
    expect(edits[0]).toBe(1)
    // Another project's: kept, not sent, until it is shown.
    sent.length = 0
    d.replace(2, reverb)
    expect(sent).toEqual([])
    expect(d.of(2)).toEqual(reverb)
    expect(d.of(3)).toEqual(FxSettings.DEFAULT)
    expect([...d.kept().keys()].sort()).toEqual([1, 2])
    d.switchTo(2)
    expect(d.fx.value).toEqual(reverb)
  })
})

describe("(web) FxDesk: the drawn EP-133's fader parameters, mute and solo", () => {
  it('supports all but TIME, VEL and MOD, in pad order', () => {
    expect(FADER_PARAMS).toEqual(['LEVEL', 'PITCH', 'TIME', 'LPF', 'HPF', 'FX', 'ATK', 'REL', 'PAN', 'TUNE', 'VEL', 'MOD'])
    expect(FADER_PARAMS.filter((p) => !faderParamSupported(p))).toEqual(['TIME', 'VEL', 'MOD'])
  })

  it('each parameter goes to the bus as it is heard, is read back, and is kept with the project', () => {
    const { d, sent, edits } = desk()
    d.load(null)
    d.switchTo(1)
    sent.length = 0
    expect(FADER_PARAMS.map((p) => d.groupParam(1, p))).toEqual(FADER_PARAMS.map((p) => FADER_DEFAULTS[p]))
    expect(d.setGroupParam(1, 'LPF', 0.25)).toBe(true)
    expect(d.setGroupParam(1, 'HPF', 0.5)).toBe(true)
    expect(d.setGroupParam(1, 'PAN', 0.75)).toBe(true)
    expect(d.setGroupParam(1, 'PITCH', 1)).toBe(true)
    expect(d.setGroupParam(1, 'TUNE', 0.25)).toBe(true)
    expect(d.setGroupParam(1, 'ATK', 0.5)).toBe(true)
    expect(d.setGroupParam(1, 'REL', 1)).toBe(true)
    expect(sent).toEqual([
      [FxControl.GROUP_FILTER, 1, 0.25, 0],
      [FxControl.GROUP_FILTER, 1, 0.25, 0.5],
      [FxControl.GROUP_PAN, 1, 0.5, 0],
      [FxControl.GROUP_PITCH, 1, 12, 0],
      [FxControl.GROUP_PITCH, 1, 11.5, 0],
      [FxControl.GROUP_ENV, 1, 0.25 * FADER_ENV_MS, 0],
      [FxControl.GROUP_ENV, 1, 0.25 * FADER_ENV_MS, FADER_ENV_MS],
    ])
    expect(edits[0]).toBe(7)
    expect(d.groupParam(1, 'LPF')).toBe(0.25)
    expect(d.groupParam(1, 'TUNE')).toBe(0.25)
    expect(d.groupParam(0, 'LPF')).toBe(1)
    // LEVEL and FX are the level and the send: one value each.
    sent.length = 0
    d.setGroupParam(2, 'LEVEL', 0.5)
    d.setGroupParam(2, 'FX', 0.3)
    expect(sent).toEqual([
      [FxControl.GROUP_LEVEL, 2, levelGain(0.5), 0],
      [FxControl.SEND, 2, Math.fround(0.3), 0],
    ])
    expect(d.fx.value.levels[2]).toBe(0.5)
    expect(d.groupParam(2, 'FX')).toBe(Math.fround(0.3))
    // Not in arc, or no such group: false, nothing.
    sent.length = 0
    expect(d.setGroupParam(1, 'TIME', 0.1)).toBe(false)
    expect(d.setGroupParam(1, 'VEL', 0.1)).toBe(false)
    expect(d.setGroupParam(1, 'MOD', 0.1)).toBe(false)
    expect(d.setGroupParam(4, 'LPF', 0.1)).toBe(false)
    expect(d.groupParam(1, 'VEL')).toBe(FADER_DEFAULTS.VEL)
    // The same again: nothing sent.
    d.setGroupParam(1, 'LPF', 0.25)
    expect(sent).toEqual([])
    // Kept, sent whole when shown again; another project has its own.
    const kept = FxBook.fromJson(d.json()!)?.get(1)
    expect(kept?.faders[1]).toEqual({ PITCH: 1, LPF: 0.25, HPF: 0.5, ATK: 0.5, REL: 1, PAN: 0.75, TUNE: 0.25 })
    d.switchTo(2)
    expect(d.groupParam(1, 'LPF')).toBe(1)
    expect(sent.filter((c) => c[0] === FxControl.GROUP_FILTER)).toEqual([0, 1, 2, 3].map((g) => [FxControl.GROUP_FILTER, g, 1, 0]))
    sent.length = 0
    d.switchTo(1)
    expect(sent.filter((c) => c[1] === 1 && c[0] >= FxControl.GROUP_FILTER)).toEqual([
      [FxControl.GROUP_FILTER, 1, 0.25, 0.5],
      [FxControl.GROUP_PAN, 1, 0.5, 0],
      [FxControl.GROUP_PITCH, 1, 11.5, 0],
      [FxControl.GROUP_ENV, 1, 0.25 * FADER_ENV_MS, FADER_ENV_MS],
    ])
  })

  it('groupParam and faderAssign are read through signals', () => {
    const { d } = desk()
    const seen: number[] = []
    const assigned: string[] = []
    const stop = effect(() => {
      seen.push(d.groupParam(3, 'PAN'))
      assigned.push(d.faderAssign.value[3]!)
    })
    d.setGroupParam(3, 'PAN', 0)
    d.setFaderAssign(3, 'PAN')
    stop()
    expect(seen).toEqual([0.5, 0, 0])
    expect(assigned).toEqual(['LEVEL', 'LEVEL', 'PAN'])
  })

  it("each group's fader is assigned to a parameter arc has, LEVEL by default, kept with the project", () => {
    const { d, sent } = desk()
    d.load(null)
    d.switchTo(1)
    sent.length = 0
    expect(d.faderAssign.value).toEqual(['LEVEL', 'LEVEL', 'LEVEL', 'LEVEL'])
    expect(d.setFaderAssign(2, 'LPF')).toBe(true)
    expect(d.setFaderAssign(2, 'VEL')).toBe(false)
    expect(d.setFaderAssign(5, 'PAN')).toBe(false)
    expect(d.faderAssign.value).toEqual(['LEVEL', 'LEVEL', 'LPF', 'LEVEL'])
    // Nothing for the bus to hear.
    expect(sent).toEqual([])
    expect(FxBook.fromJson(d.json()!)?.get(1)?.assign).toEqual(['LEVEL', 'LEVEL', 'LPF', 'LEVEL'])
    d.switchTo(2)
    expect(d.faderAssign.value[2]).toBe('LEVEL')
    d.switchTo(1)
    expect(d.faderAssign.value[2]).toBe('LPF')
    d.setFaderAssign(2, 'LEVEL')
    expect(d.json()).toBeNull()
  })

  it("resets a group's parameters as one edit, and restores them", () => {
    const { d, sent, edits } = desk()
    d.load(null)
    d.setGroupParam(0, 'LEVEL', 0.5)
    d.setGroupParam(0, 'FX', 0.25)
    d.setGroupParam(0, 'LPF', 0.2)
    d.setGroupParam(0, 'PITCH', 0.75)
    d.setGroupParam(1, 'PAN', 0)
    d.setFaderAssign(0, 'LPF')
    const before = FADER_PARAMS.map((p) => d.groupParam(0, p))
    sent.length = 0
    edits[0] = 0
    const snap = d.resetGroupParams(0)
    expect(FADER_PARAMS.map((p) => snap[p])).toEqual(before)
    expect(FADER_PARAMS.map((p) => d.groupParam(0, p))).toEqual(FADER_PARAMS.map((p) => FADER_DEFAULTS[p]))
    expect(edits[0]).toBe(1)
    // The group whole, as heard at the defaults; group B and the assignment untouched.
    expect(sent).toEqual([
      [FxControl.SEND, 0, 0, 0],
      [FxControl.GROUP_LEVEL, 0, 1, 0],
      [FxControl.GROUP_FILTER, 0, 1, 0],
      [FxControl.GROUP_PAN, 0, 0, 0],
      [FxControl.GROUP_PITCH, 0, 0, 0],
      [FxControl.GROUP_ENV, 0, 0, 0],
    ])
    expect(d.groupParam(1, 'PAN')).toBe(0)
    expect(d.faderAssign.value[0]).toBe('LPF')
    // Reset again: nothing to change, nothing sent.
    sent.length = 0
    d.resetGroupParams(0)
    expect(sent).toEqual([])
    d.restoreGroupParams(0, snap)
    expect(FADER_PARAMS.map((p) => d.groupParam(0, p))).toEqual(before)
    expect(edits[0]).toBe(2)
    expect(sent.find((c) => c[0] === FxControl.GROUP_PITCH)).toEqual([FxControl.GROUP_PITCH, 0, 6, 0])
  })

  it('mutes and solos: what is silenced goes to the bus, never kept', () => {
    const { d, sent, edits } = desk()
    d.load(null)
    sent.length = 0
    d.setMute(1, true)
    expect([...d.muted.value]).toEqual([1])
    expect([...d.silenced.value]).toEqual([1])
    expect(sent).toEqual([[FxControl.GROUP_MUTE, 1, 1, 0]])
    // Soloing C: the others silenced, B already was.
    sent.length = 0
    d.setSolo(new Set([2]))
    expect([...d.soloed.value]).toEqual([2])
    expect([...d.silenced.value].sort()).toEqual([0, 1, 3])
    expect(sent).toEqual([
      [FxControl.GROUP_MUTE, 0, 1, 0],
      [FxControl.GROUP_MUTE, 3, 1, 0],
    ])
    // A muted group soloed is heard; the same solo again, or groups out of range, change nothing.
    sent.length = 0
    d.setSolo(new Set([2, 1, 9]))
    expect([...d.silenced.value].sort()).toEqual([0, 3])
    expect(sent).toEqual([[FxControl.GROUP_MUTE, 1, 0, 0]])
    sent.length = 0
    d.setSolo(new Set([1, 2]))
    d.setMute(1, true)
    d.setMute(7, true)
    expect(sent).toEqual([])
    // The solo ends: the mutes as they were.
    d.setSolo(new Set())
    expect([...d.silenced.value]).toEqual([1])
    expect(sent).toEqual([
      [FxControl.GROUP_MUTE, 0, 0, 0],
      [FxControl.GROUP_MUTE, 1, 1, 0],
      [FxControl.GROUP_MUTE, 3, 0, 0],
    ])
    d.setMute(1, false)
    expect(d.silenced.value.size).toBe(0)
    expect(edits[0]).toBe(0)
    expect(d.json()).toBeNull()
    // The same across projects.
    d.setMute(0, true)
    d.switchTo(4)
    expect([...d.silenced.value]).toEqual([0])
    expect(silencedGroup(0, new Set([0]), new Set())).toBe(true)
    expect(silencedGroup(0, new Set([0]), new Set([0]))).toBe(false)
    expect(silencedGroup(2, new Set(), new Set([0]))).toBe(true)
  })
})

function memoryFx(json: string | null = null): FxStore & { json: string | null; writes: number } {
  const s = {
    json,
    writes: 0,
    readFx: async () => s.json,
    writeFx: async (j: string | null) => {
      s.json = j
      s.writes++
    },
  }
  return s
}

describe('FxKeeper', () => {
  it('reads once, keeps the settings once the knobs rest, and forgets them at the defaults', async () => {
    vi.useFakeTimers()
    try {
      const store = memoryFx(FxBook.toJson(new Map([[3, FxSettings.withXY(FxSettings.DEFAULT, 0.7, 0.7)]])))
      const k = new FxKeeper(() => {}, store, globalThis)
      await k.load()
      k.desk.switchTo(3)
      expect(k.desk.fx.value.x).toBeCloseTo(0.7)
      for (let i = 0; i < 10; i++) k.desk.setXY(i / 10, 0.2)
      expect(store.writes).toBe(0)
      vi.advanceTimersByTime(FX_SAVE_MS)
      await Promise.resolve()
      expect(store.writes).toBe(1)
      expect(FxBook.fromJson(store.json!)?.get(3)?.x).toBeCloseTo(0.9)
      k.desk.setXY(0.5, 0.5)
      vi.advanceTimersByTime(FX_SAVE_MS)
      await Promise.resolve()
      expect(store.json).toBeNull()
      k.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('(web) settings kept before the levels read with every group at 1', async () => {
    const before = '{"v":1,"projects":[{"project":3,"type":"DELAY","x":0.25,"y":0.75,"sends":[0.5,0,0,0]}]}'
    const sent: Sent[] = []
    const k = new FxKeeper((w, i, x, y) => sent.push([w, i, x, y]), memoryFx(before), globalThis)
    await k.load()
    k.desk.switchTo(3)
    expect(k.desk.fx.value.type).toBe('DELAY')
    expect(k.desk.fx.value.levels).toEqual([1, 1, 1, 1])
    expect(sent.filter((c) => c[0] === FxControl.GROUP_LEVEL).slice(-4)).toEqual([0, 1, 2, 3].map((g) => [FxControl.GROUP_LEVEL, g, 1, 0]))
    k.dispose()
  })

  it('unreadable settings are the defaults', async () => {
    const k = new FxKeeper(() => {}, { readFx: async () => Promise.reject(new Error('no')), writeFx: async () => {} }, globalThis)
    await k.load()
    expect(k.desk.loaded).toBe(true)
    expect(k.desk.fx.value).toEqual(FxSettings.DEFAULT)
  })

  it("a voice is on its group's bus, and the sidechain's source ducks", () => {
    const k = new FxKeeper(() => {}, memoryFx(), globalThis)
    expect(k.shapeOf(physicalPad(2, 5))).toEqual({ bus: 2 })
    k.desk.setSidechainSource(2, 5)
    k.desk.setSidechainOn(true)
    expect(k.shapeOf(physicalPad(2, 5))).toEqual({ bus: 2, duckSource: true })
    expect(k.shapeOf(physicalPad(2, 4))).toEqual({ bus: 2 })
  })
})

describe('FX in the controller', () => {
  const ORDER = { 'arc.mirror.order': 'FROM_BOTTOM' }

  async function liveOn(): Promise<LiveHarness> {
    const h = await liveHarness({ storage: memoryStorage(ORDER) })
    await h.c.connect()
    h.c.setLive(true)
    await until(h, (s) => s.mirror !== null && !s.mirror.loading && !s.busy && s.mirror.offline == null)
    return h
  }

  it("plays pads on their group's bus, tells the bus the tempo, and lets go of punch-ins away from Live", async () => {
    const h = await liveOn()
    await vi.waitFor(() => expect(h.liveAudio.loaded.has('1:kick')).toBe(true), { timeout: 5000 })
    await h.c.playPad(physicalPad(0, 0))
    expect(h.liveAudio.presses.at(-1)?.options.shape).toEqual({ bus: 0 })
    expect(h.liveAudio.controls.some(([w]) => w === FxControl.TEMPO)).toBe(true)
    // The project read: its settings sent whole.
    expect(h.c.fx.desk.project).toBe(1)
    expect(h.liveAudio.controls.some(([w]) => w === FxControl.SIDECHAIN)).toBe(true)

    h.c.fx.desk.setSidechainSource(0, 0)
    h.c.fx.desk.setSidechainOn(true)
    h.c.releasePad(physicalPad(0, 0))
    await h.c.playPad(physicalPad(0, 0))
    expect(h.liveAudio.presses.at(-1)?.options.shape).toEqual({ bus: 0, duckSource: true })

    h.c.fx.desk.punchDown(3, 0.5)
    h.c.setLive(false)
    expect(h.liveAudio.controls.at(-1)).toEqual([FxControl.PUNCH, 3, 0, 0])
  })

  it("(web) the controller's click level is Live's, and setting it leaves the click on or off", async () => {
    const h = await liveHarness({ storage: memoryStorage(ORDER) })
    expect(h.c.clickLevel.value).toBe(1)
    h.c.setClickLevel(0.4)
    expect(h.c.clickLevel.value).toBe(0.4)
    expect(h.liveAudio.clickLevel.value).toBe(0.4)
    h.c.setClickLevel(0)
    expect(h.c.clickLevel.value).toBe(0)
    expect(h.liveAudio.clickLog).toEqual([])
  })

  it("the sheet's cap plays a pad through the effects, and lets it go", async () => {
    const h = await liveOn()
    await vi.waitFor(() => expect(h.liveAudio.loaded.has('1:kick')).toBe(true), { timeout: 5000 })
    await h.c.tryPad(physicalPad(0, 0))
    expect(h.liveAudio.presses.at(-1)).toMatchObject({ id: 'live:0:0', options: { gate: true, shape: { bus: 0 } } })
    h.c.releaseTry(physicalPad(0, 0))
    expect(h.liveAudio.releases.at(-1)).toBe('live:0:0')
  })

  it("keeps each project's settings in the library", async () => {
    const h = await liveOn()
    await vi.waitFor(() => expect(h.c.fx.desk.loaded).toBe(true))
    h.c.fx.desk.setType('DELAY', 1)
    await vi.waitFor(async () => expect(await h.library.readFx()).not.toBeNull(), { timeout: 2000 })
    const kept = FxBook.fromJson((await h.library.readFx())!)
    expect(kept?.get(1)?.type).toBe('DELAY')
  })
})
