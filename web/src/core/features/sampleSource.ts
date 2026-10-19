// Port of core/src/main/kotlin/dev/arc/ep133/features/SampleSource.kt
//
// Where SAMPLE records from, what −/+ picks, how long a take can be, the name
// a recording goes on the EP-133 with, and a take's length in bars (an
// addition). The web has no SAMPLE mode; this is the core logic only.
//
// Web deltas:
// - SampleSource is a string union whose values are the Kotlin enum's `id`
//   ('mic', 'rsp', 'usb'): `source.id` is `source`, `SampleSource.of` the
//   same, and `SampleSource.entries` is SAMPLE_SOURCES.
// - SampleInput is a plain readonly interface, compared by its fields where
//   the Kotlin data class uses equals; `SampleInput.ORDER` and `cycle` are on
//   the `SampleInput` object.
// - SampleName.of takes the zone as minutes east of UTC (the browser's own
//   offset at [nowMs] by default) where the Kotlin takes a ZoneId.
// - Kotlin's Long and Int arithmetic is done on whole JS numbers with
//   Math.floor where the Kotlin divides integers (all values are >= 0, so
//   the two agree).

import { MAX_SAMPLE_RATE, MAX_SOUND_NAME } from '../protocol/device'
import { BEATS_PER_BAR } from './tempo'

/**
 * Where SAMPLE records from: the phone's mic, a resample of Live's own mix
 * (the device's RSP), or the EP-133's sound over USB audio (an addition on
 * the phone; experimental). The value is the word kept in settings and sound
 * names.
 */
export type SampleSource = 'mic' | 'rsp' | 'usb'

/** Every source, in the device's −/+ order (Kotlin's SampleSource.entries). */
export const SAMPLE_SOURCES: readonly SampleSource[] = ['mic', 'rsp', 'usb']

export const SampleSource = {
  MIC: 'mic',
  RSP: 'rsp',
  USB: 'usb',
  of(id: string): SampleSource | null {
    return (SAMPLE_SOURCES as readonly string[]).includes(id) ? (id as SampleSource) : null
  },
} as const

/** What SAMPLE's −/+ picks: a [source], recorded in mono or [stereo]. */
export interface SampleInput {
  readonly source: SampleSource
  readonly stereo: boolean
}

/** The device's −/+ order: MIC, MIC ST, RSP, RSP ST, USB, USB ST. */
const ORDER: readonly SampleInput[] = SAMPLE_SOURCES.flatMap((source) => [
  { source, stereo: false },
  { source, stereo: true },
])

const same = (a: SampleInput, b: SampleInput): boolean => a.source === b.source && a.stereo === b.stereo

const has = (list: readonly SampleInput[], x: SampleInput): boolean => list.some((y) => same(x, y))

/**
 * The input [step] presses of −/+ away from [from], in [ORDER] and wrapping
 * round both ways, counting only the inputs in [available] (USB is left out
 * while nothing is plugged in, a stereo mic on a phone with one mic). From an
 * input that isn't available, the first press lands on the next one that is;
 * [from] itself when none are.
 */
function cycle(available: readonly SampleInput[], from: SampleInput, step: number): SampleInput {
  if (!ORDER.some((x) => has(available, x))) return from
  if (step === 0) return has(available, from) ? from : cycle(available, from, 1)
  const dir = step > 0 ? 1 : -1
  const n = ORDER.length
  let i = ORDER.findIndex((x) => same(x, from))
  for (let k = 0; k < Math.abs(step); k++) {
    do {
      i = (((i + dir) % n) + n) % n
    } while (!has(available, ORDER[i]!))
  }
  return ORDER[i]!
}

/** The Kotlin `SampleInput` companion. */
export const SampleInput = { ORDER, cycle } as const

export const MAX_STEREO_S = 20
export const MAX_MONO_S = 40

function maxSeconds(stereo: boolean): number {
  return stereo ? MAX_STEREO_S : MAX_MONO_S
}

/** The longest take in frames at [rate]. */
function maxFrames(stereo: boolean, rate: number): number {
  return maxSeconds(stereo) * rate
}

const stored = (rate: number): number => Math.min(rate, MAX_SAMPLE_RATE)

/**
 * The bytes [frames] at [rate] take on the device: 16-bit samples at the
 * rate it keeps them at, since uploads above 46875 Hz are resampled down to
 * it and slower ones go up as they are.
 */
function deviceBytes(frames: number, rate: number, channels: number): number {
  return Math.floor((frames * stored(rate)) / rate) * 2 * channels
}

/**
 * Whether a full-length take in mono or [stereo] won't fit in [free] bytes on
 * the device: SAMPLE shows "Disk low" then. False while the free space isn't
 * known.
 */
function lowSpace(free: number | null, stereo: boolean): boolean {
  if (free == null) return false
  const channels = stereo ? 2 : 1
  return free < deviceBytes(maxFrames(stereo, MAX_SAMPLE_RATE), MAX_SAMPLE_RATE, channels)
}

/**
 * The longest take in frames at [rate] that fits in [free] bytes on the
 * device, to cap a take with when space is low; null while the free space
 * isn't known.
 */
function framesThatFit(free: number | null, channels: number, rate: number): number | null {
  if (free == null) return null
  const onDevice = Math.floor(Math.max(free, 0) / (2 * channels))
  return Math.min(Math.floor((onDevice * rate) / stored(rate)), 2147483647)
}

/**
 * How long a take can be, as on the EP-133 (OS 2.5): 20 s in stereo, 40 s in
 * mono. Both come to the same bytes once the device holds them at 46875 Hz,
 * which is what the free-space checks count. (The Kotlin `object SampleLimits`.)
 */
export const SampleLimits = { MAX_STEREO_S, MAX_MONO_S, maxSeconds, maxFrames, deviceBytes, lowSpace, framesThatFit } as const

const two = (n: number): string => String(n).padStart(2, '0')

/**
 * The name a new recording goes on the EP-133 with (an addition): the
 * source's word and when it was made, "mic 1007-142301" (month, day, then the
 * time to the second), so takes sort by when they were made and fit the
 * device's [MAX_SOUND_NAME] characters. [offsetMin] is the zone, in minutes
 * east of UTC.
 */
function nameOf(source: SampleSource, nowMs: number, offsetMin: number = -new Date(nowMs).getTimezoneOffset()): string {
  const d = new Date(nowMs + offsetMin * 60_000)
  const stamp =
    `${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}-` +
    `${two(d.getUTCHours())}${two(d.getUTCMinutes())}${two(d.getUTCSeconds())}`
  return `${source} ${stamp}`.slice(0, MAX_SOUND_NAME)
}

/** The Kotlin `object SampleName`. */
export const SampleName = { of: nameOf } as const

/**
 * The frames [bars] bars of 4/4 last at [bpm] and [rate], for a take of a set
 * length; rounded half up, as the Kotlin does.
 */
export function barFrames(bars: number, bpm: number, rate: number): number {
  return Math.floor((bars * BEATS_PER_BAR * 60.0 * rate) / bpm + 0.5)
}
