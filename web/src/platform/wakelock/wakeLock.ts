// Port of app/src/main/kotlin/dev/arc/ep133/service/TransferService.kt (wake lock) and the keepScreenOn
// effect in app/src/main/kotlin/dev/arc/ep133/MainActivity.kt (+ reference/src/app.js:169-172,186)
//
// Keeping the device awake. Android holds a partial wake lock in a foreground
// service while a backup or restore runs, and sets keepScreenOn while a task
// runs or the Live tab is open. The web has only the Screen Wake Lock, which
// the browser drops whenever the tab is hidden, so it is asked for again when
// the tab comes back. Where there is no wake lock this does nothing.

/** MainActivity: the screen stays on during a task, and in Live when the setting says so. */
export function keepScreenOn(taskRunning: boolean, live: boolean, settingOn: boolean): boolean {
  return taskRunning || (live && settingOn)
}

/** The bits of a WakeLockSentinel used here. */
export interface WakeLockSentinelLike {
  readonly released: boolean
  release(): Promise<void>
  addEventListener(type: 'release', listener: () => void): void
}

export interface WakeLockEnv {
  /** navigator.wakeLock, when the browser has it. */
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } | undefined
  /** document, for visibilitychange. */
  document?:
    | {
        readonly visibilityState: string
        addEventListener(type: 'visibilitychange', listener: () => void): void
        removeEventListener(type: 'visibilitychange', listener: () => void): void
      }
    | undefined
}

export interface WakeLock {
  /** Whether the browser has a screen wake lock at all. */
  readonly supported: boolean
  /** Whether the lock is wanted (it may be dropped while the tab is hidden). */
  readonly wanted: boolean
  /** Whether the browser holds the lock right now. */
  readonly held: boolean
  /** Keeps the screen on until [release]; asks again whenever the tab is shown. Never throws. */
  acquire(): Promise<void>
  release(): Promise<void>
  /** acquire() or release(). */
  set(on: boolean): Promise<void>
  /** Releases the lock and stops listening for visibility changes. */
  dispose(): void
}

/** The browser's [WakeLockEnv]. */
export function browserWakeLockEnv(): WakeLockEnv {
  const nav = (typeof navigator === 'undefined' ? undefined : navigator) as
    | { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }
    | undefined
  const wl = nav?.wakeLock
  return {
    wakeLock: wl && typeof wl.request === 'function' ? { request: (t) => wl.request(t) } : undefined,
    document: typeof document === 'undefined' ? undefined : document,
  }
}

export function createWakeLock(env: WakeLockEnv = browserWakeLockEnv()): WakeLock {
  const api = env.wakeLock
  const doc = env.document
  let wanted = false
  let sentinel: WakeLockSentinelLike | null = null
  let pending: Promise<void> | null = null
  let disposed = false

  const visible = (): boolean => !doc || doc.visibilityState === 'visible'

  const request = (): Promise<void> => {
    if (!api || disposed || !wanted || pending || (sentinel && !sentinel.released) || !visible()) {
      return pending ?? Promise.resolve()
    }
    pending = (async () => {
      try {
        const s = await api.request('screen')
        if (!wanted || disposed) {
          // Released while the request was on its way.
          await s.release().catch(() => undefined)
          return
        }
        sentinel = s
        s.addEventListener('release', () => {
          if (sentinel === s) sentinel = null
        })
      } catch {
        // NotAllowedError (hidden tab, battery saver, policy): try again when shown.
      } finally {
        pending = null
      }
    })()
    return pending
  }

  const onVisibility = (): void => {
    if (visible()) void request()
  }
  if (api && doc) doc.addEventListener('visibilitychange', onVisibility)

  const release = async (): Promise<void> => {
    wanted = false
    const s = sentinel
    sentinel = null
    if (s && !s.released) await s.release().catch(() => undefined)
  }

  const acquire = (): Promise<void> => {
    wanted = true
    return request()
  }

  return {
    get supported() {
      return api !== undefined
    },
    get wanted() {
      return wanted
    },
    get held() {
      return sentinel !== null && !sentinel.released
    },
    acquire,
    release,
    set: (on: boolean) => (on ? acquire() : release()),
    dispose() {
      disposed = true
      if (api && doc) doc.removeEventListener('visibilitychange', onVisibility)
      void release()
    },
  }
}
