// The library side of main's Live delta: IndexedDB v3 ("padSounds", PadSoundCache's folder),
// live.json in the library folder (Library.saveLive, Library.kt restoreFrom's Restored.live),
// and the library export carrying it.
import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { PadSoundCache } from '../../../src/core/features/padSoundCache'
import { readZip, writeZip } from '../../../src/core/formats/zip'
import { nullChannel } from '../../../src/platform/storage/channel'
import { DB_VERSION, STORE, openArcDb, request, transact } from '../../../src/platform/storage/db'
import { LIVE_FILE, MemoryTarget, isLive } from '../../../src/platform/storage/external'
import { Library } from '../../../src/platform/storage/library'
import { IdbPadSoundStore } from '../../../src/platform/storage/padSoundStore'

let n = 0
const fresh = (): string => `arc-live-store-${++n}-${Math.random().toString(36).slice(2)}`
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s)

function openLib(name = fresh()): Promise<Library> {
  let id = 0
  return Library.open({ dbOptions: { name }, channel: nullChannel(), storage: null, newId: () => `gen-${++id}` })
}

async function pak(names: Record<number, string>): Promise<Uint8Array> {
  const entries = [{ path: 'meta.json', data: utf8(JSON.stringify({ generated_at: '2026-01-02T03:04:05.000Z', device_name: 'EP-133' })), compress: false }]
  for (const [slot, name] of Object.entries(names)) entries.push({ path: `sounds/${slot} ${name}.wav`, data: new Uint8Array([1, 2, 3]), compress: false })
  return writeZip(entries, { date: 0, offsetMin: 0 })
}

describe('IndexedDB arc v3', () => {
  it('upgrades a v2 library in place, adding padSounds and keeping its rows', async () => {
    const name = fresh()
    const v2 = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(name, 2)
      req.onupgradeneeded = () => {
        const db = req.result
        db.createObjectStore('backups', { keyPath: 'id' }).createIndex('createdAt', 'createdAt')
        db.createObjectStore('files', { keyPath: 'id' })
        db.createObjectStore('names', { keyPath: ['backupId', 'slot'] }).createIndex('backupId', 'backupId')
        db.createObjectStore('indexed', { keyPath: 'backupId' })
        db.createObjectStore('kv', { keyPath: 'key' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    await new Promise<void>((resolve, reject) => {
      const t = v2.transaction(['kv', 'names'], 'readwrite')
      t.objectStore('kv').put({ key: 'folderPicked', value: true })
      t.objectStore('names').put({ backupId: 'b', slot: 1, name: 'kick' })
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error)
    })
    v2.close()

    const db = await openArcDb({ name })
    expect(db.version).toBe(DB_VERSION)
    expect(DB_VERSION).toBe(3)
    expect([...db.objectStoreNames].sort()).toEqual(['backups', 'files', 'indexed', 'kv', 'names', 'padSounds'])
    expect(await transact(db, STORE.kv, 'readonly', (t) => request(t.objectStore(STORE.kv).get('folderPicked')))).toEqual({ key: 'folderPicked', value: true })
    expect(await transact(db, STORE.names, 'readonly', (t) => request(t.objectStore(STORE.names).count()))).toBe(1)
    db.close()
  })
})

describe('IdbPadSoundStore', () => {
  it('is a folder for PadSoundCache: put, fresh, get, bytes, clear', async () => {
    const db = await openArcDb({ name: fresh() })
    const store = new IdbPadSoundStore(db)
    expect(await store.read('x')).toBeNull()
    expect(await store.has('x')).toBe(false)
    expect(await store.size('x')).toBe(0)
    // A view into a bigger buffer is stored as just its bytes.
    const big = new Uint8Array([9, 9, 1, 2, 3, 9])
    await store.write('x', big.subarray(2, 5))
    expect(await store.read('x')).toEqual(new Uint8Array([1, 2, 3]))
    expect(await store.size('x')).toBe(3)
    expect(await store.list()).toEqual(['x'])
    await store.remove('x')
    expect(await store.has('x')).toBe(false)

    let t = 1000
    const cache = new PadSoundCache(store, 256 * 1024 * 1024, () => t++)
    await cache.put(5, 'kick', 4000, new Uint8Array(10))
    expect(await cache.fresh(5, 'KICK.wav', 4000)).toBe(true)
    expect(await cache.fresh(5, 'kick', 4001)).toBe(false)
    expect(await cache.get(5, 'kick')).toEqual(new Uint8Array(10))
    expect(await cache.bytes()).toBe(10)
    // A new cache on the same database reads the index back.
    const again = new PadSoundCache(new IdbPadSoundStore(db))
    expect(await again.fresh(5, 'kick', 4000)).toBe(true)
    await again.clear()
    expect(await store.list()).toEqual([])
    expect(await again.bytes()).toBe(0)
    db.close()
  })
})

describe('IdbPadSoundStore sizes', () => {
  it("a row's size is remembered, not read back with the whole sample each time", async () => {
    const db = await openArcDb({ name: fresh() })
    const store = new IdbPadSoundStore(db)
    await store.write('s1.wav', new Uint8Array(100))
    await store.write('s2.wav', new Uint8Array(50))
    const reads = vi.spyOn(store, 'read')
    expect(await store.size('s1.wav')).toBe(100)
    expect(await store.size('s2.wav')).toBe(50)
    expect(reads).not.toHaveBeenCalled()
    // A replaced row has its new size; a removed one has none.
    await store.write('s1.wav', new Uint8Array(7))
    expect(await store.size('s1.wav')).toBe(7)
    await store.remove('s2.wav')
    expect(await store.size('s2.wav')).toBe(0)
    // A row this page never saw (another tab, an earlier visit) is read once.
    const other = new IdbPadSoundStore(db)
    const otherReads = vi.spyOn(other, 'read')
    expect(await other.size('s1.wav')).toBe(7)
    expect(await other.size('s1.wav')).toBe(7)
    expect(otherReads).toHaveBeenCalledTimes(1)
    db.close()
  })
})

describe('live.json in the library folder', () => {
  it('names live.json and the copies an install may write next to it', () => {
    expect(LIVE_FILE).toBe('live.json')
    expect(isLive('live.json')).toBe(true)
    expect(isLive('live (1).json')).toBe(true)
    expect(isLive('library.json')).toBe(false)
    expect(isLive('live.txt')).toBe(false)
  })

  it('saveLive writes it to the folder, and nothing happens without one', async () => {
    const lib = await openLib()
    await lib.saveLive('{"v":1}')
    const folder = new MemoryTarget('arc')
    lib.setTarget(folder)
    await lib.saveLive('{"v":1,"savedAt":5}')
    expect(folder.text(LIVE_FILE)).toBe('{"v":1,"savedAt":5}')
    const errors: string[] = []
    lib.onExternalError = (m) => errors.push(m)
    folder.failWith = 'disk full'
    await lib.saveLive('{}')
    expect(errors).toEqual(['disk full'])
    lib.close()
  })

  it('restoreFrom brings back the newest live file, or null', async () => {
    const lib = await openLib()
    const folder = new MemoryTarget('arc', {
      'a.pak': await pak({ 1: 'kick' }),
      'live.json': { data: '{"old":true}', lastModified: 100 },
      'live (1).json': { data: '{"new":true}', lastModified: 200 },
    })
    const r = await lib.restoreFrom(folder)
    expect(r.count).toBe(1)
    expect(r.live).toBe('{"new":true}')
    expect(r.settings).toEqual({})
    lib.close()

    const other = await openLib()
    expect((await other.restoreFrom(new MemoryTarget('arc', { 'b.pak': await pak({ 2: 'snare' }) }))).live).toBeNull()
    other.close()
  })

  it('the library export carries live.json when there is a last read', async () => {
    const lib = await openLib()
    let zip = await readZip(await lib.exportZip())
    expect(zip.has(LIVE_FILE)).toBe(false)
    lib.live = async () => '{"v":1}'
    zip = await readZip(await lib.exportZip())
    expect(new TextDecoder().decode(zip.get(LIVE_FILE))).toBe('{"v":1}')
    lib.live = () => {
      throw new Error('broken')
    }
    zip = await readZip(await lib.exportZip())
    expect(zip.has(LIVE_FILE)).toBe(false)
    lib.close()
  })
})
