// Web-specific edges of the storage layer (no Android counterpart): IndexedDB
// transactions and tab blocking, BroadcastChannel lifetime, localStorage
// refusal, the folder picker, and the remembered folder's permission.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BackupDevice, type BackupRecord } from '../../../src/core/text/libraryRules'
import { browserChannel, memoryHub, nullChannel, type ChannelMessage } from '../../../src/platform/storage/channel'
import { STORE, openArcDb, request, transact } from '../../../src/platform/storage/db'
import { FsaTarget, MemoryTarget, canPickFolder, pickFolder, type DirHandleLike } from '../../../src/platform/storage/external'
import { Library } from '../../../src/platform/storage/library'
import { SettingsStore, browserStorage, memoryStorage } from '../../../src/platform/storage/settings'

let n = 0
const fresh = (): string => `arc-test-plat-${++n}-${Math.random().toString(36).slice(2)}`

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function record(id: string, createdAt: number): BackupRecord {
  return {
    id,
    title: id,
    notes: '',
    createdAt,
    source: 'device',
    fileName: null,
    device: BackupDevice('EP-133', 'TE032AS001', 'S1', '1.3.2'),
    soundCount: 0,
    projectCount: 0,
    projects: [],
    slots: [],
    projectSlots: {},
    size: 0,
  }
}

describe('transact', () => {
  it('aborts everything when the body fails after a write', async () => {
    const db = await openArcDb({ name: fresh() })
    await expect(
      transact(db, STORE.kv, 'readwrite', async (t) => {
        t.objectStore(STORE.kv).put({ key: 'a', value: 1 })
        await request(t.objectStore(STORE.kv).get('a'))
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(await transact(db, STORE.kv, 'readonly', (t) => request(t.objectStore(STORE.kv).count()))).toBe(0)
    db.close()
  })

  it('rejects a write issued after awaiting something that is not IndexedDB (the transaction auto-committed)', async () => {
    const db = await openArcDb({ name: fresh() })
    await expect(
      transact(db, STORE.kv, 'readwrite', async (t) => {
        await new Promise((r) => setTimeout(r, 5))
        t.objectStore(STORE.kv).put({ key: 'late', value: 1 })
      }),
    ).rejects.toSatisfy((e: unknown) => ['TransactionInactiveError', 'InvalidStateError'].includes((e as Error).name))
    expect(await transact(db, STORE.kv, 'readonly', (t) => request(t.objectStore(STORE.kv).get('late')))).toBeUndefined()
    db.close()
  })

  it('rejects instead of throwing once the connection is closed', async () => {
    const db = await openArcDb({ name: fresh() })
    db.close()
    await expect(transact(db, STORE.kv, 'readonly', (t) => request(t.objectStore(STORE.kv).count()))).rejects.toBeTruthy()
  })
})

describe('openArcDb across tabs', () => {
  it('reports a tab that blocks the upgrade, then opens once it closes', async () => {
    const name = fresh()
    // The reference site's v1 connection, which never closes on versionchange.
    const v1 = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(name, 1)
      req.onupgradeneeded = () => req.result.createObjectStore('backups', { keyPath: 'id' })
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    let blocked = 0
    const opening = openArcDb({ name, onBlocked: () => blocked++ })
    await vi.waitFor(() => expect(blocked).toBe(1))
    v1.close()
    const db = await opening
    expect(db.version).toBe(2)
    db.close()
  })

  it('closes itself for a newer version and says so', async () => {
    const name = fresh()
    let told = 0
    const db = await openArcDb({ name, onVersionChange: () => told++ })
    const v3 = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(name, 3)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    expect(told).toBe(1)
    await expect(transact(db, STORE.kv, 'readonly', (t) => request(t.objectStore(STORE.kv).count()))).rejects.toBeTruthy()
    v3.close()
  })

  it('rejects where there is no IndexedDB', async () => {
    vi.stubGlobal('indexedDB', undefined)
    await expect(openArcDb({ name: fresh() })).rejects.toThrow('IndexedDB is not available in this browser')
  })
})

describe('browserChannel', () => {
  class FakeBC {
    static made: FakeBC[] = []
    onmessage: ((e: MessageEvent) => void) | null = null
    closed = false
    posted: unknown[] = []
    constructor(readonly name: string) {
      FakeBC.made.push(this)
    }
    postMessage(m: unknown): void {
      if (this.closed) throw Object.assign(new Error('closed'), { name: 'InvalidStateError' })
      this.posted.push(m)
    }
    close(): void {
      this.closed = true
    }
  }

  it('delivers valid messages, ignores others, and never reopens after close', () => {
    FakeBC.made = []
    vi.stubGlobal('BroadcastChannel', FakeBC)
    const ch = browserChannel('arc-test')
    const seen: ChannelMessage[] = []
    const off = ch.subscribe((m) => seen.push(m))
    expect(FakeBC.made).toHaveLength(1)
    const bc = FakeBC.made[0]!
    bc.onmessage?.({ data: { type: 'library' } } as MessageEvent)
    bc.onmessage?.({ data: { type: 'nope' } } as MessageEvent)
    bc.onmessage?.({ data: null } as MessageEvent)
    expect(seen).toEqual([{ type: 'library' }])
    ch.post({ type: 'settings' })
    expect(bc.posted).toEqual([{ type: 'settings' }])
    off()
    bc.onmessage?.({ data: { type: 'library' } } as MessageEvent)
    expect(seen).toHaveLength(1)

    ch.close()
    expect(bc.closed).toBe(true)
    // A write finishing after Library.close posts: no new channel is left open.
    ch.post({ type: 'library' })
    ch.subscribe(() => {})
    expect(FakeBC.made).toHaveLength(1)
  })

  it('is a null channel where the browser has none', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const ch = browserChannel()
    expect(() => ch.post({ type: 'library' })).not.toThrow()
    ch.subscribe(() => {})()
    ch.close()
  })

  it('memory hub: a closed channel neither posts nor hears', async () => {
    const hub = memoryHub()
    const a = hub.channel()
    const b = hub.channel()
    const seen: ChannelMessage[] = []
    b.subscribe((m) => seen.push(m))
    a.close()
    a.post({ type: 'library' })
    await Promise.resolve()
    expect(seen).toEqual([])
  })

  it('a closed Library no longer hears other tabs', async () => {
    const hub = memoryHub()
    const name = fresh()
    const a = await Library.open({ dbOptions: { name }, channel: hub.channel(), storage: null })
    const b = await Library.open({ dbOptions: { name }, channel: hub.channel(), storage: null })
    let heard = 0
    b.subscribe(() => heard++)
    b.close()
    await a.save(record('x', 1), new Uint8Array([1]), {})
    await Promise.resolve()
    expect(heard).toBe(0)
    a.close()
  })
})

describe('browserStorage', () => {
  function fakeLocalStorage(refuse: (key: string) => boolean) {
    const data = new Map<string, string>()
    return {
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (refuse(k)) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' })
        data.set(k, v)
      },
      removeItem: (k: string) => void data.delete(k),
    }
  }

  it('reads back a value localStorage refused, for the session', () => {
    let full = false
    const ls = fakeLocalStorage((k) => full && k !== 'arc.probe')
    vi.stubGlobal('localStorage', ls)
    const s = browserStorage()
    s.setItem('arc.mirror.order', 'FROM_TOP')
    full = true
    s.setItem('arc.mirror.order', 'FROM_BOTTOM')
    expect(ls.data.get('arc.mirror.order')).toBe('FROM_TOP')
    expect(s.getItem('arc.mirror.order')).toBe('FROM_BOTTOM')
    full = false
    s.setItem('arc.mirror.order', 'FROM_TOP')
    expect(s.getItem('arc.mirror.order')).toBe('FROM_TOP')
    s.removeItem('arc.mirror.order')
    expect(s.getItem('arc.mirror.order')).toBeNull()
  })

  it('falls back to memory where localStorage throws on access', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('denied')
      },
      setItem() {
        throw new Error('denied')
      },
      removeItem() {
        throw new Error('denied')
      },
    })
    const s = browserStorage()
    s.setItem('arc.coachSeen', 'true')
    expect(s.getItem('arc.coachSeen')).toBe('true')
  })

  it('one failing settings listener does not stop the others', () => {
    const store = new SettingsStore(memoryStorage())
    const seen: boolean[] = []
    store.subscribe(() => {
      throw new Error('bad listener')
    })
    store.subscribe((s) => seen.push(s.autoConnect))
    expect(() => store.update((s) => ({ ...s, autoConnect: false }))).not.toThrow()
    expect(seen).toEqual([false])
  })
})

describe('folder picker', () => {
  it('calls showDirectoryPicker on the window, and a cancel is null', async () => {
    expect(canPickFolder()).toBe(false)
    expect(await pickFolder()).toBeNull()
    const handle = { kind: 'directory', name: 'arc' } as unknown as DirHandleLike
    let self: unknown = null
    let options: unknown = null
    vi.stubGlobal(
      'showDirectoryPicker',
      async function (this: unknown, o: unknown) {
        self = this
        options = o
        return handle
      },
    )
    expect(canPickFolder()).toBe(true)
    const t = await pickFolder()
    expect(t).toBeInstanceOf(FsaTarget)
    expect(t!.handle).toBe(handle)
    expect(self).toBe(globalThis)
    expect(options).toEqual({ id: 'arc', mode: 'readwrite', startIn: 'documents' })

    vi.stubGlobal('showDirectoryPicker', async () => {
      throw Object.assign(new Error('cancelled'), { name: 'AbortError' })
    })
    expect(await pickFolder()).toBeNull()
    vi.stubGlobal('showDirectoryPicker', async () => {
      throw Object.assign(new Error('system folder'), { name: 'SecurityError' })
    })
    await expect(pickFolder()).rejects.toThrow('system folder')
  })
})

describe('the remembered folder', () => {
  function dir(state: PermissionState): DirHandleLike & { asked: number } {
    const h = {
      kind: 'directory' as const,
      name: 'arc',
      asked: 0,
      state,
      getFileHandle: async () => {
        throw Object.assign(new Error('missing'), { name: 'NotFoundError' })
      },
      removeEntry: async () => {},
      async *entries() {},
      queryPermission: async () => h.state,
      requestPermission: async () => {
        h.asked++
        h.state = 'granted'
        return h.state
      },
    }
    return h
  }

  async function withHandle(handle: unknown): Promise<Library> {
    const lib = await Library.open({ dbOptions: { name: fresh() }, channel: nullChannel(), storage: null })
    // fake-indexeddb cannot structured-clone a handle with methods; Chromium can.
    const original = (lib as unknown as { kvGet(k: string): Promise<unknown> }).kvGet.bind(lib)
    vi.spyOn(lib as unknown as { kvGet(k: string): Promise<unknown> }, 'kvGet').mockImplementation(async (k: string) =>
      k === 'dirHandle' ? handle : original(k),
    )
    return lib
  }

  it('is used at once when permission still holds', async () => {
    const h = dir('granted')
    const lib = await withHandle(h)
    expect(await lib.loadFolder()).toBe('granted')
    expect(lib.target).toBeInstanceOf(FsaTarget)
    expect(h.asked).toBe(0)
    lib.close()
  })

  it('waits for a tap when the browser wants to ask again', async () => {
    const h = dir('prompt')
    const lib = await withHandle(h)
    expect(await lib.loadFolder()).toBe('prompt')
    expect(lib.target).toBeNull()
    // Nothing is copied meanwhile.
    expect((await lib.save(record('a', 1), new Uint8Array([1]), {})).copyError).toBeNull()
    expect(await lib.reconnectFolder()).toBe('granted')
    expect(h.asked).toBe(1)
    expect(lib.target).toBeInstanceOf(FsaTarget)
    lib.close()
  })

  it('stays unused when refused, and asking again does not prompt', async () => {
    const h = dir('denied')
    const lib = await withHandle(h)
    expect(await lib.loadFolder()).toBe('denied')
    expect(await lib.reconnectFolder()).toBe('denied')
    expect(h.asked).toBe(0)
    expect(lib.target).toBeNull()
    lib.close()
  })

  it('none without a remembered handle; a session target counts as granted', async () => {
    const lib = await withHandle(undefined)
    expect(await lib.loadFolder()).toBe('none')
    expect(await lib.reconnectFolder()).toBe('none')
    lib.setTarget(new MemoryTarget('arc'))
    expect(await lib.loadFolder()).toBe('granted')
    lib.close()
  })

  it('adopting a folder whose handle cannot be stored still uses it this session', async () => {
    const lib = await Library.open({ dbOptions: { name: fresh() }, channel: nullChannel(), storage: null })
    const t = new FsaTarget(dir('granted'))
    await lib.adoptFolder(t)
    expect(lib.target).toBe(t)
    expect(lib.folderPicked).toBe(true)
    lib.close()
  })
})
