// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Chrome.kt (SectionTag, TagShape)
//
// The tag naming the section: a mustard block with an arrow point on its right
// (the point is .38 of the height deep), like the pocket operator app's EDIT
// tag. A tap lists the sections; a long-press (500 ms) opens the debug screen.
// Screen readers hear "Live, Sections".
import type { JSX } from 'preact'
import { useEffect, useMemo, useRef } from 'preact/hooks'
import { NavText } from '../../core/text/navText'
import type { Tab } from '../../state/types'
import { tabLabel } from './Chrome'
import { createLongPress } from './IconBlock'
import './SectionTag.css'

export interface SectionTagProps {
  section: Tab
  /** Tap: open or close the section list. */
  onClick: () => void
  /** Long-press: the debug screen. */
  onLongPress: () => void
  /** Whether the section list is open (aria-expanded). */
  expanded?: boolean
  /** Id of the section list (aria-controls). */
  controls?: string
}

const timers = {
  set: (fn: () => void, ms: number): number => window.setTimeout(fn, ms),
  clear: (h: number): void => window.clearTimeout(h),
}

export function SectionTag(props: SectionTagProps): JSX.Element {
  const label = tabLabel(props.section)
  // The latest handler, without rebuilding the timer.
  const onLong = useRef(props.onLongPress)
  onLong.current = props.onLongPress
  const longPress = useMemo(() => createLongPress(() => onLong.current(), timers), [])
  useEffect(() => () => longPress.dispose(), [longPress])
  return (
    <button
      type="button"
      class="section-tag"
      data-coach="top.sections"
      aria-label={NavText.sectionTag(label)}
      aria-expanded={props.expanded ?? false}
      aria-controls={props.controls}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        longPress.down()
      }}
      onPointerUp={() => longPress.up()}
      onPointerCancel={() => longPress.cancel()}
      onPointerLeave={() => longPress.cancel()}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (longPress.consumeClick()) return
        props.onClick()
      }}
    >
      <span class="section-tag__face">
        <span class="section-tag__text">{label}</span>
      </span>
    </button>
  )
}
