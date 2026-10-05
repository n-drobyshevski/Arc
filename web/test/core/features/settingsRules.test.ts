// Port of core/src/test/kotlin/dev/arc/ep133/features/SettingsRulesTest.kt
import { describe, expect, it } from 'vitest'
import { BackupDevice, LibraryRules, type BackupRecord } from '../../../src/core/text/libraryRules'
import { SettingsText } from '../../../src/core/text/settingsText'

const b = (id: string, at: number): BackupRecord => ({
  id,
  title: id,
  notes: '',
  createdAt: at,
  source: 'device',
  fileName: null,
  device: BackupDevice(),
  soundCount: 0,
  projectCount: 0,
  projects: [],
  slots: [],
  projectSlots: {},
  size: 0,
})

describe('SettingsRulesTest', () => {
  it('pruning keeps the newest and drops the oldest', () => {
    const list = [b('c', 300), b('a', 100), b('d', 400), b('b', 200)]
    expect(LibraryRules.toPrune(list, null)).toEqual([])
    expect(LibraryRules.toPrune(list, 4)).toEqual([])
    expect(LibraryRules.toPrune(list, 10)).toEqual([])
    expect(LibraryRules.toPrune(list, 2).map((r) => r.id)).toEqual(['b', 'a'])
    expect(LibraryRules.toPrune(list, 3).map((r) => r.id)).toEqual(['a'])
    // Same time: the order is still fixed (by id), so the same one goes every time.
    expect(LibraryRules.toPrune([b('x', 5), b('y', 5)], 1).map((r) => r.id)).toEqual(['x'])
  })

  it('settings wording', () => {
    expect(SettingsText.keepLabel(null)).toBe('All')
    expect(SettingsText.keepLabel(10)).toBe('10')
    expect(SettingsText.pruneConfirm(1)).toBe('This deletes the oldest backup, also from Documents/arc.')
    expect(SettingsText.pruneConfirm(3)).toBe('This deletes the 3 oldest backups, also from Documents/arc.')
    expect(SettingsText.pruned(1)).toBe('Removed 1 old backup.')
    expect(SettingsText.pruned(2)).toBe('Removed 2 old backups.')
  })
})
