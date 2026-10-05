// Tests for the reload guard in web/src/ui/components/UpdatePrompt.tsx (PWA; no
// Android counterpart). A reload, for an app update or another tab's newer
// library, must never happen while a transfer runs, and waits SETTLE_MS after
// one ends so the progress sheet's history step cannot cancel it.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ArcController } from '../../src/state/controller'
import { createStore } from '../../src/state/store'
import type { UiState } from '../../src/state/types'
import { isIdle, SETTLE_MS, whenIdle } from '../../src/ui/components/UpdatePrompt'

type Idle = Pick<UiState, 'task' | 'busy'>

function fakeController(initial: Idle): { c: ArcController; set(s: Idle): void } {
  const store = createStore<Idle>(initial)
  const c = { state: store.state, store } as unknown as ArcController
  return { c, set: (s) => store.update(() => s) }
}

const task = {} as NonNullable<UiState['task']>

afterEach(() => {
  vi.useRealTimers()
})

describe('isIdle', () => {
  it('is idle only with no task and nothing busy', () => {
    expect(isIdle({ task: null, busy: false } as UiState)).toBe(true)
    expect(isIdle({ task, busy: false } as UiState)).toBe(false)
    expect(isIdle({ task: null, busy: true } as UiState)).toBe(false)
  })
})

describe('whenIdle', () => {
  it('runs at once when idle', () => {
    const { c } = fakeController({ task: null, busy: false })
    const run = vi.fn()
    whenIdle(c, run)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('waits for the transfer to end, then for the UI to settle', () => {
    vi.useFakeTimers()
    const { c, set } = fakeController({ task, busy: false })
    const run = vi.fn()
    whenIdle(c, run)
    set({ task, busy: true })
    expect(run).not.toHaveBeenCalled()
    set({ task: null, busy: false })
    vi.advanceTimersByTime(SETTLE_MS - 1)
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('keeps waiting when a new transfer starts during the settle time', () => {
    vi.useFakeTimers()
    const { c, set } = fakeController({ task, busy: false })
    const run = vi.fn()
    whenIdle(c, run)
    set({ task: null, busy: false })
    set({ task, busy: false })
    vi.advanceTimersByTime(SETTLE_MS * 4)
    expect(run).not.toHaveBeenCalled()
    set({ task: null, busy: false })
    vi.advanceTimersByTime(SETTLE_MS)
    expect(run).toHaveBeenCalledTimes(1)
  })
})
