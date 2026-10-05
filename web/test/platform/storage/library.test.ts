// Port of app/src/test/... Library behaviour (Room DAO order, SearchDao, PakStore) onto IndexedDB
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { openPak } from '../../../src/core/backup/pak'
import { writeZip } from '../../../src/core/formats/zip'
import { BackupDevice, type BackupRecord } from '../../../src/core/text/libraryRules'
import { Strings } from '../../../src/core/text/strings'
import { memoryHub, nullChannel } from '../../../src/platform/storage/channel'
import { DB_VERSION, STORE, openArcDb, request, transact } from '../../../src/platform/storage/db'
import { Library, type LibraryChange } from '../../../src/platform/storage/library'
import { samplePak } from '../../helpers/fixtures'

let dbCount = 0
const freshName = (): string => `arc-test-lib-${++dbCount}-${Math.random().toString(36).slice(2)}`

async function openLib(name = freshName(), extra: Partial<Parameters<typeof Library.open>[0]> = {}): Promise<Library> {
  let n = 0
  return Library.open({ dbOptions: { name }, channel: nullChannel(), storage: null, newId: () => `gen-${++n}`, ...extra })
}

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s)

async function pak(names: Record<number, string>, generatedAt = '2026-01-02T03:04:05.000Z'): Promise<Uint8Array> {
  const entries = [{ path: 'meta.json', data: utf8(JSON.stringify({ generated_at: generatedAt, device_name: 'EP-133' })), compress: false }]
  for (const [slot, n] of Object.entries(names)) entries.push({ path: `sounds/${slot} ${n}.wav`, data: new Uint8Array([1, 2, 3]), compress: false })
  return writeZip(entries, { date: 0, offsetMin: 0 })
}

function record(id: string, createdAt: number, extra: Partial<BackupRecord> = {}): BackupRecord {
  return {
    id,
    title: `Backup ${id}`,
    notes: '',
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

async function count(lib: Library, store: (typeof STORE)[keyof typeof STORE]): Promise<number> {
  return transact(lib.db, store, 'readonly', (t) => request(t.objectStore(store).count()))
}

describe('IndexedDB arc v2', () => {
  it('upgrades a reference v1 database in place, keeping its rows and files', async () => {
    const name = freshName()
    // The reference's own v1 open (reference/src/library.js).
    const v1 = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(name, 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore('backups', { keyPath: 'id' })
        req.result.createObjectStore('files', { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const bytes = samplePak()
    await new Promise<void>((resolve, reject) => {
      const t = v1.transaction(['backups', 'files'], 'readwrite')
      t.objectStore('files').put({ id: 'old-1', blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }) })
      // An imported record as app.js wrote it: no device.serial, string projectSlots keys.
      t.objectStore('backups').put({
        id: 'old-1',
        title: 'From the old site',
        notes: '',
        createdAt: 1700000000000,
        source: 'import',
        fileName: 'old.pak',
        device: { product: 'EP-133', sku: 'TE032AS001', osVersion: '1.3.2' },
        soundCount: 2,
        projectCount: 1,
        projects: [1],
        slots: [1, 2],
        projectSlots: { '1': [1, 2] },
        size: bytes.length,
      })
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error)
    })
    v1.close()

    const lib = await openLib(name)
    expect(lib.db.version).toBe(DB_VERSION)
    expect([...lib.db.objectStoreNames].sort()).toEqual(['backups', 'files', 'indexed', 'kv', 'names'])
    const idx = await transact(lib.db, STORE.backups, 'readonly', (t) => [...t.objectStore(STORE.backups).indexNames])
    expect(idx).toEqual(['createdAt'])

    const [b] = await lib.list()
    expect(b).toMatchObject({ id: 'old-1', title: 'From the old site', fileName: 'old.pak', projectSlots: { 1: [1, 2] } })
    expect(b!.device).toEqual({ product: 'EP-133', sku: 'TE032AS001', serial: '', osVersion: '1.3.2' })
    expect(await lib.bytes('old-1')).toEqual(bytes)

    // Not indexed yet: indexMissing reads the names from the .pak.
    expect(await lib.names()).toEqual([])
    await lib.indexMissing()
    const expected = [...(await openPak(bytes)).sounds].map(([slot, s]) => ({ backupId: 'old-1', slot, name: s.name }))
    expect((await lib.names()).sort((x, y) => x.slot - y.slot)).toEqual(expected.sort((x, y) => x.slot - y.slot))
    expect(await count(lib, STORE.indexed)).toBe(1)
    lib.close()
  })

  it('creates every store on a fresh database', async () => {
    const db = await openArcDb({ name: freshName() })
    expect([...db.objectStoreNames].sort()).toEqual(['backups', 'files', 'indexed', 'kv', 'names'])
    db.close()
  })
})

describe('Library writes', () => {
  it('saves file, row, names and index mark together', async () => {
    const lib = await openLib()
    const bytes = await pak({ 1: 'kick', 2: 'snare' })
    const saved = await lib.save(record('', 1000), bytes, { 1: 'kick', 2: 'snare' })
    expect(saved.record.id).toBe('gen-1')
    expect(saved.record.size).toBe(bytes.length)
    expect(saved.copyError).toBeNull()
    expect(await lib.bytes('gen-1')).toEqual(bytes)
    expect(await lib.list()).toEqual([saved.record])
    expect((await lib.names()).map((n) => n.name).sort()).toEqual(['kick', 'snare'])
    expect(await count(lib, STORE.indexed)).toBe(1)

    // Saving again replaces the names.
    await lib.save(saved.record, bytes, { 3: 'hat' })
    expect(await lib.names()).toEqual([{ backupId: 'gen-1', slot: 3, name: 'hat' }])
    lib.close()
  })

  it('writes nothing when any part of a save fails', async () => {
    const lib = await openLib()
    // NaN is not a valid key: the names put throws inside the transaction.
    await expect(lib.save(record('x', 1), new Uint8Array([1]), { 1: 'ok', ['nope' as unknown as number]: 'bad' })).rejects.toThrow()
    expect(await lib.list()).toEqual([])
    expect(await count(lib, STORE.files)).toBe(0)
    expect(await count(lib, STORE.names)).toBe(0)
    expect(await count(lib, STORE.indexed)).toBe(0)
    lib.close()
  })

  it('updates title and notes, and ignores a missing backup', async () => {
    const lib = await openLib()
    await lib.save(record('a', 1), new Uint8Array([1]), {})
    await lib.update('a', 'New', 'Some notes')
    await lib.update('missing', 'x', 'y')
    expect(await lib.list()).toMatchObject([{ id: 'a', title: 'New', notes: 'Some notes' }])
    expect(await lib.get('missing')).toBeNull()
    lib.close()
  })

  it('deletes the row, file, names and mark', async () => {
    const lib = await openLib()
    await lib.save(record('a', 1), new Uint8Array([1]), { 1: 'kick' })
    await lib.save(record('b', 2), new Uint8Array([2]), { 1: 'kick' })
    expect(await lib.delete('a')).toBeNull()
    expect((await lib.list()).map((r) => r.id)).toEqual(['b'])
    expect((await lib.names()).map((n) => n.backupId)).toEqual(['b'])
    expect(await count(lib, STORE.indexed)).toBe(1)
    await expect(lib.bytes('a')).rejects.toThrow(Strings.FILE_MISSING)
    lib.close()
  })

  it('throws FILE_MISSING for a row without its file', async () => {
    const lib = await openLib()
    await expect(lib.bytes('nothing')).rejects.toThrow('The backup file is missing from this device')
    await expect(lib.blob('nothing')).rejects.toThrow(Strings.FILE_MISSING)
    lib.close()
  })
})

describe('Library order and pruning', () => {
  it('lists newest first, ties by id ascending (Room ORDER BY created_at DESC, id ASC)', async () => {
    const lib = await openLib()
    for (const [id, at] of [
      ['m', 5],
      ['b', 9],
      ['c', 5],
      ['a', 5],
      ['z', 1],
    ] as const) {
      await lib.save(record(id, at), new Uint8Array([1]), {})
    }
    expect((await lib.list()).map((r) => r.id)).toEqual(['b', 'a', 'c', 'm', 'z'])
    lib.close()
  })

  it('prunes with the other tie-break (id descending) and never the kept id', async () => {
    const lib = await openLib()
    for (const id of ['a', 'b', 'c']) await lib.save(record(id, 7), new Uint8Array([1]), {})
    // toPrune: c, b, a; keep 1 keeps c.
    expect(await lib.prune(1)).toBe(2)
    expect((await lib.list()).map((r) => r.id)).toEqual(['c'])

    for (const id of ['d', 'e']) await lib.save(record(id, 7), new Uint8Array([1]), {})
    // e, d, c: keep 1 would drop d and c, but c is spared.
    expect(await lib.prune(1, 'c')).toBe(1)
    expect((await lib.list()).map((r) => r.id)).toEqual(['c', 'e'])
    expect(await lib.prune(null)).toBe(0)
    lib.close()
  })
})

describe('Library maintenance', () => {
  it('sweeps files and drops names and marks whose backup is gone', async () => {
    const lib = await openLib()
    await lib.save(record('keep', 1), new Uint8Array([1]), { 1: 'kick' })
    await transact(lib.db, [STORE.files, STORE.names, STORE.indexed], 'readwrite', (t) => {
      t.objectStore(STORE.files).put({ id: 'ghost', blob: new Blob([new Uint8Array([9])]) })
      t.objectStore(STORE.names).put({ backupId: 'ghost', slot: 4, name: 'boo' })
      t.objectStore(STORE.indexed).put({ backupId: 'ghost' })
    })
    await lib.dropOrphans()
    expect(await lib.names()).toEqual([{ backupId: 'keep', slot: 1, name: 'kick' }])
    expect(await count(lib, STORE.indexed)).toBe(1)
    expect(await count(lib, STORE.files)).toBe(2)
    await lib.sweep()
    expect(await count(lib, STORE.files)).toBe(1)
    expect(await lib.bytes('keep')).toEqual(new Uint8Array([1]))
    lib.close()
  })

  it('indexes only unindexed backups, skipping damaged files (retried later)', async () => {
    const lib = await openLib()
    const good = await pak({ 5: 'clap', 6: 'tom' })
    // Rows written without names or marks, as v1 did.
    await transact(lib.db, [STORE.backups, STORE.files], 'readwrite', (t) => {
      t.objectStore(STORE.backups).put({ ...record('good', 2), projectSlots: {} })
      t.objectStore(STORE.files).put({ id: 'good', blob: new Blob([good as Uint8Array<ArrayBuffer>]) })
      t.objectStore(STORE.backups).put({ ...record('bad', 1), projectSlots: {} })
      t.objectStore(STORE.files).put({ id: 'bad', blob: new Blob([new Uint8Array([1, 2, 3])]) })
      t.objectStore(STORE.backups).put({ ...record('nofile', 0), projectSlots: {} })
    })
    // An already indexed backup (zero sounds) is left alone.
    await lib.save(record('empty', 3), await pak({ 1: 'x' }), {})
    const changes: LibraryChange[] = []
    lib.subscribe((c) => changes.push(c))
    await lib.indexMissing()
    expect(await lib.names()).toEqual([
      { backupId: 'good', slot: 5, name: 'clap' },
      { backupId: 'good', slot: 6, name: 'tom' },
    ])
    const marks = await transact(lib.db, STORE.indexed, 'readonly', (t) => request(t.objectStore(STORE.indexed).getAllKeys()))
    expect(marks.sort()).toEqual(['empty', 'good'])
    expect(changes).toEqual([{ remote: false }])
    lib.close()
  })

  it('searches the indexed names in library order', async () => {
    const lib = await openLib()
    await lib.save(record('old', 1), new Uint8Array([1]), { 2: 'Big Kick', 1: 'kick soft' })
    await lib.save(record('new', 2), new Uint8Array([1]), { 9: 'snare', 3: 'KICK' })
    const groups = await lib.search('kick')
    expect(groups.map((g) => [g.backup.id, g.hits])).toEqual([
      ['new', [{ slot: 3, name: 'KICK' }]],
      [
        'old',
        [
          { slot: 1, name: 'kick soft' },
          { slot: 2, name: 'Big Kick' },
        ],
      ],
    ])
    expect(await lib.search('   ')).toEqual([])
    lib.close()
  })

  it('reports free space and asks for persistence', async () => {
    let asked = 0
    const lib = await openLib(freshName(), {
      storage: {
        estimate: async () => ({ quota: 1000, usage: 250 }),
        persisted: async () => false,
        persist: async () => {
          asked++
          return true
        },
      },
    })
    expect(await lib.estimate()).toBe(750)
    expect(await lib.persist()).toBe(true)
    expect(asked).toBe(1)
    lib.close()
    const none = await openLib()
    expect(await none.estimate()).toBeNull()
    expect(await none.persist()).toBe(false)
    none.close()
  })
})

describe('Library observers', () => {
  it('tells listeners in this tab, and other tabs through the channel', async () => {
    const hub = memoryHub()
    const name = freshName()
    const a = await openLib(name, { channel: hub.channel() })
    const b = await openLib(name, { channel: hub.channel() })
    const seenA: LibraryChange[] = []
    const seenB: LibraryChange[] = []
    a.subscribe((c) => seenA.push(c))
    const off = b.subscribe((c) => seenB.push(c))
    await a.save(record('x', 1), new Uint8Array([1]), {})
    await Promise.resolve()
    expect(seenA).toEqual([{ remote: false }])
    expect(seenB).toEqual([{ remote: true }])
    expect((await b.list()).map((r) => r.id)).toEqual(['x'])
    off()
    await a.delete('x')
    await Promise.resolve()
    expect(seenB).toHaveLength(1)
    expect(seenA).toHaveLength(2)
    a.close()
    b.close()
  })
})
