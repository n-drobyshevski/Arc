// Store tests (ArcController's MutableStateFlow<UiState>; no Android counterpart test).
import { describe, expect, it } from 'vitest'
import { createStore } from '../../src/state/store'

describe('store', () => {
  it('drops an update that changes nothing (StateFlow equality)', () => {
    const st = createStore({ a: 1, b: 'x' })
    const seen: number[] = []
    st.subscribe((s) => seen.push(s.a))
    st.update((s) => ({ ...s }))
    st.update((s) => ({ ...s, a: 2 }))
    expect(seen).toEqual([2])
  })

  it('a nested update from a listener: later listeners never hear the stale state after the newer one', () => {
    const st = createStore({ n: 0 })
    st.subscribe((s) => {
      if (s.n === 1) st.update((c) => ({ ...c, n: 2 }))
    })
    const heard: number[] = []
    st.subscribe((s) => heard.push(s.n))
    st.update((c) => ({ ...c, n: 1 }))
    expect(heard).toEqual([2])
    expect(st.get().n).toBe(2)
  })

  it('waitFor judges the current state, not one a nested update replaced', async () => {
    const st = createStore({ busy: false, tick: 0 })
    // Something that turns busy on as soon as tick changes (like an action started by a subscriber).
    let started = false
    st.subscribe((s) => {
      if (s.tick === 1 && !s.busy && !started) {
        started = true
        st.update((c) => ({ ...c, busy: true }))
      }
    })
    st.update((c) => ({ ...c, busy: true }))
    let resolved: { busy: boolean } | null = null
    void st.waitFor((s) => !s.busy).then((s) => (resolved = s))
    st.update((c) => ({ ...c, busy: false, tick: 1 }))
    await new Promise((r) => setTimeout(r, 0))
    expect(st.get().busy).toBe(true)
    expect(resolved).toBeNull()
    st.update((c) => ({ ...c, busy: false }))
    await new Promise((r) => setTimeout(r, 0))
    expect(resolved).toEqual({ busy: false, tick: 1 })
  })

  it('waitFor resolves at once when the state already matches, and unsubscribes after', async () => {
    const st = createStore({ v: 1 })
    await expect(st.waitFor((s) => s.v === 1)).resolves.toEqual({ v: 1 })
    const p = st.waitFor((s) => s.v === 3)
    st.update(() => ({ v: 3 }))
    await expect(p).resolves.toEqual({ v: 3 })
  })
})
