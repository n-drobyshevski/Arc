// REC and takes in the controller (ArcController.kt toggleRec, takeDone, playTake,
// deleteTake, takeToDevice; and the mirror passing the device's PLAY and STOP on).
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodeWav } from '../../src/core/formats/wav'
import { MirrorText } from '../../src/core/text/mirrorText'
import type { RecordedTake } from '../../src/platform/audio/liveAudio'
import { disposeAll, liveHarness, until, type LiveHarness } from './liveHarness'

afterEach(() => disposeAll())

// 5 Oct 2026 14:23:01 local time.
const AT = new Date(2026, 9, 5, 14, 23, 1).getTime()

function recorded(frames = 4800, rate = 48000): RecordedTake {
  const wav = encodeWav(new Uint8Array(frames * 4).fill(1), 2, rate)
  return { wav: new Blob([wav as BlobPart]), frames, rate, seconds: frames / rate }
}

async function liveOn(): Promise<LiveHarness> {
  const h = await liveHarness({ now: () => AT })
  await h.c.connect()
  h.c.setLive(true)
  await until(h, (s) => s.mirror !== null && !s.mirror.loading && !s.busy && s.mirror.offline == null)
  return h
}

describe('REC', () => {
  it('arms on a tap and stops on the next one', async () => {
    const h = await liveHarness()
    expect(h.c.canRecord).toBe(true)
    h.c.toggleRec()
    expect(h.c.rec.value).toEqual({ kind: 'armed' })
    h.c.toggleRec()
    expect(h.liveAudio.recLog).toEqual(['arm', 'stop'])
  })

  it('no output: says so', async () => {
    const h = await liveHarness()
    h.liveAudio.available = false
    h.c.toggleRec()
    expect(h.toasts.at(-1)).toMatchObject({ text: MirrorText.NO_OUTPUT, error: true })
  })

  it('a take that ends is kept, listed and toasted', async () => {
    const h = await liveHarness({ now: () => AT })
    h.c.toggleRec()
    h.liveAudio.endTake(recorded(48000 * 12))
    await until(h, (s) => s.takes.length === 1)
    expect(h.c.state.value.takes[0]).toMatchObject({ name: 'take-20261005-142301.wav', seconds: 12 })
    await vi.waitFor(() => expect(h.toasts.at(-1)?.text).toBe(MirrorText.takeSaved(12)))
    expect(h.c.trafficLog.export()).toContain('take take-20261005-142301.wav: 12.0 s')
  })

  it('the limit says so; nothing played keeps nothing', async () => {
    const h = await liveHarness({ now: () => AT })
    h.liveAudio.endTake(null)
    await new Promise((r) => setTimeout(r, 10))
    expect(h.c.state.value.takes).toEqual([])
    h.liveAudio.endTake(recorded(48000 * 600), true)
    await until(h, (s) => s.takes.length === 1)
    await vi.waitFor(() => expect(h.toasts.at(-1)?.text).toBe(MirrorText.takeAtLimit(600)))
  })

  it('plays, saves, shares, deletes a take', async () => {
    const h = await liveHarness({ now: () => AT })
    h.liveAudio.endTake(recorded())
    const st = await until(h, (s) => s.takes.length === 1)
    const t = st.takes[0]!
    const play = vi.spyOn(h.deps.player, 'play')
    await h.c.playTake(t)
    expect(play).toHaveBeenCalledWith('take:' + t.name, expect.any(Uint8Array), 2, 48000)
    const save = vi.spyOn(h.deps.files, 'save')
    await h.c.saveTake(t)
    expect(save.mock.calls[0]?.[0]).toBe(t.name)
    expect(save.mock.calls[0]?.[2]).toBe('audio/wav')
    const share = vi.spyOn(h.deps.share, 'share')
    await h.c.shareTake(t)
    expect(share.mock.calls[0]?.[0]).toBe(t.name)
    await h.c.deleteTake(t)
    expect(h.c.state.value.takes).toEqual([])
  })

  it('To EP-133: the take is proposed for the first free slot, with its trim', async () => {
    const h = await liveOn()
    h.liveAudio.endTake(recorded())
    const st = await until(h, (s) => s.takes.length === 1)
    const t = st.takes[0]!
    await h.c.refreshBrowser()
    await until(h, (s) => s.browser.contents !== null && !s.busy)
    await h.c.takeToDevice(t)
    const d = h.c.state.value.browser.draft
    expect(d).toHaveLength(1)
    expect(d![0]).toMatchObject({ fileName: t.name, name: 'take-20261005-142301', error: null, trim: null, sampleRate: 48000 })
    expect(d![0]!.slot).not.toBeNull()
  })

  it("passes the device's PLAY and STOP on", async () => {
    const h = await liveOn()
    h.ep.input.receive([0xfa])
    h.ep.input.receive([0xfb])
    h.ep.input.receive([0xfc])
    await vi.waitFor(() => expect(h.liveAudio.recLog).toEqual(['transport:start', 'transport:start', 'transport:stop']))
  })

  it('share is offered only where the browser can share a file', async () => {
    const h = await liveHarness()
    expect(h.c.canShareTakes).toBe(false)
    h.deps.share.canShareFiles = () => true
    expect(h.c.canShareTakes).toBe(true)
  })
})
