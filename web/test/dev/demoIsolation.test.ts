// ?demo never touches the real library or settings (boot/browserDeps demo option):
// its own IndexedDB database, settings in memory, its own channel and device lock.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBrowserDeps, DEMO_CHANNEL_NAME, DEMO_LOCK_NAME, pageStorage } from '../../src/boot/browserDeps'
import { createController } from '../../src/state/controller'
import { physicalPad } from '../../src/core/features/padNotes'
import { DB_NAME, DEMO_DB_NAME } from '../../src/platform/storage/db'
import { DEVICE_LOCK_NAME } from '../../src/platform/midi/owner'
import { Library } from '../../src/platform/storage/library'
import { SETTINGS_KEY, memoryStorage } from '../../src/platform/storage/settings'
import type { Deps } from '../../src/state/deps'
import { samplePak } from '../helpers/fixtures'

const made: Deps[] = []
afterEach(() => {
  for (const d of made.splice(0)) if (d.library instanceof Library) d.library.close()
  vi.unstubAllGlobals()
})

function fakeLocalStorage(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
  }
}

/** Every row of every store of database [name], by store (opened at whatever version it has). */
async function dump(name: string): Promise<Record<string, unknown[]>> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  const out: Record<string, unknown[]> = {}
  try {
    for (const store of [...db.objectStoreNames].sort()) {
      out[store] = await new Promise<unknown[]>((resolve, reject) => {
        const req = db.transaction(store, 'readonly').objectStore(store).getAll()
        req.onsuccess = () => resolve(req.result as unknown[])
        req.onerror = () => reject(req.error)
      })
    }
  } finally {
    db.close()
  }
  return out
}

/** A .pak an import accepts (the reference backup). */
function pakFile(name: string): File {
  return new File([samplePak().slice()], name)
}

describe('?demo isolation', () => {
  it('opens its own database and keeps settings in memory, leaving localStorage alone', async () => {
    const ls = fakeLocalStorage()
    vi.stubGlobal('localStorage', ls)
    const deps = await createBrowserDeps({ demo: true })
    made.push(deps)
    expect(deps.library).toBeInstanceOf(Library)
    expect((deps.library as Library).db.name).toBe(DEMO_DB_NAME)
    deps.settings.update((s) => ({ ...s, theme: 'DARK' }))
    deps.mirrorPrefs.setPadOrder('FROM_BOTTOM')
    await deps.lastRead.save('{"v":1}')
    expect(deps.settings.settings.theme).toBe('DARK')
    expect(ls.data.size).toBe(0)
    // Live's pad copies go to the demo database too.
    await deps.padSounds.write('s1.wav', new Uint8Array([1]))
    const real = await createBrowserDeps()
    made.push(real)
    expect((real.library as Library).db.name).toBe(DB_NAME)
    expect(real.settings.settings.theme).toBe('SYSTEM')
    expect(await real.padSounds.has('s1.wav')).toBe(false)
    expect(await deps.padSounds.has('s1.wav')).toBe(true)
  })

  it('the real page keeps using localStorage', async () => {
    const ls = fakeLocalStorage()
    vi.stubGlobal('localStorage', ls)
    const deps = await createBrowserDeps()
    made.push(deps)
    deps.settings.update((s) => ({ ...s, theme: 'LIGHT' }))
    expect(JSON.parse(ls.getItem(SETTINGS_KEY)!)).toEqual({ theme: 'LIGHT' })
  })

  it('takes the storage main.tsx read the theme from', async () => {
    const storage = memoryStorage({ [SETTINGS_KEY]: '{"theme":"DARK"}' })
    const deps = await createBrowserDeps({ demo: true, storage })
    made.push(deps)
    expect(deps.settings.settings.theme).toBe('DARK')
    // pageStorage: memory for the demo.
    const ls = fakeLocalStorage()
    vi.stubGlobal('localStorage', ls)
    pageStorage(true).setItem('x', '1')
    expect(ls.data.size).toBe(0)
  })

  it('holds its own device lock, so a real tab can still connect', async () => {
    const names: string[] = []
    vi.stubGlobal('navigator', {
      locks: {
        request: (name: string, _o: unknown, cb: (lock: unknown) => unknown) => {
          names.push(name)
          return Promise.resolve(cb({ name }))
        },
      },
    })
    const deps = await createBrowserDeps({ demo: true })
    made.push(deps)
    const release = await deps.lock.acquire()
    expect(release).not.toBeNull()
    release?.()
    expect(names).toEqual([DEMO_LOCK_NAME])
    expect(DEMO_LOCK_NAME).not.toBe(DEVICE_LOCK_NAME)
    expect(DEMO_CHANNEL_NAME).toBe('arc-demo')
  })

  it('a whole demo run (controller, settings, Live, an import) leaves the real database and localStorage as they were', async () => {
    const ls = fakeLocalStorage()
    vi.stubGlobal('localStorage', ls)
    // The real page, with a backup, settings, Live preferences and a pad-sound copy.
    const real = await createBrowserDeps()
    made.push(real)
    const rc = createController(real)
    await rc.start()
    await rc.importFiles([pakFile('real.pak')])
    rc.setTheme('LIGHT')
    rc.setKeysRoot(2)
    rc.setPadOrder('FROM_BOTTOM')
    await real.padSounds.write('s1.wav', new Uint8Array([1, 2]))
    rc.dispose()
    ;(real.library as Library).close()
    made.splice(made.indexOf(real), 1)
    const lsBefore = new Map(ls.data)
    const dbBefore = await dump(DB_NAME)
    expect(dbBefore['backups']).toHaveLength(1)
    expect(lsBefore.size).toBeGreaterThan(0)

    // ?demo, as main.tsx opens it.
    const storage = pageStorage(true)
    const deps = await createBrowserDeps({ demo: true, storage })
    made.push(deps)
    const c = createController(deps)
    // It starts from the defaults, not from the real page's choices.
    expect(c.settings.value.theme).toBe('SYSTEM')
    await c.start()
    expect(c.state.value.backups).toHaveLength(0)
    c.setTheme('DARK')
    c.setKeysRoot(5)
    c.setKeysOctave(6)
    c.setLiveKeys(true)
    c.setGuideSeen()
    c.setPadOrder('FROM_TOP')
    c.selectKeysPad(physicalPad(1, 3))
    await c.importFiles([pakFile('demo.pak')])
    await vi.waitFor(() => expect(c.state.value.backups).toHaveLength(1))
    await deps.lastRead.save('{"v":1,"savedAt":1,"project":null,"groups":{},"names":{}}')
    await c.clearPadSounds()
    expect(c.settings.value.theme).toBe('DARK')
    c.dispose()

    // Nothing real moved: not one localStorage key, not one row of the real database.
    expect(ls.data).toEqual(lsBefore)
    expect(await dump(DB_NAME)).toEqual(dbBefore)
    // The demo's own database has its import; its settings were in memory.
    expect((await dump(DEMO_DB_NAME))['backups']).toHaveLength(1)
    expect(storage.getItem(SETTINGS_KEY)).not.toBeNull()
  })
})
