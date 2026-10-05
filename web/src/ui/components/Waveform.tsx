// Port of the waveform Canvas in app/src/main/kotlin/dev/arc/ep133/ui/screens/TrimSheet.kt
//
// 160 columns of SampleTrim.peaks on a display-coloured box (96 high,
// radius 10). Each column is a bar 0.7 of the column wide, centred, scaled to
// half the height less 6px; bars whose centre frame is inside [start, end)
// are signal, the others displayDim at 50%. Drawn on a <canvas> at the device
// pixel ratio, redrawn on resize and theme change.
import type { JSX } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { peaks as samplePeaks, frames as sampleFrames, type Peak } from '../../core/features/sampleTrim'
import { resolvedTheme } from '../theme/theme'
import './Waveform.css'

/** TrimSheet.kt COLUMNS. */
export const WAVE_COLUMNS = 160
/** Space kept above and below the tallest bar (6dp). */
const WAVE_PAD = 6

export interface WaveBar {
  x: number
  y: number
  w: number
  h: number
  inside: boolean
}

/**
 * The bars of the waveform in a [width] x [height] box, as the Kotlin Canvas
 * block draws them: [n] is the sound's frame count, [start, end) the selection.
 */
export function waveformBars(peaks: readonly Peak[], n: number, start: number, end: number, width: number, height: number, pad = WAVE_PAD): WaveBar[] {
  const columns = peaks.length
  if (columns === 0) return []
  const colW = width / columns
  const mid = height / 2
  const half = height / 2 - pad
  const out: WaveBar[] = []
  for (let i = 0; i < columns; i++) {
    const p = peaks[i]!
    const frame = Math.trunc(((i + 0.5) * n) / columns)
    const top = mid - p.max * half
    const bottom = mid - p.min * half
    out.push({
      x: i * colW + colW * 0.15,
      y: top,
      w: colW * 0.7,
      h: Math.max(1, bottom - top),
      inside: frame >= start && frame < end,
    })
  }
  return out
}

export interface WaveformProps {
  /** Signed 16-bit little-endian interleaved PCM. */
  pcm: Uint8Array
  channels: number
  /** Selection start frame (inclusive). */
  start: number
  /** Selection end frame (exclusive). */
  end: number
  /** Spoken description (Modifier.describe), e.g. FeatureText.selection(startS, endS). */
  label: string
  /** Height in px (default 96). */
  height?: number
  columns?: number
  class?: string
}

function cssVar(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim()
  return v || fallback
}

export function Waveform(props: WaveformProps): JSX.Element {
  const { pcm, channels, start, end, label, height = 96, columns = WAVE_COLUMNS } = props
  const canvas = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)
  const theme = resolvedTheme.value
  const peaks = useMemo(() => samplePeaks(pcm, channels, columns), [pcm, channels, columns])
  const n = useMemo(() => sampleFrames(pcm, channels), [pcm, channels])

  // Track the box width.
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const measure = (): void => setWidth(el.getBoundingClientRect().width)
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx || width <= 0) return
    const dpr = window.devicePixelRatio || 1
    el.width = Math.round(width * dpr)
    el.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    const signal = cssVar(el, '--signal', '#FF4C00')
    const dim = cssVar(el, '--display-dim', '#8A8C83')
    for (const bar of waveformBars(peaks, n, start, end, width, height)) {
      ctx.globalAlpha = bar.inside ? 1 : 0.5
      ctx.fillStyle = bar.inside ? signal : dim
      ctx.fillRect(bar.x, bar.y, bar.w, bar.h)
    }
    ctx.globalAlpha = 1
  }, [peaks, n, start, end, width, height, theme])

  return (
    <canvas
      ref={canvas}
      class={`waveform${props.class ? ` ${props.class}` : ''}`}
      style={{ height: `${height}px` }}
      role="img"
      aria-label={label}
    />
  )
}
