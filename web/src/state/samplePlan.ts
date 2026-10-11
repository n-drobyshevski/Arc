// Port of app/src/main/kotlin/dev/arc/ep133/controller/ArcController.kt (its top-level SAMPLE section)
//
// SAMPLE (an addition): recording into a pad. The mode as its line and panel
// show it ([SampleUiState]), a take on the review sheet before KEEP
// ([SampleReview]), and the pure steps between: the inputs offered, the
// longest take, the review's trims, what KEEP puts on the pad, the slot −/+
// steps to, and what a pad pressed in SAMPLE mode does.
//
// Web deltas:
// - padTargetOrWhy is the controller's editTarget (the same checks, its toast).
// - Pads are PhysicalPads, takes Int16Arrays; SampleCapture.End is the
//   string union; SAMPLE_TAP_MS is in performance.now() ms.
// - [SampleReview.file] is the take's key in the samples store (IndexedDB),
//   where Kotlin names a file in arc's samples folder.
// - No MIC or USB yet: [sampleInputs] is kept whole, and the controller asks
//   for RSP alone.

import type { OfflinePad, OfflinePads } from '../core/features/offlinePads'
import type { PadTarget } from '../core/features/liveMirror'
import type { PhysicalPad } from '../core/features/padNotes'
import type { SamplePhase } from '../core/features/sampleCapture'
import type { End } from '../core/features/sampleCapture'
import { applyGain, cut, frames as pcmFrames, leadingSilence, normalizeGain, peaks } from '../core/features/sampleEdit'
import { SampleInput, SampleLimits, type SampleSource } from '../core/features/sampleSource'
import type { Peak } from '../core/features/sampleTrim'
import { SampleUpload } from '../core/features/sampleUpload'
import { SoundSource } from '../core/features/offlinePads'

/**
 * SAMPLE mode as its line and panel show it: [on] while the mode is open,
 * the [input] recording from those [inputs] offered, its LEVEL ([gainDb]) and
 * threshold ([thresholdDb], null for none), the [bars] a hands-free take
 * lasts (null: Free; PTN is [pattern]), the panel's [latch] switch, what is
 * going on ([phase]), the longest take in seconds ([maxSeconds], less when
 * the EP-133 is short of space: [lowSpace]).
 */
export interface SampleUiState {
  readonly on: boolean
  readonly input: SampleInput
  readonly inputs: readonly SampleInput[]
  readonly gainDb: number
  readonly thresholdDb: number | null
  readonly bars: number | null
  readonly pattern: boolean
  readonly latch: boolean
  readonly phase: SamplePhase
  readonly maxSeconds: number
  readonly lowSpace: boolean
  readonly usb: boolean
}

export const SAMPLE_UI: SampleUiState = Object.freeze({
  on: false,
  input: { source: 'rsp' as SampleSource, stereo: false },
  inputs: [],
  gainDb: 0,
  thresholdDb: null,
  bars: null,
  pattern: false,
  latch: false,
  phase: { type: 'Ready' } as SamplePhase,
  maxSeconds: SampleLimits.MAX_MONO_S,
  lowSpace: false,
  usb: false,
})

/**
 * A take on SAMPLE's review sheet before KEEP: recorded into [pad] from
 * [input], [pcm] interleaved at [channels] and [rate] ([frames] of it, drawn
 * as [peaks]), and why it ended ([end]). [start] and [length] pick the part
 * kept, in frames; [silenceAt] is where the sound starts (null: all silent),
 * which [trimSilence] starts it at; [normalize] raises the part kept to 0 dB.
 * Connected, [slot] is the slot it goes into, the next free one ([nextFree])
 * unless another was picked; [offline], the slot is the next free one when
 * the EP-133 connects. [name] is what it is called on the device; [latched]
 * when it ran hands-free, for RETAKE. [file] keeps the take as recorded until
 * it is kept or let go of, so a take waiting for KEEP is never lost.
 */
export interface SampleReview {
  readonly pad: PhysicalPad
  readonly input: SampleInput
  readonly pcm: Int16Array
  readonly channels: number
  readonly rate: number
  readonly frames: number
  readonly peaks: readonly Peak[]
  readonly start: number
  readonly length: number
  readonly silenceAt: number | null
  readonly normalize: boolean
  readonly trimSilence: boolean
  readonly slot: number | null
  readonly nextFree: number | null
  readonly offline: boolean
  readonly name: string
  readonly end: End
  readonly latched: boolean
  readonly file: string | null
}

/** A press let go of sooner than this in SAMPLE mode is a tap (ms): it plays the pad, as the device's "push again", and records nothing. */
export const SAMPLE_TAP_MS = 200

/** The review's waveform, in columns: as many as EDIT's TRIM page draws. */
export const REVIEW_COLUMNS = 96

/**
 * The inputs SAMPLE's −/+ offers, in the device's order: the [mic] (stereo
 * only where it has a stereo mic, [micStereo]), RSP always, and the EP-133
 * over [usb] (stereo as it offers).
 */
export function sampleInputs(mic: boolean, micStereo: boolean, usb: boolean, usbStereo: boolean): SampleInput[] {
  return SampleInput.ORDER.filter((it) => {
    switch (it.source) {
      case 'mic':
        return mic && (!it.stereo || micStereo)
      case 'rsp':
        return true
      case 'usb':
        return usb && (!it.stereo || usbStereo)
    }
  })
}

/** [want] when it is offered, else RSP in the same mono or stereo: it always is, and needs no permission. */
export function pickSampleInput(want: SampleInput, inputs: readonly SampleInput[]): SampleInput {
  return inputs.some((i) => i.source === want.source && i.stereo === want.stereo) ? want : { source: 'rsp', stereo: want.stereo }
}

/**
 * The longest take in frames at [rate], mono or [stereo]: the EP-133's
 * limit, less when [free] bytes (the device's free space, null while
 * unknown) hold less.
 */
export function sampleMaxFrames(stereo: boolean, rate: number, free: number | null): number {
  const max = SampleLimits.maxFrames(stereo, rate)
  const fit = SampleLimits.framesThatFit(free, stereo ? 2 : 1, rate) ?? max
  return Math.min(max, fit)
}

/**
 * The review for a take: all of it kept, or from where the sound starts with
 * [trimSilence] (20 ms of the attack left in), [normalize] as it was last
 * chosen. [occupied] holds the device's slots in use, and gives the next free
 * one; null offline, where the slot is picked on upload.
 */
export function sampleReviewOf(
  pad: PhysicalPad,
  input: SampleInput,
  pcm: Int16Array,
  channels: number,
  rate: number,
  end: End,
  latched: boolean,
  name: string,
  normalize: boolean,
  trimSilence: boolean,
  occupied: ReadonlySet<number> | null,
  columns: number = REVIEW_COLUMNS,
): SampleReview {
  const frames = pcmFrames(pcm, channels)
  const silenceAt = leadingSilence(pcm, channels, Math.trunc(rate / 50))
  const start = trimSilence ? (silenceAt ?? 0) : 0
  const next = occupied === null ? null : SampleUpload.nextFree(occupied, new Set())
  return {
    pad,
    input,
    pcm,
    channels,
    rate,
    frames,
    peaks: peaks(pcm, channels, columns),
    start,
    length: frames - start,
    silenceAt,
    normalize,
    trimSilence,
    slot: next,
    nextFree: next,
    offline: occupied === null,
    name,
    end,
    latched,
    file: null,
  }
}

/** [r] kept from frame [start] for [length] frames, both held inside the take (at least one frame). */
export function trimReview(r: SampleReview, start: number, length: number): SampleReview {
  const s = Math.min(Math.max(start, 0), Math.max(0, r.frames - 1))
  const n = Math.min(Math.max(length, Math.min(1, r.frames - s)), r.frames - s)
  // Moved off where the sound starts, it no longer trims the silence.
  return { ...r, start: s, length: n, trimSilence: r.trimSilence && s === r.silenceAt }
}

/** [r] with Trim silence [on]: it starts where the sound does (or at 0, off), its end left where it was. */
export function withTrimSilence(r: SampleReview, on: boolean): SampleReview {
  const end = r.start + r.length
  const start = on ? (r.silenceAt ?? r.start) : 0
  const trimmed = trimReview(r, start, end > start ? end - start : r.frames - start)
  return { ...trimmed, trimSilence: on }
}

/** What KEEP puts on the pad: the part kept, raised to 0 dB with [SampleReview.normalize]. */
export function reviewedPcm(r: SampleReview): Int16Array {
  const c = cut(r.pcm, r.channels, r.start, r.length)
  if (!r.normalize) return c
  return applyGain(c, normalizeGain(c, r.channels, 0, pcmFrames(c, r.channels)))
}

/**
 * The free slot [step] free slots on from [from] (− down, + up), passing over
 * the [occupied] ones and staying put at either end; the first free one from
 * nothing. Null when every slot is in use.
 */
export function stepFreeSlot(occupied: ReadonlySet<number>, from: number | null, step: number): number | null {
  if (from === null) return SampleUpload.nextFree(occupied, new Set())
  let s = from
  const dir = step < 0 ? -1 : 1
  for (let k = 0; k < Math.abs(step); k++) {
    let n = s + dir
    while (n >= SampleUpload.FIRST_SLOT && n <= SampleUpload.LAST_SLOT && occupied.has(n)) n += dir
    if (n >= SampleUpload.FIRST_SLOT && n <= SampleUpload.LAST_SLOT) s = n
  }
  return s
}

/** What a pad pressed in SAMPLE mode does ([samplePress]). */
export type SamplePress =
  /** Stops the hands-free take it is the pad of (or that take's count-in or wait for PLAY), at the press. */
  | 'STOP'
  /** The same once the press is kept (an unsure press on the scrolling page): a scroll stops nothing. */
  | 'STOP_WHEN_KEPT'
  /** Plays as ever beside the take going on: how a chord goes into RSP. */
  | 'PLAY'
  /** LATCH on: a hands-free take into it. */
  | 'LATCH'
  /** The same once the press is kept: a scroll latches nothing. */
  | 'LATCH_WHEN_KEPT'
  /** Records into it while held. */
  | 'HOLD'

const samePad = (a: PhysicalPad | null, b: PhysicalPad | null): boolean => a !== null && b !== null && a.group === b.group && a.offset === b.offset

/**
 * What a press on [pad] does in SAMPLE mode: [held] is the pad held to record
 * (null for none), [latched] the pad of a hands-free take, and [handsFree]
 * whether that take (or its count-in, or its wait for PLAY) goes on;
 * [going], whether any take does; [latch], LATCH; [unsure], a press on the
 * scrolling page that may yet be a scroll. A tap on the hands-free take's pad
 * stops it, as STOP does.
 */
export function samplePress(
  pad: PhysicalPad,
  held: PhysicalPad | null,
  latched: PhysicalPad | null,
  handsFree: boolean,
  going: boolean,
  latch: boolean,
  unsure: boolean,
): SamplePress {
  if (held === null && samePad(latched, pad) && handsFree) return unsure ? 'STOP_WHEN_KEPT' : 'STOP'
  if (going) return 'PLAY'
  if (latch) return unsure ? 'LATCH_WHEN_KEPT' : 'LATCH'
  return 'HOLD'
}

/**
 * The hands-free take's pad ([latched]) once a take into [take] has come in:
 * let go of when it was that take's, unless a take is [going] again (the same
 * pad latched anew as the last take ended, before it came in).
 */
export function latchAfterTake(latched: PhysicalPad | null, take: PhysicalPad, going: boolean): PhysicalPad | null {
  return samePad(latched, take) && !going ? null : latched
}

/**
 * The slots a new take's review counts as in use: the device's ([device]),
 * and those the recordings kept and not yet up are going into ([held], each
 * as its review left it; null for the next free one then).
 */
export function slotsTaken(device: ReadonlySet<number>, held: Iterable<number | null>): Set<number> {
  const out = new Set(device)
  for (const s of held) if (s !== null) out.add(s)
  return out
}

/**
 * [pads] with the recordings on [t]'s pad taken off, but those [going] up
 * now: another sound was written onto the pad while connected, and they would
 * overwrite it when their turn came.
 */
export function withoutRecordingsOn(pads: OfflinePads, t: PadTarget, going: ReadonlySet<string>): OfflinePads {
  return {
    list: pads.list.filter(
      (it) => !(it.source === SoundSource.RECORDED && it.project === t.project && it.group === t.group && it.pad === t.pad && !going.has(it.file ?? '')),
    ),
  }
}

/**
 * The offline changes a connected mirror shows: only the recordings on their
 * way up now, or whose upload failed in this connection ([uploading], by
 * file), so their pads play them meanwhile.
 */
export function connectedLocal(pads: OfflinePads, uploading: ReadonlySet<string>): OfflinePads {
  return { list: pads.list.filter((it) => it.source === SoundSource.RECORDED && uploading.has(it.file ?? '')) }
}

/**
 * The recordings [before] holds that [after] no longer does (another sound
 * picked for the pad, or a new take kept on it), but those [going] up now:
 * their takes go to Takes, as nothing else would ever offer them again.
 */
export function recordingsLetGo(before: OfflinePads, after: OfflinePads, going: ReadonlySet<string>): OfflinePad[] {
  const kept = new Set(after.list.map((it) => it.file).filter((f): f is string => f != null))
  return before.list.filter((it) => it.source === SoundSource.RECORDED && it.file != null && !kept.has(it.file) && !going.has(it.file))
}
