// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Components.kt (Meter, ProgressMeter)
//
// The 24-segment meter (renderMeter in app.js). With tipHot only the last lit
// segment is orange (progress); otherwise everything lit turns orange once the
// fraction reaches hotAbove (storage nearly full). Segments are 3px apart with
// radius 2; unlit ones are segmentOff, lit ones displayInk.
import type { JSX } from 'preact'
import './Meter.css'

export type SegmentState = 'off' | 'on' | 'hot'

/** Number of lit segments: f > 0 lights at least one; floor(f * n + .5) otherwise. */
export function litSegments(fraction: number, segments: number): number {
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0
  return f > 0 ? Math.max(1, Math.floor(f * segments + 0.5)) : 0
}

/** The colour of every segment, as the Kotlin `when`. */
export function meterSegments(fraction: number, segments = 24, hotAbove = 0.9, tipHot = false): SegmentState[] {
  const lit = litSegments(fraction, segments)
  const out: SegmentState[] = []
  for (let i = 0; i < segments; i++) {
    if (i >= lit) out.push('off')
    else if (tipHot) out.push(i === lit - 1 ? 'hot' : 'on')
    // Kotlin compares the raw (unclamped) fraction here.
    else out.push(fraction >= hotAbove ? 'hot' : 'on')
  }
  return out
}

export interface MeterProps {
  fraction: number
  segments?: number
  hotAbove?: number
  tipHot?: boolean
  /** Height in px (default 22). */
  height?: number
  class?: string
}

/** Decorative: the panel around it says what it measures. */
export function Meter(props: MeterProps): JSX.Element {
  const { fraction, segments = 24, hotAbove = 0.9, tipHot = false, height = 22 } = props
  const states = meterSegments(fraction, segments, hotAbove, tipHot)
  return (
    <div class={`meter${props.class ? ` ${props.class}` : ''}`} style={{ height: `${height}px` }} aria-hidden="true">
      {states.map((s, i) => <span key={i} class={`meter__seg meter__seg--${s}`} />)}
    </div>
  )
}

export interface ProgressMeterProps {
  fraction: number
  /** Accessible name of the progress bar (e.g. the task title). */
  label?: string
  class?: string
}

/** The progress meter: tip-hot segments in a small display-coloured box (44 high, padding 10, radius 12). */
export function ProgressMeter(props: ProgressMeterProps): JSX.Element {
  const f = Number.isFinite(props.fraction) ? Math.min(1, Math.max(0, props.fraction)) : 0
  return (
    <div
      class={`progress-meter${props.class ? ` ${props.class}` : ''}`}
      role="progressbar"
      aria-label={props.label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(f * 100)}
    >
      <Meter fraction={props.fraction} tipHot height={24} />
    </div>
  )
}
