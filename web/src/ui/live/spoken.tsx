// Port of spoken() and SpokenLine in app/src/main/kotlin/dev/arc/ep133/ui/screens/MirrorScreen.kt
//
// A display line's words as its polite live region says them: at most once a
// second ([SPOKEN_MS]), so a run of notes or hits is read where it ends, not
// one by one. The first change after a quiet second is said at once; changes
// within the second collapse to the latest, said as the second ends.
//
// Web delta: Compose clears the line's own semantics and gives it the words
// as its description; here the line's words are aria-hidden where they are
// shown and [Spoken] is a visually hidden polite region beside them, so the
// line's keys (RECORD, PLAY, the chips) stay keys and no region holds another.
import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'

/** The least time between two things a line says, in ms. */
export const SPOKEN_MS = 1000

/** The clock and timers [SpokenThrottle] runs on (tests give their own). */
export interface SpokenClock {
  now(): number
  set(fn: () => void, ms: number): unknown
  clear(handle: unknown): void
}

const browserClock: SpokenClock = {
  now: () => performance.now(),
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}

/**
 * The throttle itself: [offer] each text the line shows; [say] hears the ones
 * to speak, at most one each [ms].
 */
export class SpokenThrottle {
  private saidAt = -Infinity
  private pending: unknown = null

  constructor(
    private readonly say: (text: string) => void,
    private readonly ms: number = SPOKEN_MS,
    private readonly clock: SpokenClock = browserClock,
  ) {}

  offer(text: string): void {
    this.cancel()
    const wait = this.saidAt + this.ms - this.clock.now()
    if (wait <= 0) {
      this.speak(text)
      return
    }
    this.pending = this.clock.set(() => {
      this.pending = null
      this.speak(text)
    }, wait)
  }

  /** A text offered and not yet said is dropped. */
  cancel(): void {
    if (this.pending !== null) this.clock.clear(this.pending)
    this.pending = null
  }

  private speak(text: string): void {
    this.saidAt = this.clock.now()
    this.say(text)
  }
}

/** [text] as a display line's live region says it (Kotlin spoken()): at most once each [ms]. */
export function useSpoken(text: string, ms: number = SPOKEN_MS): string {
  const [said, setSaid] = useState(text)
  const throttle = useRef<SpokenThrottle | null>(null)
  if (throttle.current === null) throttle.current = new SpokenThrottle(setSaid, ms)
  useEffect(() => {
    throttle.current!.offer(text)
  }, [text])
  useEffect(() => () => throttle.current!.cancel(), [])
  return said
}

/** A line's words for screen readers alone, said as [useSpoken] lets them (Kotlin SpokenLine's live region). */
export function Spoken(props: { text: string }): JSX.Element {
  const said = useSpoken(props.text)
  return (
    <span class="sr-only" aria-live="polite">
      {said}
    </span>
  )
}
