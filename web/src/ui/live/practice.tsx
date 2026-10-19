// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/LivePractice.kt (LivePractice, PadCue, padCues) and
// MirrorScreen.kt's pad cues (padCuesNow, a pad's cue ring and its beats)
//
// PRACTICE on Live (an addition): play along with a pattern. Its panel
// (PracticePanel.tsx) takes the function keys' place; meanwhile Live's pads
// light ahead of each hit ([PadCue]): ringed with the beats to go, filled
// orange when it is time.
//
// Web deltas:
// - What Live needs at once is here: the context, the pads' cues and the
//   panel's slot. The panel itself is a chunk of its own (lazy.ts), fetched
//   once the app is idle.
// - The cues are a signal of the actions ([PracticeActions.cues]), written by
//   Live's frame loop ([usePracticeCueLoop]) only when a cue changes (at most
//   once a beat); each memoized pad reads its own ([usePracticePadCue]), so a
//   frame re-renders nothing and a beat only the pads whose cue changed.
// - A cue is kept by pad key (group * 12 + offset), so only the practised
//   group's pads light.

import { createContext, type JSX } from 'preact'
import { computed, effect, useComputed, type Signal } from '@preact/signals'
import { useContext, useEffect, useMemo } from 'preact/hooks'
import type { PhysicalPad } from '../../core/features/padNotes'
import { Seq } from '../../core/features/pattern'
import type { PracticeSpec } from '../../core/features/practice'
import type { PracticeFrame, PracticeUi } from '../../state/practicePlan'
import { lazy } from '../lazy'

/**
 * PRACTICE for Live's page (Kotlin LivePractice): [ui] as the controller has
 * it (null when no practice is on), [frame] for the lane and the pads at a
 * time (the counts as they are then), [running] while the transport plays.
 * ▶ ([onPlay]) starts it over from a bar counted in, ■ ([onStop]) stops it
 * with the counts kept, ✕ ([onClose]) ends it; the keys change its
 * PracticeSpec ([onChange]), ‹ and › a lesson's step ([onStep]), and COPY
 * puts how it went on the clipboard for Claude ([onCopy]).
 */
export interface PracticeActions {
  readonly ui: PracticeUi | null
  readonly running: boolean
  frame(now: number): PracticeFrame | null
  /** Each pad's cue now, by pad key: written by [usePracticeCueLoop], read by [usePracticePadCue]. */
  readonly cues: Signal<ReadonlyMap<number, PadCue>>
  onPlay(): void
  onStop(): void
  onClose(): void
  onChange(change: (spec: PracticeSpec) => PracticeSpec): void
  onStep(delta: number): void
  onCopy(): void
}

/** PRACTICE on Live; null where Live has no pattern (no output to play it on). */
export const PracticeContext = createContext<PracticeActions | null>(null)

export function usePractice(): PracticeActions | null {
  return useContext(PracticeContext)
}

/** A pad lit by practice: its next hit [beats] away (1..4), or [now], time to play it. */
export interface PadCue {
  readonly beats: number
  readonly now: boolean
}

/** The beats ahead a pad is ringed. */
const CUE_BEATS = 4

// The cues there are, made once, so a cue read again is the same object (web: a pad re-renders only when its cue changes).
const NOW: PadCue = { beats: 0, now: true }
const AHEAD: readonly PadCue[] = Array.from({ length: CUE_BEATS + 1 }, (_, b) => ({ beats: b, now: false }))

/** Each pad's cue in [frame] (by offset): ringed with the beats to go up to a bar ahead, filled from a 32nd before its hit. */
export function padCues(frame: PracticeFrame | null, waiting: ReadonlySet<number> | null): Map<number, PadCue> {
  const out = new Map<number, PadCue>()
  if (frame === null) return out
  if (waiting !== null) {
    for (const o of waiting) out.set(o, NOW)
    return out
  }
  for (const [t, d] of frame.upcoming) {
    if (out.has(t.offset)) continue
    const beats = Math.ceil(d / Seq.PPQN)
    if (d <= Seq.PPQN / 8.0) out.set(t.offset, NOW)
    else if (beats <= CUE_BEATS) out.set(t.offset, AHEAD[beats]!)
  }
  return out
}

function sameCues(a: ReadonlyMap<number, PadCue>, b: ReadonlyMap<number, PadCue>): boolean {
  if (a.size !== b.size) return false
  for (const [k, v] of a) if (b.get(k) !== v) return false
  return true
}

const NO_CUES: ReadonlyMap<number, PadCue> = new Map()

/**
 * Live's frame loop for the pads' cues (Kotlin's padCuesNow, worked out at
 * each frame the pads are drawn at): while the practice panel is [shown] on
 * the practised group's pads, each frame while it plays (once, stopped or in
 * WAIT, as its state changes), the cues go into [PracticeActions.cues] when
 * they changed.
 */
export function usePracticeCueLoop(practice: PracticeActions | null, shown: boolean): void {
  useEffect(() => {
    if (practice === null) return
    const put = (next: ReadonlyMap<number, PadCue>): void => {
      if (!sameCues(practice.cues.peek(), next)) practice.cues.value = next
    }
    if (!shown) {
      put(NO_CUES)
      return
    }
    const off = effect(() => {
      const ui = practice.ui
      const running = practice.running
      if (ui === null) {
        put(NO_CUES)
        return
      }
      const g = ui.spec.group
      const wait = ui.spec.wait ? ui.waiting : null
      const cues = (): ReadonlyMap<number, PadCue> => {
        const out = new Map<number, PadCue>()
        for (const [o, cue] of padCues(practice.frame(performance.now()), wait)) out.set(g * 12 + o, cue)
        return out
      }
      put(cues())
      if (!running || wait !== null || typeof requestAnimationFrame === 'undefined') return
      let raf = 0
      const frame = (): void => {
        put(cues())
        raf = requestAnimationFrame(frame)
      }
      raf = requestAnimationFrame(frame)
      return () => cancelAnimationFrame(raf)
    })
    return () => {
      off()
      put(NO_CUES)
    }
  }, [practice, shown])
}

/** [pad]'s practice cue now, or null; read so that only a change of its cue re-renders the pad. */
export function usePracticePadCue(pad: PhysicalPad): PadCue | null {
  const p = usePractice()
  const key = pad.group * 12 + pad.offset
  return useMemo(() => computed(() => p?.cues.value.get(key) ?? null), [p, key]).value
}

const Panel = lazy('PracticePanel', () => import('./PracticePanel').then((m) => m.PracticePanel))

/** Fetches the panel's chunk (the app does once it is idle). */
export const preloadPracticePanel = Panel.preload

/** The PRACTICE panel while a practice is on (its chunk once it is in), in the function keys' place. */
export function PracticeSlot(props: { class?: string }): JSX.Element | null {
  const p = usePractice()
  const on = useComputed(() => p?.ui != null).value
  return on ? <Panel class={props.class} /> : null
}
