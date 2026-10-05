// Port of the ProjectPads and LibrarySearch cases of
// core/src/test/kotlin/dev/arc/ep133/features/PadsCompareSearchTest.kt.
// The compare and FeatureText cases are in padsCompareSearch.test.ts.
import { describe, expect, it } from 'vitest'
import { search, type NameEntry } from '../../../src/core/features/librarySearch'
import { openPak } from '../../../src/core/backup/pak'
import { read } from '../../../src/core/features/projectPads'
import { slotsUsedByProject } from '../../../src/core/formats/tar'
import { pad, tarFile } from '../../helpers/bytes'
import { BackupDevice, type BackupRecord } from '../../../src/core/text/libraryRules'
import { samplePak } from '../../helpers/fixtures'

// The library record of the Kotlin test.
function record(id: string): BackupRecord {
  return {
    id,
    title: `Backup ${id}`,
    notes: '',
    createdAt: 0,
    source: 'device',
    fileName: null,
    device: BackupDevice('EP-133', '', '', ''),
    soundCount: 0,
    projectCount: 0,
    projects: [],
    slots: [],
    projectSlots: {},
    size: 0,
  }
}

describe('PadsCompareSearchTest (pads, search)', () => {
  // ---------- pads ----------

  it('pads agree with the slots a project uses', async () => {
    const projects = (await openPak(samplePak())).projects
    for (const [n, tar] of projects) {
      const groups = read(tar)
      expect(groups.length, `project ${n}`).toBeGreaterThan(0)
      const slots = [...new Set(groups.flatMap((g) => [...g.pads.values()]).filter((s): s is number => s != null))]
      expect(slots.sort((a, b) => a - b), `project ${n}`).toEqual(slotsUsedByProject(tar))
    }
    // P01 of the fixture: a1, b2, c3, d4 and a5 hold slots 1..5.
    const p1 = read(projects.get(1)!)
    expect(p1.map((g) => g.name)).toEqual(['a', 'b', 'c', 'd'])
    expect(p1[0]!.pads).toEqual(new Map([[1, 1], [5, 5]]))
    expect(p1[3]!.pads).toEqual(new Map([[4, 4]]))
  })

  it('pads follow the same matching rules as the slot list', () => {
    const t = tarFile([
      ['./pads/a/p01', pad(5)],
      ['pads/b/p12', pad(1000)],
      ['x/pads/c/p3', pad(300)],
      ['pads/p04', pad(7)],
      ['pads/a/p05x', pad(8)],
      ['PADS/a/p06', pad(9)],
      ['pads/a/p07', Uint8Array.of(0, 1)],
      ['pads/d/p02', pad(0)],
      ['pads/zz/p01', pad(44)],
      ['pads/a/p99999999999', pad(6)],
    ])
    const groups = read(t)
    // a-d first, others after; slot 1000 and 0 are empty pads; short records and odd names are skipped.
    expect(groups.map((g) => g.name)).toEqual(['a', 'b', 'c', 'd', 'zz'])
    expect(groups[0]!.pads).toEqual(new Map([[1, 5]]))
    expect(groups[1]!.pads).toEqual(new Map([[12, null]]))
    expect(groups[2]!.pads).toEqual(new Map([[3, 300]]))
    expect(groups[3]!.pads).toEqual(new Map([[2, null]]))
    expect(groups[4]!.pads).toEqual(new Map([[1, 44]]))
    expect(read(new Uint8Array(0))).toEqual([])
  })

  // ---------- search ----------

  it('search matches every word, ignoring case, grouped by backup', () => {
    const backups = [record('b'), record('a'), record('c')]
    const entries: NameEntry[] = [
      { backupId: 'a', slot: 5, name: 'Kick Hard' },
      { backupId: 'a', slot: 2, name: 'kick soft' },
      { backupId: 'b', slot: 9, name: 'big KICK' },
      { backupId: 'c', slot: 1, name: 'snare' },
      { backupId: 'gone', slot: 1, name: 'kick' },
    ]
    const r = search(entries, backups, '  KICK ')
    // Library order (b before a), slots sorted, rows of deleted backups ignored.
    expect(r.map((g) => g.backup.id)).toEqual(['b', 'a'])
    expect(r[1]!.hits).toEqual([
      { slot: 2, name: 'kick soft' },
      { slot: 5, name: 'Kick Hard' },
    ])
    const single = search(entries, backups, 'hard kick')
    expect(single.length).toBe(1)
    expect(single[0]!.hits).toEqual([{ slot: 5, name: 'Kick Hard' }])
    expect(search(entries, backups, ' ')).toEqual([])
    expect(search(entries, backups, 'clap')).toEqual([])
  })
})
