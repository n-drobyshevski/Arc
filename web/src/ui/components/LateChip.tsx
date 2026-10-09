// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/PatternLine.kt (LateChip, LineChip)
//
// Live's sound plays late: a Bluetooth glyph and a clock in amber (--warn) on
// the frame of a display line's chip, for as long as it does. Not a button:
// a long press names it as a small tooltip below (the title does for a mouse),
// and a screen reader reads [text] as its description. The chip's frame is
// LineChip's: 8 radius, a 1px line in the lit colour at 60%, 5/8 padding
// (7 sideways in [compact], the top bar), 6 between the glyphs, as tall as a
// touch target (40) and at least 32 wide.
//
// Web deltas: [text] is the output's own delay (MirrorText.slowOutput), as
// the web can't tell Bluetooth from any other slow output; Android's is
// MirrorText.WIRELESS_DELAY.
import type { JSX, TargetedPointerEvent } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { createLongPress, TOOLTIP_MS, tipAlign, type TipAlign } from './IconBlock'
import { Icon, ArcIcon } from './Icons'
import './LateChip.css'

/** The glyphs' edge (Kotlin LateGlyph, 16 dp). */
const GLYPH = 16
/** About how wide the tooltip gets (max-width in LateChip.css), for [tipAlign]. */
const TIP_WIDTH = 260
/** Movement (px) that turns a press into a scroll and cancels the long press (IconBlock's). */
const SLOP = 10

export interface LateChipProps {
  /** What it says: the tooltip, the title and what a screen reader reads. */
  text: string
  /** The line in the top bar: a little tighter. */
  compact?: boolean
}

export function LateChip(props: LateChipProps): JSX.Element {
  const { text, compact = false } = props
  const [tip, setTip] = useState<TipAlign | null>(null)
  const self = useRef<HTMLSpanElement | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const hide = useRef<number | null>(null)
  const press = useMemo(
    () => createLongPress(() => {
      const r = self.current?.getBoundingClientRect()
      setTip(r ? tipAlign(r.left, r.right, window.innerWidth, TIP_WIDTH) : 'center')
      if (hide.current !== null) window.clearTimeout(hide.current)
      hide.current = window.setTimeout(() => setTip(null), TOOLTIP_MS)
    }, { set: (fn, ms) => window.setTimeout(fn, ms), clear: (h) => window.clearTimeout(h) }),
    [],
  )
  useEffect(() => () => {
    press.dispose()
    if (hide.current !== null) window.clearTimeout(hide.current)
  }, [press])

  const down = (e: TargetedPointerEvent<HTMLSpanElement>): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    start.current = { x: e.clientX, y: e.clientY }
    press.down()
  }
  const move = (e: TargetedPointerEvent<HTMLSpanElement>): void => {
    const s = start.current
    if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > SLOP) {
      start.current = null
      press.cancel()
    }
  }
  const end = (): void => {
    start.current = null
    press.cancel()
  }
  return (
    <span
      ref={self}
      class="late-chip-wrap"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={end}
      onContextMenu={(e) => { if (start.current !== null || tip) e.preventDefault() }}
    >
      <span class={`late-chip${compact ? ' late-chip--compact' : ''}`} role="img" aria-label={text} title={text} data-late-chip="">
        <Icon icon={ArcIcon.BLUETOOTH} size={GLYPH} />
        <Icon icon={ArcIcon.CLOCK} size={GLYPH} />
      </span>
      {tip && (
        <span class={`late-chip__tip late-chip__tip--${tip}`} role="tooltip" aria-hidden="true">
          {text}
        </span>
      )}
    </span>
  )
}
