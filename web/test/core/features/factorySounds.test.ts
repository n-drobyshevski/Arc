import { describe, expect, it } from 'vitest'
import type { Pak } from '../../../src/core/backup/pak'
import { FactoryKit, FactorySounds } from '../../../src/core/features/factorySounds'
import { FeatureText } from '../../../src/core/text/featureText'
import { MirrorText } from '../../../src/core/text/mirrorText'
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

  it("offline, PROJECT steps through the pack's projects with pads", () => {
    const p1 = tarFile([['pads/a/p01', pad(100)]])
    const p3 = tarFile([['pads/c/p02', pad(1)]])
    const p = pak(factoryMeta, new Map([[3, p3], [1, p1], [2, tarFile([])]]))
    expect(FactorySounds.projects(p)).toEqual([1, 3])
    const snap = FactorySounds.snapshot(p, 5, 3)!
    expect(snap.activeProject).toBe(3)
    expect(snap.groups.map((g) => g.name)).toEqual(['c'])
    expect([...snap.groups[0]!.pads]).toEqual([[2, 1]])
    expect([...snap.names]).toEqual([[1, 'micro kick'], [100, 'nt snare']])
    expect(FactorySounds.snapshot(p, 5, 2)).toBeNull()
    expect(FactorySounds.snapshot(p, 5, 4)).toBeNull()
    expect(FactorySounds.projects(pak(factoryMeta, new Map()))).toEqual([])
  })

  it("calls a sound unnamed when the device lists it as its slot's file", () => {
    expect(FactorySounds.unnamed(343, '343.pcm')).toBe(true)
    expect(FactorySounds.unnamed(1, '001.pcm')).toBe(true)
    expect(FactorySounds.unnamed(1, ' 001.PCM ')).toBe(true)
    expect(FactorySounds.unnamed(1, '1.pcm')).toBe(false)
    expect(FactorySounds.unnamed(2, '001.pcm')).toBe(false) // another slot's file: moved, not the factory sound
    expect(FactorySounds.unnamed(343, 'nt perc')).toBe(false)
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

  it('names the kits by id, library source and device sku', () => {
    expect(FactoryKit.entries).toEqual([FactoryKit.EP133, FactoryKit.EP1320, FactoryKit.EP40])
    expect(FactoryKit.EP133).toEqual({ id: 'ep133', source: 'factory', sku: 'TE032AS001', model: 'EP-133' })
    expect(FactoryKit.EP1320).toEqual({ id: 'ep1320', source: 'factory-ep1320', sku: 'TE032AS005', model: 'EP-1320' })
    // The EP-133's source is the one the library has always had.
    expect(FactoryKit.EP133.source).toBe(FactorySounds.SOURCE)
    expect(FactoryKit.ofSku('TE032AS001')).toBe(FactoryKit.EP133)
    expect(FactoryKit.ofSku('TE032AS005')).toBe(FactoryKit.EP1320)
    expect(FactoryKit.ofSku('TE032AS004')).toBeNull()
    expect(FactoryKit.ofSku(null)).toBeNull()
    expect(FactoryKit.ofId('ep1320')).toBe(FactoryKit.EP1320)
    expect(FactoryKit.ofId('EP1320')).toBeNull()
    expect(FactoryKit.ofSource('factory-ep1320')).toBe(FactoryKit.EP1320)
    expect(FactoryKit.ofSource('device')).toBeNull()
    expect(['factory', 'factory-ep1320', 'device', 'import'].map(FactorySounds.isFactorySource)).toEqual([true, true, false, false])
    expect(FactorySounds.FILE_NAME_1320).toBe('ep-1320-factory-content.pak')
  })

  it("names the EP-40's kit, and finds it by its sku", () => {
    expect(FactoryKit.EP40).toEqual({ id: 'ep40', source: 'factory-ep40', sku: 'TE032AS006', model: 'EP-40' })
    expect(FactoryKit.ofSku('TE032AS006')).toBe(FactoryKit.EP40)
    expect(FactoryKit.ofId('ep40')).toBe(FactoryKit.EP40)
    expect(FactoryKit.ofSource('factory-ep40')).toBe(FactoryKit.EP40)
    expect(FactorySounds.isFactorySource('factory-ep40')).toBe(true)
    expect(FactorySounds.KNOWN_PAK_40).toBe('/apps/ep-sample-tool/assets/ep-40-factory-content-C42FyxWp.pak')
    expect(FactorySounds.KNOWN_SIZE_40).toBe(68_853_737)
    expect(FactorySounds.FILE_NAME_40).toBe('ep-40-factory-content.pak')
    // Each downloadable kit's facts; the EP-1320's has none.
    expect(FactorySounds.download(FactoryKit.EP133)).toMatchObject({ knownPak: FactorySounds.KNOWN_PAK, knownSize: FactorySounds.KNOWN_SIZE, fileName: FactorySounds.FILE_NAME })
    expect(FactorySounds.download(FactoryKit.EP40)).toMatchObject({ knownPak: FactorySounds.KNOWN_PAK_40, knownSize: FactorySounds.KNOWN_SIZE_40, fileName: FactorySounds.FILE_NAME_40 })
    expect(FactorySounds.download(FactoryKit.EP1320)).toBeNull()
  })

  it("finds the EP-40's pack beside the EP-133's in the tool's script, else its last known path", async () => {
    expect(FactorySounds.pakPath(script, FactoryKit.EP40)).toBe('/apps/ep-sample-tool/assets/ep-40-factory-content-C42FyxWp.pak')
    expect(FactorySounds.pakPath(script, FactoryKit.EP133)).toBe('/apps/ep-sample-tool/assets/ep-133-factory-content-DRyE_DHC.pak')
    expect(FactorySounds.pakPath(script, FactoryKit.EP1320)).toBeNull()
    // Only the EP-133's in the script: none for the EP-40.
    expect(FactorySounds.pakPath('b="/apps/ep-sample-tool/assets/ep-133-factory-content-DRyE_DHC.pak"', FactoryKit.EP40)).toBeNull()
    const located = await FactorySounds.locate(async (p) => (p === FactorySounds.PAGE ? page : script.replace('C42FyxWp', 'N3w_40')), FactoryKit.EP40)
    expect(located).toBe('/apps/ep-sample-tool/assets/ep-40-factory-content-N3w_40.pak')
    await expect(FactorySounds.locate(() => Promise.reject(new Error('offline')), FactoryKit.EP40)).resolves.toBe(FactorySounds.KNOWN_PAK_40)
    await expect(FactorySounds.locate(async (p) => (p === FactorySounds.PAGE ? page : 'nothing here'), FactoryKit.EP40)).resolves.toBe(
      FactorySounds.KNOWN_PAK_40,
    )
    // The EP-133's lookup is as it was.
    await expect(FactorySounds.locate(async (p) => (p === FactorySounds.PAGE ? page : script))).resolves.toBe(FactorySounds.KNOWN_PAK)
  })

  const ep40Meta = { pak_type: 'factory', device_name: 'EP-40', device_sku: 'TE032AS006' }

  it("counts an EP-40 factory pack as the EP-40's only", () => {
    expect(FactorySounds.isFactory(pak(ep40Meta, new Map()), FactoryKit.EP40)).toBe(true)
    expect(FactorySounds.isFactory(pak(ep40Meta, new Map()), FactoryKit.EP133)).toBe(false)
    expect(FactorySounds.isFactory(pak(ep40Meta, new Map()))).toBe(false)
    expect(FactorySounds.isFactory(pak(factoryMeta, new Map()), FactoryKit.EP40)).toBe(false)
    expect(FactorySounds.isFactory(pak({ ...ep40Meta, pak_type: 'user' }, new Map()), FactoryKit.EP40)).toBe(false)
    expect(FactorySounds.isFactory({ ...pak(ep40Meta, new Map()), sounds: new Map() }, FactoryKit.EP40)).toBe(false)
    expect(FactorySounds.fitsKit(pak(ep40Meta, new Map()), FactoryKit.EP40)).toBe(true)
    expect(FactorySounds.fitsKit(pak(ep40Meta, new Map()), FactoryKit.EP1320)).toBe(false)
    expect(FactorySounds.fitsKit(pak(factoryMeta, new Map()), FactoryKit.EP40)).toBe(false)
    // Imported, an EP-40 factory pack is saved as its kit; a user pack of one is an ordinary import.
    expect(FactorySounds.importKit(pak(ep40Meta, new Map()))).toBe(FactoryKit.EP40)
    expect(FactorySounds.importKit(pak({ ...ep40Meta, pak_type: 'user' }, new Map()))).toBeNull()
    // Its backups aren't offered as factory sounds: its pack is downloaded.
    expect(FactorySounds.canUseAsFactory({ ...rec('x', 1, 'device'), device: BackupDevice('EP-40', 'TE032AS006', 'S1', '0.0.0') })).toBe(false)
  })

  it('keeps all three kits, never prunes one, and says where the EP-40 pack came from', () => {
    const ep133 = rec('f', 1, FactoryKit.EP133.source)
    const medieval = rec('m', 2, FactoryKit.EP1320.source)
    const riddim = rec('r', 3, FactoryKit.EP40.source)
    const backups = [rec('a', 10, 'device'), ep133, riddim, medieval, rec('b', 20, 'import')]
    expect(FactorySounds.inLibrary(backups, FactoryKit.EP40)).toBe(riddim)
    expect(FactorySounds.inLibrary([ep133, medieval], FactoryKit.EP40)).toBeNull()
    expect(LibraryRules.toPrune(backups, 1).map((b) => b.id)).toEqual(['a'])
    expect(LibraryRules.toPrune(backups, 0).map((b) => b.id).sort()).toEqual(['a', 'b'])
    expect(new Map(LibraryRules.facts(riddim, '')).get('From')).toBe(LibraryRules.FACTORY_FROM)
  })

  it('lists the saved kits EP-133, EP-40, EP-1320, and plays the chosen one while saved, else the first', () => {
    const ep133 = rec('f', 1, FactoryKit.EP133.source)
    const medieval = rec('m', 2, FactoryKit.EP1320.source)
    const riddim = rec('r', 3, FactoryKit.EP40.source)
    const own = rec('a', 10, 'device')
    expect(FactorySounds.savedKits([own])).toEqual([])
    expect(FactorySounds.savedKits([medieval, riddim, ep133, own])).toEqual([FactoryKit.EP133, FactoryKit.EP40, FactoryKit.EP1320])
    expect(FactorySounds.savedKits([medieval, riddim])).toEqual([FactoryKit.EP40, FactoryKit.EP1320])
    // Chosen and saved.
    expect(FactorySounds.activeKitOf(FactoryKit.EP1320, [ep133, riddim, medieval])).toBe(FactoryKit.EP1320)
    expect(FactorySounds.activeKitOf(FactoryKit.EP40, [ep133, riddim])).toBe(FactoryKit.EP40)
    // Chosen but not saved: the first saved, EP-133, EP-40, EP-1320 in that order.
    expect(FactorySounds.activeKitOf(FactoryKit.EP1320, [riddim, ep133])).toBe(FactoryKit.EP133)
    expect(FactorySounds.activeKitOf(FactoryKit.EP1320, [riddim])).toBe(FactoryKit.EP40)
    expect(FactorySounds.activeKitOf(FactoryKit.EP133, [medieval, riddim])).toBe(FactoryKit.EP40)
    expect(FactorySounds.activeKitOf(FactoryKit.EP40, [medieval])).toBe(FactoryKit.EP1320)
    // None saved: the EP-133's.
    expect(FactorySounds.activeKitOf(FactoryKit.EP40, [own])).toBe(FactoryKit.EP133)
  })

  it("words the EP-40's kit as the spec has it", () => {
    expect(FeatureText.FACTORY_TITLE_40).toBe('EP-40 Riddim factory sounds')
    expect(FeatureText.FACTORY_40).toBe('EP-40 Riddim')
    expect(FeatureText.FACTORY_40_NOTE).toBe(
      "The EP-40's factory sounds (471 sounds, about 69 MB), from teenage engineering's EP Sample Tool. Live plays them when you pick the EP-40 kit.",
    )
    expect(FeatureText.FACTORY_40_SAVED).toBe('In your backups. Live plays them when you pick the EP-40 kit.')
    expect(FeatureText.NOT_FACTORY_40).toBe("teenage engineering's file isn't an EP-40 factory pack.")
    expect(FeatureText.factory40Saved(471)).toBe('EP-40 factory sounds saved: 471 sounds. Live plays them until it has read your EP-40.')
    expect(FeatureText.factory40Saved(1)).toBe('EP-40 factory sounds saved: 1 sound. Live plays them until it has read your EP-40.')
    expect(MirrorText.kit(FactoryKit.EP40)).toBe('EP-40')
    expect(MirrorText.kit(FactoryKit.EP133)).toBe('EP-133')
    expect(MirrorText.kit(FactoryKit.EP1320)).toBe('EP-1320')
    expect(MirrorText.factoryNote(2, FactoryKit.EP40)).toBe(
      "Not connected: these are the EP-40's factory sounds, project 2 as it ships. Connect your EP-133 to see it live.",
    )
  })

  it("finds each kit's pack apart, and prunes neither", () => {
    const ep133 = rec('f', 1, FactoryKit.EP133.source)
    const medieval = rec('m', 2, FactoryKit.EP1320.source)
    const older = rec('m0', 0, FactoryKit.EP1320.source)
    const backups = [rec('a', 10, 'device'), ep133, older, medieval, rec('b', 20, 'import')]
    expect(FactorySounds.inLibrary(backups)).toBe(ep133)
    expect(FactorySounds.inLibrary(backups, FactoryKit.EP133)).toBe(ep133)
    // The newest of a kit, should there be two.
    expect(FactorySounds.inLibrary(backups, FactoryKit.EP1320)).toBe(medieval)
    expect(FactorySounds.inLibrary([ep133], FactoryKit.EP1320)).toBeNull()
    expect(FactorySounds.inLibrary([medieval], FactoryKit.EP133)).toBeNull()
    expect(LibraryRules.toPrune(backups, 1).map((b) => b.id)).toEqual(['a'])
    expect(new Map(LibraryRules.facts(medieval, '')).get('From')).toBe(LibraryRules.FACTORY_1320_FROM)
    expect(LibraryRules.FACTORY_1320_FROM).toBe('Your backup, used as EP-1320 factory sounds')
    expect(new Map(LibraryRules.facts(ep133, '')).get('From')).toBe(LibraryRules.FACTORY_FROM)
  })

  const medievalMeta = { pak_type: 'user', device_name: 'EP-1320', device_sku: 'TE032AS005' }

  it("takes an EP-1320's user or factory pack with sounds as its kit, and nothing else", () => {
    expect(FactorySounds.fitsKit(pak(medievalMeta, new Map()), FactoryKit.EP1320)).toBe(true)
    expect(FactorySounds.fitsKit(pak({ ...medievalMeta, pak_type: 'factory' }, new Map()), FactoryKit.EP1320)).toBe(true)
    // Its name alone says so too.
    expect(FactorySounds.fitsKit(pak({ pak_type: 'user', device_name: 'EP-1320 Medieval' }, new Map()), FactoryKit.EP1320)).toBe(true)
    // Its sku alone, too.
    expect(FactorySounds.fitsKit(pak({ device_sku: 'TE032AS005' }, new Map()), FactoryKit.EP1320)).toBe(true)
    // An EP-133's pack is not one, nor one without sounds.
    expect(FactorySounds.fitsKit(pak(factoryMeta, new Map()), FactoryKit.EP1320)).toBe(false)
    expect(FactorySounds.fitsKit(pak({ ...factoryMeta, device_sku: 'TE032AS001' }, new Map()), FactoryKit.EP1320)).toBe(false)
    expect(FactorySounds.fitsKit({ ...pak(medievalMeta, new Map()), sounds: new Map() }, FactoryKit.EP1320)).toBe(false)
    // The EP-133's kit is the download's check.
    expect(FactorySounds.fitsKit(pak(factoryMeta, new Map()), FactoryKit.EP133)).toBe(true)
    expect(FactorySounds.fitsKit(pak(medievalMeta, new Map()), FactoryKit.EP133)).toBe(false)
    // Imported, only an EP-1320 factory pack is saved as the kit straight away.
    expect(FactorySounds.importKit(pak({ ...medievalMeta, pak_type: 'factory' }, new Map()))).toBe(FactoryKit.EP1320)
    expect(FactorySounds.importKit(pak(medievalMeta, new Map()))).toBeNull()
    expect(FactorySounds.importKit(pak(factoryMeta, new Map()))).toBeNull()
  })

  it('offers an EP-1320 backup, not a factory pack, as the factory sounds', () => {
    const own = (source: string, product: string, sku: string): BackupRecord => ({ ...rec('x', 1, source), device: BackupDevice(product, sku, 'S1', '1.0.0') })
    expect(FactorySounds.canUseAsFactory(own('device', 'EP-1320', 'TE032AS005'))).toBe(true)
    expect(FactorySounds.canUseAsFactory(own('import', '', 'TE032AS005'))).toBe(true)
    expect(FactorySounds.canUseAsFactory(own('import', 'EP-1320 Medieval', ''))).toBe(true)
    expect(FactorySounds.canUseAsFactory(own('device', 'EP-133', 'TE032AS001'))).toBe(false)
    expect(FactorySounds.canUseAsFactory(own('import', '', ''))).toBe(false)
    expect(FactorySounds.canUseAsFactory(own(FactoryKit.EP1320.source, 'EP-1320', 'TE032AS005'))).toBe(false)
    expect(FactorySounds.canUseAsFactory(own(FactoryKit.EP133.source, 'EP-1320', 'TE032AS005'))).toBe(false)
  })

  it("words the EP-1320's kit as the spec has it", () => {
    expect(FeatureText.FACTORY_TITLE_1320).toBe('EP-1320 Medieval factory sounds')
    expect(FeatureText.FACTORY_1320).toBe('EP-1320 Medieval')
    expect(FeatureText.USE_AS_FACTORY).toBe('Use as factory sounds')
    expect(FeatureText.SAVING_FACTORY).toBe('Saving factory sounds')
    expect(FeatureText.FACTORY_KIT).toBe('Factory kit')
    expect(FeatureText.NOT_MEDIEVAL).toBe("This backup isn't from an EP-1320 Medieval, or it has no sounds.")
    expect(FeatureText.factorySaved(2)).toBe('Factory sounds saved: 2 sounds. Live plays them until it has read your EP-133.')
    expect(FeatureText.factory1320Saved(1)).toBe('EP-1320 factory sounds saved: 1 sound. Live plays them until it has read your EP-1320.')
  })
})
