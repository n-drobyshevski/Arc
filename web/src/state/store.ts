// Port of app/src/main/kotlin/dev/arc/ep133/controller/ArcController.kt (its MutableStateFlow<UiState>)
//
// One immutable UiState in a @preact/signals signal. [Store.update] is
// `_state.update { }`: the function gets the current state and returns the
// next one. Like StateFlow, an equal value is dropped (here: the same object,
// or one whose top-level fields are all identical), so nothing redraws.
// [Store.waitFor] replaces `_state.first { pred }`.

import { signal, type ReadonlySignal } from '@preact/signals'

export interface Store<T extends object> {
  /** The state, for components (reading `.value` subscribes). */
  readonly state: ReadonlySignal<T>
  /** The current state, without subscribing. */
  get(): T
  /** Replaces the state with fn(current) unless that is equal to it. */
  update(fn: (current: T) => T): void
  /** Calls [listener] after every change. Returns an unsubscribe function. */
  subscribe(listener: (state: T) => void): () => void
  /** Resolves with the first state (the current one included) that satisfies [pred]. */
  waitFor(pred: (state: T) => boolean): Promise<T>
}

/** True when both have the same keys and every value is identical (===). */
export function shallowEqual<T extends object>(a: T, b: T): boolean {
  if (a === b) return true
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (const k of ka) {
    if (!Object.hasOwn(b, k)) return false
    if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false
  }
  return true
}

export function createStore<T extends object>(initial: T): Store<T> {
  const s = signal<T>(initial)
  const listeners = new Set<(state: T) => void>()

  const notify = (state: T): void => {
    for (const l of [...listeners]) {
      // A listener's own update already told everyone about a newer state:
      // the rest must not hear this stale one after it.
      if (s.peek() !== state) return
      try {
        l(state)
      } catch (e) {
        // One listener's failure doesn't stop the others (or the update).
        console.error(e)
      }
    }
  }

  const store: Store<T> = {
    state: s,
    get: () => s.peek(),
    update(fn) {
      const prev = s.peek()
      const next = fn(prev)
      if (shallowEqual(prev, next)) return
      s.value = next
      notify(next)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    waitFor(pred) {
      const now = s.peek()
      if (pred(now)) return Promise.resolve(now)
      return new Promise<T>((resolve) => {
        const off = store.subscribe(() => {
          // The current state, not the notified one (which a nested update may have replaced).
          const st = s.peek()
          if (!pred(st)) return
          off()
          resolve(st)
        })
      })
    },
  }
  return store
}
