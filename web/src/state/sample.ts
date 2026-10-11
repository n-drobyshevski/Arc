// Port of app/src/main/kotlin/dev/arc/ep133/controller/ArcController.kt (its SAMPLE section)
//
// SAMPLE (an addition, after the EP-133's sampler): recording into a pad.
// The mode opens on an input, metering it at once; holding a pad records
// into it from that moment until the finger lifts, or (LATCH) a tap records
// hands-free until STOP or a tap on its pad. Each take opens the review sheet
// (Settings → Review samples) or goes straight onto its pad: KEEP puts it on
// the pad at once (it plays from arc), and connected it uploads in the
// background, one at a time; offline it waits for the next connection's
// question as a recorded change. A take with no pad to go on goes to Takes.
//
// Web deltas:
// - The inputs are the mic (getUserMedia, as raw as the browser gives it,
//   into the audio worklet's input; MIC ST where it has two channels) and
//   RSP (Live's mix); the EP-133 over USB isn't offered. The mic is asked
//   for when SAMPLE opens on it or steps to it; refused, it isn't offered
//   again this page, and RSP stands in (as when it can't be opened).
// - BARS, the count-in, waiting for PLAY and PTN aren't here yet: a latched
//   take runs Free whatever BARS says.
// - Times are performance.now() ms; a press is placed by the output's stamp
//   (LiveAudio.sampleArm), not System.nanoTime.
// - Recordings live in the samples store (IndexedDB), not files/samples.
// - The device side (the upload onto a pad, the pad's names, the offline
//   changes the mirror shows) is the controller's, through [SampleHost].

import { signal, type ReadonlySignal, type Signal } from '@preact/signals'
import type { PadTarget } from '../core/features/liveMirror'
import { OfflinePads, SoundSource, type OfflinePad } from '../core/features/offlinePads'
import { padFromKey, padKey, type PhysicalPad } from '../core/features/padNotes'
import { SamplePhase } from '../core/features/sampleCapture'
import { toWavBytes } from '../core/features/sampleEdit'
import { SampleInput, SampleLimits, SampleName, type SampleSource } from '../core/features/sampleSource'
import { MirrorText } from '../core/text/mirrorText'
import { WebText } from '../core/text/webText'
import type { TapPhase, TapTake } from '../platform/audio/sampleTap'
import { decodeWav } from '../core/formats/wav'
import {
  type AppSettings,
  SAMPLE_BARS,
  SAMPLE_GAINS,
  SAMPLE_THRESHOLDS,
  sampleGain,
  withSampleGain,
} from '../platform/storage/settings'
import type { Deps } from './deps'
import type { LiveSounds } from './live'
import {
  SAMPLE_TAP_MS,
  SAMPLE_UI,
  connectedLocal,
  latchAfterTake,
  pickSampleInput,
  recordingsLetGo,
  reviewedPcm,
  sampleInputs,
  sampleMaxFrames,
  samplePress,
  sampleReviewOf,
  slotsTaken,
  stepFreeSlot,
  trimReview,
  withTrimSilence,
  type SampleReview,
  type SampleUiState,
} from './samplePlan'

/** What the SAMPLE desk asks of the controller: the device side, the pads' play, the toasts. */
export interface SampleHost {
  deps: Pick<Deps, 'liveAudio' | 'samples' | 'takes' | 'perfNow' | 'now' | 'settings'>
  live: Pick<LiveSounds, 'keepRecorded' | 'forgetRecorded' | 'loadOfflinePads' | 'setOfflinePads'>
  settings(): AppSettings
  changeSettings(change: (s: AppSettings) => AppSettings): void
  toast(text: string, error?: boolean): void
  toastWith(text: string, label: string, run: () => void): void
  /** Where [pad]'s sound is set, or null after a toast says why ([quiet]: none). */
  editTarget(pad: PhysicalPad, quiet?: boolean): PadTarget | null
  /** Connected, with Live's read of this connection: a kept recording uploads at once. */
  online(): boolean
  /** The device's free space in bytes as last read; null offline. */
  free(): number | null
  /** The device's slots in use, as listed. */
  deviceSlots(): ReadonlySet<number>
  /** Whether [pad] has a sound to play (a tap plays it). */
  padHasSound(pad: PhysicalPad): boolean
  /** The pads' play beside a take, as ever. */
  playPad(pad: PhysicalPad, hold: boolean, unsure: boolean, at: number): void
  releasePad(pad: PhysicalPad): void
  keepPad(pad: PhysicalPad): void
  cutPad(pad: PhysicalPad): void
  /** Opening SAMPLE: the STEP and scene panels and the pad sheet close, the click stops, PATTERN stops recording. */
  makeRoom(): void
  /** The offline changes changed: the mirror shows [pads] (connected: only those given). */
  localChanged(pads: OfflinePads): void
  /** The pad's sound changed: its settings are the new sound's own. */
  forgetPadSettings(t: PadTarget): void
  /**
   * [wav] onto [t]'s pad on the EP-133 ([slot], else the next free one),
   * named [name], its progress told: the slot it went into, or null after a
   * toast said why.
   */
  upload(name: string, wav: Uint8Array, t: PadTarget, slot: number | null, onProgress: (fraction: number) => void): Promise<number | null>
  /** Takes changed (a recording put there). */
  takesChanged(): void
}

/** A recording kept while connected, waiting its turn to upload: its [file], [pad], and the [slot] picked (null: the next free one); [held] is the slot its review showed. */
interface QueuedSample {
  readonly pad: PhysicalPad
  readonly file: string
  readonly slot: number | null
  readonly held: number | null
}

/** A press held, latched or unsure: its pad and when it came (performance.now() ms). */
interface PadAt {
  readonly pad: PhysicalPad
  readonly at: number
}

const samePad = (a: PhysicalPad | null | undefined, b: PhysicalPad | null | undefined): boolean =>
  a != null && b != null && a.group === b.group && a.offset === b.offset

/** The SAMPLE desk: the mode, the presses, the takes, the review and KEEP. */
export class SampleDesk {
  private readonly _ui: Signal<SampleUiState>
  /** SAMPLE mode, for its panel and its line. */
  readonly ui: ReadonlySignal<SampleUiState>
  private readonly _review = signal<SampleReview | null>(null)
  /** The take on the review sheet, if any. */
  readonly review: ReadonlySignal<SampleReview | null> = this._review
  private readonly _lastTake = signal<SampleReview['peaks'] | null>(null)
  /** The last take's waveform, for the panel's display while nothing records; null before the first. */
  readonly lastTake: ReadonlySignal<SampleReview['peaks'] | null> = this._lastTake

  private on = false
  private stereo = false
  // The input the tap is open on (null: none yet, or the mic still being asked for), and each opening's number.
  private opened: SampleInput | null = null
  private opening = 0
  // The mic refused for good this page (it isn't offered again), and whether it has two channels.
  private micRefused = false
  private micStereo = false
  private latch = false
  private tapPhase: TapPhase = { kind: 'ready' }
  private uploading: SamplePhase | null = null
  // The pad held down to record, and when; with LATCH an unsure press, and one on the hands-free take's pad.
  private held: PadAt | null = null
  private latchUnsure: PadAt | null = null
  private stopUnsure: PadAt | null = null
  // The pad whose press, still down, latched the hands-free take; the hands-free take's pad.
  private latchPress: PhysicalPad | null = null
  private latched: PhysicalPad | null = null
  // Pads played as ever while a take records, to let go of with their finger; a take asked of the tap and not over.
  private readonly played = new Set<number>()
  // A take asked of the tap that it hasn't said it is waiting for yet (its phase still the last one's).
  private armed = false
  private discarded: SampleReview | null = null
  // Recordings kept while connected, waiting to upload; the one going up; those going up, those that failed.
  private readonly queue: QueuedSample[] = []
  private upNow: QueuedSample | null = null
  private readonly goingUp = new Set<string>()
  private readonly failed = new Set<string>()
  private uploader: Promise<void> | null = null
  private readonly cleanups: (() => void)[] = []

  constructor(private readonly host: SampleHost) {
    this._ui = signal(this.uiNow())
    this.ui = this._ui
    const audio = host.deps.liveAudio
    if (audio.samplePhase) {
      this.cleanups.push(
        audio.samplePhase.subscribe((p) => {
          if (p.kind !== 'ready') this.armed = false
          this.tapPhase = p
          this.publish()
        }),
      )
    }
    if (audio.onSampleTake) this.cleanups.push(audio.onSampleTake((t) => void this.done(t)))
  }

  /** Whether this browser can sample: Live's output has the tap, and recordings have a store. */
  get available(): boolean {
    return this.host.deps.liveAudio.sampleOpen !== undefined && this.host.deps.samples !== undefined
  }

  /** Whether the mode is open. */
  get open(): boolean {
    return this.on
  }

  dispose(): void {
    for (const c of this.cleanups.splice(0)) c()
  }

  /**
   * Recordings left from before this start (the page closed on a take waiting
   * for KEEP, or a KEEP half done) that no offline change names: into Takes,
   * never lost.
   */
  async moveStrays(startedAt: number): Promise<void> {
    const store = this.host.deps.samples
    if (store === undefined) return
    const referenced = new Set((await this.host.live.loadOfflinePads()).list.map((p) => p.file).filter((f): f is string => f != null))
    let moved = 0
    for (const name of await store.strays(referenced, startedAt)) if (await this.toTakes(name)) moved++
    if (moved > 0) this.host.takesChanged()
  }

  // ---------- the mode ----------

  /** The level of RSP now, 0..1 across −60..0 dBFS, and its clip light (read as the meter draws). */
  get level(): ReadonlySignal<{ readonly level: number; readonly clip: boolean }> | null {
    return this.host.deps.liveAudio.sampleLevel ?? null
  }

  /**
   * The SAMPLE panel opened: the mode opens on the input last chosen,
   * metering it at once (the mic asked for the first time); nothing records
   * until a pad is held. STEP's and the scene panel and the pad sheet close,
   * TEMPO's click stops (the speaker would play into a mic take), and
   * PATTERN stops recording (and plays on).
   */
  enter(): void {
    if (this.on || !this.available) return
    this.host.makeRoom()
    this.on = true
    if (!this.openInput(this.inputNow())) {
      this.on = false
      this.host.toast(MirrorText.NO_OUTPUT, true)
      return
    }
    this.publish()
  }

  /**
   * Opens the tap on [want] (or the input offered in its place): RSP at
   * once, the mic once the browser gives it (RSP standing in, with a toast
   * saying why, when it doesn't). False when there is no output.
   */
  private openInput(want: SampleInput): boolean {
    const input = pickSampleInput(want, this.inputs())
    const gen = ++this.opening
    if (input.source !== 'mic') return this.openTap(input)
    const audio = this.host.deps.liveAudio
    if (!audio.sampleMic) return this.openTap({ source: 'rsp', stereo: input.stereo })
    // Nothing records until the mic is open: the panel shows it opening.
    this.opened = null
    void audio.sampleMic(true).then((r) => {
      if (gen !== this.opening || !this.on) {
        // Let go of: another input took its place, or SAMPLE closed meanwhile.
        if (r.ok) this.letMicGo()
        return
      }
      if (r.ok) {
        this.micStereo = r.channels === 2
        if (this.openTap(pickSampleInput(input, this.inputs()))) return
      } else {
        if (r.why === 'denied') this.micRefused = true
        this.host.toast(micFailed(r.why), true)
      }
      if (!this.openTap({ source: 'rsp', stereo: input.stereo })) this.host.toast(MirrorText.NO_OUTPUT, true)
    })
    return true
  }

  // The tap open on [input] (the mic already open for it).
  private openTap(input: SampleInput): boolean {
    const ok = this.host.deps.liveAudio.sampleOpen?.(input.stereo, this.gainNow(input.source), this.host.settings().sampleThreshold, input.source === 'mic') ?? false
    this.opened = ok ? input : null
    if (ok) this.stereo = input.stereo
    this.publish()
    return ok
  }

  // A mic opened too late for anything: the tap goes back to what is open (RSP lets the mic go), or closes.
  private letMicGo(): void {
    const o = this.opened
    if (this.on && o !== null && o.source !== 'mic') this.openTap(o)
    else if (!this.on) this.host.deps.liveAudio.sampleClose?.()
  }

  /** Leaves SAMPLE: the input closes, and a take going on ends with what it has, kept like any other. */
  exit(): void {
    if (!this.on) return
    this.held = null
    this.latchUnsure = null
    this.stopUnsure = null
    this.latchPress = null
    this.latched = null
    for (const k of this.played) this.host.releasePad(padFromKey(k))
    this.played.clear()
    this.armed = false
    this.opening++
    this.opened = null
    this.host.deps.liveAudio.sampleClose?.()
    this.on = false
    this.publish()
  }

  /** −/+: the input [step] places on in the device's order, among those offered. */
  stepInput(step: number): void {
    this.setInput(SampleInput.cycle(this.inputs(), this.shownInput(), step))
  }

  /** Records from [i] from now on (kept); one not offered is left alone. */
  setInput(i: SampleInput): void {
    if (!this.inputs().some((x) => x.source === i.source && x.stereo === i.stereo)) return
    this.host.changeSettings((s) => ({ ...s, sampleSource: i.source, sampleStereo: i.stereo }))
    if (!this.on) return this.publish()
    const o = this.opened
    // Another input or channel count is another tap: what waited goes with the one let go of.
    if (o === null || o.source !== i.source || o.stereo !== i.stereo) this.openInput(i)
    this.publish()
  }

  /** LEVEL: the input's gain in dB (SAMPLE_GAINS), kept per source. */
  setGain(db: number): void {
    const v = Math.min(Math.max(db, SAMPLE_GAINS.min), SAMPLE_GAINS.max)
    const source = this.shownInput().source
    this.host.changeSettings((s) => withSampleGain(s, source, v))
    this.host.deps.liveAudio.sampleSet?.(v, this.host.settings().sampleThreshold)
    this.publish()
  }

  /** The threshold in dBFS (SAMPLE_THRESHOLDS) a take waits for; null records from the press. */
  setThreshold(db: number | null): void {
    const v = db === null ? null : Math.min(Math.max(db, SAMPLE_THRESHOLDS.min), SAMPLE_THRESHOLDS.max)
    this.host.changeSettings((s) => ({ ...s, sampleThreshold: v }))
    this.host.deps.liveAudio.sampleSet?.(this.gainNow(this.shownInput().source), v)
    this.publish()
  }

  /** BARS: how long a hands-free take lasts; null is Free (kept). */
  setBars(bars: number | null): void {
    if (bars !== null && !SAMPLE_BARS.includes(bars)) return
    this.host.changeSettings((s) => ({ ...s, sampleBars: bars, samplePattern: false }))
    this.publish()
  }

  /** LATCH: a tap on a pad records hands-free (not kept). */
  setLatch(on: boolean): void {
    this.latch = on
    this.publish()
  }

  /** Settings' "Review samples": each take opens the review sheet, or goes straight on its pad. */
  setReviewSamples(on: boolean): void {
    this.host.changeSettings((s) => ({ ...s, reviewSamples: on }))
  }

  // ---------- the pads ----------

  // A take the tap was asked for and hasn't ended: waiting for its start, or recording.
  private tapGoing(): boolean {
    return this.armed || this.tapPhase.kind !== 'ready'
  }

  // A take goes on: held, or the tap's.
  private going(): boolean {
    return this.held !== null || this.tapGoing()
  }

  /**
   * A pad pressed in SAMPLE mode at [at] (performance.now()): held, it records
   * from that moment (or from the first sound past the threshold) until
   * [padUp]; with LATCH on it starts a hands-free take, an [unsure] press only
   * once [padKept]. While a take goes on, another pad plays as ever (how a
   * chord goes into RSP); a tap on the hands-free take's pad stops it.
   */
  padDown(pad: PhysicalPad, at: number, unsure = false): void {
    if (!this.on) return
    const handsFree = this.latched !== null && this.tapGoing()
    switch (samplePress(pad, this.held?.pad ?? null, this.latched, handsFree, this.going(), this.latch, unsure)) {
      case 'STOP':
        this.stopAt(at)
        break
      case 'STOP_WHEN_KEPT':
        this.stopUnsure = { pad, at }
        break
      case 'PLAY':
        this.played.add(padKey(pad))
        this.host.playPad(pad, true, unsure, at)
        break
      case 'LATCH':
        this.latchTake(pad, at)
        if (samePad(this.latched, pad)) this.latchPress = pad
        break
      case 'LATCH_WHEN_KEPT':
        this.latchUnsure = { pad, at }
        break
      case 'HOLD':
        if (!this.arm(pad, at, false)) return
        this.held = { pad, at }
        break
    }
  }

  /** The finger left [pad] at [at]: the take stops then. A tap ([SAMPLE_TAP_MS]) records nothing: it plays a pad with a sound. */
  padUp(pad: PhysicalPad, at: number): void {
    if (samePad(this.latchPress, pad)) this.latchPress = null
    if (this.played.delete(padKey(pad))) return this.host.releasePad(pad)
    const h = this.held
    if (h === null || !samePad(h.pad, pad)) return
    this.held = null
    if (at - h.at < SAMPLE_TAP_MS) {
      this.host.deps.liveAudio.sampleCancel?.()
      if (this.host.padHasSound(pad)) this.host.playPad(pad, false, false, at)
      else this.host.toast(MirrorText.HOLD_TO_RECORD)
      return
    }
    this.host.deps.liveAudio.sampleStop?.(at)
  }

  /** A press on the scrolling page was a press after all: a latch starts, a stop stops, a pad played plays on. */
  padKept(pad: PhysicalPad): void {
    const s = this.stopUnsure
    if (s !== null && samePad(s.pad, pad)) {
      this.stopUnsure = null
      if (samePad(this.latched, pad)) this.stopAt(s.at)
      return
    }
    const l = this.latchUnsure
    if (l !== null && samePad(l.pad, pad)) {
      this.latchUnsure = null
      this.latchTake(pad, l.at)
      if (samePad(this.latched, pad)) this.latchPress = pad
      return
    }
    if (this.played.has(padKey(pad))) this.host.keepPad(pad)
  }

  /** The press on [pad] turned into a scroll: its take is thrown away, or never latched; played beside one, its sound is cut. */
  padCut(pad: PhysicalPad): void {
    if (this.stopUnsure !== null && samePad(this.stopUnsure.pad, pad)) {
      this.stopUnsure = null
      return
    }
    if (this.latchUnsure !== null && samePad(this.latchUnsure.pad, pad)) {
      this.latchUnsure = null
      return
    }
    if (samePad(this.latchPress, pad)) {
      this.latchPress = null
      if (samePad(this.latched, pad)) {
        this.latched = null
        this.host.deps.liveAudio.sampleCancel?.()
      }
      return
    }
    if (this.played.delete(padKey(pad))) return this.host.cutPad(pad)
    if (this.held === null || !samePad(this.held.pad, pad)) return
    this.held = null
    this.host.deps.liveAudio.sampleCancel?.()
  }

  /** A tap on [pad] with LATCH on (or a screen reader's click): a hands-free take into it, until [stop]. A latch while one goes on stops it. */
  latchTake(pad: PhysicalPad, at: number = this.host.deps.perfNow()): void {
    if (!this.on) return
    if (this.latched !== null && this.tapGoing()) return this.stop()
    if (this.held !== null) return
    this.latched = pad
    if (!this.arm(pad, at, true)) this.latched = null
  }

  /** STOP (LATCH's key during a hands-free take): it stops now. */
  stop(): void {
    this.stopAt(this.host.deps.perfNow())
  }

  private stopAt(at: number): void {
    this.latched = null
    this.latchPress = null
    this.host.deps.liveAudio.sampleStop?.(at)
  }

  // Arms a take into [pad]; false after a toast when there is no room left for one.
  private arm(pad: PhysicalPad, at: number, latched: boolean): boolean {
    // The mic still being asked for: nothing to record from yet.
    if (this.opened === null) return false
    const audio = this.host.deps.liveAudio
    const rate = audio.sampleRate ?? null
    const max = rate === null ? 0 : sampleMaxFrames(this.stereo, rate, this.on ? this.host.free() : null)
    if (max <= 0 || !audio.sampleArm) {
      this.host.toast(MirrorText.diskLow(0), true)
      return false
    }
    this.armed = true
    audio.sampleArm(padKey(pad), at, latched, max)
    return true
  }

  // ---------- a take ----------

  /** A take the tap made: onto the review sheet, or straight onto its pad. */
  private async done(t: TapTake): Promise<void> {
    const real = padFromKey(t.pad)
    this.latched = latchAfterTake(this.latched, real, this.tapGoing())
    const s = this.host.settings()
    const occupied = this.host.online() ? this.slotsTakenNow() : null
    const input: SampleInput = { source: this.opened?.source ?? 'rsp', stereo: t.channels === 2 }
    const name = SampleName.of(input.source, this.host.deps.now())
    const r = await this.backed(sampleReviewOf(real, input, t.pcm, t.channels, t.rate, t.end, t.latched, name, s.sampleNormalize, s.sampleTrimSilence, occupied))
    this._lastTake.value = r.peaks
    if (!s.reviewSamples) {
      void this.keepReviewed(r)
    } else {
      const was = this._review.peek()
      if (was !== null) void this.keepReviewed(was)
      this._review.value = r
    }
    this.publish()
  }

  /** The review's part kept: from frame [start], [length] frames. */
  setReviewTrim(start: number, length: number): void {
    const r = this._review.peek()
    if (r !== null) this._review.value = trimReview(r, start, length)
  }

  /** The review's Normalize, kept for the next take. */
  setReviewNormalize(on: boolean): void {
    const r = this._review.peek()
    if (r !== null) this._review.value = { ...r, normalize: on }
    this.host.changeSettings((s) => ({ ...s, sampleNormalize: on }))
  }

  /** The review's Trim silence, kept for the next take. */
  setReviewTrimSilence(on: boolean): void {
    const r = this._review.peek()
    if (r !== null) this._review.value = withTrimSilence(r, on)
    this.host.changeSettings((s) => ({ ...s, sampleTrimSilence: on }))
  }

  /** The review's slot − and +: [step] free slots on (connected only). */
  stepReviewSlot(step: number): void {
    const r = this._review.peek()
    if (r === null || r.offline) return
    this._review.value = { ...r, slot: stepFreeSlot(this.slotsTakenNow(), r.slot, step) }
  }

  /** What the review's play button plays: the part kept, as KEEP would put it on the pad. */
  reviewSound(): { pcm: Int16Array; channels: number; rate: number } | null {
    const r = this._review.peek()
    return r === null ? null : { pcm: reviewedPcm(r), channels: r.channels, rate: r.rate }
  }

  /** KEEP: the take goes on its pad. */
  keepSample(): void {
    const r = this._review.peek()
    if (r === null) return
    this._review.value = null
    void this.keepReviewed(r)
  }

  /** RETAKE: the take goes, and the pad records again: a hands-free one at once, a held one at the next hold. */
  retakeSample(): void {
    const r = this._review.peek()
    if (r === null) return
    this._review.value = null
    this.letGo(r)
    if (r.latched) this.latchTake(r.pad)
  }

  /** DISCARD (or the sheet dismissed): the take goes, with UNDO on the toast. */
  discardSample(): void {
    const r = this._review.peek()
    if (r === null) return
    this._review.value = null
    this.letGo(r)
    this.discarded = { ...r, file: null }
    this.host.toastWith(MirrorText.SAMPLE_DISCARDED, MirrorText.UNDO, () => void this.undoDiscard())
  }

  /** UNDO after DISCARD: the take is back on the review sheet, unless another took its place. */
  async undoDiscard(): Promise<void> {
    const r = this.discarded
    if (r === null || this._review.peek() !== null) return
    this.discarded = null
    this._review.value = r
    const b = await this.backed(r)
    const cur = this._review.peek()
    if (cur !== null && cur.pcm === r.pcm && cur.file === null) this._review.value = { ...cur, file: b.file }
    else this.letGo(b)
  }

  // [r] with its take written to the samples store, so it outlives the page closing before KEEP.
  private async backed(r: SampleReview): Promise<SampleReview> {
    const store = this.host.deps.samples
    if (r.file !== null || store === undefined) return r
    try {
      return { ...r, file: await store.write(this.host.deps.now(), toWavBytes(r.pcm, r.channels, r.rate)) }
    } catch {
      return r
    }
  }

  // The take [r] was is let go of (kept, discarded, retaken): its recording goes.
  private letGo(r: SampleReview): void {
    if (r.file !== null) void this.host.deps.samples?.delete(r.file).catch(() => undefined)
  }

  /**
   * KEEP: the part kept, normalized if asked, as a WAV at the take's rate,
   * onto its pad ([keepOnPad]). A pad with nowhere to go (no project read,
   * Live closed) sends it to Takes instead, never away; one that can't be
   * written goes back on the review sheet.
   */
  private async keepReviewed(r: SampleReview): Promise<void> {
    const pcm = reviewedPcm(r)
    const wav = toWavBytes(pcm, r.channels, r.rate)
    const t = this.host.editTarget(r.pad, true)
    const kept = pcm.length > 0 && (t !== null ? await this.keepOnPad(r, t, pcm, wav) : await this.keepInTakes(wav, r.rate, r.channels))
    if (kept) this.letGo(r)
    else if (this._review.peek() === null) this._review.value = r
  }

  // A take with no pad to go on, kept as a take.
  private async keepInTakes(wav: Uint8Array, rate: number, channels: number): Promise<boolean> {
    const takes = this.host.deps.takes
    if (takes === undefined) return false
    try {
      const frames = Math.trunc((wav.length - 44) / (2 * channels))
      await takes.add({ wav: wavBlob(wav), frames, rate, seconds: frames / rate }, this.host.deps.now())
    } catch (e) {
      this.host.toast(MirrorText.takeFailed(e instanceof Error ? e.message : String(e)), true)
      return false
    }
    this.host.takesChanged()
    this.host.toast(MirrorText.KEPT_IN_TAKES)
    return true
  }

  /**
   * A kept take onto [t]'s pad: saved in the samples store and put on the pad
   * as a recorded change, so the pad plays it at once, with fresh settings.
   * Connected, it uploads in the background ([uploadSamples]); offline, it
   * waits for the next connection's question. A recording still on the pad
   * and not on its way up goes to Takes.
   */
  private async keepOnPad(r: SampleReview, t: PadTarget, pcm: Int16Array, wav: Uint8Array): Promise<boolean> {
    const store = this.host.deps.samples
    if (store === undefined) return false
    let file: string
    try {
      file = await store.write(this.host.deps.now(), wav)
    } catch (e) {
      this.host.toast(MirrorText.takeFailed(e instanceof Error ? e.message : String(e)), true)
      return false
    }
    const before = await this.host.live.loadOfflinePads()
    const pads = OfflinePads.put(before, { project: t.project, group: t.group, pad: t.pad, slot: 0, name: r.name, source: SoundSource.RECORDED, file })
    // The recording it replaces, unless it is going up already: out of the queue, and into Takes.
    const replaced = recordingsLetGo(before, pads, this.goingUp)
    for (const old of replaced) {
      const i = this.queue.findIndex((q) => q.file === old.file)
      if (i >= 0) this.queue.splice(i, 1)
    }
    const online = this.host.online()
    if (online) this.queue.push({ pad: r.pad, file, slot: r.slot !== r.nextFree ? r.slot : null, held: r.slot })
    this.host.live.setOfflinePads(pads)
    await this.recordingsToTakes(replaced)
    this.host.forgetPadSettings(t)
    this.host.live.keepRecorded(file, pcm, r.channels, r.rate)
    if (online) {
      this.host.localChanged(connectedLocal(pads, this.shown()))
      this.uploadSamples()
    } else {
      this.host.localChanged(pads)
      this.host.toast(MirrorText.sampleQueued(r.pad))
    }
    return true
  }

  // The recordings a connected mirror plays from arc: those on their way up, and those whose upload failed.
  private shown(): Set<string> {
    return new Set([...this.queue.map((q) => q.file), ...this.goingUp, ...this.failed])
  }

  // The slots a review counts as in use: the device's, and those the recordings kept and not up yet go into.
  private slotsTakenNow(): Set<number> {
    return slotsTaken(this.host.deviceSlots(), [...this.queue.map((q) => q.held), this.upNow?.held ?? null])
  }

  /** The one worker uploading the recordings kept while connected, oldest first, the header showing the progress. */
  private uploadSamples(): void {
    if (this.uploader !== null) return
    this.uploader = (async () => {
      try {
        for (let q = this.queue[0]; q !== undefined; q = this.queue[0]) {
          if (!this.host.online()) {
            this.queue.length = 0
            break
          }
          this.queue.shift()
          const p = (await this.host.live.loadOfflinePads()).list.find((x) => x.file === q.file)
          // Replaced, discarded or reset before it left the queue.
          if (p === undefined) continue
          this.upNow = q
          let up: number | null
          try {
            up = await this.uploadRecorded(p, q.pad, q.slot)
          } finally {
            this.upNow = null
          }
          if (up !== null) this.host.toast(MirrorText.sampleSaved(q.pad))
          this.host.localChanged(connectedLocal(await this.host.live.loadOfflinePads(), this.shown()))
        }
      } finally {
        this.uploader = null
      }
    })()
  }

  /**
   * Uploads recording [p] onto its pad ([slot], else the next free one), its
   * progress in SAMPLE's header when its physical [pad] is known. Once on the
   * device, the recording's change and its WAV go. Returns the slot; null
   * after a toast said why not (a failure is kept for Write to try again).
   */
  async uploadRecorded(p: OfflinePad, pad: PhysicalPad | null, slot: number | null = null): Promise<number | null> {
    const name = p.file
    const store = this.host.deps.samples
    if (name == null || store === undefined) return null
    this.goingUp.add(name)
    try {
      // A KEEP put a newer take on its pad while it waited: nothing to upload, and nothing else offers it.
      if (!(await this.host.live.loadOfflinePads()).list.some((x) => x.file === name)) {
        await this.recordingsToTakes([p])
        return null
      }
      const wav = await store.read(name)
      if (wav === null) {
        this.failed.add(name)
        this.host.toast(MirrorText.uploadFailed(name), true)
        return null
      }
      if (pad !== null) this.setUploading(SamplePhase.Uploading(pad, 0))
      const t: PadTarget = { project: p.project, group: p.group, pad: p.pad, slot: null }
      const into = await this.host.upload(p.name, wav, t, slot, (f) => {
        if (pad !== null) this.setUploading(SamplePhase.Uploading(pad, Math.min(100, Math.max(0, Math.trunc(f * 100)))))
      })
      if (into === null) {
        this.failed.add(name)
        return null
      }
      this.failed.delete(name)
      const left = await this.host.live.loadOfflinePads()
      this.host.live.setOfflinePads({ list: left.list.filter((x) => x.file !== name) })
      this.host.live.forgetRecorded(name)
      await store.delete(name)
      return into
    } finally {
      this.goingUp.delete(name)
      this.setUploading(null)
    }
  }

  /** Recordings among [entries] moved into Takes (their pad changes dropped elsewhere); how many were. */
  async recordingsToTakes(entries: readonly OfflinePad[]): Promise<number> {
    let moved = 0
    for (const e of entries) {
      if (e.source !== SoundSource.RECORDED || e.file == null) continue
      this.host.live.forgetRecorded(e.file)
      if (await this.toTakes(e.file)) moved++
    }
    if (moved > 0) this.host.takesChanged()
    return moved
  }

  /** The recordings kept while connected and not up yet: their own upload takes them, not Write. */
  uploadingNow(): ReadonlySet<string> {
    return this.shown()
  }

  /** Live read the device again: the recordings on their way up still play from arc. */
  async shownAgain(): Promise<void> {
    const shown = this.shown()
    if (shown.size > 0) this.host.localChanged(connectedLocal(await this.host.live.loadOfflinePads(), shown))
  }

  // A recording's WAV into Takes, and out of the samples store.
  private async toTakes(name: string): Promise<boolean> {
    const store = this.host.deps.samples
    const takes = this.host.deps.takes
    if (store === undefined || takes === undefined) return false
    try {
      const wav = await store.read(name)
      if (wav === null) return false
      const w = decodeWav(wav)
      const frames = Math.trunc(w.pcm.length / (2 * Math.max(1, w.channels)))
      const rate = Math.trunc(w.sampleRate)
      await takes.add({ wav: wavBlob(wav), frames, rate, seconds: frames / rate }, this.host.deps.now())
      await store.delete(name)
      return true
    } catch {
      return false
    }
  }

  private setUploading(p: SamplePhase | null): void {
    this.uploading = p
    this.publish()
  }

  // ---------- what shows ----------

  private inputs(): SampleInput[] {
    // The mic where the browser has one and it wasn't refused; no USB on the web.
    const mic = this.host.deps.liveAudio.micSupported === true && !this.micRefused
    return sampleInputs(mic, this.micStereo, false, false)
  }

  // The input the panel shows: the one open, else the one chosen (the mic while it is being asked for).
  private shownInput(): SampleInput {
    return this.opened ?? this.inputNow()
  }

  private inputNow(): SampleInput {
    const s = this.host.settings()
    return pickSampleInput({ source: s.sampleSource, stereo: s.sampleStereo }, this.inputs())
  }

  private gainNow(source: SampleSource): number {
    return sampleGain(this.host.settings(), source)
  }

  private phaseNow(): SamplePhase {
    const p = this.tapPhase
    if (p.kind === 'waiting') return SamplePhase.Waiting(padFromKey(p.pad), p.latched)
    if (p.kind === 'recording') return SamplePhase.Recording(padFromKey(p.pad), p.seconds, p.maxSeconds, p.latched)
    return this.uploading ?? SamplePhase.Ready
  }

  private uiNow(): SampleUiState {
    const s = this.host.settings()
    const input = this.on ? this.shownInput() : this.inputNow()
    const rate = this.host.deps.liveAudio.sampleRate ?? 48000
    const free = this.on ? this.host.free() : null
    return {
      ...SAMPLE_UI,
      on: this.on,
      input,
      inputs: this.inputs(),
      gainDb: sampleGain(s, input.source),
      thresholdDb: s.sampleThreshold,
      bars: s.sampleBars,
      pattern: s.samplePattern,
      latch: this.latch,
      phase: this.phaseNow(),
      maxSeconds: Math.trunc(sampleMaxFrames(input.stereo, rate, free) / rate),
      lowSpace: SampleLimits.lowSpace(free, input.stereo),
    }
  }

  /** The settings changed elsewhere: the panel follows. */
  publish(): void {
    this._ui.value = this.uiNow()
  }
}

// A WAV's bytes as a Blob (a copy: the bytes' buffer may be shared).
function wavBlob(wav: Uint8Array): Blob {
  return new Blob([wav.slice()], { type: 'audio/wav' })
}

// Why the mic didn't open, for the toast: refused (it isn't offered again), in use, or not there.
function micFailed(why: 'denied' | 'none' | 'busy' | 'failed'): string {
  switch (why) {
    case 'denied':
      return WebText.NO_MIC
    case 'busy':
      return MirrorText.MIC_BUSY
    case 'none':
      return MirrorText.inputFailed(WebText.NO_MIC_FOUND)
    case 'failed':
      return MirrorText.inputFailed(WebText.MIC_FAILED)
  }
}
