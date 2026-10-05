// Port of the Library.kt folder behaviour (writeIndex, reconcile, restoreFrom, merge) against an in-memory folder
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { fileFor, parse, toJson, type IndexEntry } from '../../../src/core/backup/libraryIndex'
import { readZip, writeZip } from '../../../src/core/formats/zip'
import { FeatureText } from '../../../src/core/text/featureText'
import { BackupDevice, type BackupRecord } from '../../../src/core/text/libraryRules'
import { nullChannel } from '../../../src/platform/storage/channel'
import {
  FileListTarget,
  FsaTarget,
  MemoryTarget,
  isIndex,
  isLibraryFolder,
  type DirHandleLike,
  type FileHandleLike,
} from '../../../src/platform/storage/external'
import { Library } from '../../../src/platform/storage/library'

let dbCount = 0
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s)

async function openLib(target: MemoryTarget | null = null, name = `arc-test-ext-${++dbCount}-${Math.random()}`): Promise<Library> {
  let n = 0
  const lib = await Library.open({ dbOptions: { name }, channel: nullChannel(), storage: null, newId: () => `new-${++n}`, now: () => 1_750_000_000_000 })
  lib.setTarget(target)
  return lib
}

async function pak(names: Record<number, string>, generatedAt: string | null = '2026-01-02T03:04:05.000Z'): Promise<Uint8Array> {
  const meta = generatedAt ? { generated_at: generatedAt, device_name: 'EP-133', device_sku: 'TE032AS001', device_version: '1.3.2' } : {}
  const entries = [{ path: 'meta.json', data: utf8(JSON.stringify(meta)), compress: false }]
  for (const [slot, n] of Object.entries(names)) entries.push({ path: `sounds/${slot} ${n}.wav`, data: new Uint8Array([1, 2, 3]), compress: false })
  return writeZip(entries, { date: 0, offsetMin: 0 })
}

function record(id: string, createdAt: number, extra: Partial<BackupRecord> = {}): BackupRecord {
  return {
    id,
    title: `Backup ${id}`,
    notes: 'n',
    createdAt,
    source: 'device',
    fileName: null,
    device: BackupDevice('EP-133', 'TE032AS001', 'S1', '1.3.2'),
    soundCount: 1,
    projectCount: 0,
    projects: [],
    slots: [1],
    projectSlots: {},
    size: 0,
    ...extra,
  }
}

const entryOf = (r: BackupRecord, file = fileFor(r.id, r.createdAt)): IndexEntry => ({
  id: r.id,
  file,
  title: r.title,
  notes: r.notes,
  createdAt: r.createdAt,
  source: r.source,
  fileName: r.fileName,
  device: r.device,
})

describe('isLibraryFolder / isIndex', () => {
  it('follows the Android rules', () => {
    expect(isLibraryFolder('arc', [])).toBe(true)
    expect(isLibraryFolder('ARC', [])).toBe(true)
    expect(isLibraryFolder('Downloads', ['photo.jpg'])).toBe(false)
    expect(isLibraryFolder('Downloads', ['library (1).json'])).toBe(true)
    expect(isLibraryFolder('Downloads', ['old.PAK'])).toBe(true)
    expect(isLibraryFolder('Downloads', ['Library.json'])).toBe(false)
    expect(isIndex('library.json')).toBe(true)
    expect(isIndex('library (1).json')).toBe(true)
    expect(isIndex('my library.json')).toBe(false)
  })
})

describe('copies to the library folder', () => {
  it('writes the .pak under its fixed name and a byte-compatible library.json', async () => {
    const folder = new MemoryTarget('arc')
    const lib = await openLib(folder)
    lib.settings = () => ({ 'mirror.order': 'FROM_TOP', 'app.theme': 'DARK' })
    const bytes = await pak({ 1: 'kick' })
    const a = record('1a2b3c4d-5e6f', Date.UTC(2026, 9, 4, 23, 1, 12))
    const b = record('ffff0000-1111', Date.UTC(2026, 9, 5, 8, 0, 0), { source: 'import', fileName: 'x.pak' })
    expect((await lib.save(a, bytes, { 1: 'kick' })).copyError).toBeNull()
    await lib.save(b, bytes, {})
    expect(folder.files.get('arc-20261004-230112-1a2b3c4d.pak')!.data).toEqual(bytes)
    expect(folder.files.has('arc-20261005-080000-ffff0000.pak')).toBe(true)
    const saved = await lib.list()
    expect(folder.text('library.json')).toBe(
      toJson({ entries: saved.map((r) => entryOf(r)), settings: { 'mirror.order': 'FROM_TOP', 'app.theme': 'DARK' } }),
    )
    lib.close()
  })

  it('returns the copy error without failing the save', async () => {
    const folder = new MemoryTarget('arc')
    folder.failWith = 'Disk full'
    const lib = await openLib(folder)
    const saved = await lib.save(record('a', 1), new Uint8Array([1]), {})
    expect(saved.copyError).toBe('Disk full')
    expect((await lib.list()).map((r) => r.id)).toEqual(['a'])
    const errors: string[] = []
    lib.onExternalError = (m) => errors.push(m)
    await lib.syncIndex()
    expect(errors).toEqual(['Disk full'])
    lib.close()
  })

  it('copies nothing without a folder', async () => {
    const lib = await openLib(null)
    expect((await lib.save(record('a', 1), new Uint8Array([1]), {})).copyError).toBeNull()
    expect(lib.folderPicked).toBe(false)
    lib.close()
  })

  it('keeps index entries whose file is still in the folder, and settings from base under the app', async () => {
    const orphan = record('orphan', 5, { title: 'Unreadable one' })
    const gone = record('gone', 6, { title: 'File deleted' })
    const folder = new MemoryTarget('arc', {
      'library.json': toJson({ entries: [entryOf(orphan), entryOf(gone)], settings: { 'app.theme': 'LIGHT' } }),
      [fileFor('orphan', 5)]: new Uint8Array([0]),
    })
    const lib = await openLib(folder)
    await lib.save(record('mine', 9), new Uint8Array([1]), {})
    const ix = parse(folder.text('library.json')!)!
    expect(ix.entries.map((e) => e.id)).toEqual(['mine', 'orphan'])
    expect(ix.entries[1]!.title).toBe('Unreadable one')
    lib.close()
  })

  it('deletes the folder copy and rewrites the index', async () => {
    const folder = new MemoryTarget('arc')
    const lib = await openLib(folder)
    await lib.save(record('a', 1000), new Uint8Array([1]), {})
    await lib.save(record('b', 2000), new Uint8Array([2]), {})
    expect(await lib.delete('a')).toBeNull()
    expect(folder.files.has(fileFor('a', 1000))).toBe(false)
    expect(parse(folder.text('library.json')!)!.entries.map((e) => e.id)).toEqual(['b'])
    lib.close()
  })

  it('reconciles: copies missing files, then the index; an empty library writes nothing', async () => {
    const empty = new MemoryTarget('arc')
    const lib0 = await openLib(empty)
    await lib0.reconcile()
    expect(empty.files.size).toBe(0)
    lib0.close()

    const name = `arc-test-ext-rec-${Math.random()}`
    const lib = await openLib(null, name)
    await lib.save(record('a', 1000), new Uint8Array([1]), {})
    await lib.save(record('b', 2000), new Uint8Array([2]), {})
    const folder = new MemoryTarget('arc', { [fileFor('a', 1000)]: new Uint8Array([7]) })
    lib.setTarget(folder)
    await lib.reconcile()
    // Present files are left as they are.
    expect(folder.files.get(fileFor('a', 1000))!.data).toEqual(new Uint8Array([7]))
    expect(folder.files.get(fileFor('b', 2000))!.data).toEqual(new Uint8Array([2]))
    expect(parse(folder.text('library.json')!)!.entries.map((e) => e.id)).toEqual(['b', 'a'])
    lib.close()
  })
})

describe('restoreFrom', () => {
  it('reads every .pak with titles from the merged indexes (newest wins) and returns the settings', async () => {
    const known = record('aaaa1111-x', Date.UTC(2026, 0, 1), { title: 'Old title', notes: 'old' })
    const knownNewer = { ...known, title: 'Newer title', notes: 'newer' }
    const other = record('bbbb2222-y', Date.UTC(2026, 1, 1), { title: 'Second', source: 'import', fileName: 'orig.pak' })
    const bytesA = await pak({ 1: 'kick', 2: 'snare' })
    const bytesB = await pak({ 3: 'hat' })
    const bytesC = await pak({ 4: 'tom' }, '2025-05-05T00:00:00.000Z')
    const folder = new MemoryTarget('arc', {
      'library (1).json': {
        data: toJson({ entries: [entryOf(knownNewer)], settings: { 'app.theme': 'DARK', 'mirror.order': 'FROM_BOTTOM' } }),
        lastModified: 200,
      },
      'library.json': {
        data: toJson({ entries: [entryOf(known), entryOf(other)], settings: { 'app.theme': 'LIGHT', 'app.keepLast': '5' } }),
        lastModified: 100,
      },
      [fileFor(known.id, known.createdAt)]: bytesA,
      [fileFor(other.id, other.createdAt)]: bytesB,
      'My Drums.PAK': bytesC,
      'notes.txt': 'hello',
      'broken.pak': new Uint8Array([1, 2]),
    })
    const lib = await openLib(null)
    lib.settings = () => ({ 'app.theme': 'SYSTEM' })
    const { count, settings } = await lib.restoreFrom(folder)
    expect(count).toBe(3)
    expect(settings).toEqual({ 'app.theme': 'DARK', 'app.keepLast': '5', 'mirror.order': 'FROM_BOTTOM' })

    const list = await lib.list()
    expect(list.map((r) => [r.id, r.title, r.notes, r.source, r.fileName])).toEqual([
      ['bbbb2222-y', 'Second', 'n', 'import', 'orig.pak'],
      // entry?.fileName ?: name: an entry without one takes the file's name.
      ['aaaa1111-x', 'Newer title', 'newer', 'device', fileFor(known.id, known.createdAt)],
      ['new-1', 'My Drums', '', 'import', 'My Drums.PAK'],
    ])
    const drums = list[2]!
    expect(drums.createdAt).toBe(Date.parse('2025-05-05T00:00:00.000Z'))
    expect(drums.device).toEqual({ product: 'EP-133', sku: 'TE032AS001', serial: '', osVersion: '1.3.2' })
    expect(drums.slots).toEqual([4])
    expect(await lib.bytes('new-1')).toEqual(bytesC)
    expect((await lib.search('tom')).map((g) => g.backup.id)).toEqual(['new-1'])

    // Adopted, and the index rewritten with the restored settings under the app's.
    expect(lib.folderPicked).toBe(true)
    expect(lib.target).toBe(folder)
    const ix = parse(folder.text('library.json')!)!
    expect(ix.settings).toEqual({ 'app.theme': 'SYSTEM', 'app.keepLast': '5', 'mirror.order': 'FROM_BOTTOM' })
    // The odd name is remembered as the file's override.
    expect(ix.entries.find((e) => e.id === 'new-1')!.file).toBe('My Drums.PAK')
    expect(ix.entries.find((e) => e.id === 'aaaa1111-x')!.title).toBe('Newer title')

    // A second restore finds everything already there (by id, and by override name).
    expect((await lib.restoreFrom(folder)).count).toBe(0)
    // Deleting the restored one removes its odd-named file.
    await lib.delete('new-1')
    expect(folder.files.has('My Drums.PAK')).toBe(false)
    lib.close()
  })

  it('refuses a folder that is not the library, changing nothing', async () => {
    const lib = await openLib(null)
    const folder = new MemoryTarget('Downloads', { 'photo.jpg': new Uint8Array([1]) })
    await expect(lib.restoreFrom(folder)).rejects.toThrow(FeatureText.PICK_ARC_FOLDER)
    expect(lib.folderPicked).toBe(false)
    expect(lib.target).toBeNull()
    lib.close()
  })

  it('reads a webkitdirectory pick without adopting it', async () => {
    const bytes = await pak({ 1: 'kick' })
    const file = (path: string, data: Uint8Array) => ({
      name: path.split('/').pop()!,
      lastModified: 1,
      webkitRelativePath: path,
      arrayBuffer: async () => data.slice().buffer as ArrayBuffer,
    })
    const target = new FileListTarget([
      file('arc/old.pak', bytes),
      file('arc/sub/deep.pak', bytes),
      file('arc/library.json', utf8('{"backups":[]}')),
    ])
    expect(target.name).toBe('arc')
    expect((await target.list()).map((f) => f.name)).toEqual(['old.pak', 'library.json'])
    const lib = await openLib(null)
    expect((await lib.restoreFrom(target)).count).toBe(1)
    expect(lib.folderPicked).toBe(false)
    expect(lib.target).toBeNull()
    expect((await lib.list())[0]!.title).toBe('old')
    lib.close()
  })

  it('remembers the picked folder across a reopen', async () => {
    const name = `arc-test-ext-picked-${Math.random()}`
    const lib = await openLib(null, name)
    await lib.restoreFrom(new MemoryTarget('arc'))
    expect(lib.folderPicked).toBe(true)
    lib.close()
    const again = await openLib(null, name)
    expect(again.folderPicked).toBe(true)
    again.close()
  })
})

describe('exportZip', () => {
  it('zips every .pak under its folder name plus library.json', async () => {
    const lib = await openLib(null)
    const bytes = await pak({ 1: 'kick' })
    await lib.save(record('a', 1000), bytes, {})
    const files = await readZip(await lib.exportZip())
    expect([...files.keys()]).toEqual([fileFor('a', 1000), 'library.json'])
    expect(files.get(fileFor('a', 1000))).toEqual(bytes)
    expect(parse(new TextDecoder().decode(files.get('library.json')!))!.entries.map((e) => e.id)).toEqual(['a'])
    lib.close()
  })
})

describe('FsaTarget', () => {
  function fakeDir(name: string, permission: PermissionState = 'granted') {
    const files = new Map<string, Uint8Array>()
    let state = permission
    const notFound = () => Object.assign(new Error('missing'), { name: 'NotFoundError' })
    const fileHandle = (n: string): FileHandleLike => ({
      kind: 'file',
      name: n,
      getFile: async () => {
        const d = files.get(n)
        if (!d) throw notFound()
        return new File([d as Uint8Array<ArrayBuffer>], n, { lastModified: 42 })
      },
      createWritable: async () => {
        let buf: Uint8Array = new Uint8Array()
        return {
          write: async (d) => {
            buf = typeof d === 'string' ? utf8(d) : d instanceof Uint8Array ? d : new Uint8Array(await d.arrayBuffer())
          },
          close: async () => void files.set(n, buf),
          abort: async () => {},
        }
      },
    })
    const dir: DirHandleLike = {
      kind: 'directory',
      name,
      getFileHandle: async (n, o) => {
        if (!files.has(n) && !o?.create) throw notFound()
        return fileHandle(n)
      },
      removeEntry: async (n) => {
        if (!files.delete(n)) throw notFound()
      },
      async *entries() {
        for (const n of files.keys()) yield [n, fileHandle(n)] as [string, FileHandleLike]
      },
      queryPermission: async () => state,
      requestPermission: async () => (state = 'granted'),
    }
    return { dir, files }
  }

  it('reads, writes, lists and deletes through a directory handle', async () => {
    const { dir, files } = fakeDir('arc')
    const t = new FsaTarget(dir)
    await t.write('library.json', '{"a":1}')
    await t.write('x.pak', new Uint8Array([1, 2]))
    expect(new TextDecoder().decode(files.get('library.json'))).toBe('{"a":1}')
    expect(await t.read('x.pak')).toEqual(new Uint8Array([1, 2]))
    expect(await t.list()).toEqual([
      { name: 'library.json', lastModified: 42 },
      { name: 'x.pak', lastModified: 42 },
    ])
    expect(await t.exists('x.pak')).toBe(true)
    await t.delete('x.pak')
    await t.delete('x.pak')
    expect(await t.exists('x.pak')).toBe(false)
  })

  it('asks for permission only when told to', async () => {
    const { dir } = fakeDir('arc', 'prompt')
    const t = new FsaTarget(dir)
    expect(await t.permission()).toBe('prompt')
    expect(await t.permission(true)).toBe('granted')
    expect(await t.permission()).toBe('granted')
  })
})
