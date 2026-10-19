// REC and takes in the controller (ArcController.kt toggleRec, takeDone, playTake,
// deleteTake, takeToDevice; TRIM and DUP: playTakeTrim, setTakeTrim, duplicateTake,
// takeWav; and the mirror passing the device's PLAY and STOP on).
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TakeTrim } from '../../src/core/features/takeTrim'
import { decodeWav, encodeWav } from '../../src/core/formats/wav'
import { MirrorText } from '../../src/core/text/mirrorText'
import type { RecordedTake } from '../../src/platform/audio/liveAudio'
import { PREVIEW_CACHE_BYTES } from '../../src/state/previewCache'
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

  it('VOICE: the take as a mono Ogg Opus voice message, shared with no text; with no encoder, it says so', async () => {
    const h = await liveHarness({ now: () => AT })
    h.liveAudio.endTake(recorded())
    const st = await until(h, (s) => s.takes.length === 1)
    const t = st.takes[0]!
    const deps = h.deps as { voice?: unknown }
    expect(h.c.canShareVoice).toBe(false)
    h.deps.share.canShareFiles = () => true
    const fed: number[] = []
    // Two 20 ms CELT packets for whatever comes in.
    deps.voice = {
      encodeOpus: async (pcm: Int16Array) => (fed.push(pcm.length), { packets: [new Uint8Array([0xf8, 1]), new Uint8Array([0xf8, 2])], config: null }),
    }
    expect(h.c.canShareVoice).toBe(true)
    const share = vi.spyOn(h.deps.share, 'share')
    await h.c.shareTakeVoice(t)
    const [name, data, mime, , text] = share.mock.calls[0]!
    expect([name, mime, text]).toEqual(['take-20261005-142301.ogg', 'audio/ogg', ''])
    const bytes = await (data as () => Promise<Uint8Array>)()
    // 4800 stereo frames at 48 kHz: 4800 mono samples.
    expect(fed).toEqual([4800])
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('OggS')
    expect(String.fromCharCode(...bytes.subarray(28, 36))).toBe('OpusHead')
    // A share that reads the bytes, as the browser's does.
    deps.voice = undefined
    h.deps.share.share = async (_n, d) => (await (d as () => Promise<Uint8Array>)(), 'shared')
    await h.c.shareTakeVoice(t)
    expect(h.toasts.at(-1)).toMatchObject({ text: MirrorText.NO_VOICE_ENCODER, error: true })
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

  it('TRIM: its PLAY plays the part under its own key; DONE keeps it, and PLAY, SAVE, SHARE and EP use it', async () => {
    const h = await liveOn()
    h.liveAudio.endTake(recorded(48000))
    let t = (await until(h, (s) => s.takes.length === 1)).takes[0]!
    const play = vi.spyOn(h.deps.player, 'play')
    await h.c.playTakeTrim(t, 12000, 36000)
    expect(play.mock.calls[0]?.[0]).toBe('take-trim:' + t.name)
    expect((play.mock.calls[0]?.[1] as Uint8Array).length).toBe(24000 * 4)

    await h.c.setTakeTrim(t, TakeTrim.of(12000, 36000, t.frames, t.rate))
    t = (await until(h, (s) => s.takes[0]?.trim != null)).takes[0]!
    expect(t.trim).toEqual(new TakeTrim(12000, 36000))
    expect(t.keptSeconds).toBe(0.5)
    await h.c.playTake(t)
    expect(play.mock.calls[1]?.[0]).toBe('take:' + t.name)
    expect((play.mock.calls[1]?.[1] as Uint8Array).length).toBe(24000 * 4)

    const save = vi.spyOn(h.deps.files, 'save')
    await h.c.saveTake(t)
    expect(decodeWav(save.mock.calls[0]![1] as Uint8Array).pcm.length).toBe(24000 * 4)
    const share = vi.spyOn(h.deps.share, 'share')
    await h.c.shareTake(t)
    const shared = await (share.mock.calls[0]![1] as () => Promise<Uint8Array>)()
    expect(decodeWav(shared).pcm.length).toBe(24000 * 4)

    // EP: the whole take, its trim set as the upload's.
    await h.c.refreshBrowser()
    await until(h, (s) => s.browser.contents !== null && !s.busy)
    await h.c.takeToDevice(t)
    expect(h.c.state.value.browser.draft![0]).toMatchObject({ trim: { start: 12000, end: 36000 }, sampleRate: 48000 })

    // RESET then DONE: the whole take again.
    await h.c.setTakeTrim(t, TakeTrim.of(0, t.frames, t.frames, t.rate))
    await until(h, (s) => s.takes[0]?.trim === null)
  })

  it('DUP: a copy, its trim with it, the newest, and a toast names it; DEL stops its part playing', async () => {
    let now = AT
    const h = await liveHarness({ now: () => now })
    h.liveAudio.endTake(recorded(48000))
    const t = (await until(h, (s) => s.takes.length === 1)).takes[0]!
    await h.c.setTakeTrim(t, new TakeTrim(12000, 36000))
    now = AT + 60_000
    await h.c.duplicateTake(t)
    const st = await until(h, (s) => s.takes.length === 2)
    expect(st.takes.map((x) => x.name)).toEqual(['take-20261005-142401.wav', t.name])
    expect(st.takes[0]!.trim).toEqual(new TakeTrim(12000, 36000))
    expect(h.toasts.at(-1)?.text).toBe(MirrorText.takeDuplicated(2, 1))
    expect(MirrorText.takeDuplicated(2, 1)).toBe('T02, a copy of T01')

    await h.c.playTakeTrim(t, 0, 48000)
    expect(h.deps.player.playing.peek()).toBe('take-trim:' + t.name)
    await h.c.deleteTake(t)
    expect(h.deps.player.playing.peek()).toBeNull()
    expect(h.c.state.value.takes.map((x) => x.name)).toEqual(['take-20261005-142401.wav'])
  })

  it('a take over the previews\' byte cap is read and decoded once, for TRIM and its PLAY', async () => {
    const h = await liveOn()
    h.liveAudio.endTake(recorded(PREVIEW_CACHE_BYTES / 4 + 1))
    const t = (await until(h, (s) => s.takes.length === 1)).takes[0]!
    const read = vi.spyOn(h.takes, 'read')
    const first = await h.c.takeSound(t)
    await h.c.playTakeTrim(t, 0, 48000)
    expect(await h.c.takeSound(t)).toBe(first)
    expect(read).toHaveBeenCalledTimes(1)
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
