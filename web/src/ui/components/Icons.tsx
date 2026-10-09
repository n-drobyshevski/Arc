// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Icons.kt (enum ArcIcon, Icon, DrawScope.draw)
//
// Small geometric icons, drawn rather than taken from an icon set, so they match
// the pocket operator app's flat shapes. Each one is the Kotlin Canvas geometry
// at the default 22dp viewport (w = 22, stroke = 0.11w, c = centre), so the
// numbers below are the Kotlin formulas evaluated at w = 22; `size` scales the
// whole drawing, as the Kotlin size parameter does (stroke scales with it).
// They draw in currentColor. IconBlock (the key around an icon) lives in
// IconBlock.tsx.
//
// Web only: SYSTEM, SUN and MOON, the desktop top bar's theme switch
// (ThemeSwitch.tsx; Kotlin has no theme key outside Settings), drawn in the
// same way: a ring half filled, a disc with eight rays at the gear's 45°
// steps, a crescent. Kotlin's GRID, PIANO and EXCHANGE are not ported (unused here).
import type { JSX } from 'preact'
import './Icons.css'

/** enum class ArcIcon. */
export const ArcIcon = {
  DOT: 'DOT',
  RING: 'RING',
  GEAR: 'GEAR',
  HELP: 'HELP',
  REFRESH: 'REFRESH',
  PLUS: 'PLUS',
  SEARCH: 'SEARCH',
  IMPORT: 'IMPORT',
  FOLLOW: 'FOLLOW',
  SWAP: 'SWAP',
  BLUETOOTH: 'BLUETOOTH',
  CLOCK: 'CLOCK',
  SYSTEM: 'SYSTEM',
  SUN: 'SUN',
  MOON: 'MOON',
} as const
export type ArcIcon = (typeof ArcIcon)[keyof typeof ArcIcon]

export interface IconProps {
  /** Edge length in CSS px (Kotlin `size: Dp = 22.dp`). */
  size?: number
  /** Ink; defaults to currentColor (Kotlin `color`). */
  color?: string
  class?: string
  /** When set the icon is announced as an image with this name; otherwise it is decorative. */
  label?: string
}

// The Kotlin viewport: w = size.minDimension at the default size.
const W = 22
const C = W / 2
const STROKE = W * 0.11

/** Rounds to 3 decimals so the markup stays readable. */
const n = (v: number): number => Math.round(v * 1000) / 1000

function Svg(props: IconProps & { name: ArcIcon; children: JSX.Element | JSX.Element[] }): JSX.Element {
  const { size = W, color, label, name } = props
  return (
    <svg
      class={`arc-icon${props.class ? ` ${props.class}` : ''}`}
      data-icon={name}
      width={size}
      height={size}
      viewBox={`0 0 ${W} ${W}`}
      fill="none"
      focusable="false"
      style={color ? { color } : undefined}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    >
      {props.children}
    </svg>
  )
}

/** drawCircle(color, radius = w * 0.36f) */
export function Dot(props: IconProps): JSX.Element {
  return (
    <Svg {...props} name="DOT">
      <circle cx={C} cy={C} r={n(W * 0.36)} fill="currentColor" />
    </Svg>
  )
}

/** drawCircle(color, radius = w * 0.32f, style = Stroke(stroke)) */
export function Ring(props: IconProps): JSX.Element {
  return (
    <Svg {...props} name="RING">
      <circle cx={C} cy={C} r={n(W * 0.32)} stroke="currentColor" stroke-width={n(STROKE)} />
    </Svg>
  )
}

// GEAR: 8 round rects rotated in 45° steps, a disc r = .72o, and a hole r = .32o
// cleared through (BlendMode.Clear). The hole lies inside the disc and clear of
// the teeth (which start at .5o), so disc + hole as one evenodd path cuts a real
// hole without a mask.
const O = W / 2
const GEAR_DISC = O * 0.72
const GEAR_HOLE = O * 0.32
const circlePath = (r: number): string =>
  `M${n(C - r)} ${C}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z`

export function Gear(props: IconProps): JSX.Element {
  const teeth: JSX.Element[] = []
  for (let i = 0; i < 8; i++) {
    teeth.push(
      <rect
        key={i}
        x={n(C - O * 0.17)}
        y={n(C - O)}
        width={n(O * 0.34)}
        height={n(O * 0.5)}
        rx={n(O * 0.06)}
        transform={i === 0 ? undefined : `rotate(${i * 45} ${C} ${C})`}
      />,
    )
  }
  return (
    <Svg {...props} name="GEAR">
      <g fill="currentColor">
        {teeth}
        <path fill-rule="evenodd" clip-rule="evenodd" d={`${circlePath(GEAR_DISC)}${circlePath(GEAR_HOLE)}`} />
      </g>
    </Svg>
  )
}

/**
 * HELP is not drawn: it is the font's own "?" in ArcType.tab at 0.95 × size,
 * heavier than a drawn one would be.
 */
export function Help(props: IconProps): JSX.Element {
  const { size = W, color, label } = props
  return (
    <span
      class={`arc-icon arc-icon-help${props.class ? ` ${props.class}` : ''}`}
      data-icon="HELP"
      style={{ width: `${size}px`, height: `${size}px`, fontSize: `${n(size * 0.95)}px`, ...(color ? { color } : {}) }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    >
      ?
    </span>
  )
}

// REFRESH: drawArc(startAngle = 40°, sweep = 290°) clockwise from 3 o'clock
// (y down), round cap, then a filled arrowhead at the arc's end (top right).
const R_REF = W * 0.34
const rad = (deg: number): number => (deg * Math.PI) / 180
const REF_START = { x: C + R_REF * Math.cos(rad(40)), y: C + R_REF * Math.sin(rad(40)) }
const REF_END = { x: C + R_REF * Math.cos(rad(40 + 290)), y: C + R_REF * Math.sin(rad(40 + 290)) }
const REF_TIP = { x: C + R_REF * 0.77, y: C - R_REF * 0.64 }

export function Refresh(props: IconProps): JSX.Element {
  const arc = `M${n(REF_START.x)} ${n(REF_START.y)}A${n(R_REF)} ${n(R_REF)} 0 1 1 ${n(REF_END.x)} ${n(REF_END.y)}`
  const t = REF_TIP
  const head =
    `M${n(t.x + W * 0.14)} ${n(t.y - W * 0.02)}` +
    `L${n(t.x - W * 0.02)} ${n(t.y + W * 0.16)}` +
    `L${n(t.x - W * 0.1)} ${n(t.y - W * 0.12)}Z`
  return (
    <Svg {...props} name="REFRESH">
      <path d={arc} stroke="currentColor" stroke-width={n(STROKE)} stroke-linecap="round" />
      <path d={head} fill="currentColor" />
    </Svg>
  )
}

/** Two lines of half-length .36w, stroke × 1.3, round caps. */
export function Plus(props: IconProps): JSX.Element {
  const l = W * 0.36
  return (
    <Svg {...props} name="PLUS">
      <path
        d={`M${n(C - l)} ${C}H${n(C + l)}M${C} ${n(C - l)}V${n(C + l)}`}
        stroke="currentColor"
        stroke-width={n(STROKE * 1.3)}
        stroke-linecap="round"
      />
    </Svg>
  )
}

/** A lens r = .26w at c − .08w, and a handle (stroke × 1.2, round cap). */
export function Search(props: IconProps): JSX.Element {
  const r = W * 0.26
  const o = C - W * 0.08
  return (
    <Svg {...props} name="SEARCH">
      <circle cx={n(o)} cy={n(o)} r={n(r)} stroke="currentColor" stroke-width={n(STROKE)} />
      <path
        d={`M${n(o + r * 0.72)} ${n(o + r * 0.72)}L${n(C + W * 0.38)} ${n(C + W * 0.38)}`}
        stroke="currentColor"
        stroke-width={n(STROKE * 1.2)}
        stroke-linecap="round"
      />
    </Svg>
  )
}

/** An arrow down into a tray. */
export function Import(props: IconProps): JSX.Element {
  const top = W * 0.1
  const mid = C + W * 0.08
  const a = W * 0.18
  return (
    <Svg {...props} name="IMPORT">
      <g stroke="currentColor" stroke-width={n(STROKE)} stroke-linecap="round">
        <path d={`M${C} ${n(top)}V${n(mid)}M${n(C - a)} ${n(mid - a)}L${C} ${n(mid)}M${n(C + a)} ${n(mid - a)}L${C} ${n(mid)}`} />
        <path
          d={`M${n(W * 0.12)} ${n(W * 0.62)}V${n(W * 0.88)}H${n(W * 0.88)}V${n(W * 0.62)}`}
          stroke-linejoin="round"
        />
      </g>
    </Svg>
  )
}

/** A target: follow the group being played. */
export function Follow(props: IconProps): JSX.Element {
  return (
    <Svg {...props} name="FOLLOW">
      <circle cx={C} cy={C} r={n(W * 0.38)} stroke="currentColor" stroke-width={n(STROKE)} />
      <circle cx={C} cy={C} r={n(W * 0.14)} fill="currentColor" />
    </Svg>
  )
}

/**
 * Two overlapping squares, the PO app's mark beside its chosen mode (DRUMS /
 * KEYPAD): sides w * 0.5 at (0.1w, 0.1w) and (0.4w, 0.4w), Stroke(w * 0.08).
 */
export function Swap(props: IconProps): JSX.Element {
  const side = n(W * 0.5)
  return (
    <Svg {...props} name="SWAP">
      <g stroke="currentColor" stroke-width={n(W * 0.08)}>
        <rect x={n(W * 0.1)} y={n(W * 0.1)} width={side} height={side} />
        <rect x={n(W * 0.4)} y={n(W * 0.4)} width={side} height={side} />
      </g>
    </Svg>
  )
}

/**
 * The rune: a spine with two arrowheads on its right, crossed by the strokes
 * from its left (stroke × 1.1, round caps and joins).
 */
export function Bluetooth(props: IconProps): JSX.Element {
  return (
    <Svg {...props} name="BLUETOOTH">
      <path
        d={`M${n(W * 0.24)} ${n(W * 0.68)}L${n(W * 0.76)} ${n(W * 0.3)}L${C} ${n(W * 0.08)}V${n(W * 0.92)}L${n(W * 0.76)} ${n(W * 0.7)}L${n(W * 0.24)} ${n(W * 0.32)}`}
        stroke="currentColor"
        stroke-width={n(STROKE * 1.1)}
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </Svg>
  )
}

/** A face r = .4w with its two hands: late. */
export function Clock(props: IconProps): JSX.Element {
  return (
    <Svg {...props} name="CLOCK">
      <circle cx={C} cy={C} r={n(W * 0.4)} stroke="currentColor" stroke-width={n(STROKE)} />
      <path
        d={`M${C} ${n(C - W * 0.22)}V${C}L${n(C + W * 0.16)} ${n(C + W * 0.1)}`}
        stroke="currentColor"
        stroke-width={n(STROKE)}
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </Svg>
  )
}

/** Web only. Theme System: RING with its left half filled (sweeping from the top through the left). */
export function System(props: IconProps): JSX.Element {
  const r = W * 0.32
  return (
    <Svg {...props} name="SYSTEM">
      <circle cx={C} cy={C} r={n(r)} stroke="currentColor" stroke-width={n(STROKE)} />
      <path d={`M${C} ${n(C - r)}A${n(r)} ${n(r)} 0 0 0 ${C} ${n(C + r)}Z`} fill="currentColor" />
    </Svg>
  )
}

/** Web only. Theme Light: a disc r = .2w and eight rays from .3w to .42w in 45° steps (stroke × .9, round caps). */
export function Sun(props: IconProps): JSX.Element {
  let rays = ''
  for (let i = 0; i < 8; i++) {
    const a = rad(i * 45)
    const x = Math.cos(a)
    const y = Math.sin(a)
    rays += `M${n(C + W * 0.3 * x)} ${n(C + W * 0.3 * y)}L${n(C + W * 0.42 * x)} ${n(C + W * 0.42 * y)}`
  }
  return (
    <Svg {...props} name="SUN">
      <circle cx={C} cy={C} r={n(W * 0.2)} fill="currentColor" />
      <path d={rays} stroke="currentColor" stroke-width={n(STROKE * 0.9)} stroke-linecap="round" />
    </Svg>
  )
}

// MOON: a disc r = .36w with a disc r = .29w taken out of its top right (centre
// .22w right and .16w up), as one path: the outer circle's long way between
// the two crossing points, then the cut's short way back.
const MOON_R = W * 0.36
const CUT_R = W * 0.29
const CUT = { x: C + W * 0.22, y: C - W * 0.16 }
const MOON_D = (() => {
  const dx = CUT.x - C
  const dy = CUT.y - C
  const d = Math.hypot(dx, dy)
  const a = (d * d - CUT_R * CUT_R + MOON_R * MOON_R) / (2 * d)
  const h = Math.sqrt(MOON_R * MOON_R - a * a)
  const ux = dx / d
  const uy = dy / d
  const p1 = { x: C + a * ux - h * uy, y: C + a * uy + h * ux }
  const p2 = { x: C + a * ux + h * uy, y: C + a * uy - h * ux }
  return (
    `M${n(p1.x)} ${n(p1.y)}A${n(MOON_R)} ${n(MOON_R)} 0 1 1 ${n(p2.x)} ${n(p2.y)}` +
    `A${n(CUT_R)} ${n(CUT_R)} 0 0 0 ${n(p1.x)} ${n(p1.y)}Z`
  )
})()

/** Web only. Theme Dark: a crescent. */
export function Moon(props: IconProps): JSX.Element {
  return (
    <Svg {...props} name="MOON">
      <path d={MOON_D} fill="currentColor" />
    </Svg>
  )
}

const BY_NAME: Readonly<Record<ArcIcon, (p: IconProps) => JSX.Element>> = {
  DOT: Dot,
  RING: Ring,
  GEAR: Gear,
  HELP: Help,
  REFRESH: Refresh,
  PLUS: Plus,
  SEARCH: Search,
  IMPORT: Import,
  FOLLOW: Follow,
  SWAP: Swap,
  BLUETOOTH: Bluetooth,
  CLOCK: Clock,
  SYSTEM: System,
  SUN: Sun,
  MOON: Moon,
}

/** `Icon(icon, color, modifier, size)`: draws [icon] by name. */
export function Icon(props: IconProps & { icon: ArcIcon }): JSX.Element {
  const { icon, ...rest } = props
  const Draw = BY_NAME[icon]
  return <Draw {...rest} />
}
