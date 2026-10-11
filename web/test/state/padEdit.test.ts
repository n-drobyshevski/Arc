// EDIT's pad sound settings in the controller (ArcController.kt openPadEdit, adjustPad, writePadSettings,
// padsRead, forgetPadSettings and the offline settings), on the mock EP-133: read at once and from the
// device, turned and written once the turning rests (the newest only), put back when a write fails, kept
// in arc offline and put on the device once it is read again; Live's pads and the pattern play them.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { physicalPad } from '../../src/core/features/padNotes'
import { OfflinePadSettings } from '../../src/core/features/offlinePadSettings'
import { PadSettings } from '../../src/core/features/padSettings'
import { MirrorText } from '../../src/core/text/mirrorText'
import { LIVE_PAD_SETTINGS_KEY, memoryStorage } from '../../src/platform/storage/settings'
import { node as padNode } from '../../src/core/features/padPush'
import { disposeAll, liveHarness, until, type LiveHarness } from './liveHarness'

afterEach(() => disposeAll())

const ORDER = { 'arc.mirror.order': 'FROM_BOTTOM' }
const A1 = physicalPad(0, 0)

async function liveOn(opts: Parameters<typeof liveHarness>[0] = {}): Promise<LiveHarness> {
  const h = await liveHarness({ storage: memoryStorage(ORDER), ...opts })
  await h.c.connect()
  h.c.setLive(true)
  await until(h, (s) => s.mirror !== null && !s.mirror.loading && !s.busy && s.mirror.offline == null)
  return h
}

async function opened(h: LiveHarness): Promise<void> {
  h.c.openPadEdit(A1)
  await vi.waitFor(() => expect(h.c.padEdit.edit.value?.reading).toBe(false))
}

describe('EDIT: a pad sound settings', () => {
  it('opens on what the device has, and writes the newest turn once the turning rests', async () => {
    const h = await liveOn()
    const t = h.c.editTarget(A1)!
    await opened(h)
    const e = h.c.padEdit.edit.value!
    expect(e.offline).toBe(false)
    expect(e.failed).toBe(false)
    const node = padNode({ project: t.project, group: t.group, pad: t.pad })
    const before = h.mock.metaWrites.filter(([n]) => n === node).length
    for (const pitch of [-1, -4, -12]) h.c.adjustPad({ ...h.c.padEdit.edit.value!.settings, pitch, level: 40 })
    expect(h.c.padEdit.edit.value?.settings.pitch).toBe(-12)
    await h.c.padEdit.flushed()
    const writes = h.mock.metaWrites.filter(([n]) => n === node)
    expect(writes.length - before).toBe(1)
    // The device has it, and a sheet opened again reads it back.
    h.c.closePadEdit()
    await opened(h)
    expect(h.c.padEdit.edit.value?.settings).toMatchObject({ pitch: -12, level: 40 })
  })

  it("plays Live's pad and the pattern's voices with the settings turned", async () => {
    const h = await liveOn()
    await vi.waitFor(() => expect(h.liveAudio.loaded.has('1:kick')).toBe(true), { timeout: 5000 })
    await opened(h)
    h.c.adjustPad({ ...PadSettings.DEFAULT, pitch: -12, level: 40, mode: 'key' })
    await h.c.playPad(A1)
    expect(h.liveAudio.presses.at(-1)?.options.shape).toMatchObject({ semitones: -12, gain: 0.4, mode: 'KEY', bus: 0 })
    h.c.releasePad(A1)
    // KEYS on the pad: a held note, never its mute group.
    h.c.adjustPad({ ...h.c.padEdit.edit.value!.settings, mode: 'legato', muteGroup: true })
    await h.c.playNote(60)
    expect(h.liveAudio.presses.at(-1)?.options.shape).toMatchObject({ semitones: -12, mode: 'GATE', muteGroup: 0 })
    h.c.releaseNote(60)
    await h.c.padEdit.flushed()
  })

  it('a failed write says why and goes back to what the device has', async () => {
    const h = await liveOn()
    await opened(h)
    // Written once: arc knows what the device has.
    h.c.adjustPad({ ...h.c.padEdit.edit.value!.settings, pan: -4 })
    await h.c.padEdit.flushed()
    const was = h.c.padEdit.edit.value!.settings
    const mock = h.mock as unknown as { setMeta: (...a: unknown[]) => void; reply: (f: unknown, status: number) => void }
    const spy = vi.spyOn(mock, 'setMeta').mockImplementation(function (this: typeof mock, f: unknown) {
      this.reply(f, 1)
    })
    h.c.adjustPad({ ...was, pan: 10 })
    await h.c.padEdit.flushed()
    spy.mockRestore()
    expect(h.toasts.some((t) => t.error && t.text.startsWith(MirrorText.padSettingsFailed('').slice(0, 20)))).toBe(true)
    expect(h.c.padEdit.edit.value?.settings.pan).toBe(was.pan)
  })

  it('a new sound on the pad forgets its settings', async () => {
    const h = await liveOn()
    await opened(h)
    h.c.adjustPad({ ...h.c.padEdit.edit.value!.settings, pitch: 5 })
    await h.c.padEdit.flushed()
    const t = h.c.editTarget(A1)!
    expect(h.c.padEdit.settingsOf(t)?.pitch).toBe(5)
    expect(await h.c.assignPad(A1, 2)).toBe(true)
    expect(h.c.padEdit.settingsOf(t)).toBeNull()
  })
})

describe('EDIT offline: the settings turned are kept, then put on the EP-133', () => {
  it('kept in arc, and written once the device is read again', async () => {
    const storage = memoryStorage(ORDER)
    const h = await liveOn({ storage })
    // Read once, then unplugged: Live shows the last read.
    h.ep.access.unplug(h.ep.input, h.ep.output)
    await until(h, (s) => s.mirror?.offline != null)
    h.c.openPadEdit(A1)
    const e = h.c.padEdit.edit.value!
    expect(e.offline).toBe(true)
    expect(e.reading).toBe(false)
    h.c.adjustPad({ ...e.settings, pitch: 7 })
    await vi.waitFor(() => expect(storage.getItem(LIVE_PAD_SETTINGS_KEY)).not.toBeNull())
    const kept = OfflinePadSettings.fromJson(storage.getItem(LIVE_PAD_SETTINGS_KEY)!)!
    expect(OfflinePadSettings.size(kept)).toBe(1)
    h.c.closePadEdit()

    // Plugged in again: arc asks, and Write puts the turn on.
    h.ep.access.plug(h.ep.input, h.ep.output)
    await until(h, (s) => s.offlinePrompt != null)
    await h.c.writeOfflinePads()
    expect(storage.getItem(LIVE_PAD_SETTINGS_KEY)).toBeNull()
    expect(h.toasts.at(-1)?.text).toBe(MirrorText.offlineWritten(1, 0))
    const t = h.c.editTarget(A1)!
    const meta = h.mock.padMeta(t.project, t.group, t.pad)
    expect(PadSettings.fromMeta(meta as never).pitch).toBe(7)
  })
})
