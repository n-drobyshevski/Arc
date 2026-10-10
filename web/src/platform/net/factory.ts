// teenage engineering's site for the factory sounds (no Android counterpart
// file: ArcController reads it with HttpURLConnection).
//
// Their server sends no CORS headers, so the browser can't read it from arc's
// origin directly. arc's host forwards /te/apps/ep-sample-tool/ there instead
// (vercel.json's rewrite; Vite's proxy in dev and preview), and the paths
// FactorySounds gives (on ORIGIN) are fetched under [PREFIX], relative to the
// page, so arc in a subfolder still works. Nothing else is forwarded.

import { CancelledError } from '../../core/protocol/errors'
import { FeatureText } from '../../core/text/featureText'
import type { FactoryDeps } from '../../state/deps'

/** Where arc's host forwards teenage engineering's EP Sample Tool. */
export const PREFIX = 'te'

/** The URL a path on teenage engineering's origin is read from: "./te/apps/…". */
export function proxied(path: string, base: string): string {
  return new URL(PREFIX + path, base).href
}

async function get(path: string, signal: AbortSignal, base: string): Promise<Response> {
  let res: Response
  try {
    // Same-origin credentials: a protected preview deployment lets the request through only with
    // its login cookie (without it, a redirect to vercel.com fails as a network error). arc's own
    // origin sets no cookies, so in production nothing is sent.
    res = await fetch(proxied(path, base), { signal, credentials: 'same-origin', cache: 'no-store' })
  } catch {
    if (signal.aborted) throw new CancelledError()
    // fetch says only "NetworkError…" / "Failed to fetch" (offline, DNS, a blocked redirect).
    throw new Error(FeatureText.FACTORY_UNREACHABLE)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res
}

/** The browser's FactoryDeps: fetch through arc's own origin, the pack streamed for its progress. */
export function browserFactory(base: () => string): FactoryDeps {
  return {
    async text(path, signal) {
      return (await get(path, signal, base())).text()
    },
    async bytes(path, signal, onProgress) {
      const res = await get(path, signal, base())
      // A compressed response's length isn't the length read.
      const length = res.headers.get('content-encoding') === null ? Number(res.headers.get('content-length')) : NaN
      const total = Number.isFinite(length) && length > 0 ? length : null
      const reader = res.body?.getReader()
      if (!reader) return new Uint8Array(await res.arrayBuffer())
      const chunks: Uint8Array[] = []
      let done = 0
      try {
        for (;;) {
          const r = await reader.read()
          if (r.done) break
          chunks.push(r.value)
          done += r.value.length
          onProgress(done, total)
        }
      } catch (e) {
        if (signal.aborted) throw new CancelledError()
        throw e
      }
      // A stream cut off reads as the end: a cancel, or a server that stopped short.
      if (signal.aborted) throw new CancelledError()
      if (total !== null && done !== total) throw new Error(`The download stopped at ${done} of ${total} bytes`)
      const out = new Uint8Array(done)
      let at = 0
      for (const c of chunks) {
        out.set(c, at)
        at += c.length
      }
      return out
    },
  }
}
