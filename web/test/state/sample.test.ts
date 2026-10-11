// SAMPLE in the controller (ArcController.kt's SAMPLE section, state/sample.ts):
// the mode opens RSP on Live's mix, a held pad records into it, a tap plays
// it instead, LATCH records hands-free; a take goes onto the review sheet and
// KEEP puts it on its pad: connected it uploads, offline it waits as a recorded
// change for Write (or goes to Takes when the changes are discarded).
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { physicalPad } from '../../src/core/features/padNotes'
import { SampleCapture } from '../../src/core/features/sampleCapture'
import { SoundSource } from '../../src/core/features/offlinePads'
import { MirrorText } from '../../src/core/text/mirrorText'
import type { TapTake } from '../../src/platform/audio/sampleTap'
import { memoryStorage } from '../../src/platform/storage/settings'
import { disposeAll, liveHarness, until, type LiveHarness } from './liveHarness'

afterEach(() => disposeAll())

// With pad numbers counted from the bottom, pad offset k of group A is a/p(k+1):
// project 1 holds clap (slot 5) on a/p05.
const ORDER = { 'arc.mirror.order': 'FROM_BOTTOM' }
const A5 = physicalPad(0, 4)
const A1 = physicalPad(0, 0)
const PAD_SLOTS = [1, 2, 3, 4, 5]

async function liveOn(): Promise<LiveHarness> {
  const h = await liveHarness({ storage: memoryStorage(ORDER) })
  await h.c.connect()
  h.c.setLive(true)
  await until(h, (s) => s.mirror !== null && !s.mirror.loading && !s.busy && s.mirror.offline == null)
  return h
}

async function copied(h: LiveHarness): Promise<void> {
  await vi.waitFor(
    async () => {
      for (const slot of PAD_SLOTS) expect(await h.padSounds.has(`s${slot}.wav`)).toBe(true)
      expect(h.c.state.value.backgroundRead).toBe(false)
    },
    { timeout: 5000 },
  )
}

async function onDevice(h: LiveHarness, n: number): Promise<number | null | undefined> {
  await h.c.loadProjectSounds(1)
  return h.c.state.value.browser.projectPads.get(1)?.find((g) => g.name === 'a')?.pads.get(n)
}

/** Half a second of a 480 Hz tone at 48 kHz, mono. */
function tone(): Int16Array {
  return Int16Array.from({ length: 24000 }, (_, i) => Math.round(8000 * Math.sin((2 * Math.PI * 480 * i) / 48000)))
}

function take(pad = A5, latched = false): TapTake {
  return { pad: pad.group * 12 + pad.offset, pcm: tone(), channels: 1, rate: 48000, end: SampleCapture.End.STOPPED, latched }
}

const now = (): number => performance.now()

/** SAMPLE on, [pad] held for [ms] and let go. */
async function hold(h: LiveHarness, pad = A5, ms = 400): Promise<void> {
  // Pressed [ms] ago (an event's own time), let go now.
  await h.c.playPad(pad, true, false, now() - ms)
  h.c.releasePad(pad, now())
}

describe('SAMPLE', () => {
  it('opens RSP on the mix; a held pad records into it, and the take goes on the review sheet', async () => {
    const h = await liveOn()
    const s = h.c.sample
    s.enter()
    expect(s.open).toBe(true)
    expect(s.ui.value.on).toBe(true)
    expect(s.ui.value.input).toEqual({ source: 'rsp', stereo: false })
    expect(h.liveAudio.sampleLog).toEqual(['open:false:0:null'])
    const presses = h.liveAudio.presses.length
    await hold(h)
    expect(h.liveAudio.sampleLog.slice(1)).toEqual([expect.stringMatching(/^arm:4:false:\d+$/), 'stop'])
    // Not played: recorded.
    expect(h.liveAudio.presses.length).toBe(presses)
    expect(s.ui.value.phase).toEqual({ type: 'Waiting', pad: A5, latched: false })
    h.liveAudio.sampleTake(take())
    await vi.waitFor(() => expect(s.review.value).not.toBeNull())
    const r = s.review.value!
    expect(r.pad).toEqual(A5)
    expect(r.frames).toBe(24000)
    // Connected: the slot is the next free one on the device.
    expect(r.offline).toBe(false)
    expect(r.slot).not.toBeNull()
    // Backed in the samples store until KEEP.
    expect(r.file).not.toBeNull()
    expect(await h.samples.read(r.file!)).not.toBeNull()
    s.exit()
    expect(h.liveAudio.sampleLog.at(-1)).toBe('close')
  })

  it('a tap records nothing: the take is thrown away and the pad plays', async () => {
    const h = await liveOn()
    h.c.sample.enter()
    const presses = h.liveAudio.presses.length
    await hold(h, A5, 50)
    expect(h.liveAudio.sampleLog.at(-1)).toBe('cancel')
    await vi.waitFor(() => expect(h.liveAudio.presses.length).toBe(presses + 1))
  })

  it('KEEP while connected uploads the take onto its pad', async () => {
    const h = await liveOn()
    await copied(h)
    const s = h.c.sample
    s.enter()
    await hold(h)
    h.liveAudio.sampleTake(take())
    await vi.waitFor(() => expect(s.review.value?.file).toBeTruthy())
    const slot = s.review.value!.slot
    s.keepSample()
    await vi.waitFor(() => expect(h.toasts.at(-1)?.text).toBe(MirrorText.sampleSaved(A5)), { timeout: 5000 })
    expect(await onDevice(h, 5)).toBe(slot)
    // Up: the recording's change and its file go.
    await vi.waitFor(async () => expect(await h.samples.strays(new Set(), Number.MAX_SAFE_INTEGER)).toEqual([]))
    expect(h.c.state.value.offlinePads).toBe(0)
  })

  it('LATCH: a tap records hands-free until its pad is tapped again', async () => {
    const h = await liveOn()
    const s = h.c.sample
    s.enter()
    s.setLatch(true)
    await h.c.playPad(A5, true, false, now())
    h.c.releasePad(A5, now())
    expect(h.liveAudio.sampleLog.at(-1)).toMatch(/^arm:4:true:\d+$/)
    // Another pad plays beside it.
    const presses = h.liveAudio.presses.length
    await h.c.playPad(A1, true, false, now())
    await vi.waitFor(() => expect(h.liveAudio.presses.length).toBe(presses + 1))
    h.c.releasePad(A1, now())
    await h.c.playPad(A5, true, false, now())
    h.c.releasePad(A5, now())
    expect(h.liveAudio.sampleLog.at(-1)).toBe('stop')
  })

  it('offline, KEEP puts the take on its pad in arc; Write uploads it once the EP-133 is back', async () => {
    const h = await liveOn()
    await copied(h)
    h.ep.access.unplug(h.ep.input, h.ep.output)
    await until(h, (st) => st.mirror?.offlineSounds != null)
    const s = h.c.sample
    s.enter()
    await hold(h)
    h.liveAudio.sampleTake(take())
    await vi.waitFor(() => expect(s.review.value?.file).toBeTruthy())
    expect(s.review.value!.offline).toBe(true)
    s.keepSample()
    await vi.waitFor(() => expect(h.toasts.at(-1)?.text).toBe(MirrorText.sampleQueued(A5)))
    expect(h.c.state.value.offlinePads).toBe(1)
    expect(h.storage.getItem('arc.live.pads')).toContain(SoundSource.RECORDED)
    // The pad plays the take, from memory.
    expect([...h.liveAudio.loaded.keys()].some((k) => k.startsWith('rec:'))).toBe(true)
    s.exit()
    h.ep.access.plug(h.ep.input, h.ep.output)
    await until(h, (st) => st.offlinePrompt !== null && st.mirror !== null && !st.mirror.loading && !st.busy)
    expect(h.c.state.value.offlinePrompt).toBe(1)
    await h.c.writeOfflinePads()
    expect(h.toasts.at(-1)?.text).toBe(MirrorText.offlineWritten(1, 0))
    const slot = await onDevice(h, 5)
    expect(slot).not.toBe(5)
    expect(slot).not.toBeNull()
    expect(h.c.state.value.offlinePads).toBe(0)
    expect(await h.samples.strays(new Set(), Number.MAX_SAFE_INTEGER)).toEqual([])
  })

  it('Discard sends the recordings to Takes, never away', async () => {
    const h = await liveOn()
    await copied(h)
    h.ep.access.unplug(h.ep.input, h.ep.output)
    await until(h, (st) => st.mirror?.offlineSounds != null)
    const s = h.c.sample
    s.enter()
    await hold(h)
    h.liveAudio.sampleTake(take())
    await vi.waitFor(() => expect(s.review.value?.file).toBeTruthy())
    s.keepSample()
    await vi.waitFor(() => expect(h.c.state.value.offlinePads).toBe(1))
    s.exit()
    h.ep.access.plug(h.ep.input, h.ep.output)
    await until(h, (st) => st.offlinePrompt !== null && st.mirror !== null && !st.mirror.loading && !st.busy)
    await h.c.discardOfflinePads()
    expect(h.toasts.at(-1)?.text).toBe(`${MirrorText.OFFLINE_DISCARDED} ${MirrorText.samplesToTakes(1)}`)
    expect(h.c.state.value.offlinePads).toBe(0)
    await vi.waitFor(() => expect(h.c.state.value.takes.length).toBe(1))
    expect(await onDevice(h, 5)).toBe(5)
  })

  it('DISCARD on the review sheet lets the take go, and UNDO brings it back', async () => {
    const h = await liveOn()
    const s = h.c.sample
    s.enter()
    await hold(h)
    h.liveAudio.sampleTake(take())
    await vi.waitFor(() => expect(s.review.value?.file).toBeTruthy())
    const file = s.review.value!.file!
    s.discardSample()
    expect(s.review.value).toBeNull()
    const t = h.c.state.value.toast
    expect(t?.text).toBe(MirrorText.SAMPLE_DISCARDED)
    await vi.waitFor(async () => expect(await h.samples.read(file)).toBeNull())
    h.c.runToastAction(t!.id)
    await vi.waitFor(() => expect(s.review.value?.file).toBeTruthy())
    expect(s.review.value!.frames).toBe(24000)
  })

  it('leaving Live closes SAMPLE', async () => {
    const h = await liveOn()
    h.c.sample.enter()
    h.c.setLive(false)
    expect(h.c.sample.open).toBe(false)
    expect(h.liveAudio.sampleLog.at(-1)).toBe('close')
  })
})
