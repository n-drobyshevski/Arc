// Port of core/src/main/kotlin/dev/arc/ep133/features/PadSettings.kt
//
// A pad's SOUND EDIT settings, as Live's EDIT reads and writes them (an
// addition to the web version). None of this is in the official guide; it
// follows community notes:
//
// - ZacharySBrown/ep133-ppak (PROTOCOL.md): the settings are JSON metadata on
//   the pad's file node (padPush.node), read with a METADATA GET and written
//   with a METADATA SET, and the 26-byte pad record in a project TAR.
// - wil-gerard/ep133-mcp (docs/research/pad-params-proof.md): the twelve keys
//   of toMeta, checked on hardware (OS 2.5.1) to persist through a power
//   cycle. `sound.playmode` and `time.mode` must be strings or the device
//   refuses the write (status 1). A partial write can make the device re-sync
//   every field from the sample, so a write always carries the full record.
//
// Web deltas:
// - PlayMode is a string union whose values are the Kotlin enum's `id`
//   ('oneshot', 'key', 'legato'): `mode.id` is `mode`, `PlayMode.of` the same,
//   and `PlayMode.entries` is PLAY_MODES (the record's order).
// - PadSettings is a plain readonly interface; its methods are functions
//   taking the value first (`s.withMode(m)` is `withMode(s, m)`), and they and
//   the companion's members are on the `PadSettings` object.
// - Kotlin's Long frames and Int fields are JS numbers; `end` is null for the
//   sample's end. clamped also rounds the whole-number fields, which Kotlin's
//   types keep whole, and makes a -0 pitch 0. Math.round is the same in both
//   (floor of x + 0.5).

import type { JsonObject, JsonValue } from '../protocol/fs'
import { ktTrim } from '../util/kotlinText'

/** How a pad plays its sample (SOUND EDIT's MODE), by the string the device's pad metadata uses for `sound.playmode`. */
export type PlayMode = 'oneshot' | 'key' | 'legato'

/** Every play mode, by its number in the pad record (Kotlin's PlayMode.entries). */
export const PLAY_MODES: readonly PlayMode[] = ['oneshot', 'key', 'legato']

export const PlayMode = {
  ONESHOT: 'oneshot',
  KEY: 'key',
  LEGATO: 'legato',
  of(id: string): PlayMode | null {
    return (PLAY_MODES as readonly string[]).includes(id) ? (id as PlayMode) : null
  },
} as const

/**
 * [pitch] is in semitones (-12..12, two decimals), [level] 0..100 (ep133-mcp
 * reads `sound.amplitude` as 0..200 with 100 as unity; arc stays at 0..100),
 * [pan] -16..16, [start] and [end] frame indices into the sample ([end] null
 * for the sample's end), [attack] and [release] envelope ticks 0..255,
 * [midiChannel] 0..15. [timeMode] is kept as read and written back, not
 * edited.
 */
export interface PadSettings {
  readonly pitch: number
  readonly level: number
  readonly pan: number
  readonly mode: PlayMode
  readonly start: number
  readonly end: number | null
  readonly attack: number
  readonly release: number
  readonly muteGroup: boolean
  readonly midiChannel: number
  readonly timeMode: string
}

const DEFAULT: PadSettings = {
  pitch: 0,
  level: 100,
  pan: 0,
  mode: 'oneshot',
  start: 0,
  end: null,
  attack: 0,
  release: 255,
  muteGroup: false,
  midiChannel: 0,
  timeMode: 'off',
}

/** The release the device gave a pad in key mode (ep133-mcp); see [withMode]. */
export const KEY_RELEASE = 15
/** Milliseconds per envelope tick: provisional, not verified on the device. */
export const ENV_MS_PER_TICK = 10
export const PITCH_MAX = 12.0
export const LEVEL_MAX = 100
export const PAN_MAX = 16
export const ENV_MAX = 255
export const CHANNELS = 16

/** `time.mode`'s values, by their number in the pad record. */
export const TIME_MODES: readonly string[] = ['off', 'bpm', 'bar']

/** The pad metadata keys, in the order [toMeta] writes them. */
export const KEYS: readonly string[] = [
  'sym', 'sound.playmode', 'sample.start', 'sample.end', 'envelope.attack', 'envelope.release',
  'sound.pitch', 'sound.amplitude', 'sound.pan', 'sound.mutegroup', 'time.mode', 'midi.channel',
]

const clampN = (x: number, lo: number, hi: number): number => Math.min(Math.max(x, lo), hi)
// + 0 turns -0 into 0, as Kotlin's Long round trip does.
const round2 = (x: number): number => Math.round(x * 100) / 100 + 0
const whole = (x: number, lo: number, hi: number): number => clampN(Math.round(x), lo, hi) + 0

/**
 * [m] as the play mode, with the release the tools pair with it: ONESHOT
 * plays to the end, so release 255; leaving ONESHOT with release 255 goes to
 * [KEY_RELEASE], the device's key-mode default. The same mode again changes
 * nothing.
 */
export function withMode(s: PadSettings, m: PlayMode): PadSettings {
  if (m === s.mode) return s
  if (m === 'oneshot') return { ...s, mode: m, release: ENV_MAX }
  if (s.mode === 'oneshot' && s.release === ENV_MAX) return { ...s, mode: m, release: KEY_RELEASE }
  return { ...s, mode: m }
}

/**
 * Every value in its range: pitch rounded to two decimals, an unknown
 * [timeMode] as "off", and the trim with start < end <= [frames] when the
 * sample's length is known (an [end] of null stays the sample's end).
 */
export function clamped(s: PadSettings, frames: number | null): PadSettings {
  const n = frames !== null && frames >= 1 ? frames : null
  const e = s.end === null ? null : whole(s.end, 1, n ?? Number.MAX_SAFE_INTEGER)
  const start = whole(s.start, 0, (e ?? n ?? Number.MAX_SAFE_INTEGER) - 1)
  return {
    ...s,
    pitch: round2(Number.isNaN(s.pitch) ? 0 : clampN(s.pitch, -PITCH_MAX, PITCH_MAX)),
    level: whole(s.level, 0, LEVEL_MAX),
    pan: whole(s.pan, -PAN_MAX, PAN_MAX),
    start,
    end: e,
    attack: whole(s.attack, 0, ENV_MAX),
    release: whole(s.release, 0, ENV_MAX),
    midiChannel: whole(s.midiChannel, 0, CHANNELS - 1),
    timeMode: TIME_MODES.includes(s.timeMode) ? s.timeMode : 'off',
  }
}

/**
 * The METADATA SET for a pad playing [slot] (1..999): the full record, in the
 * order of [KEYS], enums as strings, the values [clamped] to [frames].
 * `sample.end` is [end] or else [frames]; the trim is left out only when
 * neither is known. The largest record stays well under the 320-byte metadata
 * page. Kotlin's `require` is a RangeError.
 */
export function toMeta(s: PadSettings, slot: number, frames: number | null): JsonObject {
  if (!(Number.isInteger(slot) && slot >= 1 && slot <= 999)) throw new RangeError(`Slot ${slot} doesn't exist. Slots go from 1 to 999.`)
  const c = clamped(s, frames)
  const last = c.end ?? (frames !== null && frames >= 1 ? frames : null)
  const m: JsonObject = { sym: slot, 'sound.playmode': c.mode }
  if (last !== null) {
    m['sample.start'] = c.start
    m['sample.end'] = last
  }
  m['envelope.attack'] = c.attack
  m['envelope.release'] = c.release
  m['sound.pitch'] = c.pitch
  m['sound.amplitude'] = c.level
  m['sound.pan'] = c.pan
  m['sound.mutegroup'] = c.muteGroup
  m['time.mode'] = c.timeMode
  m['midi.channel'] = c.midiChannel
  return m
}

/**
 * Offline edits replayed onto what the device holds now, so only what was
 * turned changes: field by field (every one, [end] and [timeMode] too), [s]'s
 * value where it differs from [base] (what the sheet showed before the
 * edits), else [current]'s (what the device reads now).
 */
export function mergedOnto(s: PadSettings, base: PadSettings, current: PadSettings): PadSettings {
  return {
    pitch: s.pitch !== base.pitch ? s.pitch : current.pitch,
    level: s.level !== base.level ? s.level : current.level,
    pan: s.pan !== base.pan ? s.pan : current.pan,
    mode: s.mode !== base.mode ? s.mode : current.mode,
    start: s.start !== base.start ? s.start : current.start,
    end: s.end !== base.end ? s.end : current.end,
    attack: s.attack !== base.attack ? s.attack : current.attack,
    release: s.release !== base.release ? s.release : current.release,
    muteGroup: s.muteGroup !== base.muteGroup ? s.muteGroup : current.muteGroup,
    midiChannel: s.midiChannel !== base.midiChannel ? s.midiChannel : current.midiChannel,
    timeMode: s.timeMode !== base.timeMode ? s.timeMode : current.timeMode,
  }
}

/** Frames the pad plays of a sample [frames] long: end (or the sample's end) less start, never below 0. */
export function length(s: PadSettings, frames: number): number {
  return Math.max(0, (s.end ?? frames) - s.start)
}

/** arc's own saved form (offlinePadSettings), by field name; [end] only when set. */
export function toJson(s: PadSettings): JsonObject {
  const m: JsonObject = { pitch: s.pitch, level: s.level, pan: s.pan, mode: s.mode, start: s.start }
  if (s.end !== null) m['end'] = s.end
  m['attack'] = s.attack
  m['release'] = s.release
  m['muteGroup'] = s.muteGroup
  m['midiChannel'] = s.midiChannel
  m['timeMode'] = s.timeMode
  return m
}

const NUMERIC = /^-?[0-9]+(\.[0-9]+)?$/

/** A number, or a string that is one ("12", "-1.5"); null for anything else. */
function num(v: JsonValue | undefined): number | null {
  let d: number | null = null
  if (typeof v === 'number') d = v
  else if (typeof v === 'string') {
    const t = ktTrim(v)
    d = NUMERIC.test(t) ? Number(t) : null
  }
  return d !== null && Number.isFinite(d) ? d : null
}

const int = (v: JsonValue | undefined): number | null => {
  const d = num(v)
  return d === null ? null : Math.round(clampN(d, -1e9, 1e9))
}

const long = (v: JsonValue | undefined): number | null => {
  const d = num(v)
  return d === null ? null : Math.round(clampN(d, -1e15, 1e15))
}

/** true/false, 1/0, or those as strings. */
function bool(v: JsonValue | undefined): boolean | null {
  if (typeof v === 'boolean') return v
  if (typeof v !== 'number' && typeof v !== 'string') return null
  // A JSON number's text: 1 and 0 (JS reads 1.0 as 1 where Kotlin keeps "1.0").
  const t = typeof v === 'number' ? String(v) : ktTrim(v)
  return t === 'true' || t === '1' ? true : t === 'false' || t === '0' ? false : null
}

/** A known string (any case), or its number in the record. */
function named<T extends string>(v: JsonValue | undefined, all: readonly T[]): T | null {
  if (typeof v === 'string') {
    const t = ktTrim(v).toLowerCase()
    return all.find((x) => x === t) ?? null
  }
  const i = typeof v === 'number' ? num(v) : null
  if (i === null || i !== Math.floor(i)) return null
  return all[i] ?? null
}

/**
 * A pad's settings from its metadata GET, tolerant of how the values come:
 * numbers or numeric strings, booleans or 0/1, the play and time modes as
 * strings or their record numbers. Anything missing or unreadable keeps
 * [base]'s value; the result is [clamped].
 */
export function fromMeta(meta: JsonObject | null, base: PadSettings = DEFAULT): PadSettings {
  if (meta === null) return clamped(base, null)
  return clamped(
    {
      pitch: num(meta['sound.pitch']) ?? base.pitch,
      level: int(meta['sound.amplitude']) ?? base.level,
      pan: int(meta['sound.pan']) ?? base.pan,
      mode: named(meta['sound.playmode'], PLAY_MODES) ?? base.mode,
      start: long(meta['sample.start']) ?? base.start,
      end: long(meta['sample.end']) ?? base.end,
      attack: int(meta['envelope.attack']) ?? base.attack,
      release: int(meta['envelope.release']) ?? base.release,
      muteGroup: bool(meta['sound.mutegroup']) ?? base.muteGroup,
      midiChannel: int(meta['midi.channel']) ?? base.midiChannel,
      timeMode: named(meta['time.mode'], TIME_MODES) ?? base.timeMode,
    },
    null,
  )
}

/**
 * Whether a pad's metadata GET looks like real pad settings: `sym` above 0,
 * or any `sound.` or `envelope.` key. An untouched pad reads `{"sym":0}` or
 * less (device.assignPad), and its settings are then better taken from the
 * project's pad record ([fromRecord]).
 */
export function written(meta: JsonObject | null): boolean {
  if (meta === null) return false
  if ((num(meta['sym']) ?? 0) > 0) return true
  return Object.keys(meta).some((k) => k.startsWith('sound.') || k.startsWith('envelope.'))
}

/**
 * A pad's settings from its 26-byte record in a project TAR
 * (`pads/<group>/pNN`), at the offsets ep133-ppak gives, not verified here:
 * volume u8 @16, pitch i8 @17, pan i8 @18, attack u8 @19, release u8 @20,
 * time mode u8 @21 (0 off, 1 bpm, 2 bar), mute group u8 @22, play mode u8 @23
 * (0 oneshot, 1 key, 2 legato). Null unless the record looks like that: at
 * least 24 bytes, volume 1..100, pitch -12..12, pan -16..16 and play mode
 * 0..2 (an all-zero record, as arc's demo writes, is not). The trim stays the
 * whole sample: the record's sample length (u32 @8) comes without a start.
 */
export function fromRecord(rec: Uint8Array): PadSettings | null {
  if (rec.length < 24) return null
  const i8 = (b: number): number => (b << 24) >> 24
  const level = rec[16]!
  const pitch = i8(rec[17]!)
  const pan = i8(rec[18]!)
  const mode = PLAY_MODES[rec[23]!] ?? null
  if (level < 1 || level > LEVEL_MAX || pitch < -12 || pitch > 12 || pan < -PAN_MAX || pan > PAN_MAX || mode === null) return null
  return {
    ...DEFAULT,
    pitch,
    level,
    pan,
    mode,
    attack: rec[19]!,
    release: rec[20]!,
    timeMode: TIME_MODES[rec[21]!] ?? 'off',
    muteGroup: rec[22] !== 0,
  }
}

/** arc's saved form back ([toJson]); missing or unreadable fields are [DEFAULT]'s, the result [clamped]. */
export function fromJson(o: JsonObject | null): PadSettings {
  if (o === null) return DEFAULT
  const d = DEFAULT
  const mode = typeof o['mode'] === 'string' ? PlayMode.of(o['mode']) : null
  const timeMode = o['timeMode']
  return clamped(
    {
      pitch: num(o['pitch']) ?? d.pitch,
      level: int(o['level']) ?? d.level,
      pan: int(o['pan']) ?? d.pan,
      mode: mode ?? d.mode,
      start: long(o['start']) ?? d.start,
      end: long(o['end']),
      attack: int(o['attack']) ?? d.attack,
      release: int(o['release']) ?? d.release,
      muteGroup: bool(o['muteGroup']) ?? d.muteGroup,
      midiChannel: int(o['midiChannel']) ?? d.midiChannel,
      timeMode: typeof timeMode === 'string' ? timeMode : d.timeMode,
    },
    null,
  )
}

/** The Kotlin `PadSettings` (its methods and companion). */
export const PadSettings = {
  DEFAULT,
  KEY_RELEASE,
  ENV_MS_PER_TICK,
  PITCH_MAX,
  LEVEL_MAX,
  PAN_MAX,
  ENV_MAX,
  CHANNELS,
  TIME_MODES,
  KEYS,
  withMode,
  clamped,
  toMeta,
  mergedOnto,
  length,
  toJson,
  fromMeta,
  written,
  fromRecord,
  fromJson,
} as const
