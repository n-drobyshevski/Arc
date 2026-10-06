// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/PianoKeyboard.kt
//
// Live's KEYS on a wide window (an addition): a chromatic piano in place of
// the EP-133's 4×3 keypad. Every key plays; the key and scale only mark
// them: the root with an orange bar at its foot (and its name in orange), the
// scale's other notes named in ink, dimmed and unnamed outside it. No rings,
// names on or off. A finger slides from key to key (a glissando), and several
// fingers make a chord.
//
// The keys are caps, as every key in the app (theme/cap.css): each a flat
// face over a flat edge offset down and to the right, sitting in the device's
// grey body with a gap between white keys. A key goes down on its edge under
// a finger (whether or not it has a sound) and while it sounds here.
//
// Web deltas:
// - The keys are DOM caps (buttons placed from Piano.layout), not a Canvas;
//   one pointer handler on the plate takes every finger (setPointerCapture,
//   Piano.keyAt with a slide slop) and feeds NoteTouches, as Kotlin's
//   pointerInput does. A screen reader's Play is a click with detail 0: the
//   whole note (hold = false). The keys stay out of the Tab order (37 stops
//   at most); the computer keyboard plays them instead.
// - Device notes light a key through --glow on [data-note] (MirrorScreen's
//   applyGlow, by exact pitch); the press travel is the caps' 60 ms one. A
//   pressed key goes down at once (data-down set on the element in the
//   handler, as the pads do), not at the next render.
// - A key under the mouse is tinted (hover). The haptic tick ([haptics],
//   platform/haptics.ts) follows a finger's press, not the computer keyboard's.
// - [playingNotes] is the controller's signal, read here, so a voice starting
//   or ending re-renders the piano, not Live's whole screen.
// - [computer] (a desktop or a fine pointer): the letter row plays it
//   (live/keyboard.ts), a small letter on each key it reaches; Z / X step
//   the octave. Ignored while typing in a field, in a dialog, or with a
//   modifier held.
import type { JSX, TargetedPointerEvent } from 'preact'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { ReadonlySignal } from '@preact/signals'
import { Keys, MAX_OCTAVE, MIN_OCTAVE } from '../../core/features/keys'
import type { MirrorState } from '../../core/features/liveMirror'
import { NoteTouches, type NoteEvent } from '../../core/features/noteTouches'
import { KeyMark, Piano, type NoteRange, type PianoKey } from '../../core/features/piano'
import { MirrorText } from '../../core/text/mirrorText'
import { tick } from '../../platform/haptics'
import { glow, glowCss } from './glow'
import { COMPUTER_KEYS, computerHint, computerNote, octaveStep, playsKeys } from './keyboard'
import type { KeysShown } from './keys'
import './PianoKeyboard.css'

/** How far past a key's edge a sliding finger keeps it, so it doesn't flicker between two keys. */
const SLIDE_SLOP = 6
/** A finger that moves less than this after − or + keeps the note it pressed (Compose's touch slop). */
const TOUCH_SLOP = 8
/** The body showing between two white keys. */
const WHITE_GAP = 4

export interface PianoKeyboardProps {
  range: NoteRange
  st: MirrorState
  keys: KeysShown
  /** The notes sounding here, outlined and down. */
  playingNotes: ReadonlySignal<ReadonlySet<number>>
  /** A light tick when a finger presses a key. */
  haptics?: boolean
  /** The fade's clock (fixed in screenshots). */
  now: number
  /** A note pressed; it sounds until [onNoteUp]. A screen reader's Play passes hold = false. */
  onNote: (note: number, hold: boolean) => void
  onNoteUp: (note: number) => void
  /** Web: the computer keyboard plays it, with letter hints on the keys. */
  computer?: boolean
  /** Z / X: the octave down or up. */
  onOctave?: (octave: number) => void
  class?: string
}

/** One finger on the keys: its note (null off them), where it last moved, and the layout it was in. */
interface Finger {
  readonly note: number | null
  readonly x: number
  readonly y: number
  readonly generation: number
}

/** Whether [t] is a field (typing) or inside a dialog, where letters don't play. */
function inField(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return false
  if (t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return true
  return t.closest('dialog, [role="dialog"], [role="alertdialog"], [role="listbox"]') !== null
}

export function PianoKeyboard(props: PianoKeyboardProps): JSX.Element {
  const { range, st, keys, now, computer = false } = props
  const playingNotes = props.playingNotes.value
  const plate = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = plate.current
    if (!el) return
    const read = (): void => {
      const w = el.clientWidth
      const h = el.clientHeight
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }))
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The keys laid out for this range and size; a new layout is a new generation, so a
  // finger resting on a key when − or + moves the keys under it keeps its note.
  const generation = useRef(0)
  const laid = useMemo(() => {
    generation.current++
    return Piano.layout(range, size.w, size.h)
  }, [range.first, range.last, size.w, size.h])
  const laidRef = useRef<PianoKey[]>(laid)
  laidRef.current = laid

  // The latest callbacks, for the long-lived handlers.
  const cb = useRef(props)
  cb.current = props

  const touches = useMemo(() => new NoteTouches(), [])
  const fingers = useRef(new Map<number, Finger>())
  const [fingered, setFingered] = useState<ReadonlySet<number>>(() => new Set())
  /** The key element of [note], if it shows. */
  const keyOf = (note: number): HTMLElement | null => plate.current?.querySelector<HTMLElement>(`[data-note="${note}"]`) ?? null
  /** [events] played; [finger]: by a finger (a tick on each press, where on). */
  const play = (events: readonly NoteEvent[], finger = false): void => {
    let pressed = false
    for (const e of events) {
      if (e.type === 'Press') {
        cb.current.onNote(e.note, true)
        // Down now, not at the next render.
        keyOf(e.note)?.setAttribute('data-down', '')
        pressed = true
      } else {
        cb.current.onNoteUp(e.note)
        // Up now unless it still sounds or another finger holds it (the render agrees either way).
        if (!touches.held.has(e.note) && !cb.current.playingNotes.peek().has(e.note)) keyOf(e.note)?.removeAttribute('data-down')
      }
    }
    if (pressed && finger && cb.current.haptics) tick()
    if (events.length > 0) setFingered(touches.held)
  }
  // Also when the keys leave the screen (PADS, a narrower window) under a finger.
  useEffect(() => () => {
    fingers.current.clear()
    for (const e of touches.releaseAll()) if (e.type === 'Release') cb.current.onNoteUp(e.note)
  }, [touches])

  const local = (e: TargetedPointerEvent<HTMLDivElement>): { x: number; y: number } => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left - e.currentTarget.clientLeft, y: e.clientY - r.top - e.currentTarget.clientTop }
  }
  const onPointerDown = (e: TargetedPointerEvent<HTMLDivElement>): void => {
    // The mouse's other buttons (and a pen's barrel button) don't play.
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // No focus ring, text selection or compatibility mouse events from a press.
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Already gone.
    }
    const { x, y } = local(e)
    const note = Piano.keyAt(laidRef.current, x, y, null, 0)
    fingers.current.set(e.pointerId, { note, x, y, generation: generation.current })
    if (note !== null) play(touches.down(e.pointerId, note), true)
  }
  const onPointerMove = (e: TargetedPointerEvent<HTMLDivElement>): void => {
    const f = fingers.current.get(e.pointerId)
    if (!f) return
    const { x, y } = local(e)
    // After − or +, a finger resting on a key keeps the note it pressed until it really moves.
    if (f.generation !== generation.current && Math.hypot(x - f.x, y - f.y) <= TOUCH_SLOP) return
    const note = Piano.keyAt(laidRef.current, x, y, f.note, SLIDE_SLOP)
    fingers.current.set(e.pointerId, { note, x, y, generation: generation.current })
    play(touches.move(e.pointerId, note), true)
  }
  const onPointerEnd = (e: TargetedPointerEvent<HTMLDivElement>): void => {
    if (!fingers.current.delete(e.pointerId)) return
    play(touches.up(e.pointerId))
  }

  // The computer keyboard: letters play (each a finger of its own, ids below zero), Z / X step the octave.
  const octave = useRef(keys.octave)
  octave.current = keys.octave
  useEffect(() => {
    if (!computer || typeof window === 'undefined') return
    const ids = new Map<string, number>()
    const releaseAll = (): void => {
      for (const id of ids.values()) play(touches.up(id))
      ids.clear()
    }
    const onDown = (e: KeyboardEvent): void => {
      // macOS sends no keyup for a letter let go while Cmd is down: let the letters go now.
      if (e.metaKey || e.key === 'Meta') releaseAll()
      // Live is covered (the Guide, the section menu make it inert): the piano is out of reach.
      if (plate.current?.closest('[inert]')) {
        releaseAll()
        return
      }
      if (e.defaultPrevented || !playsKeys({ ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, inField: inField(e.target) })) return
      const step = octaveStep(e.code)
      if (step !== null) {
        e.preventDefault()
        if (e.repeat) return
        const next = Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, octave.current + step))
        if (next !== octave.current) cb.current.onOctave?.(next)
        return
      }
      const note = computerNote(e.code, octave.current)
      if (note === null) return
      e.preventDefault()
      if (e.repeat || ids.has(e.code)) return
      const id = -1 - COMPUTER_KEYS.indexOf(e.code)
      ids.set(e.code, id)
      play(touches.down(id, note))
    }
    const onUp = (e: KeyboardEvent): void => {
      if (e.key === 'Meta') releaseAll()
      const id = ids.get(e.code)
      if (id === undefined) return
      ids.delete(e.code)
      play(touches.up(id))
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', releaseAll)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', releaseAll)
      releaseAll()
    }
  }, [computer, touches])

  // How lit each key is (the device's notes, by exact pitch), and the brightest note past either end.
  let below = 0
  let above = 0
  const lit = new Map<number, number>()
  for (const [n, l] of st.notes) {
    const g = glow(l, now)
    if (g <= 0) continue
    if (n < range.first) below = Math.max(below, g)
    else if (n > range.last) above = Math.max(above, g)
    else lit.set(n, g)
  }
  const white = laid.find((k) => !k.black)?.rect.width ?? 0
  const own = Piano.lowest(keys.octave) + 12
  return (
    <div class={`piano${props.class ? ` ${props.class}` : ''}`}>
      <div
        ref={plate}
        class="piano__plate"
        role="group"
        aria-label={MirrorText.pianoRange(range.first, range.last, keys.names)}
        style={{ '--white-w': `${white}px`, '--black-h': `${size.h * Piano.BLACK_HEIGHT}px` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onLostPointerCapture={onPointerEnd}
        // A long press is a held note, not a context menu.
        onContextMenu={(e) => e.preventDefault()}
      >
        {laid.map((k) => {
          const mark = Piano.mark(k.note, keys.root, keys.scale)
          const down = fingered.has(k.note) || playingNotes.has(k.note)
          const cls =
            `piano__key piano__key--${k.black ? 'black' : 'white'} cap-3d` +
            (mark === KeyMark.ROOT ? ' is-root' : mark === KeyMark.OUT ? ' is-out' : '') +
            (playingNotes.has(k.note) ? ' is-playing' : '')
          const r = k.rect
          const gap = k.black ? 0 : WHITE_GAP / 2
          const hint = computer ? computerHint(k.note, keys.octave) : null
          return (
            <button
              key={k.note}
              type="button"
              class={cls}
              data-note={k.note}
              data-down={down ? '' : undefined}
              aria-label={MirrorText.pianoKey(k.note, keys.names, mark)}
              aria-description={MirrorText.PLAY}
              tabIndex={-1}
              style={{
                left: `${r.left + gap}px`,
                top: `${r.top}px`,
                width: `${Math.max(0, r.width - 2 * gap)}px`,
                height: `${r.height}px`,
                '--glow': glowCss(lit.get(k.note) ?? 0),
              }}
              onClick={(e) => {
                if (e.detail === 0) cb.current.onNote(k.note, false)
              }}
            >
              {hint !== null && <span class="piano__hint" aria-hidden="true">{hint}</span>}
              {/* Each C carries its octave; OCT's own C in ink. */}
              {!k.black && k.note % 12 === 0 && (
                <span class={`piano__digit${k.note === own ? ' piano__digit--own' : ''}`} aria-hidden="true">
                  {Keys.octaveOf(k.note)}
                </span>
              )}
              {keys.showNames && mark !== KeyMark.OUT && (
                <span class="piano__name" aria-hidden="true">{Keys.name(k.note, keys.names)}</span>
              )}
              {mark === KeyMark.ROOT && <span class="piano__bar" aria-hidden="true" />}
            </button>
          )
        })}
        {/* A device note the piano doesn't reach: an orange tick at that end. */}
        {below > 0 && <span class="piano__tick piano__tick--below" style={{ opacity: below }} aria-hidden="true" />}
        {above > 0 && <span class="piano__tick piano__tick--above" style={{ opacity: above }} aria-hidden="true" />}
      </div>
    </div>
  )
}

