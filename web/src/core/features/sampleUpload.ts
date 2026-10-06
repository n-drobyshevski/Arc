// Port of core/src/main/kotlin/dev/arc/ep133/features/SampleUpload.kt
//
// Loading WAV files into sample slots (not part of the web version). It goes
// through exactly the restore path: the files become a backup in memory with
// only these sounds and no projects, and restorePak writes it. So uploads get
// the same free-space check, resampling above 46875 Hz, CRC verification with
// one retry, progress and cancel.
//
// Web deltas: an item's trim is a half-open frame range {start, end}
// (Kotlin's IntRange is inclusive and is cut at first..last + 1); the
// Kotlin `object SampleUpload` is a module of functions (also gathered in
// the `SampleUpload` const); CancelSignal is an AbortSignal.

import { restorePak, type Progress, type RestoreResult } from '../backup/backup'
import type { Pak, PakSound } from '../backup/pak'
import { decodeWav, encodeWav } from '../formats/wav'
import { assignPad, cleanSoundName } from '../protocol/device'
import type { JsonObject } from '../protocol/fs'
import type { Session } from '../protocol/session'
import { MirrorText } from '../text/mirrorText'
import type { PadTarget } from './liveMirror'
import { cut, frames, shiftLoops, type TrimRange } from './sampleTrim'

/** A WAV file to load into a sample slot, optionally only frames [trim.start, trim.end) of it. */
export interface UploadItem {
  slot: number
  name: string
  wav: Uint8Array
  trim?: TrimRange | null
}

export function UploadItem(slot: number, name: string, wav: Uint8Array, trim: TrimRange | null = null): UploadItem {
  return { slot, name, wav, trim }
}

export class UploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UploadError'
  }
}

export const FIRST_SLOT = 1
export const LAST_SLOT = 999

/** The sound name a file gets on the device: its file name, cleaned like any upload. */
export function nameFor(fileName: string): string {
  return cleanSoundName(fileName)
}

/** The first [count] free slots, lowest first (fewer if the device is that full). */
export function suggestSlots(
  occupied: ReadonlySet<number>,
  count: number,
  taken: ReadonlySet<number> = new Set(),
): number[] {
  // Kotlin's Sequence.take requires a count >= 0.
  if (count < 0) throw new RangeError(`Requested element count ${count} is less than zero.`)
  const out: number[] = []
  for (let s = FIRST_SLOT; s <= LAST_SLOT && out.length < count; s++) {
    if (!occupied.has(s) && !taken.has(s)) out.push(s)
  }
  return out
}

/** The next free slot not in [taken], or null when every slot is used. */
export function nextFree(occupied: ReadonlySet<number>, taken: ReadonlySet<number>): number | null {
  return suggestSlots(occupied, 1, taken)[0] ?? null
}

export function validate(items: readonly UploadItem[]): void {
  for (const i of items) {
    // Kotlin's slot is an Int; a fractional slot is no slot either.
    if (!(Number.isInteger(i.slot) && i.slot >= FIRST_SLOT && i.slot <= LAST_SLOT)) {
      throw new UploadError(`Slot ${i.slot} doesn't exist. Slots go from 1 to 999.`)
    }
  }
  // groupBy keeps first-seen order, so the first slot (in that order) used twice is reported.
  const counts = new Map<number, number>()
  for (const i of items) counts.set(i.slot, (counts.get(i.slot) ?? 0) + 1)
  for (const [slot, n] of counts) {
    if (n > 1) throw new UploadError(`Two files are set to slot ${slot}. Give each file its own slot.`)
  }
}

/**
 * A trimmed file is cut at its own sample rate (the restore path resamples
 * afterwards). Its embedded settings come along as the sound's settings,
 * with loop points moved to the new start.
 */
function trimmed(i: UploadItem, range: TrimRange): PakSound {
  const w = decodeWav(i.wav)
  const pcm = cut(w.pcm, w.channels, range.start, range.end)
  if (pcm.length === 0) throw new UploadError(`The trimmed part of ${i.name} is empty.`)
  const n = frames(pcm, w.channels)
  const settings = shiftLoops((w.embedded ?? {}) as JsonObject, range.start, n)
  const wav = encodeWav(pcm, w.channels, w.sampleRate)
  return { slot: i.slot, name: i.name, wav, settings }
}

/** The in-memory backup an upload is restored from. */
export function asPak(items: readonly UploadItem[]): Pak {
  const sounds = new Map<number, PakSound>()
  for (const i of items) {
    sounds.set(i.slot, i.trim == null ? { slot: i.slot, name: i.name, wav: i.wav, settings: null } : trimmed(i, i.trim))
  }
  return { meta: {}, sidecar: {}, sounds, projects: new Map() }
}

export interface UploadOptions {
  onProgress?: (p: Progress) => void
  signal?: AbortSignal | null
}

export async function upload(session: Session, items: readonly UploadItem[], opts: UploadOptions = {}): Promise<RestoreResult> {
  validate(items)
  const { onProgress, signal } = opts
  return restorePak(session, asPak(items), {
    slots: items.map((i) => i.slot),
    projects: [],
    ...(onProgress ? { onProgress } : {}),
    signal: signal ?? null,
  })
}

/**
 * Live's "Upload a new sample…" on a pad (an addition): [wav] goes into the
 * first free slot (not in [occupied], the slots used on the device), through
 * [upload], then onto [target]'s pad with assignPad. Returns the slot it went into.
 */
export async function uploadToPad(
  session: Session,
  fileName: string,
  wav: Uint8Array,
  occupied: ReadonlySet<number>,
  target: PadTarget,
  trim: TrimRange | null = null,
  opts: UploadOptions = {},
): Promise<number> {
  const slot = nextFree(occupied, new Set())
  if (slot === null) throw new UploadError(MirrorText.NO_FREE_SLOT)
  await upload(session, [UploadItem(slot, nameFor(fileName), wav, trim)], opts)
  await assignPad(session, target.project, target.group, target.pad, slot)
  return slot
}

/** The Kotlin `object SampleUpload`. */
export const SampleUpload = {
  FIRST_SLOT,
  LAST_SLOT,
  nameFor,
  suggestSlots,
  nextFree,
  validate,
  asPak,
  upload,
  uploadToPad,
} as const
