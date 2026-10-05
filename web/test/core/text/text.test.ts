// Port of core/src/test/kotlin/dev/arc/ep133/text/TextTest.kt
// Dates pin locale 'en-US' and time zone 'UTC' (the Kotlin test uses Locale.US and ZoneOffset.UTC).
import { describe, expect, it } from 'vitest'
import { DATE_TIME_PATTERN, DAY_PATTERN, Format } from '../../../src/core/text/format'
import {
  BackupDevice,
  LibraryRules,
  RestoreSelection,
  type BackupRecord,
} from '../../../src/core/text/libraryRules'
import { Strings } from '../../../src/core/text/strings'

const b: BackupRecord = {
  id: 'x',
  title: 'Backup Oct 4, 1:05 PM',
  notes: '',
  createdAt: 0,
  source: 'device',
  fileName: null,
  device: BackupDevice('EP-133', 'TE032AS001', 'E3PTV2JT', '2.0.5'),
  soundCount: 4,
  projectCount: 3,
  projects: [1, 2, 5],
  slots: [1, 2, 3, 9],
  projectSlots: { 1: [1, 2], 2: [2, 3], 5: [] },
  size: 1536,
}

describe('TextTest', () => {
  it('fmtBytes and plural', () => {
    expect([0, 1023, 1024, 1536, 1048575, 1048576, 1572864, 10485760, 67108864].map((n) => Format.bytes(n))).toEqual([
      '0 B',
      '1023 B',
      '1 KB',
      '2 KB',
      '1024 KB',
      '1.0 MB',
      '1.5 MB',
      '10 MB',
      '64 MB',
    ])
    expect(Format.plural(0, 'sound')).toBe('0 sounds')
    expect(Format.plural(1, 'project')).toBe('1 project')
    expect(Format.list(['1', '2', '5'])).toBe('1, 2, and 5')
    expect(Format.list(['1', '2'])).toBe('1 and 2')
  })

  it('dates use plain spaces', () => {
    const ms = 1_791_119_124_116
    expect(Format.date(ms, DATE_TIME_PATTERN, 'en-US', 'UTC')).toBe('Oct 4, 1:05 PM')
    expect(Format.date(ms, DAY_PATTERN, 'en-US', 'UTC')).toBe('Oct 4, 2026')
    // Kotlin passes "MMM d, h:mm a"; Intl options cannot ask for the narrow space,
    // so check that whatever Intl puts there (U+202F in current ICU) comes out plain.
    const raw = new Intl.DateTimeFormat('en-US', { ...DATE_TIME_PATTERN, timeZone: 'UTC' }).format(ms)
    expect(raw.replace(/[\u202F\u00A0]/g, ' ')).toBe('Oct 4, 1:05 PM')
    expect(Format.date(ms, DATE_TIME_PATTERN, 'en-US', 'UTC')).not.toMatch(/[\u202F\u00A0]/)
  })

  it('file names', () => {
    expect(LibraryRules.fileNameFor('Backup Oct 4, 1:05 PM')).toBe('backup-oct-4-105-pm.pak')
    expect(LibraryRules.fileNameFor('ÄÖÜ!!')).toBe('ep133-backup.pak')
    expect(LibraryRules.fileNameFor('  My_Set  -2 ')).toBe('my_set--2.pak') // as the JS: "-" stays, then spaces become "-"
    expect(LibraryRules.importTitle('live set.PAK')).toBe('live set')
    expect(LibraryRules.importTitle('a.zip.zip')).toBe('a.zip')
    expect(LibraryRules.importTitle('.pak')).toBe('Imported backup')
    expect(LibraryRules.importTitle('notes.txt')).toBe('notes.txt')
  })

  it('restore selection, button and warning', () => {
    const all = LibraryRules.restoreSelection(b, true, [], false)
    expect(all).toEqual(RestoreSelection([1, 2, 3, 9], [1, 2, 5]))
    expect(LibraryRules.restoreButton(all)).toBe('Restore 4 sounds and 3 projects')
    expect(LibraryRules.restoreWarning(all)).toBe(
      'This overwrites projects 1, 2, and 5 and 4 sample slots on your EP-133. Everything else on the device stays as it is.',
    )
    const one = LibraryRules.restoreSelection(b, false, [2], false)
    expect(one).toEqual(RestoreSelection([2, 3], [2]))
    expect(LibraryRules.restoreWarning(one)).toBe(
      'This overwrites project 2 and 2 sample slots on your EP-133. Everything else on the device stays as it is.',
    )
    // "other" adds sounds used by no project at all (9), not just by no picked one.
    const other = LibraryRules.restoreSelection(b, false, [5], true)
    expect(other).toEqual(RestoreSelection([9], [5]))
    const none = LibraryRules.restoreSelection(b, false, [], false)
    expect(LibraryRules.restoreButton(none)).toBe('Pick something to restore')
    expect(LibraryRules.restoreWarning(none)).toBe('')
    expect(LibraryRules.restoreButton(RestoreSelection([9], []))).toBe('Restore 1 sound')
  })

  it('detail facts and project lines', () => {
    expect(LibraryRules.facts(b, 'Oct 4')).toEqual([
      ['Made', 'Oct 4'],
      ['From', 'EP-133, E3PTV2JT'],
      ['OS', '2.0.5'],
      ['Contents', '4 sounds, 3 projects'],
      ['Size', '2 KB'],
    ])
    const imp: BackupRecord = { ...b, source: 'import', fileName: 'friend.pak', device: BackupDevice() }
    expect(LibraryRules.facts(imp, 'x').find((f) => f[0] === 'From')?.[1]).toBe('Imported file, friend.pak')
    expect(LibraryRules.facts(imp, 'x').find((f) => f[0] === 'OS') ?? null).toBe(null)
    expect(LibraryRules.projectSoundsDetail(b, 5)).toBe('')
    expect(LibraryRules.projectSoundsRestore(b, 5)).toBe('0 sounds')
    expect(LibraryRules.projectSoundsDetail(b, 1)).toBe('2 sounds')
  })

  it('toasts and notes', () => {
    expect(Strings.saved(1, 0)).toBe('Saved 1 sound and 0 projects.')
    expect(Strings.restored(12, 3)).toBe('Restored 12 sounds and 3 projects.')
    expect(Strings.imported(2, 1)).toBe('Imported 2 sounds and 1 project.')
    expect(Strings.importFailed('x.pak', 'This file has no sounds or projects in it')).toBe(
      "Couldn't import x.pak: This file has no sounds or projects in it",
    )
    expect(Strings.deleteConfirm('My set')).toBe('Delete "My set" from this phone? This can\'t be undone.')
    expect(Strings.storageNote(2, 3 * 1048576, 1048576)).toBe('2 backups, 3.0 MB stored on this phone (1.0 MB space left).')
    expect(Strings.storageNote(0, 0, 5)).toBe('')
    expect(Strings.meterDescription(1572864.0, 67108864.0)).toBe('1.5 MB of 64 MB used')
    expect(Strings.backupRowMeta(4, 3, 1536)).toBe('4 sounds, 3 projects, 2 KB')
  })
})
