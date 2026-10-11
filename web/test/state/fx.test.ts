// Port of app/src/test/kotlin/dev/arc/ep133/controller/FxPlanTest.kt (FxDesk, punchSlotForPad,
// punchDepth, sidechainIndex, duckSource), plus the web's FxKeeper (the library's kv row "fx",
// written once the knobs rest) and the controller's FX: the voices' bus, the tempo, the project.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FxBook, FxSettings } from '../../src/core/features/fxSettings'
import { physicalPad } from '../../src/core/features/padNotes'
import { FxControl } from '../../src/core/formats/fx/fxBus'
import { memoryStorage } from '../../src/platform/storage/settings'
import {
  FIRST_SEND,
  FX_SAVE_MS,
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
    // Whole: the effect, four sends, the compressor, the sidechain.
    expect(sent.map((s) => s[0])).toEqual([FxControl.FX_TYPE, FxControl.SEND, FxControl.SEND, FxControl.SEND, FxControl.SEND, FxControl.COMP, FxControl.SIDECHAIN])
    expect([...d.kept().keys()]).toEqual([1])
    d.setXY(0.5, 0.5)
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

  it("keeps each project's settings in the library", async () => {
    const h = await liveOn()
    await vi.waitFor(() => expect(h.c.fx.desk.loaded).toBe(true))
    h.c.fx.desk.setType('DELAY', 1)
    await vi.waitFor(async () => expect(await h.library.readFx()).not.toBeNull(), { timeout: 2000 })
    const kept = FxBook.fromJson((await h.library.readFx())!)
    expect(kept?.get(1)?.type).toBe('DELAY')
  })
})
