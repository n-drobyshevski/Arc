// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/MirrorScreen.kt (glow, the group sums, KeysStrip geometry, display text)
//
// The pure parts of the Live screen, factored out so they can be tested:
// how lit a pad is, how lit a group is, whether a fade is still running, the
// two-octave keyboard's geometry and the display's main line.
//
// Web delta: times are milliseconds on the MIDI event clock (performance.now),
// where the Kotlin uses System.nanoTime; FADE_NS 300 ms is FADE_MS here.

import type { Hit, MirrorState, PadLight } from '../../core/features/liveMirror'
import { MirrorText } from '../../core/text/mirrorText'
import type { MirrorUi } from '../../state/types'

/** How long a released pad takes to fade out on screen (Kotlin FADE_NS = 300 ms). */
export const FADE_MS = 300

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** 0..1: how lit a pad is now. Velocity sets the brightness; release fades it out. */
export function glow(l: PadLight, now: number): number {
  const strength = 0.45 + 0.55 * (clamp(l.velocity, 1, 127) / 127)
  if (l.offAt === null) return strength
  const left = 1 - (now - l.offAt) / FADE_MS
  return clamp(strength * left, 0, 1)
}

/** The brightest of a group's pads now (0 when none is lit): its caption and key light with it. */
export function groupGlow(pads: ReadonlyMap<number, PadLight>, group: number, now: number): number {
  let max = 0
  let any = false
  for (const [key, l] of pads) {
    if (Math.trunc(key / 12) !== group) continue
    const g = glow(l, now)
    if (!any || g > max) max = g
    any = true
  }
  return max
}

/**
 * Whether a released pad is still fading at [now], so the frame loop has to run.
 * The Kotlin runs it while any pad has an offAt; past the fade the picture no
 * longer changes, so the web stops there.
 */
export function fading(pads: ReadonlyMap<number, PadLight>, now: number): boolean {
  for (const l of pads.values()) if (l.offAt !== null && glow(l, now) > 0) return true
  return false
}

/** A CSS number for a custom property (four decimals: enough for a colour, short in the DOM). */
export function glowCss(g: number): string {
  return String(Math.round(clamp(g, 0, 1) * 10000) / 10000)
}

// ---------- the KEYS strip ----------

const BLACK = new Set([1, 3, 6, 8, 10])

export interface KeyRect {
  note: number
  /** Left edge and width as fractions of the strip's width. */
  x: number
  w: number
  black: boolean
}

/** The first note of the two octaves (25 notes) around [last]. */
export function keysStart(last: number): number {
  return clamp(Math.trunc(last / 12) * 12 - 12, 0, 103)
}

/**
 * Two octaves around [last]: the white keys side by side (each 1/n wide, drawn
 * 1px in from both sides), then the black keys 0.6 of a white wide, centred on
 * the line between their white neighbours. Whites first, so blacks draw over.
 */
export function keysLayout(last: number): KeyRect[] {
  const start = keysStart(last)
  const whites: number[] = []
  for (let n = start; n < start + 25; n++) if (!BLACK.has(n % 12)) whites.push(n)
  const w = 1 / whites.length
  const rects: KeyRect[] = whites.map((n, i) => ({ note: n, x: i * w, w, black: false }))
  for (let n = start; n < start + 25; n++) {
    if (!BLACK.has(n % 12)) continue
    const leftWhites = whites.filter((x) => x < n).length
    rects.push({ note: n, x: leftWhites * w - w * 0.3, w: w * 0.6, black: true })
  }
  return rects
}

// ---------- the display ----------

/**
 * The display's main line: the error, "Reading…", the hit, offline the time
 * of the last read ("Last seen Oct 5, 2:02 PM"), or "Press a pad".
 */
export function displayLine(st: MirrorState, mirror: MirrorUi | null): string {
  const hit: Hit | null = st.lastHit
  if (mirror?.error != null) return mirror.error
  if (mirror?.loading === true && hit === null) return MirrorText.READING
  if (hit !== null) return MirrorText.hit(hit)
  if (mirror?.offline != null) return mirror.offline
  return MirrorText.WAITING
}

/** Whether the all-groups display shows Offline (and its folded note) in place of the transport. */
export function showOffline(st: MirrorState, mirror: MirrorUi | null): boolean {
  return mirror?.offline != null && st.playing === null
}

/** The offline line ("Last seen …") is longer than a hit: the display draws it a size down (22 for 26). */
export function displayLineSmall(st: MirrorState, mirror: MirrorUi | null): boolean {
  return mirror?.offline != null && st.lastHit === null
}

/** The all-groups display's transport word: "▶ Playing", "■ Stopped", or nothing before any clock. */
export function transportText(playing: boolean | null): string {
  if (playing === true) return '▶ ' + MirrorText.PLAYING
  if (playing === false) return '■ ' + MirrorText.STOPPED
  return ''
}

/** Whether the tools panel says that no pad pushes came (so samples can't be named). */
export function showNoPushes(st: MirrorState, mirror: MirrorUi | null): boolean {
  return !st.pushesSeen && st.learned.size === 0 && st.lastHit?.pad != null && mirror?.loading === false
}
