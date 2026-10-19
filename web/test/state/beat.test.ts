// BEAT CARDS in the controller (ArcController.kt's BEAT CARDS section, state/pattern.ts and
// controller.ts): SHARE sends the card through the share sheet (or copies it where there is
// none), PASTE BEAT reads the clipboard (or waits for a paste where the page can't read it),
// a card opens its sheet, IMPORT places it as one UNDO step, and COPY PROBLEMS copies them.
// A share carries the pads' sound lines and, with "With my sound list" on, the sounds Arc knows;
// SHARE CHAIN shares the project's chain. IMPORT puts the card's ticked sounds and the ones
// picked for silent pads on the pads (on the EP-133, or offline in arc), in the same UNDO step;
// writes that throw stop it with its error toast.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BeatCards, SoundStatus } from '../../src/core/features/beatCard'
import { FactoryKit } from '../../src/core/features/factorySounds'
import { padKey, physicalPad } from '../../src/core/features/padNotes'
import { ProjectPatterns } from '../../src/core/features/pattern'
import { ClaudeText } from '../../src/core/text/claudeText'
import { MirrorText } from '../../src/core/text/mirrorText'
import { BackupDevice, type BackupRecord } from '../../src/core/text/libraryRules'
import { WebText } from '../../src/core/text/webText'
import { memoryStorage } from '../../src/platform/storage/settings'
import type { Deps } from '../../src/state/deps'
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
const ORDER = { 'arc.mirror.order': 'FROM_BOTTOM' }
const now = (): number => performance.now()

async function liveOn(): Promise<LiveHarness> {
  const h = await liveHarness({ storage: memoryStorage(ORDER) })
  await h.c.connect()
  h.c.setLive(true)
  await until(h, (s) => s.mirror !== null && !s.mirror.loading && !s.busy && s.mirror.offline == null)
  await vi.waitFor(() => expect(h.c.pattern.ui.value.project).toBe(1))
  return h
}

/** Settable deps for a test: the clipboard and the share sheet. */
function mutable(h: LiveHarness): { -readonly [K in keyof Deps]: Deps[K] } {
  return h.deps as { -readonly [K in keyof Deps]: Deps[K] }
}

const CARD = ['ARC BEAT 1', 'name Four on the floor', 'tempo 124', '[A]', 'A7 | X... X... X... X... |'].join('\n')
const SCENES = ['ARC BEAT 1', 'name Two', 'chain 1x2 2', '', 'scene One', '[A]', 'A7 | X... .... X... .... |', '', 'scene Two', '[A]', 'A7 | X.X. X.X. X.X. X.X. |'].join('\n')
const BAD = ['ARC BEAT 1', '[A]', 'A9 | X... .... .... ... |'].join('\n')

async function recordOne(h: LiveHarness): Promise<void> {
  const p = h.c.pattern
  p.setCountIn(false)
  p.recordDown(now())
  await h.c.playPad(A0, true, false, now())
  h.c.releasePad(A0, now())
  p.stop()
}

describe('BEAT CARDS', () => {
  it('SHARE: nothing with no notes; a card through the share sheet, or copied where there is none', async () => {
    const h = await liveOn()
    expect(h.c.beatShare(0)).toBeNull()
    await recordOne(h)
    const share = h.c.beatShare(0)
    expect(share?.text).toContain('ARC BEAT 1')
    const shared: string[] = []
    mutable(h).share = { ...h.deps.share, shareText: async (_t, text) => (shared.push(text), 'shared') }
    await h.c.shareBeat(0)
    expect(shared).toEqual([share!.text])
    const copied: string[] = []
    mutable(h).share = { ...h.deps.share, shareText: async () => 'unsupported' }
    mutable(h).clipboard = { writeText: async (t) => void copied.push(t) }
    await h.c.shareBeat(null)
    expect(copied[0]).toContain('ARC BEAT 1')
    expect(h.toasts.at(-1)?.text).toBe(WebText.CARD_COPIED)
  })

  it("SHARE names the EP-133's own kit, not the one Live plays offline", async () => {
    const h = await liveOn()
    await recordOne(h)
    // Live is on the EP-40's kit, its pack saved; the EP-133 connected holds sounds of its own.
    const slots = Array.from({ length: 120 }, (_, i) => 600 + i)
    const riddim: BackupRecord = { id: 'r', title: 'r', notes: '', createdAt: 1, source: FactoryKit.EP40.source, fileName: null, device: BackupDevice(), soundCount: slots.length, projectCount: 0, projects: [], slots, projectSlots: {}, size: 0 }
    h.c.store.update((s) => ({ ...s, backups: [...s.backups, riddim] }))
    h.c.setFactoryKit(FactoryKit.EP40)
    expect(h.c.factoryKit).toBe(FactoryKit.EP40)
    expect(h.c.shareKit()).toBe(FactoryKit.EP133)
    const shared: string[] = []
    mutable(h).share = { ...h.deps.share, shareText: async (_t, text) => (shared.push(text), 'shared') }
    await h.c.shareBeat(0)
    expect(shared[0]).toContain(ClaudeText.SHARE_PROMPT + '\n\n' + ClaudeText.EP133_LINE + '\n\n```\nARC BEAT 1\n')
    expect(shared[0]).not.toContain(ClaudeText.kitLine(FactoryKit.EP40)!)
  })

  it('SHARE has a sound line for each pad it uses, and the sound list after the card while "With my sound list" is on', async () => {
    const h = await liveOn()
    await recordOne(h)
    await vi.waitFor(() => expect(h.c.shareSoundCount.value).toBeGreaterThan(0))
    expect(h.c.shareSoundCount.value).toBe(h.mock.sounds.size)
    const header = ClaudeText.soundListHeader(ClaudeText.SOUNDS_FROM_DEVICE)
    const share = h.c.beatShare(0)!
    // The pad's line names the slot Live shows on it, one of the EP-133's.
    const line = BeatCards.read(share.text).card!.sections[0]!.sounds.get(A0.offset)!
    expect(h.mock.sounds.has(line.slot)).toBe(true)
    expect(share.text).toContain('\n```\n\n' + header + '\n')
    // Off: the card alone, its sound lines kept; kept as a setting.
    h.c.setShareSounds(false)
    expect(h.c.settings.value.shareSounds).toBe(false)
    const plain = h.c.beatShare(0)!
    expect(plain.text).not.toContain(header)
    expect(plain.text.endsWith('\n```\n')).toBe(true)
    expect(BeatCards.read(plain.text).card).toEqual(BeatCards.read(share.text).card)
    expect(JSON.parse(h.storage.getItem('arc.settings')!).shareSounds).toBe(false)
  })

  it('SHARE CHAIN: nothing without a chain; a card of scenes imported sets one, and its share is the chain as a card', async () => {
    const h = await liveOn()
    const p = h.c.pattern
    expect(h.c.beatShareChain()).toBeNull()
    expect(p.scene.value.chain).toEqual([])
    await h.c.receiveBeat(SCENES)
    p.importBeat(false)
    expect(p.scene.value.chain.length).toBe(2)
    const shared: string[] = []
    mutable(h).share = { ...h.deps.share, shareText: async (_t, text) => (shared.push(text), 'shared') }
    await h.c.shareChain()
    expect(shared[0]!.startsWith(ClaudeText.SHARE_CHAIN_PROMPT + '\n\n' + ClaudeText.EP133_LINE + '\n\n```\nARC BEAT 1\nname Chain\n')).toBe(true)
    const card = BeatCards.read(shared[0]!).card!
    expect(card.scenes.length).toBe(2)
    expect(card.chain).toEqual([[1, 2], [2, 1]])
  })

  it('PASTE BEAT: a card opens its sheet, IMPORT places it as one UNDO step', async () => {
    const h = await liveOn()
    const p = h.c.pattern
    mutable(h).clipboard = { writeText: async () => {}, readText: async () => CARD }
    await h.c.pasteBeat()
    const ui = p.beat.value
    expect(ui?.title).toBe('Four on the floor')
    // The next free pattern: A's 1 is the one the scene plays.
    expect(ui?.placed).toEqual([[0, 2]])
    expect(ui?.tempo).toBe(124)
    expect(ui?.blocked).toBeNull()
    p.importBeat(true)
    expect(p.beat.value).toBeNull()
    expect(p.metronome.value.bpm).toBe(124)
    expect(p.ui.value.hasNotes[0]).toBe(true)
    p.undo()
    expect(p.ui.value.hasNotes[0]).toBe(false)
  })

  it('no card in the text: a toast; a page that may not read the clipboard waits for a paste', async () => {
    const h = await liveOn()
    await h.c.receiveBeat('hello')
    expect(h.toasts.at(-1)?.text).toBe(ClaudeText.NO_CARD)
    expect(h.c.pattern.beat.value).toBeNull()
    mutable(h).clipboard = {
      writeText: async () => {},
      readText: async () => {
        throw new Error('NotAllowedError')
      },
    }
    await h.c.pasteBeat()
    expect(h.c.beatPasting.value).toBe(true)
    await h.c.receiveBeat(CARD)
    expect(h.c.beatPasting.value).toBe(false)
    expect(h.c.pattern.beat.value?.title).toBe('Four on the floor')
  })

  it('a card file picked or dropped opens on the sheet; one too long to be a card says there is none', async () => {
    const h = await liveOn()
    await h.c.receiveBeatFile({ size: CARD.length, text: async () => CARD })
    expect(h.c.pattern.beat.value?.title).toBe('Four on the floor')
    const h2 = await liveOn()
    await h2.c.receiveBeatFile({ size: BeatCards.MAX_CARD_FILE + 1, text: async () => CARD })
    expect(h2.toasts.at(-1)?.text).toBe(ClaudeText.NO_CARD)
    expect(h2.c.pattern.beat.value).toBeNull()
    expect(BeatCards.isCardFile('Night bus.arcbeat.txt')).toBe(true)
    expect(BeatCards.isCardFile('beat.MD')).toBe(true)
    expect(BeatCards.isCardFile('backup.pak')).toBe(false)
  })

  it('a card that cannot be read is blocked; COPY PROBLEMS copies its problems', async () => {
    const h = await liveOn()
    await h.c.receiveBeat(BAD)
    const ui = h.c.pattern.beat.value
    expect(ui?.blocked).toBe(ClaudeText.FIX_ERRORS)
    const copied: string[] = []
    mutable(h).clipboard = { writeText: async (t) => void copied.push(t) }
    await h.c.copyProblems(ui!.read.problems)
    expect(copied[0]).toBe(ClaudeText.problemsReport(BeatCards.read(BAD).problems))
    expect(h.toasts.at(-1)?.text).toBe(ClaudeText.PROBLEMS_COPIED)
    // Nothing changed: the project's patterns are as they were.
    expect(ProjectPatterns.isEmpty(h.c.pattern.patternsNow)).toBe(true)
  })

  // ---- SOUNDS and SILENT PADS ----

  // The keypad's 2 (offset 4) is the demo's pad 5, clap (slot 5); the keypad's D9 (offset 11) is D's pad 12, which has no sound.
  const A2 = physicalPad(0, 4)
  const D9 = physicalPad(3, 11)
  const SOUNDS = ['ARC BEAT 1', 'name Snare swap', '[A]', 'sound A2 2 snare', 'A2 | X... X... X... X... |', '[D]', 'D9 | X... .... X... .... |'].join('\n')

  /** The slot on project 1's pad [n] of group [group], read back from the device. */
  async function onDevice(h: LiveHarness, group: string, n: number): Promise<number | null | undefined> {
    await h.c.loadProjectSounds(1)
    return h.c.state.value.browser.projectPads.get(1)?.find((g) => g.name === group)?.pads.get(n)
  }

  it('IMPORT puts the ticked sounds and the one picked for a silent pad on the pads, and UNDO puts the old ones back', async () => {
    const h = await liveOn()
    const p = h.c.pattern
    await h.c.receiveBeat(SOUNDS)
    const ui = p.beat.value!
    expect(ui.sounds!.rows.map((r) => [r.pad, r.pick.status, r.oldName])).toEqual([[A2, SoundStatus.CHANGE, 'clap']])
    expect(ui.sounds!.offline).toBe(false)
    expect(ui.silent!.rows.map((r) => [r.pad, r.notes])).toEqual([[D9, 2]])
    expect(ui.silent!.choices!.names.get(3)).toBe(h.c.liveSounds().find((snd) => snd.slot === 3)?.name)
    p.importBeat(false, new Set([padKey(A2), padKey(D9)]), new Map([[padKey(D9), 3]]))
    const done = await until(h, (st) => st.toast?.text?.startsWith('Imported to') === true)
    expect(done.toast?.text).toBe(ClaudeText.imported([[0, 2], [3, 1]], 'S02', 2) )
    expect(done.toast?.action).toBe(MirrorText.UNDO)
    expect(await onDevice(h, 'a', 5)).toBe(2)
    expect(await onDevice(h, 'd', 12)).toBe(3)
    expect(h.c.mirrorName(A2)).toBe('snare')
    // UNDO on the toast: the patterns, and the old sound on the pad that had one; the empty pad keeps its new one.
    h.c.runToastAction(done.toast!.id)
    await until(h, (st) => st.toast?.text === ClaudeText.importUndone(1, 1, 0, false))
    expect(p.ui.value.hasNotes.some(Boolean)).toBe(false)
    expect(await onDevice(h, 'a', 5)).toBe(5)
    expect(h.c.mirrorName(A2)).toBe('clap')
  })

  it('IMPORT leaves an unticked sound where it is, and PUT ON PADS off writes none', async () => {
    const h = await liveOn()
    const p = h.c.pattern
    await h.c.receiveBeat(SOUNDS)
    p.importBeat(false)
    const done = await until(h, (st) => st.toast?.text?.startsWith('Imported to') === true)
    expect(done.toast?.text).toBe(ClaudeText.imported([[0, 2], [3, 1]], 'S02'))
    expect(await onDevice(h, 'a', 5)).toBe(5)
  })

  it('writes that throw stop IMPORT with its error toast, and UNDO still takes the import back', async () => {
    const h = await liveOn()
    const p = h.c.pattern
    await h.c.receiveBeat(SOUNDS)
    vi.spyOn(h.c as unknown as { putSounds(): Promise<unknown> }, 'putSounds').mockRejectedValue(new Error('gone'))
    p.importBeat(false, new Set([padKey(A2)]))
    const done = await until(h, (st) => st.toast?.text === ClaudeText.soundsFailed('gone', 0))
    expect(done.toast?.error).toBe(true)
    h.c.runToastAction(done.toast!.id)
    await vi.waitFor(() => expect(p.ui.value.hasNotes.some(Boolean)).toBe(false))
  })

  it('offline, IMPORT keeps the sounds as offline pad changes, and UNDO takes them back', async () => {
    const h = await liveOn()
    // The pads' sounds copied, then unplugged: Live shows the last read, offering its sounds.
    await vi.waitFor(
      async () => {
        for (const slot of [1, 2, 3, 4, 5]) expect(await h.padSounds.has(`s${slot}.wav`)).toBe(true)
        expect(h.c.state.value.backgroundRead).toBe(false)
      },
      { timeout: 5000 },
    )
    h.ep.access.unplug(h.ep.input, h.ep.output)
    await until(h, (st) => st.mirror?.offlineSounds != null)
    const p = h.c.pattern
    await h.c.receiveBeat(SOUNDS)
    const ui = p.beat.value!
    expect(ui.sounds!.offline).toBe(true)
    expect(ui.sounds!.changes.map((r) => r.pad)).toEqual([A2])
    p.importBeat(false, new Set([padKey(A2), padKey(D9)]), new Map([[padKey(D9), 3]]))
    const done = await until(h, (st) => st.toast?.text?.startsWith('Imported to') === true)
    expect(done.toast?.text).toBe(ClaudeText.imported([[0, 2], [3, 1]], 'S02', 2))
    expect(h.c.state.value.offlinePads).toBe(2)
    expect(h.c.mirrorName(A2)).toBe('snare')
    h.c.runToastAction(done.toast!.id)
    await until(h, (st) => st.toast?.text === ClaudeText.importUndone(2, 0, 0, false))
    expect(h.c.state.value.offlinePads).toBe(0)
    expect(h.c.mirrorName(A2)).toBe('clap')
  })
})
