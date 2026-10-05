// Port of core/src/main/kotlin/dev/arc/ep133/backup/Backup.kt (+ reference/src/backup.js)
//
// Device <-> .pak backup and restore.
//
// A backup is a ZIP laid out like the official Sample Tool's .pak:
//   /meta.json
//   /sounds/NNN name.wav
//   /projects/PNN.tar
// plus /arc.json with per-sound settings and library info, which the
// official tool ignores.

import { decodeWav, encodeWav, resampleS16 } from '../formats/wav'
import { writeZip, type ZipEntry } from '../formats/zip'
import { checkAbort } from '../protocol/cancel'
import {
  MAX_SAMPLE_RATE,
  PROJECTS_NODE,
  getStorage,
  listProjects,
  listSounds,
  projectNode,
  readProject,
  readSound,
  writeProject,
  writeSound,
  type ProjectEntry,
  type SoundData,
} from '../protocol/device'
import { asObject, getMetadata, isJsonObject, setMetadata, type JsonObject, type JsonValue } from '../protocol/fs'
import type { Session } from '../protocol/session'
import { APP_NAME, APP_VERSION } from '../../version'
import type { Pak, PakSound } from './pak'

export { APP_NAME, APP_VERSION }

/** Progress of a backup or restore: a fraction in 0..1 and what is being worked on. */
export interface Progress {
  fraction: number
  label: string
}

export interface SummaryDevice {
  product: string
  sku: string
  serial: string
  osVersion: string
}

export interface BackupSummary {
  createdAt: number
  device: SummaryDevice
  soundCount: number
  projectCount: number
  projects: number[]
}

export interface BackupResult {
  bytes: Uint8Array
  summary: BackupSummary
}

export interface RestoreResult {
  sounds: number
  projects: number
}

/** A plain `Error` in the JS (not a device error), e.g. "Not enough room on the device". */
export class RestoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RestoreError'
  }
}

const PROJECT_WEIGHT = 64 * 1024

export const pad3 = (n: number): string => String(n).padStart(3, '0')
export const pad2 = (n: number): string => String(n).padStart(2, '0')
// slice(0, 40) counts UTF-16 code units, like Kotlin's take(40).
export const safeName = (s: string): string => String(s).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 40)

const utf8 = new TextEncoder()

/** The .pak's /meta.json, as backup.js writes it (key order is part of the format). */
export function metaJson(
  product: string,
  sku: string,
  osVersion: string,
  createdAt: number,
  appVersion: string = APP_VERSION,
): JsonObject {
  return {
    info: 'teenage engineering - pak file',
    pak_version: 1,
    pak_type: 'user',
    pak_release: '1.2.0',
    device_name: product,
    device_sku: sku,
    device_version: osVersion,
    generated_at: isoString(createdAt),
    author: `${APP_NAME} ${appVersion}`,
  }
}

/** `Date.prototype.toISOString()`: always milliseconds and Z. */
export function isoString(ms: number): string {
  return new Date(ms).toISOString()
}

export interface BackupOptions {
  onProgress?: (p: Progress) => void
  signal?: AbortSignal | null
  /** The clock; tests pin the timestamp. */
  now?: () => number
  /** Minutes east of UTC for the zip's DOS times (Kotlin `zone`). Default: the local zone. */
  offsetMin?: number
  /** The version named in meta.json's author; tests pass the reference version to compare byte for byte. */
  appVersion?: string
}

/** Pull every sound and project off the device. */
export async function backupDevice(session: Session, opts: BackupOptions = {}): Promise<BackupResult> {
  const { onProgress = () => {}, signal, now = Date.now, offsetMin, appVersion = APP_VERSION } = opts
  const info = session.info
  onProgress({ fraction: 0, label: 'Reading device contents' })
  const sounds = await listSounds(session)
  let projects: ProjectEntry[] = await listProjects(session)
  // Some firmware lists no projects; then try the first nine directly and
  // keep whatever downloads.
  const probing = projects.length === 0
  if (probing) projects = Array.from({ length: 9 }, (_, i) => ({ project: i + 1, node: projectNode(i + 1), name: '', size: 0 }))

  const totalWeight =
    sounds.reduce((n, s) => n + Math.max(s.size, 1024), 0) + projects.length * PROJECT_WEIGHT || 1
  let doneWeight = 0
  const report = (label: string, partial = 0): void =>
    onProgress({ fraction: Math.min(1, (doneWeight + partial) / totalWeight), label })

  const entries: ZipEntry[] = []
  // Slot keys: JS orders integer keys ascending, which arc.json relies on.
  const soundInfo: JsonObject = {}
  for (const s of sounds) {
    checkAbort(signal)
    const weight = Math.max(s.size, 1024)
    const label = `Sound ${pad3(s.slot)}, ${s.name}`
    report(label)
    const snd = await readSound(session, s.slot, {
      signal,
      onProgress: (got, total) => report(label, total ? (got / total) * weight : 0),
    })
    entries.push({
      path: `/sounds/${pad3(s.slot)} ${safeName(snd.name)}.wav`,
      data: encodeWav(snd.pcm, snd.channels, snd.sampleRate),
    })
    soundInfo[s.slot] = { name: snd.nameValue ?? snd.name, settings: snd.settings }
    doneWeight += weight
  }

  const projectNums: number[] = []
  for (const p of projects) {
    checkAbort(signal)
    const label = `Project ${pad2(p.project)}`
    report(label)
    try {
      const tar = await readProject(session, p.project, { signal })
      if (tar.length) {
        entries.push({ path: `/projects/P${pad2(p.project)}.tar`, data: tar })
        projectNums.push(p.project)
      }
    } catch (err) {
      // While probing, a project that does not download is just not there
      // (a cancel is caught by the next checkAbort, as in the JS).
      if (!probing) throw err
    }
    doneWeight += PROJECT_WEIGHT
  }

  const createdAt = now()
  const product = info?.product || 'EP-133'
  const meta = metaJson(product, info?.sku || '', info?.osVersion || '', createdAt, appVersion)
  const sidecar: JsonObject = { app: APP_NAME, version: 1, sounds: soundInfo }
  entries.unshift(
    { path: '/meta.json', data: utf8.encode(JSON.stringify(meta, null, 2)) },
    { path: '/arc.json', data: utf8.encode(JSON.stringify(sidecar)) },
  )
  onProgress({ fraction: 1, label: 'Packing backup' })
  const bytes = await writeZip(entries, offsetMin === undefined ? { date: createdAt } : { date: createdAt, offsetMin })
  return {
    bytes,
    summary: {
      createdAt,
      device: { product, sku: info?.sku || '', serial: info?.serial || '', osVersion: info?.osVersion || '' },
      soundCount: sounds.length,
      projectCount: projectNums.length,
      projects: projectNums,
    },
  }
}

/** Decode a backed-up WAV into what the device takes: s16 PCM at 46875 Hz or below. */
export function prepareSound(snd: PakSound): SoundData {
  const wav = decodeWav(snd.wav)
  const rate = Math.min(wav.sampleRate, MAX_SAMPLE_RATE)
  const pcm = resampleS16(wav.pcm, wav.channels, wav.sampleRate, rate)
  // {...(wav.embedded ?? {}), ...(snd.settings ?? {})}; the sidecar is merged only if it is an object.
  const settings: JsonObject = { ...((wav.embedded ?? {}) as JsonObject), ...(isJsonObject(snd.settings) ? snd.settings : {}) }
  if (rate !== wav.sampleRate) {
    // Loop points are frame positions, so they scale with the sample rate.
    const k = rate / wav.sampleRate
    for (const key of ['sound.loopstart', 'sound.loopend']) {
      const v = settings[key]
      if (typeof v === 'number') settings[key] = Math.round(v * k)
    }
  }
  return { slot: snd.slot, name: snd.name, channels: wav.channels, sampleRate: rate, settings, pcm }
}

export interface RestoreOptions {
  /** Slots to restore; default every sound in the file. */
  slots?: readonly number[] | null
  /** Projects to restore; default every project in the file. */
  projects?: readonly number[] | null
  onProgress?: (p: Progress) => void
  signal?: AbortSignal | null
}

/**
 * Write a .pak (or a subset of it) back to the device.
 * [slots] and [projects] default to everything in the file.
 */
export async function restorePak(session: Session, pak: Pak, opts: RestoreOptions = {}): Promise<RestoreResult> {
  const { slots, projects, onProgress = () => {}, signal } = opts
  const slotList = (slots ?? [...pak.sounds.keys()]).filter((s) => pak.sounds.has(s)).sort((a, b) => a - b)
  const projList = (projects ?? [...pak.projects.keys()]).filter((p) => pak.projects.has(p)).sort((a, b) => a - b)

  onProgress({ fraction: 0, label: 'Checking space on device' })
  const prepared = slotList.map((s) => prepareSound(pak.sounds.get(s)!))
  const needed = prepared.reduce((n, p) => n + p.pcm.length, 0)
  // Restore checks free space before writing anything. Sounds about to be
  // overwritten free their space, so they count as available.
  const storage = await getStorage(session)
  if (storage.total) {
    const onDevice = await listSounds(session)
    const reclaim = onDevice.filter((s) => slotList.includes(s.slot)).reduce((n, s) => n + s.size, 0)
    if (needed > storage.free + reclaim) {
      const mb = (b: number): string => (b / 1048576).toFixed(1)
      throw new RestoreError(
        `Not enough room on the device: this restore needs ${mb(needed)} MB, ` +
          `${mb(storage.free + reclaim)} MB is available. Delete some samples on the device or restore fewer sounds.`,
      )
    }
  }

  let active: JsonValue | undefined
  try {
    active = asObject(await getMetadata(session, PROJECTS_NODE)).active
  } catch {
    active = undefined
  }

  const totalWeight = needed + projList.length * PROJECT_WEIGHT || 1
  let doneWeight = 0
  const report = (label: string, partial = 0): void =>
    onProgress({ fraction: Math.min(1, (doneWeight + partial) / totalWeight), label })

  for (const snd of prepared) {
    checkAbort(signal)
    const label = `Sound ${pad3(snd.slot)}, ${snd.name}`
    report(label)
    let lastErr: unknown = null
    // A sound whose checksum does not match is uploaded once more.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await writeSound(session, snd, { onProgress: (got) => report(label, got) })
        lastErr = null
        break
      } catch (err) {
        lastErr = err
        const message = err instanceof Error ? err.message : undefined
        if (!message?.includes('did not verify')) break
        report(`${label}, retrying`)
      }
    }
    if (lastErr !== null) throw lastErr
    doneWeight += snd.pcm.length
  }

  for (const n of projList) {
    checkAbort(signal)
    report(`Project ${pad2(n)}`)
    await writeProject(session, n, pak.projects.get(n)!)
    doneWeight += PROJECT_WEIGHT
  }

  // Project uploads switch the active project; put back the one that was active.
  if (projList.length && typeof active === 'number') {
    try {
      await setMetadata(session, PROJECTS_NODE, { active })
    } catch {
      // Non-fatal.
    }
  }
  onProgress({ fraction: 1, label: 'Done' })
  return { sounds: slotList.length, projects: projList.length }
}
