// Web only: Live's computer keyboard on a desktop (liveKeyboard has the
// rules, useAppKeys the one listener). MirrorScreen plugs it into the app
// layer's slot while Live is on screen; a key held plays until it comes up,
// the pad or key it pressed (not whatever shows by then), and a pad held by
// two keys (Numpad7 and 7) sounds until both are up.

import { useEffect, useMemo, useRef } from 'preact/hooks'
import { setKeyScope, type KeyScopeHandler } from '../appKeys'
import type { KeyInput } from '../keyGuard'
import { liveCommand, type LiveCommand, type LiveContext } from './liveKeyboard'

// How many presses hold each cap down: a reused button (a group change) may be two pads' at once.
const capHolds = new WeakMap<Element, number>()

/** [el] down for one more press (capDown on the first). */
export function holdCap(el: Element, down: (el: Element) => void): void {
  const n = capHolds.get(el) ?? 0
  capHolds.set(el, n + 1)
  if (n === 0) down(el)
}

/** One press fewer on [el] (capUp on the last). */
export function releaseCap(el: Element, up: (el: Element) => void): void {
  const n = (capHolds.get(el) ?? 1) - 1
  if (n > 0) capHolds.set(el, n)
  else {
    capHolds.delete(el)
    up(el)
  }
}

/** Something a key holds down: what it is (pads and keys counted once) and how to press and let go. */
export interface Held {
  readonly id: string
  down(at: number): void
  up(): void
}

/** What Live gives its keys, read fresh at each key. */
export interface LiveKeysHost {
  /** Live's root: out of reach (inert, under the guide or the menu) means no keys. */
  root(): HTMLElement | null
  context(): LiveContext
  /** The pad at [offset] in the target group, or null (pads don't play here). */
  pad(offset: number): Held | null
  /** The grid's key [offset], or null. */
  gridKey(offset: number): Held | null
  /** Carries out a command that holds nothing (group, EDIT, view, …). */
  run(cmd: LiveCommand): void
  /** Esc with no screen to close: true when it did something. */
  escape(): boolean
}

export function useLiveKeys(enabled: boolean, host: LiveKeysHost): void {
  const latest = useRef(host)
  latest.current = host
  // The key (code) to what it holds, and what each held pad or key's first press holds, with how many keys hold it.
  const held = useMemo(() => new Map<string, string>(), [])
  const counts = useMemo(() => new Map<string, { target: Held; n: number }>(), [])

  const handler = useMemo((): KeyScopeHandler => {
    const release = (code: string): void => {
      const id = held.get(code)
      if (id === undefined) return
      held.delete(code)
      const c = counts.get(id)
      if (!c) return
      c.n--
      if (c.n > 0) return
      counts.delete(id)
      // Let go by the press that pressed it.
      c.target.up()
    }
    const releaseAll = (): void => {
      for (const code of [...held.keys()]) release(code)
    }
    const outOfReach = (): boolean => latest.current.root()?.closest('[inert]') != null
    return {
      keydown(e: KeyboardEvent, input: KeyInput): boolean {
        if (outOfReach()) {
          releaseAll()
          return false
        }
        const h = latest.current
        const cmd = liveCommand(input, h.context())
        if (cmd === null) return false
        e.preventDefault()
        if (cmd.kind === 'pad' || cmd.kind === 'gridKey') {
          if (input.repeat || held.has(input.code)) return true
          const target = cmd.kind === 'pad' ? h.pad(cmd.offset) : h.gridKey(cmd.offset)
          if (target === null) return true
          held.set(input.code, target.id)
          const c = counts.get(target.id)
          if (c) c.n++
          else {
            counts.set(target.id, { target, n: 1 })
            target.down(e.timeStamp)
          }
          return true
        }
        // Toggles and steps act once a press, not again while the key repeats.
        if (input.repeat) return true
        // A change of mode or EDIT lets every held key go first.
        if (cmd.kind === 'mode' || cmd.kind === 'edit') releaseAll()
        h.run(cmd)
        return true
      },
      keyup(e: KeyboardEvent): void {
        release(e.code)
      },
      escape(): boolean {
        if (outOfReach()) return false
        return latest.current.escape()
      },
      releaseAll,
      context: () => latest.current.context(),
      takes: (target) => {
        const root = latest.current.root()
        return root !== null && target instanceof Node && root.contains(target) && !outOfReach()
      },
    }
  }, [held, counts])

  useEffect(() => {
    if (!enabled) return
    return setKeyScope(handler)
  }, [enabled, handler])
}
