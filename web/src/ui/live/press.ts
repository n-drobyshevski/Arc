// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/MirrorScreen.kt (holdToPlay)
//
// Sounds while held, as an instrument in gate mode does: press on touch-down,
// release when the finger lifts (or the gesture is taken over). Each pointer
// is its own press, so several pads or keys held together make a chord.
// In a scrolling page the press waits a moment (PRESS_DELAY_MS), and a drag
// that starts then is a scroll that plays nothing.
//
// Web delta: Compose's awaitEachGesture loop becomes a small state machine
// keyed by pointerId, fed from pointerdown / pointermove / pointerup /
// pointercancel / pointerleave (the browser's own scroll ends a pointer with
// pointercancel, Compose's "consumed by the scroll above"). Timers are
// injectable so the logic tests without a DOM. A screen reader's Play
// (Kotlin's semantics onClick) is a click with detail 0, handled by the
// screen, not here.

/** How long a press in a scrolling page waits to tell a tap from a scroll (as Compose's own press feedback does). */
export const PRESS_DELAY_MS = 64
/** How far a finger may move before the press is a drag (Compose's touch slop, 8dp). */
export const TOUCH_SLOP = 8

export interface PressTarget {
  /** The sound starts; hold is true here (a gate). */
  press: (hold: boolean) => void
  /** The finger lifted, left, or a scroll took it over. */
  release: () => void
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
  /** The pending press in a scrolling page, or null once pressed. */
  timer: unknown
  pressed: boolean
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

  /** A finger (or the mouse) went down on [target]. [inScroll]: the page scrolls, so wait before pressing. */
  down(id: number, x: number, y: number, target: PressTarget, inScroll: boolean): void {
    // A pointer id seen again without its end: finish the old press first.
    this.end(id)
    const p: Pointer = { target, x, y, timer: null, pressed: false }
    this.pointers.set(id, p)
    if (!inScroll) {
      p.pressed = true
      target.press(true)
      return
    }
    p.timer = this.timers.set(() => {
      p.timer = null
      if (this.pointers.get(id) !== p) return
      p.pressed = true
      target.press(true)
    }, this.delayMs)
  }

  /** The finger moved: before the delayed press, a move past the slop is a scroll that plays nothing. */
  move(id: number, x: number, y: number): void {
    const p = this.pointers.get(id)
    if (!p || p.pressed) return
    if (Math.hypot(x - p.x, y - p.y) > this.slop) this.drop(id)
  }

  /**
   * The finger lifted. Lifted before the delayed press, the press still
   * happens (a tap) and ends at once, as the Kotlin loop does.
   */
  up(id: number): void {
    const p = this.pointers.get(id)
    if (!p) return
    if (!p.pressed) {
      this.timers.clear(p.timer)
      p.timer = null
      p.pressed = true
      p.target.press(true)
    }
    this.end(id)
  }

  /** The browser took the pointer (a scroll) or it left the pad: whatever sounds stops; a pending press is dropped. */
  cancel(id: number): void {
    this.end(id)
  }

  /** Every finger ends (the screen goes away). */
  releaseAll(): void {
    for (const id of [...this.pointers.keys()]) this.end(id)
  }

  /** Whether the pointer is being tracked (pressed or waiting). */
  has(id: number): boolean {
    return this.pointers.has(id)
  }

  private drop(id: number): void {
    const p = this.pointers.get(id)
    if (!p) return
    this.timers.clear(p.timer)
    this.pointers.delete(id)
  }

  private end(id: number): void {
    const p = this.pointers.get(id)
    if (!p) return
    this.timers.clear(p.timer)
    this.pointers.delete(id)
    // Also when the pad leaves the screen with the finger still on it.
    if (p.pressed) p.target.release()
  }
}
