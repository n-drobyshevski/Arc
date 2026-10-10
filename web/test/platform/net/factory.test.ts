import { afterEach, describe, expect, it, vi } from 'vitest'
import { CancelledError } from '../../../src/core/protocol/errors'
import { FeatureText } from '../../../src/core/text/featureText'
import { browserFactory, proxied } from '../../../src/platform/net/factory'

/** A response streaming [chunks], saying [length] (or none), and stopping there. */
function streamed(chunks: Uint8Array[], length: number | null): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(ch)
      c.close()
    },
  })
  return new Response(body, { status: 200, headers: length === null ? {} : { 'content-length': String(length) } })
}

afterEach(() => vi.unstubAllGlobals())

describe('browserFactory', () => {
  const base = 'https://arc.example/index.html'

  it("reads teenage engineering's paths through arc's own /te/ prefix", async () => {
    expect(proxied('/apps/ep-sample-tool', base)).toBe('https://arc.example/te/apps/ep-sample-tool')
    expect(proxied('/apps/ep-sample-tool', 'https://arc.example/sub/')).toBe('https://arc.example/sub/te/apps/ep-sample-tool')
    const fetch = vi.fn(async () => new Response('<html>'))
    vi.stubGlobal('fetch', fetch)
    await expect(browserFactory(() => base).text('/apps/ep-sample-tool', new AbortController().signal)).resolves.toBe('<html>')
    expect(fetch).toHaveBeenCalledWith('https://arc.example/te/apps/ep-sample-tool', expect.objectContaining({ credentials: 'same-origin' }))
  })

  it('streams the pack with its progress against the length', async () => {
    vi.stubGlobal('fetch', async () => streamed([new Uint8Array([1, 2]), new Uint8Array([3])], 3))
    const seen: Array<[number, number | null]> = []
    const bytes = await browserFactory(() => base).bytes('/x.pak', new AbortController().signal, (d, t) => seen.push([d, t]))
    expect([...bytes]).toEqual([1, 2, 3])
    expect(seen).toEqual([[2, 3], [3, 3]])
  })

  it('a pack cut short is an error, not a smaller pack', async () => {
    vi.stubGlobal('fetch', async () => streamed([new Uint8Array(10)], 50))
    await expect(browserFactory(() => base).bytes('/x.pak', new AbortController().signal, () => {})).rejects.toThrow(
      'The download stopped at 10 of 50 bytes',
    )
  })

  it('a cancel ends as a cancel, and a server error as an error', async () => {
    const abort = new AbortController()
    vi.stubGlobal('fetch', async () => {
      abort.abort()
      return streamed([new Uint8Array(10)], 10)
    })
    await expect(browserFactory(() => base).bytes('/x.pak', abort.signal, () => {})).rejects.toBeInstanceOf(CancelledError)
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }))
    await expect(browserFactory(() => base).text('/x', new AbortController().signal)).rejects.toThrow('HTTP 404')
    // fetch's own words for a network failure are replaced.
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('NetworkError when attempting to fetch resource.')))
    await expect(browserFactory(() => base).text('/x', new AbortController().signal)).rejects.toThrow(FeatureText.FACTORY_UNREACHABLE)
  })
})
