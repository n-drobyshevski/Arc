// ARP in the controller (ArcController.kt's ARP section, state/pattern.ts): a pad
// press with RPT on holds the pad for note repeat (neither played nor recorded
// itself; the plan carries it), the finger up lets it go unless LATCH holds it,
// a KEYS note joins the arp, and a step the arp played while recording is a note
// of the pattern where it played.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectPatterns } from '../../src/core/features/pattern'
import { Keys } from '../../src/core/features/keys'
import { arpNote } from '../../src/core/features/arp'
import { physicalPad } from '../../src/core/features/padNotes'
import { memoryStorage } from '../../src/platform/storage/settings'
import { disposeAll, liveHarness, until, type LiveHarness } from './liveHarness'

let clockSpy: { mockRestore(): void } | null = null
beforeEach(() => {
  const real = performance.now.bind(performance)
  clockSpy = vi.spyOn(performance, 'now').mockImplementation(() => real() + 100_000)
})

afterEach(() => {
  disposeAll()
  clockSpy?.mockRestore()
})

const A0 = physicalPad(0, 0)
const A4 = physicalPad(0, 4)
const ORDER = { 'arc.mirror.order': 'FROM_BOTTOM' }

async function liveOn(): Promise<LiveHarness> {
  const h = await liveHarness({ storage: memoryStorage(ORDER) })
  await h.c.connect()
  h.c.setLive(true)
  await until(h, (s) => s.mirror !== null && !s.mirror.loading && !s.busy && s.mirror.offline == null)
  await vi.waitFor(() => expect(h.c.pattern.ui.value.project).toBe(1))
  await h.c.playPad(A0)
  h.c.releasePad(A0)
  return h
}

const now = (): number => performance.now()

describe('ARP', () => {
  it('RPT on: a pad press is held for note repeat, not played; up, it goes', async () => {
    const h = await liveOn()
    const p = h.c.pattern
    p.setArpOn(true)
    const presses = h.liveAudio.presses.length
    await h.c.playPad(A4, true, false, now())
    expect(h.liveAudio.presses.length).toBe(presses)
    const plan = h.liveAudio.arps.at(-1)
    expect(plan?.keys).toBe(false)
    expect(plan?.notes.map((n) => n.pad.offset)).toEqual([4])
    expect(p.arp.value.line).toMatch(/^REPEAT · 1\/16 · /)
    h.c.releasePad(A4, now())
    expect(h.liveAudio.arps.at(-1)).toBeNull()
    expect(p.arp.value.sounding).toBe(false)
  })

  it("follows the EP-133's tempo while it has notes, and sends nothing for it with none", async () => {
    const h = await liveOn()
    const p = h.c.pattern
    const tempo = (bpm: number): void => h.c.store.update((s) => ({ ...s, mirror: { ...s.mirror!, state: { ...s.mirror!.state, bpm } } }))
    p.setArpOn(true)
    const arps = h.liveAudio.arps.length
    tempo(124)
    expect(h.liveAudio.arps.length).toBe(arps)
    p.setArpLatch(true)
    await h.c.playPad(A4, true, false, now())
    h.c.releasePad(A4, now())
    tempo(131.04)
    expect(h.liveAudio.arps.at(-1)?.bpm).toBe(131)
  })

  it('LATCH keeps the notes after the fingers are up; off, they go', async () => {
    const h = await liveOn()
    const p = h.c.pattern
    p.setArpOn(true)
    p.setArpLatch(true)
    await h.c.playPad(A4, true, false, now())
    h.c.releasePad(A4, now())
    expect(h.liveAudio.arps.at(-1)?.notes.length).toBe(1)
    expect(p.arp.value.line).toMatch(/^REPEAT ∞/)
    p.setArpLatch(false)
    expect(h.liveAudio.arps.at(-1)).toBeNull()
  })

  it('a KEYS note joins the arp on the KEYS sound; ARP off lets it go', async () => {
    const h = await liveOn()
    const p = h.c.pattern
    p.setArpOn(true)
    await h.c.playNote(Keys.ROOT_NOTE + 4, true, now())
    const plan = h.liveAudio.arps.at(-1)
    expect(plan?.keys).toBe(true)
    expect(plan?.notes.map((n) => n.semitones)).toEqual([4])
    p.setArpOn(false)
    expect(h.liveAudio.arps.at(-1)).toBeNull()
    h.c.releaseNote(Keys.ROOT_NOTE + 4)
  })

  it('a step the arp played while recording is a note where it played, its gate long', async () => {
    const h = await liveOn()
    const p = h.c.pattern
    p.setCountIn(false)
    p.recordDown(now())
    await h.c.playPad(A0, true, false, now())
    h.c.releasePad(A0, now())
    expect(p.ui.value.recording).toBe(true)
    h.liveAudio.arpStep({ note: arpNote(A4, null, 100), globalTick: 48, gateTicks: 12 })
    const n = ProjectPatterns.group(p.patternsNow, 0).notes.find((x) => x.offset === 4)
    expect(n?.tick).toBe(48)
    expect(n?.gate).toBe(12)
    expect(n?.velocity).toBe(100)
    p.stop()
  })
})
