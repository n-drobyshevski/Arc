// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/KeysSheet.kt
//
// The KEYS sheet, which a tap on KEYS' scale, key or octave word opens
// ([part]: that one's section in view): under SCALE and a close ✕, a row for
// each scale with its twelve notes as dots (the root orange, its other notes
// filled, the rest rings), the current one navy; then KEY, the twelve notes as
// caps in two rows of six; then OCTAVE, caps 0 to 8. A tap applies at once,
// with a tick under the finger, and the sheet stays open to change another;
// ✕, Escape, Back or the scrim close it. In a short window (a phone on its
// side) the scales take two columns, and the keys and octaves sit side by side.
//
// Web deltas:
// - Named ScaleSheet: app.tsx's 'keys' sheet is the computer's keyboard keys.
// - The Sheet has no swipe down (ArcSheet's swipe): Escape, the scrim and Back.
// - The sections are radio groups of buttons (Kotlin's selectableGroup and
//   RadioButton roles); the dots are an aria-hidden SVG.
// - ArcSheet's widest (720) applies in a short window only, where the scales
//   take their two columns; elsewhere the sheet keeps the usual column.
// - The tick is useFingerTick's, on a finger's press of a choice.
import type { JSX } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import { Keys, MAX_OCTAVE, MIN_OCTAVE, SCALES, intervals, type NoteNames, type Scale } from '../../core/features/keys'
import { KeyMark } from '../../core/features/piano'
import { MirrorText } from '../../core/text/mirrorText'
import { Sheet } from '../components/Sheet'
import { KeysSheetPart } from '../live/keys'
import { useFingerTick } from '../useHaptic'
import './ScaleSheet.css'

/**
 * The twelve semitones up from a scale's root, as its row in the KEYS sheet draws them as dots:
 * the root, the scale's other notes, and the notes outside it.
 */
export function scaleDots(scale: Scale): KeyMark[] {
  const notes = intervals(scale)
  return Array.from({ length: 12 }, (_, i) => (i === 0 ? KeyMark.ROOT : notes.includes(i) ? KeyMark.IN : KeyMark.OUT))
}

/** The key, scale and octave the sheet marks (KeysUi's). */
export interface ScaleSheetKeys {
  readonly root: number
  readonly scale: Scale
  readonly octave: number
  readonly names: NoteNames
}

export interface ScaleSheetProps {
  open: boolean
  keys: ScaleSheetKeys
  onRoot: (root: number) => void
  onScale: (scale: Scale) => void
  onOctave: (octave: number) => void
  /** The section the word tapped scrolls into view. */
  part: KeysSheetPart
  onDismiss: () => void
}

const OCTAVES: readonly number[] = Array.from({ length: MAX_OCTAVE - MIN_OCTAVE + 1 }, (_, i) => MIN_OCTAVE + i)
const KEY_ROWS: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5],
  [6, 7, 8, 9, 10, 11],
]
/** The scales column by column in a short window: the first half on the left. */
const TALL = Math.ceil(SCALES.length / 2)

export function ScaleSheet(props: ScaleSheetProps): JSX.Element {
  const { keys, part } = props
  const tick = useFingerTick()
  const keyAt = useRef<HTMLElement | null>(null)
  const octaveAt = useRef<HTMLElement | null>(null)
  // Once the sheet is laid out, so the scroll knows where the section is.
  useEffect(() => {
    if (!props.open || part === KeysSheetPart.SCALE) return
    const f = requestAnimationFrame(() => {
      const at = part === KeysSheetPart.KEY ? keyAt.current : octaveAt.current
      at?.scrollIntoView?.({ block: 'nearest' })
    })
    return () => cancelAnimationFrame(f)
  }, [props.open, part])
  return (
    <Sheet open={props.open} onDismiss={props.onDismiss} label={MirrorText.KEYS_SHEET} class="scale-sheet">
      <div class="scale-sheet__body" onPointerDownCapture={tick}>
        <div class="scale-sheet__head">
          <h2 id="scale-sheet-scale" class="scale-sheet__caption">
            {MirrorText.SCALE}
          </h2>
          <button type="button" class="scale-sheet__close" aria-label={MirrorText.CLOSE_KEYS_SHEET} onClick={props.onDismiss}>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
              <path d="M0 0L10 10M10 0L0 10" />
            </svg>
          </button>
        </div>
        <div class="scale-sheet__scales" role="radiogroup" aria-labelledby="scale-sheet-scale" style={{ '--tall': String(TALL) }}>
          {SCALES.map((s) => (
            <ScaleRow
              key={s}
              scale={s}
              on={s === keys.scale}
              onPick={() => {
                if (s !== keys.scale) props.onScale(s)
              }}
            />
          ))}
        </div>
        <div class="scale-sheet__lower">
          <section ref={keyAt} class="scale-sheet__section">
            <h2 id="scale-sheet-key" class="scale-sheet__caption">
              {MirrorText.KEY}
            </h2>
            <div class="scale-sheet__keys" role="radiogroup" aria-labelledby="scale-sheet-key">
              {KEY_ROWS.map((row, r) => (
                <div key={r} class="scale-sheet__row">
                  {row.map((pc) => (
                    <PickCap
                      key={pc}
                      label={Keys.name(pc, keys.names)}
                      description={MirrorText.keyWord(pc, keys.names)}
                      on={pc === keys.root}
                      onPick={() => {
                        if (pc !== keys.root) props.onRoot(pc)
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </section>
          <section ref={octaveAt} class="scale-sheet__section">
            <h2 id="scale-sheet-octave" class="scale-sheet__caption">
              {MirrorText.OCTAVE}
            </h2>
            <div class="scale-sheet__row scale-sheet__octaves" role="radiogroup" aria-labelledby="scale-sheet-octave">
              {OCTAVES.map((n) => (
                <PickCap
                  key={n}
                  label={String(n)}
                  description={MirrorText.octaveCap(n)}
                  on={n === keys.octave}
                  onPick={() => {
                    if (n !== keys.octave) props.onOctave(n)
                  }}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </Sheet>
  )
}

/** A scale's row: its name and its twelve notes as dots ([ScaleDots]); navy while it is the scale. */
function ScaleRow(props: { scale: Scale; on: boolean; onPick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.on}
      aria-label={MirrorText.scaleRow(props.scale)}
      class={`scale-row${props.on ? ' is-on' : ''}`}
      onClick={props.onPick}
    >
      <span class="scale-row__name" aria-hidden="true">
        {MirrorText.scaleName(props.scale)}
      </span>
      <ScaleDots scale={props.scale} />
    </button>
  )
}

/** The dots' size and the room between them. */
const DOT = 8
const DOT_GAP = 4
const STROKE = 1.5

/**
 * A scale's twelve semitones from its root ([scaleDots]): the root a signal-orange dot, its other
 * notes filled navy, the rest navy rings; on a navy row the filled ones turn the row's ink and the
 * rings fade (ScaleSheet.css). Decorative: the row says how many notes.
 */
function ScaleDots(props: { scale: Scale }): JSX.Element {
  const marks = scaleDots(props.scale)
  const width = DOT * 12 + DOT_GAP * 11
  return (
    <svg class="scale-dots" width={width} height={DOT} viewBox={`0 0 ${width} ${DOT}`} aria-hidden="true" focusable="false">
      {marks.map((mark, i) => {
        const cx = i * (DOT + DOT_GAP) + DOT / 2
        return mark === KeyMark.OUT ? (
          <circle key={i} class="scale-dots__out" cx={cx} cy={DOT / 2} r={(DOT - STROKE) / 2} stroke-width={STROKE} />
        ) : (
          <circle key={i} class={mark === KeyMark.ROOT ? 'scale-dots__root' : 'scale-dots__in'} cx={cx} cy={DOT / 2} r={DOT / 2} />
        )
      })}
    </svg>
  )
}

/** A key or an octave as a pale cap with its edge; navy while it is the one picked. */
function PickCap(props: { label: string; description: string; on: boolean; onPick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.on}
      aria-label={props.description}
      class={`scale-cap cap-3d${props.on ? ' is-on' : ''}`}
      onClick={props.onPick}
    >
      <span aria-hidden="true">{props.label}</span>
    </button>
  )
}
