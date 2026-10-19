// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/TakeTrimDeck.kt
//
// TRIM on the Takes page (an addition): the glass shows the take's wave with
// two orange handles, the part between them lit, how long it is large and its
// edges, and a playhead while it plays. Drag a handle, or tap START or END
// while the part plays to cut there. Under it PLAY (the part), START, END,
// RESET (the whole take) and DONE, which keeps the part with the take
// ([TakesUi.onSetTrim]): nothing is cut from its file.
//
// Web deltas:
// - The wave is Waveform's canvas (TakeTrim.peaks' walk, 120 columns), the
//   handles and playhead drawn over it; its bars keep Waveform's 6px of room.
// - Compose's drag and tap are one set of pointer events on the wave: past
//   the touch slop sideways (and more across than up or down), the handle
//   nearer where the pointer went down follows it (setPointerCapture); let go
//   within the slop, it is a tap and the nearer handle goes there. Up and down
//   still scroll the page (touch-action pan-y).
// - The handles are sliders: the arrow keys move one half a second, as
//   TalkBack's custom actions do (MirrorText.TRIM_START_LATER, ...), PageUp
//   and PageDown ten times that, Home and End as far as it goes. The Start
//   slider takes the focus as the wave opens, TRIM's place gone.
// - START and END stay in the tab order while nothing plays (focusable), so
//   END, which stops the part, keeps the focus.
// - The playhead runs on the deck's own requestAnimationFrame and is written
//   to the DOM, so the deck doesn't render per frame; START and END read it.
import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { TakeTrim } from '../../core/features/takeTrim'
import { FeatureText } from '../../core/text/featureText'
import { MirrorText } from '../../core/text/mirrorText'
import type { TakeInfo } from '../../platform/storage/takeStore'
import { sliderKey } from '../components/drag'
import { Waveform } from '../components/Waveform'
import { DeckKey, DeckStrip } from './DeckKeys'
import { useIs } from './memo'
import { TOUCH_SLOP } from './press'
import type { TakeSound, TakesUi } from './Takes'
import './TakeTrim.css'

const COLUMNS = 120
/** The wave's box (76) and its handles' knobs (7), as the Kotlin Canvas. */
const BOX = 76
const KNOB = 7

const coerce = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)

export function TakeTrimDeck(props: { t: TakesUi; info: TakeInfo; n: number; onClose: () => void }): JSX.Element {
  const { t, info, n } = props
  const [sound, setSound] = useState<TakeSound | null>(null)
  useEffect(() => {
    let live = true
    setSound(null)
    void t.loadSound(info).then((s) => {
      if (live) setSound(s)
    })
    return () => {
      live = false
    }
  }, [info.name])
  const frames = info.frames
  const rate = Math.max(1, info.rate)
  const least = Math.min(TakeTrim.minFrames(rate), frames)
  const [startState, setStart] = useState(info.trim?.start ?? 0)
  const [endState, setEnd] = useState(info.trim?.end ?? frames)
  const start = coerce(startState, 0, frames - least)
  const end = coerce(endState, start + least, frames)
  const secs = (f: number): number => f / rate
  const step = Math.max(1, Math.trunc(rate / 2))

  // The playhead: where the part has got to since PLAY, by the clock.
  const playing = useIs(t.playing, t.trimKeyOf(info))
  const playFrom = useRef(0)
  const [playAt, setPlayAt] = useState(0)
  const head = useRef<number | null>(null)
  const headLine = useRef<HTMLDivElement>(null)
  const headTime = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const show = (h: number | null): void => {
      head.current = h
      const line = headLine.current
      const time = headTime.current
      if (line !== null) {
        line.hidden = h === null
        if (h !== null) line.style.left = `${(h / Math.max(1, frames)) * 100}%`
      }
      if (time !== null) time.textContent = h === null ? '' : '▶ ' + MirrorText.trimTime(secs(h))
    }
    show(null)
    if (!playing) return
    let raf = 0
    const tick = (now: number): void => {
      show(coerce(playFrom.current + Math.trunc(((now - playAt) * rate) / 1000), 0, frames))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, playAt])

  // The pointer down on the wave, until it lets go; the handle it moves once
  // it is a drag: -1 the start, 1 the end, 0 none yet.
  const press = useRef<{ id: number; x: number; y: number; far: boolean } | null>(null)
  const moving = useRef(0)
  const wave = useRef<HTMLDivElement>(null)
  const at = (x: number): number => {
    const box = wave.current?.getBoundingClientRect()
    if (!box || box.width <= 0) return 0
    return coerce(Math.trunc(((x - box.left) / box.width) * frames), 0, frames)
  }
  const nearer = (x: number): -1 | 1 => {
    const f = at(x)
    return Math.abs(f - start) <= Math.abs(f - end) ? -1 : 1
  }
  const move = (x: number): void => {
    const f = at(x)
    if (moving.current < 0) setStart(Math.min(f, end - least))
    else setEnd(Math.max(f, start + least))
  }
  const onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 || press.current !== null) return
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, far: false }
    moving.current = 0
  }
  const onPointerMove = (e: PointerEvent): void => {
    const p = press.current
    if (p === null || e.pointerId !== p.id) return
    if (moving.current !== 0) {
      move(e.clientX)
      return
    }
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    if (Math.hypot(dx, dy) > TOUCH_SLOP) p.far = true
    // detectHorizontalDragGestures: sideways past the slop.
    if (Math.abs(dx) > TOUCH_SLOP && Math.abs(dx) > Math.abs(dy)) {
      moving.current = nearer(p.x)
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
      move(e.clientX)
    }
  }
  const onPointerUp = (e: PointerEvent): void => {
    const p = press.current
    if (p === null || e.pointerId !== p.id) return
    // detectTapGestures: let go within the slop.
    if (moving.current === 0 && !p.far) {
      moving.current = nearer(e.clientX)
      move(e.clientX)
    }
    press.current = null
    moving.current = 0
  }
  const onPointerCancel = (e: PointerEvent): void => {
    if (press.current?.id !== e.pointerId) return
    press.current = null
    moving.current = 0
  }
  const onHandleKey = (edge: -1 | 1) => (e: KeyboardEvent): void => {
    const k = sliderKey(e.key)
    if (k === null) return
    e.preventDefault()
    e.stopPropagation()
    if (edge < 0) setStart('to' in k ? (k.to === 'min' ? 0 : end - least) : coerce(start + k.step * step, 0, end - least))
    else setEnd('to' in k ? (k.to === 'min' ? start + least : frames) : coerce(end + k.step * step, start + least, frames))
  }

  // The Start slider takes the focus as the wave opens (TRIM, which had it, is gone).
  const startHandle = useRef<HTMLDivElement>(null)
  const opened = sound !== null
  useEffect(() => {
    const now = document.activeElement
    if (opened && (now === null || now === document.body)) startHandle.current?.focus()
  }, [opened])

  // A handle; its line stays whole on the wave at either end (Kotlin's x coerced into [w/2, width - w/2]).
  const handle = (edge: -1 | 1): JSX.Element => {
    const f = edge < 0 ? start : end
    const word = edge < 0 ? MirrorText.TRIM_START : MirrorText.TRIM_END
    return (
      <div
        ref={edge < 0 ? startHandle : undefined}
        class="take-trim__handle"
        style={{ left: `clamp(1.5px, ${(f / Math.max(1, frames)) * 100}%, calc(100% - 1.5px))` }}
        role="slider"
        tabIndex={0}
        aria-label={word}
        aria-valuemin={0}
        aria-valuemax={secs(frames)}
        aria-valuenow={secs(f)}
        aria-valuetext={MirrorText.trimTime(secs(f))}
        aria-description={edge < 0 ? `${MirrorText.TRIM_START_EARLIER}, ${MirrorText.TRIM_START_LATER}` : `${MirrorText.TRIM_END_EARLIER}, ${MirrorText.TRIM_END_LATER}`}
        onKeyDown={onHandleKey(edge)}
      />
    )
  }

  const keys: JSX.Element[] = [
    <DeckKey
      key="play"
      glyph={playing ? 'stop' : 'play'}
      label={playing ? FeatureText.STOP : FeatureText.PLAY}
      description={playing ? FeatureText.STOP : FeatureText.PLAY_SELECTION}
      onClick={() => {
        if (playing) {
          t.onStop()
        } else {
          playFrom.current = start
          setPlayAt(performance.now())
          t.onTrimPlay(info, start, end)
        }
      }}
      style={playing ? 'navy' : 'normal'}
      enabled={playing || sound !== null}
    />,
    <DeckKey
      key="start"
      glyph="start"
      label={MirrorText.TRIM_START}
      description={MirrorText.trimMark(MirrorText.TRIM_START, playing)}
      onClick={() => {
        const h = head.current
        if (h !== null) setStart(Math.min(h, end - least))
      }}
      enabled={playing}
      focusable
    />,
    <DeckKey
      key="end"
      glyph="end"
      label={MirrorText.TRIM_END}
      description={MirrorText.trimMark(MirrorText.TRIM_END, playing)}
      onClick={() => {
        const h = head.current
        if (h !== null) setEnd(Math.max(h, start + least))
        t.onStop()
      }}
      enabled={playing}
      focusable
    />,
    <DeckKey
      key="reset"
      glyph="reset"
      label={MirrorText.TRIM_RESET}
      description={MirrorText.TRIM_RESET}
      onClick={() => {
        setStart(0)
        setEnd(frames)
      }}
      enabled={start !== 0 || end !== frames}
    />,
    <DeckKey
      key="done"
      glyph="done"
      label={MirrorText.TRIM_DONE}
      description={MirrorText.TRIM_DONE}
      onClick={() => {
        if (playing) t.onStop()
        t.onSetTrim(info, TakeTrim.of(start, end, frames, rate))
        props.onClose()
      }}
      style="signal"
    />,
  ]

  return (
    <>
      <div class="take-trim">
        <div class="take-trim__head">
          <span class="take-trim__sub is-signal">{'✂ ' + MirrorText.TRIM_HEAD.toUpperCase()}</span>
          <span class="take-trim__sub take-trim__grow">{' ' + MirrorText.takeNumber(n)}</span>
          <span class="take-trim__sub">{MirrorText.takeLength(info.seconds)}</span>
        </div>
        <div class="take-trim__part" aria-hidden="true">
          <span class="take-trim__length">{MirrorText.takeLength(secs(end - start))}</span>
          <span class="take-trim__sub">{MirrorText.trimSpan(secs(start), secs(end))}</span>
        </div>
        {sound === null ? (
          <div class="take-trim__opening">
            <span class="take-trim__sub">{FeatureText.OPENING.toUpperCase()}</span>
          </div>
        ) : (
          <div
            ref={wave}
            class="take-trim__wave"
            style={{ height: `${BOX}px` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            <Waveform
              pcm={sound.pcm}
              channels={sound.channels}
              start={start}
              end={end}
              label={MirrorText.takeTrimDescription(n, secs(start), secs(end))}
              height={BOX - KNOB * 2}
              columns={COLUMNS}
              class="take-trim__canvas"
            />
            {handle(-1)}
            {handle(1)}
            <div ref={headLine} class="take-trim__head-line" style={{ height: `${BOX - KNOB * 2}px` }} hidden aria-hidden="true" />
          </div>
        )}
        <div class="take-trim__foot" aria-hidden="true">
          <span class="take-trim__sub take-trim__small take-trim__grow">{MirrorText.TRIM_DRAG.toUpperCase()}</span>
          <span ref={headTime} class="take-trim__sub take-trim__small is-ink" />
        </div>
      </div>
      <p class="t-tiny takes__hint">{MirrorText.TRIM_TAP_HINT}</p>
      <DeckStrip keys={keys} />
    </>
  )
}
