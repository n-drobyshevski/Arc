import { describe, expect, it } from 'vitest'
import type { Pak } from '../../../src/core/backup/pak'
import { FactorySounds } from '../../../src/core/features/factorySounds'
import { BackupDevice, LibraryRules, type BackupRecord } from '../../../src/core/text/libraryRules'
import { pad, tarFile } from '../../helpers/bytes'

// The EP Sample Tool's page and a line of its script, as served (Oct 2026).
const page = `<link rel="icon" type="image/x-icon" href="/apps/ep-sample-tool/assets/favicon-CV1VhAGr.ico" />
<script type="module" crossorigin src="/apps/ep-sample-tool/assets/index-C1wBjhTa.js"></script>
<link rel="stylesheet" crossorigin href="/apps/ep-sample-tool/assets/index-qny0Yi1N.css">`
const script =
  'const a="/apps/ep-sample-tool/assets/ep-40-factory-content-C42FyxWp.pak",' +
  'b="/apps/ep-sample-tool/assets/ep-133-factory-content-DRyE_DHC.pak";'

describe('FactorySounds', () => {
  it("finds the pack through the tool's page and script", async () => {
    expect(FactorySounds.scriptPath(page)).toBe('/apps/ep-sample-tool/assets/index-C1wBjhTa.js')
    expect(FactorySounds.pakPath(script)).toBe('/apps/ep-sample-tool/assets/ep-133-factory-content-DRyE_DHC.pak')
    const asked: string[] = []
    const path = await FactorySounds.locate(async (p) => {
      asked.push(p)
      return p === FactorySounds.PAGE ? page : script.replace('DRyE_DHC', 'N3w-H4sh')
    })
    expect(path).toBe('/apps/ep-sample-tool/assets/ep-133-factory-content-N3w-H4sh.pak')
    expect(asked).toEqual([FactorySounds.PAGE, '/apps/ep-sample-tool/assets/index-C1wBjhTa.js'])
  })

  it('falls back to the last known path when the lookup fails', async () => {
    await expect(FactorySounds.locate(() => Promise.reject(new Error('offline')))).resolves.toBe(FactorySounds.KNOWN_PAK)
    await expect(FactorySounds.locate(async () => '<html></html>')).resolves.toBe(FactorySounds.KNOWN_PAK)
    await expect(FactorySounds.locate(async (p) => (p === FactorySounds.PAGE ? page : 'nothing here'))).resolves.toBe(
      FactorySounds.KNOWN_PAK,
    )
  })

  const pak = (meta: Record<string, string>, projects: Map<number, Uint8Array>): Pak => ({
    meta,
    sidecar: {},
    sounds: new Map([
      [1, { slot: 1, name: 'micro kick', wav: new Uint8Array(0), settings: null }],
      [100, { slot: 100, name: 'nt snare', wav: new Uint8Array(0), settings: null }],
    ]),
    projects,
  })
  const factoryMeta = { pak_type: 'factory', device_name: 'EP-133' }

  it('counts only an EP-133 factory pack', () => {
    expect(FactorySounds.isFactory(pak(factoryMeta, new Map()))).toBe(true)
    expect(FactorySounds.isFactory(pak({ ...factoryMeta, pak_type: 'user' }, new Map()))).toBe(false)
    expect(FactorySounds.isFactory(pak({ ...factoryMeta, device_name: 'EP-40' }, new Map()))).toBe(false)
    expect(FactorySounds.isFactory(pak({}, new Map()))).toBe(false)
  })

  it("shows project 1's pads with every sound's name", () => {
    const p1 = tarFile([
      ['pads/a/p01', pad(100)],
      ['pads/a/p10', pad(1)],
      ['pads/b/p01', pad(0)],
    ])
    const snap = FactorySounds.snapshot(pak(factoryMeta, new Map([[1, p1], [2, tarFile([])]])), 5)!
    expect(snap.savedAt).toBe(5)
    expect(snap.activeProject).toBe(1)
    expect(snap.groups.map((g) => g.name)).toEqual(['a', 'b'])
    expect([...snap.groups[0]!.pads]).toEqual([[1, 100], [10, 1]])
    expect([...snap.groups[1]!.pads]).toEqual([[1, null]])
    expect([...snap.names]).toEqual([[1, 'micro kick'], [100, 'nt snare']])
    // No project 1, or one without pads: nothing to show.
    expect(FactorySounds.snapshot(pak(factoryMeta, new Map([[2, p1]])), 5)).toBeNull()
    expect(FactorySounds.snapshot(pak(factoryMeta, new Map([[1, tarFile([])]])), 5)).toBeNull()
  })

  it('numbers unlearned pads from the top row, never over a learned number', () => {
    const top = FactorySounds.links(new Map())
    expect(top.size).toBe(12)
    expect(top.get(9)).toBe(1) // '7'
    expect(top.get(0)).toBe(10) // '.'
    expect(top.get(2)).toBe(12) // ENTER
    // '7' learned as p02: '8' (p02 from the top) is left unlinked; the rest as before.
    const some = FactorySounds.links(new Map([[9, 2]]))
    expect(some.get(9)).toBe(2)
    expect(some.has(10)).toBe(false)
    expect(some.get(0)).toBe(10)
  })

  const rec = (id: string, createdAt: number, source: string): BackupRecord => ({
    id,
    title: id,
    notes: '',
    createdAt,
    source,
    fileName: null,
    device: BackupDevice(),
    soundCount: 0,
    projectCount: 0,
    projects: [],
    slots: [],
    projectSlots: {},
    size: 0,
  })

  it('finds the factory pack in the library and never prunes it', () => {
    const factory = rec('f', 1, FactorySounds.SOURCE)
    const backups = [rec('a', 10, 'device'), factory, rec('b', 20, 'import'), rec('c', 30, 'device')]
    expect(FactorySounds.inLibrary(backups)).toBe(factory)
    expect(FactorySounds.inLibrary(backups.filter((b) => b !== factory))).toBeNull()
    // Keep 2: the oldest own backup goes; the factory pack, older still, is neither counted nor deleted.
    expect(LibraryRules.toPrune(backups, 2).map((b) => b.id)).toEqual(['a'])
    expect(LibraryRules.toPrune(backups, 3)).toEqual([])
    expect(new Map(LibraryRules.facts(factory, '')).get('From')).toBe(LibraryRules.FACTORY_FROM)
  })
})
