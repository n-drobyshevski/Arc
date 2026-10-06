// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/MirrorScreen.kt (holdToPlay)
//
// Sounds while held, as an instrument in gate mode does: press on touch-down,
// release when the finger lifts (or the gesture is taken over). Each pointer
// is its own press, so several pads or keys held together make a chord.
// In a scrolling page the press still sounds at once; a drag past the touch
// slop within PRESS_DELAY_MS (or the page's scroll taking the pointer) turns
// it into a scroll, and the sound is cut ([PressTarget.cut]: a short fade,
// minimum gate or not) instead of released. Such a press is pressed
// "unsure", and only once the window closes without a scroll (or the finger
// lifts inside it) is it kept ([PressTarget.keep]).
//
// Web delta: Compose's awaitEachGesture loop becomes a small state machine
// keyed by pointerId, fed from pointerdown / pointermove / pointerup /
// pointercancel / pointerleave (the browser's own scroll ends a pointer with
// pointercancel, Compose's "consumed by the scroll above"). Timers are
// injectable so the logic tests without a DOM. A screen reader's Play
// (Kotlin's semantics onClick) is a click with detail 0, handled by the
// screen, not here. The haptic tick after a press is [ticking] (Kotlin
// performs it right after press() in the same gesture loop).

/** How long a press in a scrolling page can still turn into a scroll (as Compose's own press feedback waits). */
export const PRESS_DELAY_MS = 64
/** How far a finger may move before the press is a drag (Compose's touch slop, 8dp). */
export const TOUCH_SLOP = 8

export interface PressTarget {
  /**
   * The sound starts; hold is true here (a gate). [unsure]: pressed in a
   * scrolling page, so [keep] or [cut] follows.
   */
  press: (hold: boolean, unsure?: boolean) => void
  /** The unsure press was a press after all: the scroll window closed without a scroll, or the finger lifted inside it. */
  keep?: () => void
  /** The finger lifted, left, or a scroll took it over after the scroll window. */
  release: () => void
  /** The press turned into a scroll: the sound ends at once (default: [release]). */
  cut?: () => void
}

/**
 * [target] with a [tick] after each press when [on] (Settings → Haptic
 * feedback): the press is handed on first, so the sound never waits for the
 * tick. Nothing on the release, and a press cut by a scroll keeps its tick.
 */
export function ticking(target: PressTarget, on: boolean, tick: () => void): PressTarget {
  if (!on) return target
  return {
    ...target,
    press: (hold, unsure) => {
      target.press(hold, unsure)
      tick()
    },
  }
}

export interface PressTimers {
  set: (fn: () => void, ms: number) => unknown
  clear: (handle: unknown) => void
}

const browserTimers: PressTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}

interface Pointer {
  readonly target: PressTarget
  readonly x: number
  readonly y: number
  /** Pressed in a scrolling page: a scroll that takes it cuts the sound. */
  readonly inScroll: boolean
  /** The scroll window still open (a move past the slop cuts), or null once it closed. */
  timer: unknown
}

/**
 * The fingers on a screen's pads or keys, one entry per pointerId. Not tied to
 * one element: a finger that went down on a pad stays that pad's until it ends.
 */
export class PressTracker {
  private readonly pointers = new Map<number, Pointer>()

  constructor(
    private readonly timers: PressTimers = browserTimers,
    private readonly delayMs: number = PRESS_DELAY_MS,
    private readonly slop: number = TOUCH_SLOP,
  ) {}

  /**
   * A finger (or the mouse) went down on [target]: it sounds at once.
   * [inScroll]: the page scrolls, so for PRESS_DELAY_MS a drag is a scroll.
   */
  down(id: number, x: number, y: number, target: PressTarget, inScroll: boolean): void {
    // A pointer id seen again without its end: finish the old press first.
    this.end(id, false)
    const p: Pointer = { target, x, y, inScroll, timer: null }
    this.pointers.set(id, p)
    target.press(true, inScroll)
    if (inScroll) {
      p.timer = this.timers.set(() => {
        p.timer = null
        target.keep?.()
      }, this.delayMs)
    }
  }

  /** The finger moved: within the scroll window, a move past the slop is a scroll, and the sound is cut. */
  move(id: number, x: number, y: number): void {
    const p = this.pointers.get(id)
    if (!p || p.timer === null) return
    if (Math.hypot(x - p.x, y - p.y) > this.slop) this.end(id, true)
  }

  /** The finger lifted: the sound fades out. */
  up(id: number): void {
    this.end(id, false)
  }

  /**
   * The pointer ended without a lift: [scrolled] (pointercancel) the browser
   * took it for a scroll, which cuts a press in a scrolling page; otherwise
   * (it left the pad) the sound is released.
   */
  cancel(id: number, scrolled = false): void {
    const p = this.pointers.get(id)
    if (!p) return
    this.end(id, scrolled && p.inScroll)
  }

  /** Every finger ends (the screen goes away). */
  releaseAll(): void {
    for (const id of [...this.pointers.keys()]) this.end(id, false)
  }

  /** Whether the pointer is being tracked (pressed). */
  has(id: number): boolean {
    return this.pointers.has(id)
  }

  private end(id: number, cut: boolean): void {
    const p = this.pointers.get(id)
    if (!p) return
    const open = p.timer !== null
    if (open) this.timers.clear(p.timer)
    p.timer = null
    this.pointers.delete(id)
    // Also when the pad leaves the screen with the finger still on it.
    if (cut && p.target.cut) p.target.cut()
    else {
      // Lifted inside the scroll window: a tap, kept before it is let go of.
      if (open) p.target.keep?.()
      p.target.release()
    }
  }
}
