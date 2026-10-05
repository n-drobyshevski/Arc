// Port of the Material3 RangeSlider used in app/src/main/kotlin/dev/arc/ep133/ui/screens/TrimSheet.kt
//
// Two thumbs on one track for a start and an end (frames in the trim sheet),
// coloured as TrimSheet sets SliderDefaults.colors: signal thumbs and active
// track, keyEdge inactive track. The look is Material 3's current slider: a 16px
// track with rounded ends, 4x44 bar thumbs with a 6px gap either side, and a
// stop dot at each end. The thumbs cannot cross.
//
// Keyboard: each thumb is a role="slider". Arrows move 1% of the range (at
// least one step), Page Up/Down 10%, Home/End to the thumb's limits.
// Pointer: a press on the track moves the nearer thumb there, then drags it.
import type { JSX, TargetedKeyboardEvent, TargetedPointerEvent } from 'preact'
import { useRef, useState } from 'preact/hooks'
import { FeatureText } from '../../core/text/featureText'
import './RangeSlider.css'

/** Half the thumb width: the thumbs' centres run from here to width - here. */
export const THUMB_INSET = 2

export type Thumb = 'start' | 'end'

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * The range the caller should store, as TrimSheet clamps it: start in
 * [min, max], end in [start, max]. A max below min is treated as min.
 */
export function clampRange(start: number, end: number, min: number, max: number): { start: number; end: number } {
  const hi = Math.max(min, max)
  const s = clamp(start, min, hi)
  return { start: s, end: clamp(end, s, hi) }
}

/** Snaps [v] to the step grid from [min] (roundToInt for step 1). */
export function snap(v: number, min: number, step: number): number {
  if (!(step > 0)) return v
  return min + Math.round((v - min) / step) * step
}

/** The value under a pointer at [x] px across a slider [width] px wide. */
export function valueAt(x: number, width: number, min: number, max: number, step = 1, inset = THUMB_INSET): number {
  const span = width - 2 * inset
  const f = span > 0 ? clamp((x - inset) / span, 0, 1) : 0
  return clamp(snap(min + f * (max - min), min, step), min, Math.max(min, max))
}

/** The thumb a press at [value] grabs: the nearer one; when they meet, by side. */
export function nearestThumb(value: number, start: number, end: number): Thumb {
  if (value <= start) return 'start'
  if (value >= end) return 'end'
  return value - start <= end - value ? 'start' : 'end'
}

/** Moves one thumb to [value], keeping it on its side of the other. */
export function moveThumb(thumb: Thumb, value: number, start: number, end: number, min: number, max: number): { start: number; end: number } {
  const hi = Math.max(min, max)
  if (thumb === 'start') return { start: clamp(value, min, end), end }
  return { start, end: clamp(value, start, hi) }
}

/** The arrow-key step: 1% of the range, at least one step, on the step grid. */
export function keyStep(min: number, max: number, step = 1): number {
  const s = step > 0 ? step : 1
  return Math.max(s, Math.round((max - min) / 100 / s) * s)
}

/** Where [key] moves a thumb at [value] within [lo, hi], or null when it is not a slider key. */
export function keyValue(key: string, value: number, lo: number, hi: number, min: number, max: number, step = 1): number | null {
  const k = keyStep(min, max, step)
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return clamp(value - k, lo, hi)
    case 'ArrowRight':
    case 'ArrowUp':
      return clamp(value + k, lo, hi)
    case 'PageDown':
      return clamp(value - 10 * k, lo, hi)
    case 'PageUp':
      return clamp(value + 10 * k, lo, hi)
    case 'Home':
      return lo
    case 'End':
      return hi
    default:
      return null
  }
}

export interface RangeSliderProps {
  start: number
  end: number
  min?: number
  max: number
  step?: number
  onChange: (start: number, end: number) => void
  /** Spoken names of the two thumbs (default FeatureText.START / END). */
  startLabel?: string
  endLabel?: string
  /** aria-valuetext for a value (e.g. seconds for frames). */
  valueText?: (value: number) => string
  disabled?: boolean
  class?: string
  id?: string
}

export function RangeSlider(props: RangeSliderProps): JSX.Element {
  const { min = 0, step = 1, onChange, disabled = false } = props
  const max = Math.max(min, props.max)
  const { start, end } = clampRange(props.start, props.end, min, max)
  const root = useRef<HTMLDivElement>(null)
  const thumbs = { start: useRef<HTMLDivElement>(null), end: useRef<HTMLDivElement>(null) }
  const [drag, setDrag] = useState<Thumb | null>(null)
  // The latest values while dragging (events can outrun re-renders).
  const live = useRef({ start, end })
  live.current = drag ? live.current : { start, end }

  const span = max - min
  const frac = (v: number): number => (span > 0 ? (v - min) / span : 0)

  const emit = (next: { start: number; end: number }): void => {
    if (next.start === live.current.start && next.end === live.current.end) return
    live.current = next
    onChange(next.start, next.end)
  }

  const pointerValue = (e: TargetedPointerEvent<HTMLDivElement>): number => {
    const r = e.currentTarget.getBoundingClientRect()
    return valueAt(e.clientX - r.left, r.width, min, max, step)
  }

  const onPointerDown = (e: TargetedPointerEvent<HTMLDivElement>): void => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return
    e.preventDefault()
    const v = pointerValue(e)
    const cur = live.current
    const thumb = nearestThumb(v, cur.start, cur.end)
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag(thumb)
    thumbs[thumb].current?.focus({ preventScroll: true })
    emit(moveThumb(thumb, v, cur.start, cur.end, min, max))
  }
  const onPointerMove = (e: TargetedPointerEvent<HTMLDivElement>): void => {
    if (!drag) return
    const cur = live.current
    emit(moveThumb(drag, pointerValue(e), cur.start, cur.end, min, max))
  }
  const endDrag = (e: TargetedPointerEvent<HTMLDivElement>): void => {
    if (!drag) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDrag(null)
  }

  const onKey = (thumb: Thumb) => (e: TargetedKeyboardEvent<HTMLDivElement>): void => {
    if (disabled) return
    const cur = live.current
    const value = thumb === 'start' ? cur.start : cur.end
    const lo = thumb === 'start' ? min : cur.start
    const hi = thumb === 'start' ? cur.end : max
    const rtl = root.current ? getComputedStyle(root.current).direction === 'rtl' : false
    const key = rtl && e.key === 'ArrowLeft' ? 'ArrowRight' : rtl && e.key === 'ArrowRight' ? 'ArrowLeft' : e.key
    const next = keyValue(key, value, lo, hi, min, max, step)
    if (next === null) return
    e.preventDefault()
    emit(moveThumb(thumb, next, cur.start, cur.end, min, max))
  }

  const thumb = (which: Thumb): JSX.Element => {
    const value = which === 'start' ? start : end
    return (
      <div
        ref={thumbs[which]}
        class={`range-slider__thumb${drag === which ? ' is-dragging' : ''}`}
        style={{ '--at': String(frac(value)) }}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={which === 'start' ? (props.startLabel ?? FeatureText.START) : (props.endLabel ?? FeatureText.END)}
        aria-valuemin={which === 'start' ? min : start}
        aria-valuemax={which === 'start' ? end : max}
        aria-valuenow={value}
        aria-valuetext={props.valueText?.(value)}
        aria-disabled={disabled || undefined}
        aria-orientation="horizontal"
        onKeyDown={onKey(which)}
      />
    )
  }

  return (
    <div
      ref={root}
      id={props.id}
      class={`range-slider${disabled ? ' is-disabled' : ''}${props.class ? ` ${props.class}` : ''}`}
      style={{ '--a': String(frac(start)), '--b': String(frac(end)) }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={() => setDrag(null)}
    >
      <div class="range-slider__track range-slider__track--before" aria-hidden="true" />
      <div class="range-slider__track range-slider__track--active" aria-hidden="true" />
      <div class="range-slider__track range-slider__track--after" aria-hidden="true" />
      <span class="range-slider__stop range-slider__stop--start" aria-hidden="true" />
      <span class="range-slider__stop range-slider__stop--end" aria-hidden="true" />
      {thumb('start')}
      {thumb('end')}
    </div>
  )
}
