// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/PianoKeyboard.kt
//
// Live's landscape KEYS (an addition): a chromatic piano, the KEYS sound
// repitched to every key. Keys in the key and scale ring navy, the root
// orange with a bar at its foot; the others fade and lose their names but
// still play. Notes from the EP-133 light their exact key; one past either
// end puts an orange tick at that end. A note playing here is outlined.
//
// The keys are caps, as every key in the app (theme/cap.css): each a flat
// face over a flat edge offset down and to the right, sitting in the
// device's grey body with a gap between white keys; a key sounding here is
// down on its edge.
//
// Every finger is followed across the keys: sliding onto the next key lets go
// of one note and plays the next (a glissando), several fingers make a chord,
// and a note is let go of when its last finger lifts or leaves (NoteTouches).
//
// Web deltas:
// - The keys are positioned elements (percentages of Piano.layout), not a
//   Canvas; the pointer events go to the plate, which captures each pointer,
//   and keyAt hit-tests in CSS px against the plate's box at that moment.
// - Each key is a button for the keyboard and screen readers (Compose's
//   semantics children): one at a time is in the Tab order, and the arrow
//   keys move along the keys (a roving tabindex); Enter or Space, or a screen
//   reader's Play, plays the whole sound (a click with detail 0).
// - The glow is the --glow custom property on each key, as on the pads.
import type { JSX, TargetedKeyboardEvent, TargetedPointerEvent } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Keys } from '../../core/features/keys'
import type { MirrorState } from '../../core/features/liveMirror'
import type { NoteEvent } from '../../core/features/noteTouches'
import { KeyMark, Piano, rangeNotes, type NoteRange, type PianoKey } from '../../core/features/piano'
import { CoachText } from '../../core/text/coachText'
import { MirrorText } from '../../core/text/mirrorText'
import { COACH_YELLOW, COACH_YELLOW_INK } from '../components/Coach'
import { glowCss } from './glow'
import type { KeysUi } from './keys'
import { PianoFingers, pastEnds, pianoLit } from './piano'
import './PianoKeyboard.css'

export interface PianoActions {
  /** A key pressed; it sounds until [onNoteUp]. A keyboard's or screen reader's Play passes hold = false. */
  onNote?: (note: number, hold: boolean) => void
  onNoteUp?: (note: number) => void
}

export function PianoKeyboard(props: {
  range: NoteRange
  st: MirrorState
  keys: KeysUi
  now: number
  actions: PianoActions
}): JSX.Element {
  const { range, st, keys, now, actions } = props
  const plate = useRef<HTMLDivElement | null>(null)
  const area = useRef<HTMLDivElement | null>(null)
  const notes = useMemo(() => rangeNotes(range), [range.first, range.last])
  // The keys in unit space (0..1 of the plate), drawn as percentages; hits scale them to the plate's box.
  const unit = useMemo(() => Piano.layout(range, 1, 1), [range.first, range.last])
  const whites = unit.filter((k) => !k.black).length

  // Every finger, by pointer id; when the range moves (− / +) a resting finger keeps its note until it really moves.
  const fingers = useMemo(() => new PianoFingers(), [])
  const act = useRef(actions)
  act.current = actions
  const play = (events: readonly NoteEvent[]): void => {
    for (const e of events) {
      if (e.kind === 'press') act.current.onNote?.(e.note, true)
      else act.current.onNoteUp?.(e.note)
    }
  }
  useEffect(() => fingers.relayout(), [range.first, range.last])
  // Leaving the keys (the screen goes, KEYS goes off, the window turns upright) lets go of every note.
  useEffect(() => () => play(fingers.releaseAll()), [fingers])

  // The keys in px now, and a pointer's place among them (inside the body around them).
  const at = (e: TargetedPointerEvent<HTMLDivElement>): { x: number; y: number; keys: PianoKey[] } | null => {
    const box = area.current?.getBoundingClientRect()
    if (!box || box.width === 0) return null
    return { x: e.clientX - box.left, y: e.clientY - box.top, keys: Piano.layout(range, box.width, box.height) }
  }

  const onPointerDown = (e: TargetedPointerEvent<HTMLDivElement>): void => {
    // The mouse's other buttons (and a pen's barrel button) don't play.
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const p = at(e)
    if (p === null) return
    const events = fingers.down(e.pointerId, p.x, p.y, p.keys)
    if (!fingers.has(e.pointerId)) return
    e.preventDefault()
    try {
      // Moves outside the plate still reach it, so a slide off the end lets go.
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Not capturable (a synthetic event).
    }
    play(events)
  }

  const onPointerMove = (e: TargetedPointerEvent<HTMLDivElement>): void => {
    if (!fingers.has(e.pointerId)) return
    const p = at(e)
    if (p !== null) play(fingers.move(e.pointerId, p.x, p.y, p.keys))
  }

  const onPointerEnd = (e: TargetedPointerEvent<HTMLDivElement>): void => {
    play(fingers.up(e.pointerId))
  }

  // One key at a time is in the Tab order; the arrow keys move along the keys.
  const [focusNote, setFocusNote] = useState<number | null>(null)
  const tabNote = focusNote !== null && focusNote >= range.first && focusNote <= range.last ? focusNote : (notes.find((n) => Piano.mark(n, keys.root, keys.scale) === KeyMark.ROOT) ?? range.first)
  const onKeyDown = (e: TargetedKeyboardEvent<HTMLDivElement>): void => {
    const at = notes.indexOf(tabNote)
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(notes.length - 1, at + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, at - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = notes.length - 1
    if (next === null) return
    e.preventDefault()
    const n = notes[next]!
    setFocusNote(n)
    plate.current?.querySelector<HTMLElement>(`[data-note="${n}"]`)?.focus()
  }

  const lit = pianoLit(st.notes, range, now)
  const past = pastEnds(st.notes, range, now)
  const ownC = 12 * (keys.octave + 1)
  return (
    <div
      class="piano"
      role="group"
      aria-label={MirrorText.pianoRange(range.first, range.last, keys.names)}
      data-coach="live.keys"
      data-coach-label={CoachText.PIANO}
      data-coach-face={COACH_YELLOW}
      data-coach-ink={COACH_YELLOW_INK}
      // The white keys' count: ring sizes follow the key width.
      style={{ '--whites': whites }}
    >
      <div
        ref={plate}
        class="piano__plate"
        dir="ltr"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onLostPointerCapture={onPointerEnd}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={onKeyDown}
      >
        <div ref={area} class="piano__keys">
        {unit.map((k) => {
          const mark = Piano.mark(k.note, keys.root, keys.scale)
          const g = lit.get(k.note) ?? 0
          const playing = keys.playingNotes.has(k.note)
          const isC = k.note % 12 === 0
          // Names on the white keys of the scale; a black key's only while it sounds, where it fits.
          const named = mark !== KeyMark.OUT && (!k.black || g > 0 || playing)
          const cls =
            'piano__key cap-3d' +
            (k.black ? ' piano__key--black' : ' piano__key--white') +
            (mark === KeyMark.OUT ? ' is-out' : mark === KeyMark.ROOT ? ' is-root' : ' is-in') +
            (playing ? ' is-playing is-down' : '')
          return (
            <button
              key={k.note}
              type="button"
              class={cls}
              data-note={k.note}
              tabIndex={k.note === tabNote ? 0 : -1}
              aria-label={MirrorText.pianoKey(k.note, keys.names, mark)}
              aria-description={MirrorText.PLAY}
              style={{
                left: `${k.rect.left * 100}%`,
                // A white key gives 2px either side to the gap between keys (its margins).
                width: k.black ? `${k.rect.width * 100}%` : `calc(${k.rect.width * 100}% - 4px)`,
                height: `${k.rect.height * 100}%`,
                '--glow': glowCss(g),
              }}
              onFocus={() => setFocusNote(k.note)}
              // The keyboard's or a screen reader's Play: the whole sound.
              onClick={(e) => {
                if (e.detail === 0) act.current.onNote?.(k.note, false)
              }}
            >
              {isC && !k.black && (
                <span class={`piano__digit${k.note === ownC ? ' piano__digit--own' : ''}`} aria-hidden="true">
                  {Keys.octaveOf(k.note)}
                </span>
              )}
              {mark !== KeyMark.OUT && (
                <span class="piano__ring" aria-hidden="true">
                  {named && <span class="piano__name">{Keys.name(k.note, keys.names)}</span>}
                </span>
              )}
              {mark === KeyMark.ROOT && <span class="piano__bar" aria-hidden="true" />}
            </button>
          )
        })}
        {past.below !== null && <span class="piano__tick piano__tick--below" aria-hidden="true" />}
        {past.above !== null && <span class="piano__tick piano__tick--above" aria-hidden="true" />}
        </div>
      </div>
    </div>
  )
}
