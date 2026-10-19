// Web addition: what Live's memoized caps share (MirrorScreen's pads and KEYS
// keys, the piano's keys, the drawn device's parts): a component that renders
// again only when its props changed, a set member read on its own, and a set
// kept while its notes are.

import { h, type Component, type FunctionComponent, type JSX } from 'preact'
import { useMemo } from 'preact/hooks'
import { computed, type ReadonlySignal } from '@preact/signals'

/** Whether [key] is in [set], read so that only a change of that answer re-renders the caller. */
export function useHas(set: ReadonlySignal<ReadonlySet<number>>, key: number): boolean {
  return useMemo(() => computed(() => set.value.has(key)), [set, key]).value
}

/**
 * [render] as a component that renders again only when [same] says its props
 * changed (preact/compat's memo, without the rest of compat).
 */
export function memo<P extends object>(render: FunctionComponent<P>, same: (a: P, b: P) => boolean): FunctionComponent<P> {
  function shouldUpdate(this: Component<P>, next: P): boolean {
    return !same(this.props, next)
  }
  function Memoed(this: Component<P>, props: P): JSX.Element {
    this.shouldComponentUpdate = shouldUpdate
    return h(render, props)
  }
  return Memoed as FunctionComponent<P>
}

/** Whether every prop of [a] and [b] is the same value (props all values, or kept by the parent). */
export function sameProps<P extends object>(a: P, b: P): boolean {
  for (const k in b) if (a[k] !== b[k]) return false
  return true
}

/** Whether [a] and [b] hold the same notes in the same order (first pressed first). */
export function sameNotes(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false
  const it = b.values()
  for (const n of a) if (it.next().value !== n) return false
  return true
}
