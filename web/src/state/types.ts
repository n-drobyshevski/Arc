// Port of app/src/main/kotlin/dev/arc/ep133/controller/ArcController.kt (data classes, :58-151)
//
// Every data class of the controller as a plain readonly shape. Kotlin's
// defaults become the [emptyBrowser] / [emptySearch] / [initialState] values.
//
// Web deltas:
// - Map<Int, X> stays a ReadonlyMap (immutable: every change makes a new Map).
// - ByteArray is Uint8Array, IntRange (trim frames) is the half-open
//   TrimRange {start, end} of core/features/sampleTrim.
// - ToastMsg.id is a number from a counter (AtomicLong on Android).
// - UiState has two web additions for the library folder: [folderStatus]
//   (a remembered folder may need a tap to be used again) and
//   [canPickFolder] (File System Access is Chromium only).
// - UiState.keysPad is a PhysicalPad (compare with padKey(), not ===).
// - Live's EDIT (pad assignment): ToastMsg.action is the toast's UNDO word,
//   whose closure the controller keeps (runToastAction); BrowserUi.draftPad
//   is the pad an upload draft's sample goes onto.
// - Live offline (an addition): MirrorUi.offlineSounds (the Device / Factory
//   lists), UiState.offlinePads (changes kept) and UiState.offlinePrompt (the
//   question once the EP-133 connects).

import type { TakeInfo } from '../platform/storage/takeStore'
import type { Pak } from '../core/backup/pak'
import type { DiffResult } from '../core/features/backupDiff'
import type { DeviceContents, SoundDetails } from '../core/features/deviceBrowser'
import type { SearchGroup } from '../core/features/librarySearch'
import type { MirrorState } from '../core/features/liveMirror'
import type { SoundSource } from '../core/features/offlinePads'
import type { PhysicalPad } from '../core/features/padNotes'
import { PadOrder } from '../core/features/padPush'
import type { PakCompareResult } from '../core/features/pakCompare'
import type { PadGroup } from '../core/features/projectPads'
import type { TrimRange } from '../core/features/sampleTrim'
import type { SoundEntry, Storage } from '../core/protocol/device'
import type { DeviceInfo } from '../core/protocol/session'
import type { BackupRecord, RestoreSelection } from '../core/text/libraryRules'
import type { FolderStatus } from '../platform/storage/library'

export type { FolderStatus }

/** What the device panel shows (app.js state.device). The two counts are numbers, not lists. */
export interface DeviceSummary {
  readonly info: DeviceInfo
  readonly storage: Storage
  readonly sounds: number
  readonly projects: number
}

/** The progress sheet. */
export interface TaskUi {
  readonly title: string
  readonly label: string
  readonly fraction: number
  readonly cancelling: boolean
}

export interface ToastMsg {
  readonly id: number
  readonly text: string
  readonly error: boolean
  /** A key on the toast (Live's UNDO), its word; the controller runs it (runToastAction). */
  readonly action?: string | undefined
}

/** One picked file. [error] is set when it can't be uploaded (not a usable WAV). */
export interface UploadDraftItem {
  readonly fileName: string
  readonly name: string
  readonly slot: number | null
  readonly wav: Uint8Array | null
  readonly error: string | null
  /** Frames to upload; null means the whole file. */
  readonly trim: TrimRange | null
  /** The file's sample rate, for showing trim times (0 when unusable). */
  readonly sampleRate: number
}

/** What [BrowserUi.reading] can hold: "contents", "slot:N", "project:N", "play:N" or "mirror". */
export type ReadingKey = string

/** The device browser (an addition to the web version). */
export interface BrowserUi {
  readonly contents: DeviceContents | null
  readonly details: ReadonlyMap<number, SoundDetails>
  readonly projectSounds: ReadonlyMap<number, readonly number[]>
  /** Pads of the projects whose sounds were read (same download). */
  readonly projectPads: ReadonlyMap<number, readonly PadGroup[]>
  /** What is being read right now: "contents", "slot:N", "project:N", "play:N" or "mirror". */
  readonly reading: ReadingKey | null
  /** WAV files picked for upload, waiting for their slots to be confirmed. */
  readonly draft: readonly UploadDraftItem[] | null
  /** Live's EDIT: the pad the draft's sample goes onto once uploaded (null: a plain upload). */
  readonly draftPad?: PhysicalPad | null
}

/** Sound search across saved backups: the query, its results, and whether older backups are still being indexed. */
export interface SearchUi {
  readonly query: string
  readonly results: readonly SearchGroup<BackupRecord>[]
  readonly indexing: boolean
}

/**
 * Two saved backups being compared, older first. The sound names stay for
 * describing pad changes; the backups themselves are not kept.
 */
export interface PakCompareUi {
  readonly oldId: string
  readonly newId: string
  readonly result: PakCompareResult | null
  readonly oldNames: ReadonlyMap<number, string>
  readonly newNames: ReadonlyMap<number, string>
  readonly error: string | null
}

/**
 * The sounds Live offers without the device (an addition): the last read's
 * sound list ([device], sizes unknown, null before any read) and the saved
 * factory pack's ([factory], null without it). [base] is the list the pads
 * shown come from (FACTORY for the factory sounds' first project); the
 * device sounds arc can't play without the EP-133 are [unavailable].
 */
export interface OfflineSounds {
  readonly base: SoundSource
  readonly device: readonly SoundEntry[] | null
  readonly factory: readonly SoundEntry[] | null
  readonly unavailable: ReadonlySet<number>
}

/** The live mirror: what the device is playing, plus loading and errors. */
export interface MirrorUi {
  readonly state: MirrorState
  readonly loading: boolean
  readonly error: string | null
  /** Not connected, showing the last read instead: when it was made ("Last seen 5 Oct, 14:02"). */
  readonly offline?: string | null | undefined
  /** Offline: the sounds to preview and put on the pads in arc only. */
  readonly offlineSounds?: OfflineSounds | null | undefined
}

/** A backup opened for its contents screen (sounds and projects, playback, export). */
export interface ContentsUi {
  readonly backupId: string
  readonly pak: Pak | null
  readonly error: string | null
  /** Length of each sound in seconds; missing when its WAV can't be read. */
  readonly durations: ReadonlyMap<number, number>
}

/** The result of comparing a backup with the device, for the selection it was made with. */
export interface DiffUi {
  readonly backupId: string
  readonly selection: RestoreSelection
  readonly result: DiffResult
}

export interface UiState {
  readonly midiSupported: boolean
  readonly connected: boolean
  readonly device: DeviceSummary | null
  readonly busy: boolean
  readonly backups: readonly BackupRecord[]
  /** False until the library has been read once (the empty state stays hidden until then). */
  readonly libraryLoaded: boolean
  readonly freshId: string | null
  readonly task: TaskUi | null
  readonly spaceLeft: number | null
  readonly toast: ToastMsg | null
  readonly browser: BrowserUi
  readonly diff: DiffUi | null
  readonly contents: ContentsUi | null
  readonly search: SearchUi
  readonly pakCompare: PakCompareUi | null
  readonly mirror: MirrorUi | null
  /**
   * Live is copying a pad's sound from the device in the background. Unlike
   * [busy] it leaves every key enabled: an action waits for that one sound.
   */
  readonly backgroundRead: boolean
  /** The sound Live's KEYS plays: a pad, its sample as the mirror names it. */
  readonly keysPad: PhysicalPad | null
  /** Whether the library folder has been picked; until then restoring is offered. */
  readonly folderPicked: boolean
  /** Web: the remembered library folder's permission ('prompt' shows the "Reconnect library folder" banner). */
  readonly folderStatus: FolderStatus
  /** Web: whether this browser can pick a writable folder (else "Export library" and a read-only restore). */
  readonly canPickFolder: boolean
  /** Web: the library folder's name while it is in use (folderStatus 'granted'), for WebText.folderNote. */
  readonly folderName: string | null
  /** Live's pad changes made offline and kept (Reset pads), 0 when none. */
  readonly offlinePads: number
  /** The EP-133 connected with offline pad changes kept: how many, while it asks to write them. */
  readonly offlinePrompt: number | null
  /** Live's takes, newest first (ArcController.takes). */
  readonly takes: readonly TakeInfo[]
}

/** The three tabs under the top bar (ui/components Tab). */
export type Tab = 'backups' | 'live' | 'device'

/** Live is the home section: the app opens on it, and Back from another section returns to it (MainActivity). */
export const HOME_TAB: Tab = 'live'

export const emptyBrowser: BrowserUi = Object.freeze({
  contents: null,
  details: new Map(),
  projectSounds: new Map(),
  projectPads: new Map(),
  reading: null,
  draft: null,
})

export const emptySearch: SearchUi = Object.freeze({ query: '', results: [], indexing: false })

/** MirrorState() with Kotlin's defaults (nothing lit, nothing known). */
export function emptyMirrorState(padOrder: PadOrder = PadOrder.FROM_TOP): MirrorState {
  return {
    pads: new Map(),
    keysHeld: new Map(),
    lastKeysNote: null,
    lastHit: null,
    playing: null,
    bpm: null,
    activeProject: null,
    learned: new Map(),
    pushesSeen: false,
    padOrder,
    notes: new Map(),
    lastNote: null,
  }
}

/** UiState(midiSupported = midi.supported) with every other field at its default. */
export function initialState(midiSupported = true, canPickFolder = false): UiState {
  return {
    takes: [],
    midiSupported,
    connected: false,
    device: null,
    busy: false,
    backups: [],
    libraryLoaded: false,
    freshId: null,
    task: null,
    spaceLeft: null,
    toast: null,
    browser: emptyBrowser,
    diff: null,
    contents: null,
    search: emptySearch,
    pakCompare: null,
    mirror: null,
    backgroundRead: false,
    keysPad: null,
    folderPicked: false,
    folderStatus: 'none',
    canPickFolder,
    folderName: null,
    offlinePads: 0,
    offlinePrompt: null,
  }
}
