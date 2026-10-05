// Port of app/src/main/kotlin/dev/arc/ep133/data/Library.kt (its Room Flows, across tabs)
//
// On Android one process owns the library, and Room's Flows tell every
// observer about a write. On the web several tabs can hold the library open,
// so after each write the writing tab posts a note on BroadcastChannel('arc')
// and the others reload. Same-tab observers are told directly (library.ts).

export const CHANNEL_NAME = 'arc'

/** What changed in another tab. */
export type ChannelMessage = { type: 'library' } | { type: 'settings' }

export interface ArcChannel {
  post(message: ChannelMessage): void
  /** Messages from other tabs (never this channel's own posts). */
  subscribe(listener: (message: ChannelMessage) => void): () => void
  close(): void
}

const isMessage = (v: unknown): v is ChannelMessage =>
  typeof v === 'object' && v !== null && ((v as { type?: unknown }).type === 'library' || (v as { type?: unknown }).type === 'settings')

/** A channel that goes nowhere (no BroadcastChannel, or a single-tab test). */
export function nullChannel(): ArcChannel {
  return { post() {}, subscribe: () => () => {}, close() {} }
}

/** BroadcastChannel(name); a [nullChannel] where the browser has none. */
export function browserChannel(name: string = CHANNEL_NAME): ArcChannel {
  if (typeof BroadcastChannel === 'undefined') return nullChannel()
  let bc: BroadcastChannel | null = null
  // Once closed, posts and subscriptions do nothing (a late write after
  // Library.close must not open a new BroadcastChannel that nobody closes).
  let closed = false
  const listeners = new Set<(m: ChannelMessage) => void>()
  const open = (): BroadcastChannel => {
    if (!bc) {
      bc = new BroadcastChannel(name)
      bc.onmessage = (e: MessageEvent) => {
        if (!isMessage(e.data)) return
        for (const l of [...listeners]) l(e.data)
      }
    }
    return bc
  }
  return {
    post(message) {
      if (closed) return
      try {
        open().postMessage(message)
      } catch {
        // A closed channel: the other tabs simply don't hear about it.
      }
    },
    subscribe(listener) {
      if (closed) return () => {}
      open()
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    close() {
      closed = true
      listeners.clear()
      bc?.close()
      bc = null
    },
  }
}

/**
 * Channels joined in memory, for tests: a post on one reaches every other
 * channel made by the same hub, asynchronously like BroadcastChannel.
 */
export function memoryHub(): { channel(): ArcChannel } {
  const members = new Set<Set<(m: ChannelMessage) => void>>()
  return {
    channel(): ArcChannel {
      const listeners = new Set<(m: ChannelMessage) => void>()
      let closed = false
      members.add(listeners)
      return {
        post(message) {
          if (closed) return
          for (const other of members) {
            if (other === listeners) continue
            queueMicrotask(() => {
              for (const l of [...other]) l(message)
            })
          }
        },
        subscribe(listener) {
          if (closed) return () => {}
          listeners.add(listener)
          return () => void listeners.delete(listener)
        },
        close() {
          closed = true
          listeners.clear()
          members.delete(listeners)
        },
      }
    },
  }
}
