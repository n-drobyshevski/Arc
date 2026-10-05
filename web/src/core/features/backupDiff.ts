// Port of core/src/main/kotlin/dev/arc/ep133/features/BackupDiff.kt
//
// Compares a backup with what is on the device (not part of the web
// version). Sounds are compared by the device's CRC against a CRC of the PCM
// a restore would actually upload (after resampling); projects by
// downloading them. Nothing is written.
//
// Web deltas: Kotlin's enums are string unions with a const object of the
// same name; the data classes are plain objects built by same-named factory
// functions, with the Kotlin computed properties (nameDiffers, unchanged,
// changes) filled in as fields when the object is built. CancelSignal is an
// AbortSignal and Session.onLoop is dropped (single-threaded JS).

import { prepareSound, type Progress } from '../backup/backup'
import type { Pak } from '../backup/pak'
import { crc32 } from '../formats/crc32'
import { checkAbort } from '../protocol/cancel'
import { SOUND_KEYS, cleanSoundName, listProjects, listSounds, pickSoundSettings, readProject, soundMeta } from '../protocol/device'
import { DeviceError } from '../protocol/errors'
import { asObject, getMetadata, type JsonValue } from '../protocol/fs'
import type { Session } from '../protocol/session'
import { equalBytes } from '../util/bytes'

export type SoundState = 'SAME_AUDIO' | 'DIFFERENT_AUDIO' | 'NOT_ON_DEVICE' | 'UNVERIFIED'
export const SoundState = {
  /** The device has exactly this audio (its CRC matches). */
  SAME_AUDIO: 'SAME_AUDIO',
  /** The device has different audio in this slot; restoring replaces it. */
  DIFFERENT_AUDIO: 'DIFFERENT_AUDIO',
  /** The slot is empty on the device; restoring adds the sound. */
  NOT_ON_DEVICE: 'NOT_ON_DEVICE',
  /** The device reports no CRC; size matches, so the audio is probably the same. */
  UNVERIFIED: 'UNVERIFIED',
} as const

export interface SoundDiff {
  readonly slot: number
  readonly backupName: string
  readonly deviceName: string | null
  readonly state: SoundState
  /** Setting keys whose value on the device differs from what a restore would write. */
  readonly settingsDiffer: readonly string[]
  /** `deviceName != null && deviceName != cleanSoundName(backupName)` */
  readonly nameDiffers: boolean
  /** Restoring this slot would change nothing. */
  readonly unchanged: boolean
}

export function SoundDiff(
  slot: number,
  backupName: string,
  deviceName: string | null,
  state: SoundState,
  settingsDiffer: readonly string[],
): SoundDiff {
  const nameDiffers = deviceName !== null && deviceName !== cleanSoundName(backupName)
  const unchanged = state === SoundState.SAME_AUDIO && !nameDiffers && settingsDiffer.length === 0
  return { slot, backupName, deviceName, state, settingsDiffer, nameDiffers, unchanged }
}

export type ProjectState = 'SAME' | 'DIFFERENT' | 'NOT_ON_DEVICE'
export const ProjectState = { SAME: 'SAME', DIFFERENT: 'DIFFERENT', NOT_ON_DEVICE: 'NOT_ON_DEVICE' } as const

export interface ProjectDiff {
  readonly project: number
  readonly state: ProjectState
}

export function ProjectDiff(project: number, state: ProjectState): ProjectDiff {
  return { project, state }
}

export interface DiffResult {
  readonly sounds: readonly SoundDiff[]
  readonly projects: readonly ProjectDiff[]
  /** Slots on the device that the compared backup does not contain (a restore leaves them alone). */
  readonly deviceOnlySlots: readonly number[]
  readonly deviceOnlyProjects: readonly number[]
  /** Sounds that are not unchanged plus projects that are not the same. */
  readonly changes: number
}

export function DiffResult(
  sounds: readonly SoundDiff[],
  projects: readonly ProjectDiff[],
  deviceOnlySlots: readonly number[],
  deviceOnlyProjects: readonly number[],
): DiffResult {
  const changes =
    sounds.filter((s) => !s.unchanged).length + projects.filter((p) => p.state !== ProjectState.SAME).length
  return { sounds, projects, deviceOnlySlots, deviceOnlyProjects, changes }
}

export interface CompareOptions {
  /** Slots to compare; default every sound in the backup. */
  slots?: readonly number[] | null
  /** Projects to compare; default every project in the backup. */
  projects?: readonly number[] | null
  onProgress?: (p: Progress) => void
  signal?: AbortSignal | null
}

const PROJECT_WEIGHT = 64 * 1024

const byNumber = (a: number, b: number): number => a - b

/** Kotlin `filter { in pak }.distinct().sorted()`. */
function pick(wanted: readonly number[] | null | undefined, inPak: ReadonlyMap<number, unknown>): number[] {
  return [...new Set((wanted ?? [...inPak.keys()]).filter((n) => inPak.has(n)))].sort(byNumber)
}

/** Equal as JSON values (numbers compare by value: 60 and 60.0 are the same in JS anyway). */
function sameValue(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  if (a === undefined || b === undefined) return a === b
  return JSON.stringify(a) === JSON.stringify(b)
}

export async function compare(session: Session, pak: Pak, opts: CompareOptions = {}): Promise<DiffResult> {
  const { slots, projects, onProgress = () => {}, signal } = opts
  const slotList = pick(slots, pak.sounds)
  const projList = pick(projects, pak.projects)

  onProgress({ fraction: 0, label: 'Reading device contents' })
  const onDevice = new Map((await listSounds(session)).map((e) => [e.slot, e] as const))
  const deviceProjects = new Set((await listProjects(session)).map((p) => p.project))
  const total = slotList.length * 1024 + projList.length * PROJECT_WEIGHT || 1
  let done = 0
  const report = (label: string): void => onProgress({ fraction: Math.min(1, done / total), label })

  const sounds: SoundDiff[] = []
  for (const slot of slotList) {
    checkAbort(signal)
    const snd = pak.sounds.get(slot)!
    report(`Sound ${String(slot).padStart(3, '0')}, ${snd.name}`)
    const entry = onDevice.get(slot)
    if (entry === undefined) {
      sounds.push(SoundDiff(slot, snd.name, null, SoundState.NOT_ON_DEVICE, []))
    } else {
      const prepared = prepareSound(snd)
      const meta = asObject(await getMetadata(session, slot))
      const crc = typeof meta.crc === 'number' ? meta.crc : null
      const state: SoundState =
        crc !== null
          ? crc === crc32(prepared.pcm)
            ? SoundState.SAME_AUDIO
            : SoundState.DIFFERENT_AUDIO
          : entry.size !== prepared.pcm.length
            ? SoundState.DIFFERENT_AUDIO
            : SoundState.UNVERIFIED
      // Compare what a restore would write (after clamping) with the device,
      // for the settings the backup carries.
      const frames = Math.floor(prepared.pcm.length / (2 * prepared.channels))
      const written = soundMeta(prepared.channels, prepared.sampleRate, prepared.settings, frames)
      // A restore writes defaults for settings the backup lacks (soundMeta), so
      // every written setting counts. A key the device does not report can only
      // be judged when the backup sets it explicitly.
      const explicit = new Set(Object.keys(pickSoundSettings(prepared.settings)))
      const differ = SOUND_KEYS.filter((k) => {
        const w = Object.hasOwn(written, k) ? written[k] : undefined
        if (w === undefined) return false
        const d = Object.hasOwn(meta, k) ? meta[k] : undefined
        return d === undefined ? explicit.has(k) : !sameValue(w, d)
      })
      sounds.push(SoundDiff(slot, snd.name, entry.name, state, differ))
    }
    done += 1024
  }

  const projectDiffs: ProjectDiff[] = []
  for (const n of projList) {
    checkAbort(signal)
    report(`Project ${String(n).padStart(2, '0')}`)
    // Like the backup, try the download even if the device lists no projects.
    let onDeviceTar: Uint8Array | null = null
    if (deviceProjects.size === 0 || deviceProjects.has(n)) {
      try {
        onDeviceTar = await readProject(session, n, { signal })
      } catch (err) {
        // Only while probing (the device lists no projects) does a failed
        // download mean "not there", as in the backup. Otherwise it is an error.
        if (!(err instanceof DeviceError) || deviceProjects.size !== 0) throw err
        onDeviceTar = null
      }
    }
    const state: ProjectState =
      onDeviceTar === null || onDeviceTar.length === 0
        ? ProjectState.NOT_ON_DEVICE
        : equalBytes(onDeviceTar, pak.projects.get(n)!)
          ? ProjectState.SAME
          : ProjectState.DIFFERENT
    projectDiffs.push(ProjectDiff(n, state))
    done += PROJECT_WEIGHT
  }

  onProgress({ fraction: 1, label: 'Done' })
  return DiffResult(
    sounds,
    projectDiffs,
    [...onDevice.keys()].filter((s) => !pak.sounds.has(s)).sort(byNumber),
    [...deviceProjects].filter((p) => !pak.projects.has(p)).sort(byNumber),
  )
}

/** The Kotlin `object BackupDiff`. */
export const BackupDiff = { compare } as const
