// Port of app/src/main/kotlin/dev/arc/ep133/controller/ArcController.kt (runTask, cancelTask, exclusive: :310-408)
// and app/src/main/kotlin/dev/arc/ep133/service/TransferService.kt (+ reference/src/app.js:155-197)
//
// Long transfers (backup, restore, upload, compare) run through [Tasks.runTask]:
// busy, the progress sheet's TaskUi, an AbortController (Kotlin CancelSignal),
// and errors as toasts. Short device reads that must not overlap a transfer
// run through [Tasks.exclusive].
//
// Web deltas (TransferService has no web equivalent):
// - While a task runs, leaving the page asks first (beforeunload guard), the
//   document title carries the progress ("42% · Backing up · arc") in place of
//   the notification, and hiding the tab toasts WebText.KEEP_IN_FRONT
//   (background timers are throttled, so a transfer can stall).
// - The wake lock follows MainActivity's keepOn expression (task running, or
//   Live open with keepScreenOn); the controller drives it from the state, see
//   [keepScreenOn] in platform/wakelock.
// - Coroutine CancellationException has no equivalent; every error is caught.

import type { Progress } from '../core/backup/backup'
import { CancelledError } from '../core/protocol/errors'
import type { Session } from '../core/protocol/session'
import { Strings } from '../core/text/strings'
import { WebText } from '../core/text/webText'
import type { Deps } from './deps'
import type { Store } from './store'
import type { TaskUi, UiState } from './types'

export type OnProgress = (p: Progress) => void

/** `e.message ?: e.toString()`. */
export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message || e.toString()
  return String(e)
}

/** The user's cancel (CancelledError), however it was thrown. */
export function isCancelled(e: unknown): boolean {
  return e instanceof CancelledError || (e instanceof Error && e.name === 'CancelledError')
}

/** The document title while a task runs: "42% · Backing up · <base>". */
export function progressTitle(task: Pick<TaskUi, 'title' | 'fraction'>, base: string): string {
  const pct = Math.max(0, Math.min(100, Math.floor(task.fraction * 100)))
  return base.length !== 0 ? `${pct}% · ${task.title} · ${base}` : `${pct}% · ${task.title}`
}

export interface TaskHost {
  store: Store<UiState>
  deps: Pick<Deps, 'guardUnload' | 'visibility' | 'title'>
  toast(text: string, error?: boolean): void
  /** The open session, if any. */
  session(): Session | null
}

export class Tasks {
  /** The running task's cancel signal (ArcController.abortCurrent). */
  abortCurrent: AbortController | null = null

  constructor(private readonly host: TaskHost) {}

  /**
   * Runs a long transfer. Returns null without doing anything when something
   * else is busy (no toast), and null after an error (shown as a toast: the
   * cancel note for CancelledError, the error's message otherwise).
   */
  async runTask<T>(title: string, fn: (onProgress: OnProgress, signal: AbortSignal) => Promise<T>): Promise<T | null> {
    const { store } = this.host
    if (store.get().busy) return null
    store.update((s) => ({ ...s, busy: true, task: { title, label: '', fraction: 0, cancelling: false } }))
    const signal = new AbortController()
    this.abortCurrent = signal
    const guard = this.guard(title)
    const onProgress: OnProgress = (p) => {
      store.update((st) => {
        const t = st.task
        if (!t) return st
        return { ...st, task: { ...t, fraction: p.fraction, label: p.label.length !== 0 ? p.label : t.label } }
      })
      guard.progress()
    }
    try {
      return await fn(onProgress, signal.signal)
    } catch (e) {
      if (isCancelled(e)) this.host.toast(Strings.CANCELLED)
      else this.host.toast(errorText(e), true)
      return null
    } finally {
      if (this.abortCurrent === signal) this.abortCurrent = null
      guard.stop()
      store.update((s) => ({ ...s, busy: false, task: null }))
    }
  }

  /** Cancel stops between items, like the web version. */
  cancelTask(): void {
    const a = this.abortCurrent
    if (!a) return
    a.abort()
    this.host.store.update((st) => (st.task ? { ...st, task: { ...st.task, cancelling: true, label: Strings.STOPPING } } : st))
  }

  /**
   * Runs a short device read that must not overlap a transfer (the device
   * handles one conversation at a time). Returns null if there is no session
   * or something else is busy, and null after an error (toasted unless [quiet]).
   */
  async exclusive<T>(reading: string, quiet: boolean, block: (s: Session) => Promise<T>): Promise<T | null> {
    const { store } = this.host
    const s = this.host.session()
    if (!s) return null
    if (store.get().busy) return null
    store.update((st) => ({ ...st, busy: true, browser: { ...st.browser, reading } }))
    try {
      return await block(s)
    } catch (e) {
      if (!quiet) this.host.toast(errorText(e), true)
      return null
    } finally {
      store.update((st) => ({ ...st, busy: false, browser: { ...st.browser, reading: null } }))
    }
  }

  /** TransferService's web stand-ins for one task: unload guard, title progress, keep-in-front warning. */
  private guard(title: string): { progress(): void; stop(): void } {
    const { deps, store } = this.host
    const base = deps.title.get()
    const unguard = deps.guardUnload()
    const unwatch = deps.visibility.subscribe((visible) => {
      if (!visible && store.get().task) this.host.toast(WebText.KEEP_IN_FRONT)
    })
    let last = ''
    const show = (): void => {
      const t = store.get().task
      const next = progressTitle(t ?? { title, fraction: 0 }, base)
      if (next === last) return
      last = next
      deps.title.set(next)
    }
    show()
    return {
      progress: show,
      stop() {
        unguard()
        unwatch()
        deps.title.set(base)
      },
    }
  }
}
