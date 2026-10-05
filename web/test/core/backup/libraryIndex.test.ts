// Port of core/src/test/kotlin/dev/arc/ep133/backup/LibraryIndexTest.kt
import { describe, expect, it } from 'vitest'
import {
  fileFor,
  merge,
  parse,
  toJson,
  type IndexEntry,
  type LibraryIndexData,
} from '../../../src/core/backup/libraryIndex'
import { BackupDevice } from '../../../src/core/text/libraryRules'


describe('LibraryIndexTest', () => {
  const a: IndexEntry = {
    id: '1a2b3c4d-0000-4000-8000-000000000000',
    file: 'arc-20261004-230112-1a2b3c4d.pak',
    title: 'Before the gig',
    notes: 'two "quoted" lines\nhere',
    createdAt: 1_791_154_872_000,
    source: 'device',
    fileName: null,
    device: BackupDevice('EP-133', 'TE032AS001', 'serial-1', '2.5.1'),
  }
  const b: IndexEntry = {
    id: 'ffff',
    file: 'arc-20261002-101500-ffff.pak',
    title: 'my set',
    notes: '',
    createdAt: 1_790_936_100_000,
    source: 'import',
    fileName: 'my set.pak',
    device: BackupDevice(),
  }

  it('file names come from the creation time and id only', () => {
    expect(fileFor(a.id, a.createdAt)).toBe('arc-20261004-230112-1a2b3c4d.pak')
    expect(fileFor('--', 0)).toBe('arc-19700101-000000-backup.pak')
  })

  it('an index round-trips, settings included', () => {
    const data: LibraryIndexData = { entries: [a, b], settings: { 'mirror.order': 'FROM_TOP', 'mirror.learned': '0:10,9:1' } }
    const json = toJson(data)
    expect(parse(json)).toEqual(data)
    // It names the app, so a stray library.json is easy to tell apart.
    expect(json.startsWith('{\n  "app": "arc"')).toBe(true)
  })

  it('unusable entries and files are skipped', () => {
    const text = `{"backups": [
  {"id": "x", "file": "x.pak", "createdAt": 5},
  {"id": "", "file": "y.pak", "createdAt": 5},
  {"id": "z", "createdAt": 5},
  {"id": "w", "file": "w.pak", "createdAt": "5"},
  7
], "settings": {"k": "v", "n": 1}}`
    const d = parse(text)!
    expect(d.entries.map((e) => e.id)).toEqual(['x'])
    expect(d.entries).toEqual([
      { id: 'x', file: 'x.pak', title: '', notes: '', createdAt: 5, source: 'import', fileName: null, device: BackupDevice() },
    ])
    expect(d.settings).toEqual({ k: 'v' })
    expect(parse('not json')).toBeNull()
    expect(parse('{"sounds": {}}')).toBeNull()
  })

  it('indexes merge by id, later ones winning', () => {
    const old: LibraryIndexData = { entries: [a, b], settings: { 'mirror.order': 'FROM_TOP' } }
    const newer: LibraryIndexData = { entries: [{ ...a, title: 'Renamed' }], settings: { 'mirror.order': 'FROM_BOTTOM' } }
    const m = merge([old, newer])
    expect(m.entries.map((e) => e.title)).toEqual(['Renamed', 'my set'])
    expect(m.settings).toEqual({ 'mirror.order': 'FROM_BOTTOM' })
  })
})
