// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/QuickPick.kt (QuickPickFan)
//
// The open fan ([QuickPick.fan]) over the window: a scrim, the dead-zone ring at the press point,
// the faint dashed guide through the chips, and while a choice is lit a line from the press point to
// the [finger] (window px, read as it moves). The chips are pale caps named by [names], [current]
// ringed in signal orange, [lit] navy and a little larger. A short fade in (off under reduced motion).
//
// Web deltas:
// - Compose's Popup the window's size is a manual popover in the top layer, so no ancestor's
//   transform (the words turned on their side) or stacking moves it; without popover support it
//   is the same fixed layer. It takes no pointer: the finger stays the word's (captured).
// - The finger's line is drawn, not rendered: [PickWord] moves it through [line] as the finger
//   goes, so a move re-renders nothing.
// - [safeWindow] reads the window's safe area (WindowInsets.safeDrawing) off a probe padded by
//   env(safe-area-inset-*).
import type { JSX, Ref } from 'preact'
import { useLayoutEffect, useRef } from 'preact/hooks'
import { QuickPick, type Fan, type Rect } from './quickPick'
import './QuickPickFan.css'

/** The window's safe area in px, in client coordinates (WindowInsets.safeDrawing). */
export function safeWindow(): Rect {
  const root = document.documentElement
  const width = root.clientWidth || window.innerWidth
  const height = root.clientHeight || window.innerHeight
  const probe = document.createElement('div')
  probe.className = 'quick-fan__insets'
  document.body.appendChild(probe)
  const s = getComputedStyle(probe)
  const px = (v: string): number => {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : 0
  }
  const out = { left: px(s.paddingLeft), top: px(s.paddingTop), right: width - px(s.paddingRight), bottom: height - px(s.paddingBottom) }
  probe.remove()
  return out
}

export interface QuickPickFanProps {
  fan: Fan
  /** The choices' names in the fan's order, top to bottom. */
  names: readonly string[]
  /** The row of the choice picked now (ringed). */
  current: number
  /** The row lit by the finger, or null in the dead zone. */
  lit: number | null
  /** Where the finger is now (window px), for the line's far end as it is first drawn. */
  finger: { readonly current: { x: number; y: number } | null }
  /** The finger's line, moved by the caller as the finger goes. */
  line: Ref<SVGLineElement>
}

/** The hold's fan over the window (Kotlin QuickPickFan). */
export function QuickPickFan(props: QuickPickFanProps): JSX.Element {
  const { fan, names, current, lit, finger } = props
  const layer = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const el = layer.current
    if (!el || typeof el.showPopover !== 'function') return
    try {
      el.showPopover()
    } catch {
      // No popover support: the plain fixed layer stays.
    }
  }, [])
  const points = fan.slots.map((s) => QuickPick.at(fan, s))
  const end = lit !== null ? finger.current : null
  return (
    // Only a picture: screen readers have the word's arrow keys, and the list.
    <div ref={layer} class="quick-fan" popover="manual" aria-hidden="true">
      <svg class="quick-fan__lines" width="100%" height="100%">
        <polyline class="quick-fan__guide" points={points.map((p) => `${p.x},${p.y}`).join(' ')} />
        <circle class="quick-fan__dead" cx={fan.x} cy={fan.y} r={QuickPick.DEAD} />
        {end && <line ref={props.line} class="quick-fan__finger" x1={fan.x} y1={fan.y} x2={end.x} y2={end.y} />}
      </svg>
      {fan.slots.map((s, k) => {
        const p = points[k]!
        const on = s.i === lit
        const cls = ['quick-fan__chip', 'cap-3d', on ? 'is-lit' : '', s.i === current ? 'is-current' : ''].filter(Boolean).join(' ')
        return (
          // Each chip's middle level with its row, its near end on the arc.
          <div key={s.i} class={`quick-fan__at${fan.dir < 0 ? ' quick-fan__at--left' : ''}`} style={{ left: `${p.x}px`, top: `${p.y}px` }}>
            <span class={cls}>{names[s.i]}</span>
          </div>
        )
      })}
    </div>
  )
}
