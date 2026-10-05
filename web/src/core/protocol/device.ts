// Port of core/src/main/kotlin/dev/arc/ep133/protocol/Device.kt (+ reference/src/protocol/device.js)
//
// EP-133 K.O. II filesystem layout and high-level operations.
//
//   /sounds    node 1000, children are sample slots 1..999 (raw s16le PCM + JSON metadata)
//   /projects  node 2000, project N lives at 3000 + (N-1)*1000 and reads/writes as a TAR

import { crc32 } from '../formats/crc32'
import { DeviceError } from './errors'
import {
  PUT_FLAGS_DIR,
  PUT_FLAGS_SOUND,
  asObject,
  download,
  getMetadata,
  listNode,
  listPage,
  setMetadata,
  upload,
  type DownloadOptions,
  type JsonObject,
  type JsonValue,
  type ProgressFn,
  type UploadTuning,
} from './fs'
import type { Session } from './session'

export { asObject, getMetadata, listNode, setMetadata }

export interface Storage {
  total: number
  free: number
  used: number
}

export interface SoundEntry {
  slot: number
  name: string
  size: number
}

export interface ProjectEntry {
  project: number
  node: number
  name: string
  size: number
}

/**
 * A sound read from, or about to be written to, the device.
 * [channels] and [sampleRate] are JS numbers (`Number(meta.x) || default`).
 */
export interface SoundData {
  slot: number
  name: string
  channels: number
  sampleRate: number
  settings: JsonObject
  pcm: Uint8Array
  /**
   * The name as the device's JSON had it (it need not be a string); goes into
   * arc.json unchanged. Missing means [name] (Kotlin's default).
   */
  nameValue?: JsonValue
}

export interface WriteOptions {
  onProgress?: ProgressFn | undefined
  /** Upload pacing (window, ack stall, streaming pauses); defaults match the Kotlin. */
  tuning?: UploadTuning | undefined
}

export const SOUNDS_NODE = 1000
export const PROJECTS_NODE = 2000
export const MAX_SAMPLE_RATE = 46875
export const MAX_SOUND_NAME = 20

export const projectNode = (n: number): number => 3000 + (n - 1) * 1000

export function projectFromNode(node: number): number | null {
  if (node < 3000 || (node - 3000) % 1000 !== 0) return null
  const n = (node - 3000) / 1000 + 1
  return n >= 1 && n <= 99 ? n : null
}

/** Per-sound settings worth carrying through a backup. */
export const SOUND_KEYS: readonly string[] = [
  'sound.playmode',
  'sound.rootnote',
  'sound.pitch',
  'sound.pan',
  'sound.amplitude',
  'sound.loopstart',
  'sound.loopend',
  'sound.bpm',
  'time.mode',
  'envelope.attack',
  'envelope.release',
]

/** Defaults sent with every sound upload, in this key order. */
export const DEFAULT_SOUND: Readonly<JsonObject> = Object.freeze({
  'sound.playmode': 'oneshot',
  'sound.rootnote': 60,
  'sound.pitch': 0,
  'sound.pan': 0,
  'sound.amplitude': 100,
  'envelope.attack': 0,
  'envelope.release': 255,
  'time.mode': 'off',
})

export function pickSoundSettings(meta?: Readonly<Record<string, unknown>> | null): JsonObject {
  const out: JsonObject = {}
  if (meta) {
    for (const k of SOUND_KEYS) {
      const v = meta[k]
      if (v !== undefined && v !== null) out[k] = v as JsonValue
    }
  }
  return out
}

export async function getStorage(session: Session): Promise<Storage> {
  const m = asObject(await getMetadata(session, SOUNDS_NODE))
  const total = Number(m.max_capacity) || 0
  const free = Number(m.free_space_in_bytes) || 0
  return { total, free, used: Math.max(0, total - free) }
}

export async function listSounds(session: Session): Promise<SoundEntry[]> {
  const entries = await listNode(session, SOUNDS_NODE)
  return entries
    .filter((e) => !e.isDir && e.node >= 1 && e.node <= 999)
    .map((e) => ({ slot: e.node, name: e.name, size: e.size }))
    .sort((a, b) => a.slot - b.slot)
}

export async function listProjects(session: Session): Promise<ProjectEntry[]> {
  const out: ProjectEntry[] = []
  for (const e of await listNode(session, PROJECTS_NODE)) {
    const n = projectFromNode(e.node)
    if (n != null) out.push({ project: n, node: e.node, name: e.name, size: e.size })
  }
  return out.sort((a, b) => a.project - b.project)
}

export async function readSound(session: Session, slot: number, opts: DownloadOptions = {}): Promise<SoundData> {
  const meta = asObject(await getMetadata(session, slot))
  const pcm = await download(session, slot, opts)
  // meta.name || `sound ${slot}`: the raw value is kept for arc.json.
  const nameValue: JsonValue = meta.name || `sound ${slot}`
  return {
    slot,
    name: meta.name ? String(meta.name) : `sound ${slot}`,
    channels: Number(meta.channels) || 1,
    sampleRate: Number(meta.samplerate) || MAX_SAMPLE_RATE,
    settings: pickSoundSettings(meta),
    pcm,
    nameValue,
  }
}

export function readProject(session: Session, n: number, opts: DownloadOptions = {}): Promise<Uint8Array> {
  return download(session, projectNode(n), opts)
}

/** Metadata sent with a sound upload. */
export function soundMeta(
  channels: number,
  sampleRate: number,
  settings: Readonly<Record<string, unknown>> | null | undefined,
  frames: number,
): JsonObject {
  const meta: JsonObject = { ...DEFAULT_SOUND, ...pickSoundSettings(settings), channels, samplerate: sampleRate }
  // Loop points beyond the end of the sample confuse the device. This is the
  // JS relational `>`: numeric strings compare as numbers, anything else is false.
  const last = frames - 1
  const loopEnd = meta['sound.loopend']
  if (loopEnd != null && (loopEnd as number) > last) meta['sound.loopend'] = last
  const loopStart = meta['sound.loopstart']
  if (loopStart != null && (loopStart as number) > last) meta['sound.loopstart'] = 0
  // Stay under the 320 byte metadata page by dropping optional keys.
  const optional = ['sound.bpm', 'sound.loopstart', 'sound.loopend', 'time.mode', 'sound.pan']
  const utf8 = new TextEncoder()
  while (utf8.encode(JSON.stringify(meta)).length > 320 && optional.length) {
    delete meta[optional.shift()!]
  }
  return meta
}

export function cleanSoundName(name: string | null | undefined): string {
  return (
    (name || 'sound')
      // Without the u flag, /i only folds ASCII letters, as the Kotlin spells out.
      .replace(/\.wav$/i, '')
      .replace(/[^\x20-\x7e]/g, '')
      .trim()
      .slice(0, MAX_SOUND_NAME) || 'sound'
  )
}

/** Upload PCM (s16le interleaved) into a sample slot and verify it landed intact. */
export async function writeSound(session: Session, sound: SoundData, opts: WriteOptions = {}): Promise<void> {
  const { slot, name, pcm, channels, sampleRate, settings } = sound
  if (!pcm.length) throw new DeviceError(`Sound ${slot} is empty`)
  const frames = Math.floor(pcm.length / (2 * channels))
  const meta = soundMeta(channels, sampleRate, settings, frames)
  await upload(session, {
    ...opts.tuning,
    node: slot,
    parent: SOUNDS_NODE,
    flags: PUT_FLAGS_SOUND,
    name: cleanSoundName(name),
    meta,
    data: pcm,
    onProgress: opts.onProgress,
    barrier: () => setMetadata(session, slot, meta, { timeout: 180000, progress: true }),
  })
  // Sound uploads are verified by comparing the device's crc with a CRC32 of
  // the PCM, only when the device reports one. A crc that is not a number
  // never matches (JS !==).
  const after = asObject(await getMetadata(session, slot))
  const crc = after.crc
  if (crc !== undefined && crc !== null) {
    const same = typeof crc === 'number' && crc === crc32(pcm)
    if (!same) throw new DeviceError(`Sound ${slot} did not verify after upload (checksum mismatch)`)
  }
}

/** Upload a project TAR and make the device reload it. */
export async function writeProject(session: Session, n: number, tar: Uint8Array, opts: WriteOptions = {}): Promise<void> {
  const node = projectNode(n)
  await upload(session, {
    ...opts.tuning,
    node,
    parent: PROJECTS_NODE,
    flags: PUT_FLAGS_DIR,
    name: String(n).padStart(2, '0'),
    data: tar,
    onProgress: opts.onProgress,
    barrier: () => listPage(session, PROJECTS_NODE, 0, { timeout: 180000, progress: true }),
  })
  // The device keeps the old project in memory if it is the active one.
  // Switch away and back so the new data is actually loaded.
  try {
    const projects = await listProjects(session)
    const other = projects.find((p) => p.project !== n)
    if (other) {
      await setMetadata(session, PROJECTS_NODE, { active: other.node })
      await new Promise((r) => setTimeout(r, 200))
    }
    await setMetadata(session, PROJECTS_NODE, { active: node })
  } catch {
    // Non-fatal: the project is written, it loads next time it is selected.
  }
}
