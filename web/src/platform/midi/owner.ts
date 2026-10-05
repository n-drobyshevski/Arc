// New for the web (no Android counterpart): one device owner across tabs.
//
// Android has one app process, so one MidiDevice owner. On the web every tab
// of the origin could open the EP-133 and interleave requests, so connect()
// holds a Web Lock named 'arc-device' for as long as its session lives. A tab
// that cannot get it shows OWNER_TEXT.OTHER_TAB instead of connecting.
// Browsers without navigator.locks (or where it throws) degrade to "acquired".

export const DEVICE_LOCK_NAME = 'arc-device'

export const OWNER_TEXT = {
  OTHER_TAB: 'arc is connected to the EP-133 in another tab or window. Disconnect it there, then connect again.',
} as const

/** The bits of `navigator.locks` (LockManager) used here. */
export interface LocksLike {
  request(name: string, options: { ifAvailable: boolean }, callback: (lock: unknown) => unknown): Promise<unknown>
}

/** Releases the lock; calling it again does nothing. */
export type ReleaseLock = () => void

function browserLocks(): LocksLike | undefined {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as unknown as { locks?: LocksLike }).locks
}

// Compile-time proof that the browser LockManager fits LocksLike.
const _locksFit: (l: LockManager) => LocksLike = (l) => l
void _locksFit

/**
 * Takes the device lock if no other tab holds it. Resolves a release function,
 * or null when another tab (or this one, before releasing) holds the lock.
 * Without Web Locks it resolves a no-op release function.
 */
export function acquireDeviceLock(locks: LocksLike | null | undefined = browserLocks()): Promise<ReleaseLock | null> {
  if (!locks || typeof locks.request !== 'function') return Promise.resolve(noop)
  return new Promise<ReleaseLock | null>((resolve) => {
    let releaseHeld: () => void = noop
    const held = new Promise<void>((r) => {
      releaseHeld = r
    })
    let released = false
    const release: ReleaseLock = () => {
      if (released) return
      released = true
      releaseHeld()
    }
    let request: Promise<unknown>
    try {
      request = locks.request(DEVICE_LOCK_NAME, { ifAvailable: true }, (lock) => {
        if (lock == null) {
          resolve(null)
          return undefined
        }
        resolve(release)
        // The lock is held until this promise settles.
        return held
      })
    } catch {
      resolve(noop)
      return
    }
    // A rejected request (SecurityError in an opaque origin, say) before the
    // callback ran: work without the lock rather than refuse to connect.
    request.catch(() => resolve(noop))
  })
}

function noop(): void {}
