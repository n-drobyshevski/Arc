// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/LivePractice.kt (PracticeHeader, PlayStopChip, PracticeDeck,
// Lane, Result, PracticeKey)
//
// PRACTICE on Live (an addition): play along with a pattern. Its panel's
// header names what is practised with ▶ or ■ and how it goes; under it the
// lane, each pad played a row and its next hits coming in from the right to
// the orange line, and the keys WAIT, the speed, the bars looped and the
// backing. After a stop the lane gives way to how it went, with COPY.
// Meanwhile Live's pads light ahead of each hit (practice.tsx's cues).
//
// Web deltas:
// - A chunk of its own (practice.tsx's PracticeSlot). The panel takes the
//   function keys' place, with its own header, unrolling there as it mounts
//   (MirrorScreen.css), as STEP's does; Escape ends the practice, as Back.
// - The lane is a canvas drawn on the frame clock while it plays; the
//   header's counts follow the frames, re-rendering it only when they change.
// - A card's lesson (STEP 2/4, the step's line, ‹ ›, the steps' results)
//   comes with lesson lines, not ported yet.

import type { JSX } from 'preact'
import { useComputed } from '@preact/signals'
import { useEffect, useRef, useState } from 'preact/hooks'
import { Seq } from '../../core/features/pattern'
import { PracticeCounts, PracticeSpec, type PracticeCounts as Counts } from '../../core/features/practice'
import { PracticeText } from '../../core/text/practiceText'
import type { PracticeUi } from '../../state/practicePlan'
import { useFingerTick } from '../useHaptic'
import { usePractice, type PracticeActions } from './practice'
import { Spoken } from './spoken'
import './PracticePanel.css'

/** The bars LOOP steps through: the whole pattern, then its first 1, 2 and 4. */
const LOOPS: readonly (number | null)[] = [null, 1, 2, 4]

/** The lane shows this many pads; more share the last row's room unshown. */
const MAX_ROWS = 6

/** Where the orange line stands across the lane. */
const HEAD_AT = 0.12

/** A hit this hard is an accent, drawn orange. */
const ACCENT = 114

/** The PRACTICE panel, on the line's dark screen: its header, then the lane (or how it went) and its keys. */
export function PracticePanel(props: { class?: string }): JSX.Element | null {
  const p = usePractice()
  // Its keys tick under a finger, as STEP's do.
  const feel = useFingerTick()
  const ui = p?.ui ?? null
  const running = useComputed(() => p?.running ?? false).value
  if (p === null || ui === null) return null
  return (
    <section class={`practice-panel${props.class ? ` ${props.class}` : ''}`} aria-label={PracticeText.PANE} onPointerDownCapture={feel}>
      <PracticeHeader p={p} ui={ui} running={running} />
      <PracticeDeck p={p} ui={ui} running={running} />
    </section>
  )
}

/**
 * ▶ or ■, "PRACTICE A · 01", how it goes ("12/14 ON TIME", WAIT's step) and
 * ✕. A screen reader hears the counts as they change (at most once a second).
 */
function PracticeHeader(props: { p: PracticeActions; ui: PracticeUi; running: boolean }): JSX.Element {
  const { p, ui, running } = props
  const [counts, setCounts] = useState<Counts>(ui.counts)
  useEffect(() => {
    setCounts(ui.counts)
    if (!running || typeof requestAnimationFrame === 'undefined') return
    let raf = 0
    const frame = (): void => {
      const c = p.frame(performance.now())?.counts
      // The same object while nothing was marked: no render.
      if (c !== undefined) setCounts(c)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [running, ui])
  const hits = PracticeCounts.hits(counts)
  const status = ui.spec.wait ? PracticeText.waitStep(ui.waitStep, ui.waitSteps) : hits > 0 ? PracticeText.onTime(counts.onTime, hits) : PracticeText.READY
  return (
    <div class="practice-panel__head">
      {!ui.spec.wait && (
        <button
          type="button"
          class={`step-chip practice-chip${running ? ' is-on' : ''}`}
          aria-label={running ? PracticeText.STOP : PracticeText.PLAY}
          onClick={() => (running ? p.onStop() : p.onPlay())}
        >
          <span class={running ? 'practice-chip__stop' : 'step-chip__play'} aria-hidden="true" />
        </button>
      )}
      <span class="practice-panel__place" aria-hidden="true">
        {PracticeText.head(ui.place).toUpperCase()}
      </span>
      <span class="practice-panel__status" aria-hidden="true">
        {status.toUpperCase()}
      </span>
      <Spoken text={hits > 0 ? PracticeText.said(counts.onTime, hits) : status} />
      <button type="button" class="step-panel__close" aria-label={PracticeText.CLOSE} onClick={() => p.onClose()}>
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  )
}

/**
 * The lane (or, stopped after playing, how it went: the share in time, the
 * counts and the pad most often off), then WAIT, the speed (50, 75, 100%), the
 * bars looped (all, 1, 2, 4) and BACKING (the rest of the scene underneath).
 */
function PracticeDeck(props: { p: PracticeActions; ui: PracticeUi; running: boolean }): JSX.Element {
  const { p, ui, running } = props
  const s = ui.spec
  const stopped = !running && !s.wait && PracticeCounts.hits(ui.counts) > 0
  return (
    <div class="practice-panel__deck">
      <div class="practice-panel__lane">{stopped ? <Result ui={ui} onCopy={() => p.onCopy()} /> : <Lane p={p} ui={ui} running={running} />}</div>
      <div class="practice-panel__keys">
        <PracticeKey word={PracticeText.WAIT} on={s.wait} description={PracticeText.WAIT_NAME} onClick={() => p.onChange((x) => ({ ...x, wait: !x.wait }))} />
        <PracticeKey
          word={PracticeText.speed(s.speed)}
          sub={String(ui.bpm)}
          on
          latch={false}
          description={PracticeText.speedName(s.speed, ui.bpm)}
          onClick={() => p.onChange((x) => ({ ...x, speed: PracticeSpec.SPEEDS[(PracticeSpec.SPEEDS.indexOf(x.speed) + 1) % PracticeSpec.SPEEDS.length]! }))}
        />
        <PracticeKey
          word={PracticeText.loop(s.bars)}
          on
          latch={false}
          description={PracticeText.loopName(s.bars)}
          onClick={() => p.onChange((x) => ({ ...x, bars: LOOPS[(LOOPS.indexOf(x.bars) + 1) % LOOPS.length]! }))}
        />
        <PracticeKey word={PracticeText.BACKING} on={s.backing} description={PracticeText.BACKING_NAME} onClick={() => p.onChange((x) => ({ ...x, backing: !x.backing }))} />
      </div>
    </div>
  )
}

function cssVar(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim()
  return v || fallback
}

/**
 * The lane: a row for each pad played, named, its hits not yet played as
 * marks coming in from the right (accents orange) to the orange line, the
 * beats as hairlines; a bar ahead. In WAIT the line stands at the step waited
 * for.
 */
function Lane(props: { p: PracticeActions; ui: PracticeUi; running: boolean }): JSX.Element {
  const { p, ui, running } = props
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const rows = ui.pads.slice(0, MAX_ROWS)
  useEffect(() => {
    const el = canvas.current
    if (el === null) return
    const signal = cssVar(el, '--signal', '#FF4C00')
    const ink = cssVar(el, '--display-ink', '#E8E9E1')
    const off = cssVar(el, '--segment-off', '#3A3D36')
    const draw = (): void => {
      const ctx = el.getContext('2d')
      if (ctx === null) return
      const w = el.clientWidth
      const h = el.clientHeight
      const dpr = window.devicePixelRatio || 1
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr)
        el.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const f = p.frame(performance.now())
      const head = w * HEAD_AT
      const span = w - head
      const ahead = Seq.TICKS_PER_BAR
      const x = (d: number): number => head + (d / ahead) * span
      const tick = f?.tick ?? 0
      // The beats' hairlines, moving with the beat.
      ctx.fillStyle = off
      for (let b = Math.floor(tick / Seq.PPQN) * Seq.PPQN; b <= tick + ahead; b += Seq.PPQN) {
        const bx = x(b - tick)
        if (bx >= 0) ctx.fillRect(bx, 0, 1, h)
      }
      const rowH = h / Math.max(rows.length, 1)
      const mark = Math.min(rowH * 0.55, 9)
      for (const [t, d] of f?.upcoming ?? []) {
        const r = rows.indexOf(t.offset)
        if (r < 0) continue
        const cx = x(d)
        if (cx < 0 || cx > w) continue
        ctx.fillStyle = t.velocity >= ACCENT ? signal : ink
        const top = rowH * r + (rowH - mark) / 2
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath()
          ctx.roundRect(cx - mark / 2, top, mark, mark, 2)
          ctx.fill()
        } else {
          ctx.fillRect(cx - mark / 2, top, mark, mark)
        }
      }
      ctx.fillStyle = signal
      ctx.fillRect(head - 1, 0, 2, h)
    }
    draw()
    if (!running || typeof requestAnimationFrame === 'undefined') return
    let raf = 0
    const frame = (): void => {
      draw()
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [running, ui])
  return (
    <div class="practice-lane" role="img" aria-label={ui.spec.wait ? PracticeText.WAIT_HINT : PracticeText.START_HINT}>
      {/* A name to each row, centred on the row's marks. */}
      <div class="practice-lane__names" aria-hidden="true">
        {rows.map((o) => (
          <span key={o} class="practice-lane__name">
            {(ui.names.get(o) ?? '').toUpperCase()}
          </span>
        ))}
      </div>
      <canvas ref={canvas} class="practice-lane__marks" aria-hidden="true" />
    </div>
  )
}

/** Stopped after playing: the share in time large, the counts, the pad most often off in orange. COPY puts how it went on the clipboard. */
function Result(props: { ui: PracticeUi; onCopy(): void }): JSX.Element {
  const { ui } = props
  const n = ui.counts
  const hits = PracticeCounts.hits(n)
  const worst = ui.worst
  return (
    <div class="practice-result">
      <div class="practice-result__text" role="status">
        <span class="practice-result__percent">{PracticeText.result(PracticeCounts.percent(n)).toUpperCase()}</span>
        <span class="practice-result__counts">
          {(PracticeText.counts(hits, n.onTime, n.early, n.late, n.missed, n.extra) + ' · ' + PracticeText.passes(n.passes)).toUpperCase()}
        </span>
        {worst !== null && <span class="practice-result__worst">{PracticeText.worst(ui.names.get(worst[0]) ?? '', worst[1]).toUpperCase()}</span>}
      </div>
      <PracticeKey word={PracticeText.COPY_REPORT} sub={PracticeText.COPY_REPORT_SUB} on latch={false} description={PracticeText.COPY_REPORT_NAME} wide onClick={props.onCopy} />
    </div>
  )
}

/**
 * A key on the panel's dark screen: its [word] (and [sub] under it); a latch
 * ([latch]: WAIT, BACKING) filled orange while [on], a switch for screen
 * readers; a stepping key (the speed, the loop) outlined.
 */
function PracticeKey(props: {
  word: string
  sub?: string
  on: boolean
  description: string
  latch?: boolean
  wide?: boolean
  onClick(): void
}): JSX.Element {
  const latch = props.latch ?? true
  const filled = latch && props.on
  return (
    <button
      type="button"
      role={latch ? 'switch' : undefined}
      aria-checked={latch ? props.on : undefined}
      aria-label={props.description}
      class={`practice-key${filled ? ' is-on' : ''}${props.wide ? ' practice-key--wide' : ''}`}
      onClick={() => props.onClick()}
    >
      <span class="practice-key__word" aria-hidden="true">
        {props.word.toUpperCase()}
      </span>
      {props.sub !== undefined && (
        <span class="practice-key__sub" aria-hidden="true">
          {props.sub}
        </span>
      )}
    </button>
  )
}
