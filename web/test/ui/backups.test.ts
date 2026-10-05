// Tests for the pure helpers of the Backups tab: src/ui/screens/MainScreen.tsx
// (ports of MainScreen.kt DevicePanel and the folder lines) and src/ui/sheets/*
// (Sheets.kt Actions, RestoreSheetContent's diff match, DiffResultView, Root's sheet ids).
import { describe, expect, it } from 'vitest'
import { DiffResult, ProjectDiff, SoundDiff } from '../../src/core/features/backupDiff'
import { BackupDevice, RestoreSelection, type BackupRecord } from '../../src/core/text/libraryRules'
import { Strings } from '../../src/core/text/strings'
import { WebText } from '../../src/core/text/webText'
import { initialState, type UiState } from '../../src/state/types'
import { devicePanel, folderModel } from '../../src/ui/screens/MainScreen'
import { actionRows } from '../../src/ui/sheets/Actions'
import { sheetArg } from '../../src/ui/sheets/BackupsSheets'
import { soundLine } from '../../src/ui/sheets/DiffResultView'
import { sameSelection, shownDiff } from '../../src/ui/sheets/RestoreSheet'

function record(id: string): BackupRecord {
  return {
    id, title: id, notes: '', createdAt: 0, source: 'device', fileName: null, device: BackupDevice(),
    soundCount: 1, projectCount: 1, projects: [1], slots: [1], projectSlots: { 1: [1] }, size: 10,
  }
}

const device = (total: number, used: number, product = 'EP-133'): UiState['device'] => ({
  info: { product, sku: '', osVersion: '2.5.1', serial: '', mode: '' },
  storage: { total, used, free: total - used },
  sounds: 212,
  projects: 6,
})

describe('actionRows (Sheets.kt Actions)', () => {
  const w = { wide: true }
  const h = { wide: false }
  it('pairs half keys and gives wide keys a row each', () => {
    // The detail sheet: Restore, Share | Save, Contents, Compare, Delete.
    expect(actionRows([w, h, h, w, w, w])).toEqual([[0], [1, 2], [3], [4], [5]])
  })
  it('a half key left alone before a wide key or at the end takes a row', () => {
    expect(actionRows([h, w, h])).toEqual([[0], [1], [2]])
    expect(actionRows([h, h, h])).toEqual([[0, 1], [2]])
    expect(actionRows([])).toEqual([])
  })
})

describe('devicePanel (MainScreen.kt DevicePanel)', () => {
  it('no MIDI uses the browser wording', () => {
    const m = devicePanel({ midiSupported: false, connected: false, device: null })
    expect(m).toMatchObject({ title: WebText.NO_MIDI_TITLE, hint: WebText.NO_MIDI_HINT, sub: '', fraction: 0, stats: null })
  })
  it('no device, then reading', () => {
    expect(devicePanel({ midiSupported: true, connected: false, device: null })).toMatchObject({
      title: Strings.NO_DEVICE, hint: Strings.PLUG_IN_HINT,
    })
    expect(devicePanel({ midiSupported: true, connected: true, device: null })).toMatchObject({
      title: Strings.READING_DEVICE, hint: Strings.ONE_MOMENT,
    })
  })
  it('a device: name, OS, meter and stats', () => {
    const m = devicePanel({ midiSupported: true, connected: true, device: device(100, 60) })
    expect(m.title).toBe('EP-133')
    expect(m.sub).toBe('OS 2.5.1')
    expect(m.hint).toBeNull()
    expect(m.fraction).toBeCloseTo(0.6)
    expect(m.meterText).toBe(Strings.meterDescription(60, 100))
    expect(m.stats).toEqual({ sounds: 212, projects: 6, free: 40 })
  })
  it('an unnamed device is "EP-133"; unknown storage has no free column and an empty meter', () => {
    const m = devicePanel({ midiSupported: true, connected: true, device: device(0, 0, '') })
    expect(m.title).toBe('EP-133')
    expect(m.fraction).toBe(0)
    expect(m.meterText).toBe('')
    expect(m.stats?.free).toBeNull()
  })
})

describe('folderModel (the library folder lines)', () => {
  const base = { ...initialState(true, true), libraryLoaded: true }
  it('empty library: the restore hint and key once loaded', () => {
    expect(folderModel(base)).toEqual({ reconnect: false, emptyRestore: true, note: '', key: null })
    expect(folderModel({ ...base, libraryLoaded: false }).emptyRestore).toBe(false)
  })
  it('a lapsed folder permission shows the reconnect banner instead', () => {
    expect(folderModel({ ...base, folderStatus: 'prompt', folderPicked: true })).toEqual({
      reconnect: true, emptyRestore: false, note: '', key: null,
    })
    expect(folderModel({ ...base, backups: [record('a')], folderStatus: 'prompt', folderPicked: true }).note).toBe('')
  })
  it('backups without a folder: the offer to pick one, or Export library where none can be picked', () => {
    const withList = { ...base, backups: [record('a')] }
    expect(folderModel(withList)).toMatchObject({ note: WebText.FOLDER_NOTE_OFF, key: 'pick' })
    expect(folderModel({ ...withList, canPickFolder: false })).toMatchObject({ note: WebText.EXPORT_LIBRARY_NOTE, key: 'export' })
  })
  it('backups with a folder in use: the folder note naming it', () => {
    const m = folderModel({ ...base, backups: [record('a')], folderPicked: true, folderStatus: 'granted', folderName: 'arc' })
    expect(m).toEqual({ reconnect: false, emptyRestore: false, note: WebText.folderNote('arc'), key: null })
  })
})

describe('restore sheet diff match', () => {
  const sel = RestoreSelection([1, 2], [3])
  const result = DiffResult([SoundDiff(1, 'kick', 'kick', 'SAME_AUDIO', [])], [ProjectDiff(3, 'SAME')], [], [])
  it('compares selections like a Kotlin data class', () => {
    expect(sameSelection(sel, RestoreSelection([1, 2], [3]))).toBe(true)
    expect(sameSelection(sel, RestoreSelection([1], [3]))).toBe(false)
    expect(sameSelection(sel, RestoreSelection([1, 2], []))).toBe(false)
  })
  it('shows a result only for this backup and this selection', () => {
    const diff = { backupId: 'a', selection: sel, result }
    expect(shownDiff(diff, 'a', RestoreSelection([1, 2], [3]))).toBe(diff)
    expect(shownDiff(diff, 'b', sel)).toBeNull()
    expect(shownDiff(diff, 'a', RestoreSelection([1, 2, 5], [3]))).toBeNull()
    expect(shownDiff(null, 'a', sel)).toBeNull()
  })
})

describe('sheet ids and labels', () => {
  it('sheetArg finds the topmost sheet with a prefix', () => {
    expect(sheetArg(['detail:a', 'restore:b'], 'detail:')).toBe('a')
    expect(sheetArg(['detail:a', 'detail:b'], 'detail:')).toBe('b')
    expect(sheetArg(['progress'], 'restore:')).toBeNull()
  })
  it('soundLine pads the slot', () => {
    expect(soundLine(7, 'kick')).toBe('Sound 007, kick')
  })
})
