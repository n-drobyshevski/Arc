import { afterEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { createBrowserDeps } from '../../src/boot/browserDeps'
import { createController } from '../../src/state/controller'
import { Strings } from '../../src/core/text/strings'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createBrowserDeps', () => {
  it('without IndexedDB still resolves, with a library that says why it failed', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const deps = await createBrowserDeps()
    await expect(deps.library.list()).rejects.toThrow('IndexedDB is not available in this browser')
    const c = createController(deps)
    const toasts: string[] = []
    c.store.subscribe((s) => {
      if (s.toast) toasts.push(s.toast.text)
    })
    await c.start()
    expect(toasts).toContain(Strings.libraryFailed('IndexedDB is not available in this browser'))
    c.dispose()
  })

  it('opens the library database and passes the version-change callback through', async () => {
    const factory = new IDBFactory()
    vi.stubGlobal('indexedDB', factory)
    const onLibraryVersionChange = vi.fn()
    const deps = await createBrowserDeps({ onLibraryVersionChange })
    expect(await deps.library.list()).toEqual([])
    // A newer version opened elsewhere closes this connection and tells the page.
    await new Promise<void>((resolve, reject) => {
      const req = factory.open('arc', 999)
      req.onsuccess = () => {
        req.result.close()
        resolve()
      }
      req.onerror = () => reject(req.error)
    })
    expect(onLibraryVersionChange).toHaveBeenCalledTimes(1)
  })
})
