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
//   whole note (hold = false).
// - Each key is a button for the keyboard and screen readers (Compose's
//   semantics children): one at a time is in the Tab order (a roving
//   tabindex, on the root until a key is focused), the arrow keys, Home and
//   End move along the keys (without scrolling the page), and Enter or Space
//   plays the focused key's whole sound (its click, detail 0; a held Enter
//   doesn't repeat it). Neither is a computer-keyboard key (below), so a
//   focused key is never played twice by one press.
// - Where the browser sends pointerrawupdate (Chrome, press.ts
//   rawMovesSupported), a held finger's moves come from it as they arrive, so
//   a glissando reaches the next key without waiting for the frame's
//   pointermove; a finger seen there skips its pointermove (the same move again).
// - Device notes light a key through --glow on [data-note] (MirrorScreen's
//   applyGlow, by exact pitch); the press travel is the caps' (core
//   KeyMotion: straight down, a spring back up). A pressed key goes down at
//   once (data-down set on the element in the handler, as the pads do), not
//   at the next render, and a quick tap keeps it a moment (live/capDown.ts);
//   each render then brings every key's data-down in line with what holds or
//   sounds, so it isn't in the markup Preact diffs.
// - A key under the mouse is tinted (hover). The haptic tick ([haptics],
//   platform/haptics.ts) follows a finger's press, not the computer keyboard's.
// - A press hands on its event's timeStamp ([onNote]'s at: the pointerdown,
//   the move that slid onto the key, or the keydown; Kotlin's uptimeMillis),
//   for the latency note.
// - [playingNotes] is the controller's signal, read here, so a voice starting
//   or ending re-renders the piano, not Live's whole screen.
// - [computer] (a desktop or a fine pointer): the letter row plays it
//   (live/keyboard.ts), a small letter on each key it reaches; Z / X step
//   the octave. Ignored while typing in a field, in a dialog, or with a
//   modifier held.
import type { JSX, TargetedKeyboardEvent, TargetedPointerEvent } from 'preact'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { ReadonlySignal } from '@preact/signals'
import { Keys, MAX_OCTAVE, MIN_OCTAVE, type Scale } from '../../core/features/keys'
import type { MirrorState } from '../../core/features/liveMirror'
import { NoteTouches, type NoteEvent } from '../../core/features/noteTouches'
import { KeyMark, Piano, rangeNotes, type NoteRange, type PianoKey } from '../../core/features/piano'
import { MirrorText } from '../../core/text/mirrorText'
import { tick } from '../../platform/haptics'
import { glow, glowCss } from './glow'
import { COMPUTER_KEYS, computerHint, computerNote, octaveStep, playsKeys } from './keyboard'
import type { KeysShown } from './keys'
import { capDown, capUp } from './capDown'
import { rawMovesSupported } from './press'
import './PianoKeyboard.css'
import { altGraph, composing, inField } from '../keyGuard'
import { computerKeys } from '../keyPrefs'

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
  /**
   * A note pressed; it sounds until [onNoteUp]. A screen reader's Play passes
   * hold = false. [at]: the press's event timeStamp (absent for a screen reader's Play).
   */
  onNote: (note: number, hold: boolean, at?: number) => void
  onNoteUp: (note: number) => void
  /** Web: the computer keyboard plays it, with letter hints on the keys. */
  computer?: boolean
  /** Z / X: the octave down or up. */
  onOctave?: (octave: number) => void
  class?: string
}

/**
 * One finger on the keys: its note (null off them), where it last moved, the
 * layout it was in, and whether its moves come from pointerrawupdate (its
 * pointermoves are then skipped).
 */
interface Finger {
  readonly note: number | null
  readonly x: number
  readonly y: number
  readonly generation: number
  readonly raw: boolean
}

export function PianoKeyboard(props: PianoKeyboardProps): JSX.Element {
  const { range, st, keys, now, computer = false } = props
  // The letters on the keys only while Settings → Computer keyboard is on (they play only then).
  const hints = computer && computerKeys.value
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
  /** [events] played; [finger]: by a finger (a tick on each press, where on); [at]: their input event's timeStamp. */
  const play = (events: readonly NoteEvent[], finger = false, at?: number): void => {
    let pressed = false
    for (const e of events) {
      if (e.type === 'Press') {
        cb.current.onNote(e.note, true, at)
        // Down now, not at the next render.
        const el = keyOf(e.note)
        if (el) capDown(el)
        pressed = true
      } else {
        cb.current.onNoteUp(e.note)
        // Up now unless it still sounds or another finger holds it (the render agrees either way).
        const el = keyOf(e.note)
        if (el && !touches.held.has(e.note) && !cb.current.playingNotes.peek().has(e.note)) capUp(el)
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

  const local = (e: PointerEvent, el: HTMLElement): { x: number; y: number } => {
    const r = el.getBoundingClientRect()
    return { x: e.clientX - r.left - el.clientLeft, y: e.clientY - r.top - el.clientTop }
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
    const { x, y } = local(e, e.currentTarget)
    const note = Piano.keyAt(laidRef.current, x, y, null, 0)
    fingers.current.set(e.pointerId, { note, x, y, generation: generation.current, raw: false })
    if (note !== null) play(touches.down(e.pointerId, note), true, e.timeStamp)
  }
  /** A finger moved on [el] (the plate, which captures it); [raw]: from pointerrawupdate. */
  const moved = (e: PointerEvent, el: HTMLElement, raw: boolean): void => {
    let f = fingers.current.get(e.pointerId)
    if (!f) return
    // Its pointermove is a move pointerrawupdate already brought.
    if (!raw && f.raw) return
    if (raw && !f.raw) {
      f = { ...f, raw: true }
      fingers.current.set(e.pointerId, f)
    }
    const { x, y } = local(e, el)
    // After − or +, a finger resting on a key keeps the note it pressed until it really moves.
    if (f.generation !== generation.current && Math.hypot(x - f.x, y - f.y) <= TOUCH_SLOP) return
    const note = Piano.keyAt(laidRef.current, x, y, f.note, SLIDE_SLOP)
    fingers.current.set(e.pointerId, { note, x, y, generation: generation.current, raw: f.raw })
    play(touches.move(e.pointerId, note), true, e.timeStamp)
  }
  const onPointerMove = (e: TargetedPointerEvent<HTMLDivElement>): void => moved(e, e.currentTarget, false)
  const movedRef = useRef(moved)
  movedRef.current = moved
  // Chrome: the moves as they arrive (the plate holds every finger's capture, so they come here).
  useEffect(() => {
    const el = plate.current
    if (!el || !rawMovesSupported()) return
    const onRaw = (e: Event): void => movedRef.current(e as PointerEvent, el, true)
    el.addEventListener('pointerrawupdate', onRaw)
    return () => el.removeEventListener('pointerrawupdate', onRaw)
  }, [])
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
      // Settings → Computer keyboard off, or an input method composing: no letters play.
      if (!computerKeys.peek() || composing(e) || altGraph(e)) return
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
      play(touches.down(id, note), false, e.timeStamp)
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

  // One key at a time is in the Tab order (the one last focused, else the root); the arrow
  // keys, Home and End move along the keys.
  const notes = useMemo(() => rangeNotes(range), [range.first, range.last])
  const [focusNote, setFocusNote] = useState<number | null>(null)
  const tabNote = tabStop(notes, focusNote, keys.root, keys.scale)
  const onKeyDown = (e: TargetedKeyboardEvent<HTMLDivElement>): void => {
    // A held Enter would click again and again: one press, one note.
    if (e.key === 'Enter' && e.repeat) {
      e.preventDefault()
      return
    }
    const next = stepNote(notes, tabNote, e.key)
    if (next === null) return
    // The page doesn't scroll under the arrows.
    e.preventDefault()
    setFocusNote(next)
    keyOf(next)?.focus()
  }

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
  // Each key down while a finger holds it or it sounds here, as this render has it (live/capDown.ts).
  useLayoutEffect(() => {
    for (const el of plate.current?.querySelectorAll<HTMLElement>('[data-note]') ?? []) {
      const n = Number(el.dataset.note)
      if (fingered.has(n) || playingNotes.has(n)) capDown(el)
      else capUp(el)
    }
  })
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
        onKeyDown={onKeyDown}
      >
        {laid.map((k) => {
          const mark = Piano.mark(k.note, keys.root, keys.scale)
          const cls =
            `piano__key piano__key--${k.black ? 'black' : 'white'} cap-3d` +
            (mark === KeyMark.ROOT ? ' is-root' : mark === KeyMark.OUT ? ' is-out' : '') +
            (playingNotes.has(k.note) ? ' is-playing' : '')
          const r = k.rect
          const gap = k.black ? 0 : WHITE_GAP / 2
          const hint = hints ? computerHint(k.note, keys.octave) : null
          return (
            <button
              key={k.note}
              type="button"
              class={cls}
              data-note={k.note}
              aria-label={MirrorText.pianoKey(k.note, keys.names, mark)}
              aria-description={MirrorText.PLAY}
              tabIndex={k.note === tabNote ? 0 : -1}
              onFocus={() => setFocusNote(k.note)}
              style={{
                left: `${r.left + gap}px`,
                top: `${r.top}px`,
                width: `${Math.max(0, r.width - 2 * gap)}px`,
                height: `${r.height}px`,
                '--glow': glowCss(lit.get(k.note) ?? 0),
              }}
              // The keyboard's (Enter, Space) or a screen reader's Play: the whole sound.
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


/**
 * The key in the Tab order among [notes] (the piano's, lowest first): the
 * one last focused while it still shows, else the first root of [root]'s
 * [scale], else the lowest.
 */
export function tabStop(notes: readonly number[], focused: number | null, root: number, scale: Scale): number | null {
  if (focused !== null && notes.includes(focused)) return focused
  return notes.find((n) => Piano.mark(n, root, scale) === KeyMark.ROOT) ?? notes[0] ?? null
}

/**
 * The key a [key] press moves the focus to from [from]: the arrows one key
 * along (right and up go higher), Home and End to either end; null for any
 * other key (or none to move to).
 */
export function stepNote(notes: readonly number[], from: number | null, key: string): number | null {
  if (notes.length === 0) return null
  const at = from === null ? 0 : Math.max(0, notes.indexOf(from))
  let next: number
  if (key === 'ArrowRight' || key === 'ArrowUp') next = Math.min(notes.length - 1, at + 1)
  else if (key === 'ArrowLeft' || key === 'ArrowDown') next = Math.max(0, at - 1)
  else if (key === 'Home') next = 0
  else if (key === 'End') next = notes.length - 1
  else return null
  return notes[next]!
}
