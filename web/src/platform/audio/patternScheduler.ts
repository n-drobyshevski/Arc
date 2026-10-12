// Port of app/src/main/kotlin/dev/arc/ep133/audio/PatternScheduler.kt
// (and ClickSound.kt's sound)
//
// The pattern sequencer on Live's output: MixerHost (liveMixer.ts) runs it in
// the audio thread before each render, and it sends the notes that start in
// the next lookahead to the mixer as timed starts and releases, each on its
// frame.
//
// Web deltas:
// - It runs in the AudioWorklet, so the main thread reaches it only through
//   messages: the plan (SeqPlan, its sounds by the ids MixerHost holds them
//   under), play and stop. The timeline goes back as the TransportClock alone
//   ([onTimeline]); the main thread pairs it with the output's stamp it keeps
//   itself (liveAudio.ts), as Timeline does with Kotlin's FrameClock.
// - A press's frame comes worked out ([play]'s atFrame, from the main thread's
//   stamp), so there is no waiting for a stamp here, nor PRESS_WAIT_NS: a
//   press with no stamp anchors on the frames rendered (Kotlin's fallback).
// - No lost(): a new stream is a new worklet, and a new scheduler.
// - A queued switch's [freeTick] goes back to the main thread with the
//   output's stamps (liveMixer.ts), not as a volatile.
// - ArpPlan's press comes as the frame it was heard at ([ArpPlan.atFrame],
//   from the main thread's stamp; null: the frames rendered) and the run's
//   identity as its press time ([ArpPlan.pressMs]), not System.nanoTime; a
//   step for RECORD goes back as a message ([onArpStep]). No frames lost.
// - The count-in's click is MixerHost's (clickScheduler.ts), on [clock]'s
//   beats while [countingIn]: Kotlin's controller turns its click stream on
//   for it.
// - Times are frames and milliseconds; Kotlin's Long ticks are whole numbers.

import { Arp, type ArpNote, type ArpSettings } from '../../core/features/arp'
import { Keys } from '../../core/features/keys'
import { ProjectPatterns, Seq, projectPatterns, swingOffset, timingTicks, type Pattern, type Timing, type TimingSettings } from '../../core/features/pattern'
import {
  PatternPlayer,
  PhaseAnchors,
  framesPerTick,
  frameOf,
  retempo,
  tickAt,
  transportClock,
  type SeqNote,
  type TransportClock,
} from '../../core/features/sequencer'
import { BEATS_PER_BAR, DEFAULT as DEFAULT_BPM } from '../../core/features/tempo'
import { VoiceMixer, VoiceShape } from '../../core/formats/voiceMixer'

/** A pad's sound as the pattern plays it: the mixer's sample [id], shaped by [shape] for a pad hit and [keysShape] for a KEYS note. */
export interface PadVoice {
  readonly id: number
  readonly channels: number
  readonly rate: number
  readonly shape: VoiceShape
  readonly keysShape: VoiceShape
}

/** A pattern waiting to take over a group (a pick made while the sequencer plays): [pattern] plays from global tick [atTick] on. */
export interface QueuedSwitch {
  readonly pattern: Pattern
  readonly atTick: number
}

/**
 * What the sequencer plays: the project's [patterns], the sounds on their
 * pads ([voices], by pad key group × 12 + offset; a note on a pad not in it
 * is told to [PatternScheduler.onMissing]), [skip] (a note's id to the pass
 * not to play) and the tempo, [bpm]. [queued] gives a group (0..3) the
 * pattern that takes over from a tick: its notes before the tick come from
 * [patterns], those from it on from the queued one, which starts at its bar
 * 1 on that tick. Each group's pattern loops from its own anchor in [phase].
 * Made anew for each change, never changed in place.
 */
export interface SeqPlan {
  readonly patterns: ProjectPatterns
  readonly voices: ReadonlyMap<number, PadVoice>
  readonly skip: ReadonlyMap<number, number>
  readonly bpm: number
  readonly phase: PhaseAnchors
  readonly queued?: ReadonlyMap<number, QueuedSwitch>
}

export const EMPTY_PLAN: SeqPlan = {
  patterns: projectPatterns(),
  voices: new Map(),
  skip: new Map(),
  bpm: DEFAULT_BPM,
  phase: PhaseAnchors.ZERO,
}

/**
 * What the arp or note repeat plays (an addition): the [notes] held, in the
 * order pressed (latched ones too), the sounds on their pads ([voices], by
 * pad key), whether it is KEYS's arp ([keys]) or PADS's note repeat, TIMING
 * and the arp's settings, the tempo ([bpm]), the RANDOM order's [seed], and
 * the press that started the run: when ([pressMs]; another one starts the run
 * again, its first step on that press) and the mix frame it was heard at
 * ([atFrame]; null when not known: the frames rendered). Made anew for each
 * change, never changed in place.
 */
export interface ArpPlan {
  readonly notes: readonly ArpNote[]
  readonly voices: ReadonlyMap<number, PadVoice>
  readonly keys: boolean
  readonly timing: TimingSettings
  readonly settings: ArpSettings
  readonly bpm: number
  readonly seed: number
  readonly pressMs: number
  readonly atFrame: number | null
}

/** A note the arp played at [globalTick] of the pattern's clock, [gateTicks] long: for RECORD. */
export interface ArpStep {
  readonly note: ArpNote
  readonly globalTick: number
  readonly gateTicks: number
}

/** Where the scheduler's timed commands go (Kotlin ScheduleSink): the mixer, with its samples. */
export interface ScheduleSink {
  startAt(key: string, voice: PadVoice, semitones: number, tag: number, shape: VoiceShape, frame: number): boolean
  releaseAt(key: string, frame: number, tag: number): void
  flushTimed(): void
}

/** How far ahead of the mix notes are sent (ms): past a stalled thread or two. */
export const LOOKAHEAD_MS = 50

/** The count-in's click: a short sine blip, 1.6 kHz on a beat, 2.4 kHz on a bar's first (ClickSound.kt). */
export const ClickSound = {
  FREQ: 1600,
  ACCENT_FREQ: 2400,
  ATTACK_S: 0.001,
  DECAY_S: 0.007,
  LENGTH_S: 0.03,
  FADE_S: 0.002,
  PEAK_DBFS: -7,

  /** The click at [rate] Hz, accented or not: mono 16-bit. */
  render(rate: number, accent: boolean): Int16Array {
    const n = Math.round(ClickSound.LENGTH_S * rate)
    const attack = ClickSound.ATTACK_S * rate
    const fade = ClickSound.FADE_S * rate
    const w = (2 * Math.PI * (accent ? ClickSound.ACCENT_FREQ : ClickSound.FREQ)) / rate
    const peak = 32767 * 10 ** (ClickSound.PEAK_DBFS / 20)
    const out = new Int16Array(n)
    for (let i = 0; i < n; i++) {
      const rise = i < attack ? 0.5 * (1 - Math.cos((Math.PI * i) / attack)) : 1
      const decay = i < attack ? 1 : Math.exp(-(i - attack) / (ClickSound.DECAY_S * rate))
      // The last sample is the fade's end: zero.
      const left = n - 1 - i
      const end = left < fade ? 0.5 * (1 - Math.cos((Math.PI * left) / fade)) : 1
      out[i] = Math.round(peak * rise * decay * end * Math.sin(w * i))
    }
    return out
  },
} as const

/** [shape] for a note at [velocity] (1..127): its gain times Arp.velocityGain; itself at 127. */
export function velocityShape(shape: VoiceShape, velocity: number): VoiceShape {
  const g = Arp.velocityGain(velocity)
  return g === 1 ? shape : { ...shape, gain: shape.gain * g }
}

// A gate whose release isn't sent yet.
const UNSENT = Number.NEGATIVE_INFINITY

/** A held note: its key, tag, end tick, and the frame its release was sent for (UNSENT). */
interface Held {
  key: string
  tag: number
  end: number
  sent: number
}

type Ask =
  | { readonly kind: 'play'; readonly countInBars: number; readonly leadMs: number; readonly atFrame: number | null; readonly atPress: boolean }
  | { readonly kind: 'stop' }

/**
 * The pattern sequencer: plays the plan's patterns into Live's mix in the
 * audio thread. Before each render ([fill]) it sends the notes that start in
 * the next [LOOKAHEAD_MS] as timed starts, each to its mix frame, and the
 * releases of the gates that end in it, so a note plays to the frame however
 * late the render runs, as long as it runs within the lookahead.
 *
 * The clock is arc's own (TransportClock): [play] anchors tick 0 a lookahead
 * (and the count-in's bars, and any lead asked for) after the frames
 * rendered so far, or on a pad's press's frame. A new plan's bpm takes over
 * where scheduling has got to. Notes are counted by tick across windows, so a
 * tempo change's rounding neither repeats a note nor skips one.
 *
 * A pad hit plays as voice "live:<group>:<offset>", the pad's own key (its
 * ring lights as for a press); a KEYS note as "seq:<group>:<offset>:<midi>".
 * Each gets a tag of its own below 0, so its release lets go of that voice
 * only (a press of the same pad plays on) and never counts as a press.
 *
 * [stop] drops what is still waiting and lets go of every note still sounding.
 */
export class PatternScheduler {
  /** What plays: set from the main thread's 'plan' messages. */
  plan: SeqPlan = EMPTY_PLAN

  /** A note whose pad has no PadVoice in the plan, once a plan: the main thread loads it. */
  onMissing: (pad: number) => void = () => {}

  /** The anchored clock, each time it changes (a start, a tempo); null when stopped. */
  onTimeline: (clock: TransportClock | null) => void = () => {}

  /** What the arp or note repeat plays: set from the main thread's 'arp' messages; null (or no notes) stops it. */
  arp: ArpPlan | null = null

  /** A step the arp played while the pattern's clock runs, once mixed: for RECORD. */
  get onArpStep(): ((s: ArpStep) => void) | null {
    return this.arpRunner.onStep
  }

  set onArpStep(f: ((s: ArpStep) => void) | null) {
    this.arpRunner.onStep = f
  }

  private readonly asks: Ask[] = []
  private on = false
  private clock: TransportClock | null = null
  private published: TransportClock | null = null
  // The first tick not yet sent, the mix frame scheduling has got to, and the count-in's first tick.
  private nextTick = 0
  private scheduledTo = 0
  private countFrom = 0
  private nextTag = -1
  private readonly notes: SeqNote[] = []
  // The queued patterns of the plan last switched in, as patterns playing from their own anchors.
  private switchOf: SeqPlan | null = null
  private switched: ProjectPatterns = projectPatterns()
  private switchedPhase: PhaseAnchors = PhaseAnchors.ZERO
  private readonly switchedNotes: SeqNote[] = []
  /**
   * The first tick a plan published now is sure to reach before it is sent
   * (for a [SeqPlan.queued] switch while it plays): a lookahead past the
   * first tick not sent yet. A switch at an earlier tick would find the old
   * pattern's notes from it sent already, and the queued one's never.
   * -Infinity until the transport's first block is sent.
   */
  freeTick = Number.NEGATIVE_INFINITY
  private held: Held[] = []
  private readonly arpRunner = new ArpRunner(() => this.nextTag--)
  private missingOf: SeqPlan | null = null
  private readonly missing = new Set<number>()

  constructor(private readonly lookaheadMs = LOOKAHEAD_MS) {}

  /** The transport plays (or counts in), or the arp does: the output's stamp is wanted. */
  get running(): boolean {
    return this.on || (this.arp !== null && this.arp.notes.length > 0)
  }

  /** The transport plays (or counts in); the arp alone doesn't count. */
  get transportOn(): boolean {
    return this.on
  }

  /** The anchored clock (null while stopped): the click follows its beats. */
  get clockNow(): TransportClock | null {
    return this.clock
  }

  /** Whether mix frame [frame] is in the count-in (the bars before tick 0 that [play] asked for). */
  countingIn(frame: number): boolean {
    const c = this.clock
    if (c === null || this.countFrom >= 0) return false
    const t = tickAt(c, frame)
    return t < 0 && t >= this.countFrom - Seq.PPQN / 2
  }

  /**
   * Starts the transport from tick 0, [countInBars] bars after the next
   * render's lookahead, and [leadMs] later still (time for a count-in's click
   * to start); playing already, it starts again. At a press ([atPress]),
   * tick 0 is [atFrame], the frame heard then (the frames rendered when it
   * isn't known), and notes up to a lookahead behind the mix still go.
   */
  play(countInBars: number, leadMs = 0, atFrame: number | null = null, atPress = atFrame !== null): void {
    this.on = true
    this.freeTick = Number.NEGATIVE_INFINITY
    this.asks.push({ kind: 'play', countInBars: Math.max(countInBars, 0), leadMs: Math.max(leadMs, 0), atFrame, atPress })
  }

  /** Stops it: on the next [fill], what waits is dropped and the notes sounding let go of. */
  stop(): void {
    this.on = false
    this.freeTick = Number.NEGATIVE_INFINITY
    this.asks.push({ kind: 'stop' })
  }

  /** Before a render: [rendered] mix frames are done, at [rate]; what falls ahead goes to [sink]. */
  fill(sink: ScheduleSink, rendered: number, rate: number): void {
    // The arp's steps mixed by now go to RECORD, before a flush below drops those not yet.
    this.arpRunner.mixed(rendered, false)
    this.fillPattern(sink, rendered, rate)
    const ahead = Math.floor((this.lookaheadMs * rate) / 1000)
    this.arpRunner.fill(sink, rendered, rate, ahead, this.arp, this.clock)
  }

  // The pattern's part of [fill]: the transport's asks, its anchor and the notes and gates of this window.
  private fillPattern(sink: ScheduleSink, rendered: number, rate: number): void {
    for (let a = this.asks.shift(); a !== undefined; a = this.asks.shift()) {
      this.flush(sink)
      if (a.kind === 'play') {
        this.anchor(a, rendered, rate)
      } else {
        this.clock = null
        this.publish()
      }
    }
    let c = this.clock
    if (c === null) return
    const p = this.plan
    if (p.bpm > 0 && p.bpm !== c.bpm) {
      c = retempo(c, Math.max(this.scheduledTo, rendered), p.bpm)
      this.clock = c
    }
    const ahead = Math.floor((this.lookaheadMs * rate) / 1000)
    const to = rendered + ahead
    // From the first tick not sent; one fallen further behind than the lookahead is let go.
    const from = Math.max(frameOf(c, this.nextTick), rendered - ahead)
    if (to > from) {
      PatternPlayer.window(p.patterns, c, from, to, p.skip, this.notes, p.phase)
      if (p.queued !== undefined && p.queued.size > 0) this.switchIn(p, c, from, to)
      for (const n of this.notes) this.start(sink, p, n)
      this.nextTick = firstTick(c, to)
    }
    this.freeTick = Math.max(this.nextTick, firstTick(c, to + ahead))
    this.scheduledTo = to
    this.releases(sink, c, to, rendered)
    this.publish()
  }

  // [notes] (the plan's patterns' window) with each queued group's notes from its switch's tick on taken from the queued pattern instead.
  private switchIn(p: SeqPlan, c: TransportClock, from: number, to: number): void {
    const queued = p.queued!
    if (this.switchOf !== p) {
      this.switchOf = p
      let q = projectPatterns()
      let ph = PhaseAnchors.ZERO
      for (const [g, sw] of queued) {
        if (g < 0 || g > 3) continue
        q = ProjectPatterns.with(q, g, sw.pattern)
        // The queued pattern starts at its bar 1 where it takes over.
        ph = PhaseAnchors.with(ph, g, sw.atTick)
      }
      this.switched = q
      this.switchedPhase = ph
    }
    PatternPlayer.window(this.switched, c, from, to, new Map(), this.switchedNotes, this.switchedPhase)
    const kept = this.notes.filter((n) => {
      const sw = queued.get(n.group)
      return sw === undefined || n.startTick < sw.atTick
    })
    for (const n of this.switchedNotes) {
      const sw = queued.get(n.group)
      if (sw !== undefined && n.startTick >= sw.atTick) kept.push(n)
    }
    kept.sort((a, b) => a.startTick - b.startTick || a.group - b.group)
    this.notes.length = 0
    this.notes.push(...kept)
  }

  private anchor(a: Extract<Ask, { kind: 'play' }>, rendered: number, rate: number): void {
    const bpm = this.plan.bpm > 0 ? this.plan.bpm : DEFAULT_BPM
    const start = a.atPress ? (a.atFrame ?? rendered) : rendered + Math.floor(((this.lookaheadMs + a.leadMs) * rate) / 1000)
    const count = Math.floor(a.countInBars * BEATS_PER_BAR * ((60 * rate) / bpm) + 0.5)
    const c = transportClock(start + count, rate, bpm)
    this.clock = c
    this.countFrom = -a.countInBars * Seq.TICKS_PER_BAR
    // At a press, notes up to a lookahead behind the mix still go (late); nothing before.
    const ahead = Math.floor((this.lookaheadMs * rate) / 1000)
    this.nextTick = firstTick(c, a.atPress ? rendered - ahead : rendered)
    this.scheduledTo = rendered
  }

  private publish(): void {
    if (this.published === this.clock) return
    this.published = this.clock
    this.onTimeline(this.clock)
  }

  private start(sink: ScheduleSink, p: SeqPlan, n: SeqNote): void {
    const o = n.note.offset
    if (n.group < 0 || n.group > 3 || o < 0 || o > 11) return
    const pad = n.group * 12 + o
    const v = p.voices.get(pad)
    if (v === undefined) {
      if (this.missingOf !== p) {
        this.missingOf = p
        this.missing.clear()
      }
      if (!this.missing.has(pad)) {
        this.missing.add(pad)
        this.onMissing(pad)
      }
      return
    }
    const semis = n.note.semitones
    const key = semis === null ? `live:${n.group}:${o}` : `seq:${n.group}:${o}:${Keys.ROOT_NOTE + semis}`
    const tag = this.nextTag--
    const shape = velocityShape(semis === null ? v.shape : v.keysShape, n.note.velocity)
    if (sink.startAt(key, v, semis ?? 0, tag, shape, n.startFrame)) {
      this.held.push({ key, tag, end: n.startTick + n.note.gate, sent: UNSENT })
    }
  }

  // The releases that fall before [to] are sent; a note is forgotten once its release is rendered.
  private releases(sink: ScheduleSink, c: TransportClock, to: number, rendered: number): void {
    const kept: Held[] = []
    for (const h of this.held) {
      if (h.sent === UNSENT) {
        const f = frameOf(c, h.end)
        if (f < to) {
          sink.releaseAt(h.key, f, h.tag)
          h.sent = f
        }
      }
      if (h.sent !== UNSENT && h.sent < rendered) continue
      kept.push(h)
    }
    this.held = kept
  }

  // What waits is dropped first, then every note sent and not over is let go of now (the arp's too).
  private flush(sink: ScheduleSink): void {
    sink.flushTimed()
    for (const h of this.held) sink.releaseAt(h.key, VoiceMixer.NOW, h.tag)
    this.held = []
    this.arpRunner.flushed(sink)
  }
}

// The first tick whose frame is at or after [frame].
function firstTick(c: TransportClock, frame: number): number {
  let t = Math.ceil(tickAt(c, frame)) - 1
  while (frameOf(c, t) < frame) t++
  return t
}

/** A note the arp sent and that isn't over: its key, tag, start and end frame, and whether its release is sent. */
interface ArpHeld {
  key: string
  tag: number
  start: number
  end: number
  sent: boolean
}

/**
 * The arp and note repeat as [PatternScheduler] plays them (an addition),
 * in the audio thread, after the pattern's notes in each [fill]. A step is
 * TIMING's interval, swung on its odd steps: while the transport runs, on
 * the pattern's own grid (step k at k × interval + swing, from tick 0), else
 * on a clock of its own whose step 0 is the frame the run's press was heard
 * at (with none known, the frames rendered). A run that starts while the
 * transport runs plays its first step at the press all the same, and the
 * grid's after it, leaving out one less than half a step on.
 *
 * KEYS (the arp) plays one note of Arp.cycle a step, PADS (note repeat)
 * every pad held. Each step's notes play as "arp:<group>:<offset>:<semitones>"
 * ("n" for a pad hit), with a tag of their own below 0 ([tag]), and let go
 * of Arp.gateTicks later. Steps are counted across windows, so a tempo or
 * plan change neither repeats a step nor skips one; a new plan's notes play
 * from the next step on (what was sent, at most a lookahead, plays out).
 * With no plan, every arp voice sounding is let go of where the mix is.
 *
 * Its gates are kept in frames, not ticks: a run may go from its own clock
 * to the pattern's (PLAY) and back (STOP) while a note sounds.
 */
export class ArpRunner {
  /** A step played on the pattern's clock (not on the arp's own), told once mixed ([mixed]): for RECORD. */
  onStep: ((s: ArpStep) => void) | null = null

  // The plan the cycle is of, and the run's press (a new one starts the run again); active while it plays.
  private shown: ArpPlan | null = null
  private cycle: readonly ArpNote[] = []
  private runPress = 0
  private active = false
  // The steps played this run: the cycle's index.
  private count = 0
  // The arp's own clock while the transport is stopped; whether it steps on the pattern's grid instead.
  private free: TransportClock | null = null
  private onGrid = false
  // The next step of the grid in use, its interval and swing, and the frame scheduling has got to.
  private nextStep = 0
  private stepInterval: Timing | null = null
  private stepSwing = 50
  private scheduledTo = 0
  // What was sent may be gone (flushed): steps go from the frames rendered again.
  private resync = false
  private held: ArpHeld[] = []
  // The steps for [onStep] not mixed yet, and their frames: a flush drops them, unheard, unrecorded.
  private told: { step: ArpStep; frame: number }[] = []

  constructor(private readonly tag: () => number) {}

  /**
   * Before a block: [rendered] frames done at [rate], [ahead] frames of
   * lookahead. [grid] is the pattern's clock while it runs.
   */
  fill(sink: ScheduleSink, rendered: number, rate: number, ahead: number, plan: ArpPlan | null, grid: TransportClock | null): void {
    const to = rendered + ahead
    const p = plan !== null && plan.notes.length > 0 ? plan : null
    if (p === null) {
      if (this.active) this.stop(sink, rendered)
      this.releases(sink, to, rendered)
      return
    }
    const restart = !this.active || p.pressMs !== this.runPress
    if (p !== this.shown) {
      this.shown = p
      this.cycle = p.keys ? Arp.cycle(p.notes, p.settings.order, p.settings.octaves) : Arp.repeatNotes(p.notes)
    }
    if (restart) {
      this.active = true
      this.runPress = p.pressMs
      this.count = 0
    }
    const interval = p.timing.interval
    const ticks = timingTicks(interval)
    const swing = p.timing.swing
    const gate = Arp.gateTicks(interval, p.settings.gate)
    // Where the press was heard; up to a lookahead behind the mix, as a press's pattern notes go.
    const press = restart ? Math.max(p.atFrame ?? rendered, rendered - ahead) : 0
    let c: TransportClock
    if (grid !== null) {
      c = grid
      if (restart) {
        // The press plays at once; the grid's steps go on from half a step after it.
        const t = tickAt(c, press)
        this.step(sink, p, c, Math.floor(t + 0.5), press, gate, true)
        const after = t + ticks / 2
        this.nextStep = firstStep(after, ticks, (k) => k * ticks + swingOffset(interval, k, swing) >= after)
      } else if (!this.onGrid || this.resync || interval !== this.stepInterval) {
        // From the pattern's next step on: the transport started, steps were dropped, or another interval.
        const from = this.onGrid && !this.resync ? this.scheduledTo : rendered
        this.nextStep = firstStep(tickAt(c, from), ticks, (k) => frameOf(c, k * ticks + swingOffset(interval, k, swing)) >= from)
      }
      this.onGrid = true
      this.free = null
    } else {
      const bpm = p.bpm > 0 ? p.bpm : DEFAULT_BPM
      let f = this.free
      if (restart || f === null || this.onGrid || this.resync || f.rate !== rate) {
        // Step 0 on the press, or (the transport stopped, steps dropped) where the mix is.
        f = transportClock(restart ? press : rendered, rate, bpm)
        this.nextStep = 0
      } else if (interval !== this.stepInterval) {
        // Another interval: its step 0 where the old one's next step was.
        const old = this.stepInterval ?? interval
        f = transportClock(frameOf(f, this.nextStep * timingTicks(old) + swingOffset(old, this.nextStep, this.stepSwing)), rate, f.bpm)
        this.nextStep = 0
      } else if (bpm !== f.bpm) {
        f = retempo(f, Math.max(this.scheduledTo, rendered), bpm)
      }
      this.onGrid = false
      this.free = f
      c = f
    }
    this.stepInterval = interval
    this.stepSwing = swing
    this.resync = false
    let k = this.nextStep
    for (;;) {
      const t = k * ticks + swingOffset(interval, k, swing)
      const f = frameOf(c, t)
      if (f >= to) break
      // One fallen further behind than the lookahead is let go.
      if (f >= rendered - ahead) this.step(sink, p, c, t, f, gate, grid !== null)
      k++
    }
    this.nextStep = k
    this.scheduledTo = to
    this.releases(sink, to, rendered)
  }

  /** What was sent and waits is gone (ScheduleSink.flushTimed): every arp voice is let go of now, and steps go on from the mix. */
  flushed(sink: ScheduleSink): void {
    for (const h of this.held) sink.releaseAt(h.key, VoiceMixer.NOW, h.tag)
    this.held = []
    this.resync = true
    // Never heard, so not for RECORD either.
    this.mixed(Number.NEGATIVE_INFINITY, true)
  }

  /**
   * Before a block, [rendered] frames done: the steps on the pattern's clock
   * mixed by now are told ([onStep]); [lost] (the frames gone), none still
   * waiting ever is.
   */
  mixed(rendered: number, lost: boolean): void {
    if (this.told.length === 0) return
    const kept: { step: ArpStep; frame: number }[] = []
    for (const t of this.told) {
      if (lost) continue
      if (t.frame < rendered) this.onStep?.(t.step)
      else kept.push(t)
    }
    this.told = kept
  }

  // The run ends: the voices sounding are let go of at [rendered]; those sent to start later play out their gate.
  private stop(sink: ScheduleSink, rendered: number): void {
    for (const h of this.held) {
      if (h.start >= rendered || (h.sent && h.end <= rendered)) continue
      sink.releaseAt(h.key, rendered, h.tag)
      h.end = rendered
      h.sent = true
    }
    this.active = false
    this.shown = null
    this.cycle = []
    this.free = null
    this.onGrid = false
  }

  // Step [tick] at [frame]: the arp's note, or every pad held; [recorded] on the pattern's clock.
  private step(sink: ScheduleSink, p: ArpPlan, c: TransportClock, tick: number, frame: number, gate: number, recorded: boolean): void {
    const end = frame + Math.floor(gate * framesPerTick(c) + 0.5)
    if (p.keys) {
      const n = Arp.noteAt(this.count, this.cycle, p.settings.order, p.seed)
      if (n !== null) this.play(sink, p, n, tick, frame, end, gate, recorded)
    } else {
      for (const n of this.cycle) this.play(sink, p, n, tick, frame, end, gate, recorded)
    }
    this.count++
  }

  private play(sink: ScheduleSink, p: ArpPlan, n: ArpNote, tick: number, frame: number, end: number, gate: number, recorded: boolean): void {
    const { group, offset } = n.pad
    if (group < 0 || group > 3 || offset < 0 || offset > 11) return
    const v = p.voices.get(group * 12 + offset)
    if (v === undefined) return
    const semis = n.semitones
    const key = `arp:${group}:${offset}:${semis ?? 'n'}`
    const t = this.tag()
    const shape = velocityShape(semis === null ? v.shape : v.keysShape, n.velocity)
    if (!sink.startAt(key, v, semis ?? 0, t, shape, frame)) return
    this.held.push({ key, tag: t, start: frame, end, sent: false })
    if (recorded && this.onStep !== null) this.told.push({ step: { note: n, globalTick: tick, gateTicks: gate }, frame })
  }

  // The releases that fall before [to] are sent; a note is forgotten once its release is rendered.
  private releases(sink: ScheduleSink, to: number, rendered: number): void {
    if (this.held.length === 0) return
    const kept: ArpHeld[] = []
    for (const h of this.held) {
      if (!h.sent && h.end < to) {
        sink.releaseAt(h.key, h.end, h.tag)
        h.sent = true
      }
      if (h.sent && h.end < rendered) continue
      kept.push(h)
    }
    this.held = kept
  }
}

// The first step [at] holds for, the steps rising: from two below the one at [tick] (a swing is under a step).
function firstStep(tick: number, ticks: number, at: (k: number) => boolean): number {
  let k = Math.floor(tick / ticks) - 2
  while (!at(k)) k++
  return k
}
