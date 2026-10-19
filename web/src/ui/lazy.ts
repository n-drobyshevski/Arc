// Web addition: a screen or sheet whose code is a chunk of its own, left out
// of the first load (preact/compat's lazy, without Suspense). It renders
// nothing until its chunk is in; [preload] fetches it ahead, which the app
// does once it is idle, so opening one normally finds it there. A failed
// fetch (offline before the service worker had it) is tried again when the
// browser is back online, or next time it is shown.

import { h, type FunctionComponent, type JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'

export interface Lazy<P> extends FunctionComponent<P> {
  /** Fetches the chunk (once); resolves when it is in. */
  preload(): Promise<void>
}

/** [name] names the wrapper, Lazy(name), for the ?demo render counter. */
export function lazy<P extends object>(name: string, load: () => Promise<FunctionComponent<P>>): Lazy<P> {
  let loaded: FunctionComponent<P> | null = null
  let loading: Promise<void> | null = null
  const preload = (): Promise<void> => {
    loading ??= load().then(
      (c) => {
        loaded = c
      },
      (e: unknown) => {
        loading = null
        throw e
      },
    )
    return loading
  }
  function Lazy(props: P): JSX.Element | null {
    const [, setIn] = useState(false)
    // What this render showed: the chunk can come in before the effect runs.
    const C = loaded
    useEffect(() => {
      if (C !== null) return
      let live = true
      const get = (): void => {
        preload().then(
          () => {
            if (live) setIn(true)
          },
          () => {
            if (live && typeof window !== 'undefined') window.addEventListener('online', get, { once: true })
          },
        )
      }
      get()
      return () => {
        live = false
        if (typeof window !== 'undefined') window.removeEventListener('online', get)
      }
    }, [])
    return C === null ? null : h(C, props)
  }
  Lazy.displayName = `Lazy(${name})`
  return Object.assign(Lazy, { preload })
}

/** Preloads [parts] once the page is idle (a timer where there is no requestIdleCallback); the returned function cancels it. */
export function preloadWhenIdle(parts: readonly Pick<Lazy<object>, 'preload'>[]): () => void {
  const run = (): void => {
    for (const p of parts) p.preload().catch(() => undefined)
  }
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(run, { timeout: 5000 })
    return () => cancelIdleCallback(id)
  }
  const id = setTimeout(run, 1000)
  return () => clearTimeout(id)
}
