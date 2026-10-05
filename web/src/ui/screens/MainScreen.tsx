// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/MainScreen.kt
//
// The Backups tab (index.html .app): the device panel and the library. The
// header's keys live in the top bar now.
//
// Web deltas:
// - No MIDI: WebText.NO_MIDI_* (the browser, not the phone).
// - The library lives in the browser: WebText.storageNote ("stored in this browser").
// - The library folder is opt-in (File System Access). Under the list: the
//   folder note while one is in use, else the note offering one with a key
//   to pick it (Android: "Restore from Documents/arc" until it is picked);
//   browsers that can't keep a folder get "Export library" instead.
//   A remembered folder whose permission lapsed shows the "Reconnect library
//   folder" banner (folderStatus 'prompt'), which also stands in for the
//   empty library's restore hint and key.
import type { JSX } from 'preact'
import { CoachText } from '../../core/text/coachText'
import { bytes } from '../../core/text/format'
import type { BackupRecord } from '../../core/text/libraryRules'
import { NavText } from '../../core/text/navText'
import { Strings } from '../../core/text/strings'
import { WebText } from '../../core/text/webText'
import type { UiState } from '../../state/types'
import { Caption } from '../components/Caption'
import { DashedBox } from '../components/DashedBox'
import { DisplayPanel } from '../components/DisplayPanel'
import { GridPlate, PlateLine } from '../components/GridPlate'
import { IconBlock } from '../components/IconBlock'
import { ArcIcon } from '../components/Icons'
import { Key } from '../components/Key'
import { Meter } from '../components/Meter'
import './MainScreen.css'

export interface MainScreenProps {
  state: UiState
  fmtDay: (ms: number) => string
  onBackup: () => void
  onImport: () => void
  /** A row tap: the detail sheet. */
  onOpen: (b: BackupRecord) => void
  onSearch: () => void
  /** Restore from a folder (Android: Documents/arc). */
  onRestoreFolder: () => void
  /** Web: the "Reconnect library folder" banner (state.folderStatus === 'prompt'). */
  onReconnectFolder: () => void
  /** Web: "Export library" where no folder can be picked (!state.canPickFolder). */
  onExportLibrary: () => void
}

/** What the display panel shows (DevicePanel's `when`). */
export interface DevicePanelModel {
  title: string
  sub: string
  hint: string | null
  fraction: number
  /** The meter's description (contentDescription), "" when there is no device. */
  meterText: string
  /** Sounds, projects and free bytes (free only when the storage size is known). */
  stats: { sounds: number; projects: number; free: number | null } | null
}

export function devicePanel(state: Pick<UiState, 'midiSupported' | 'connected' | 'device'>): DevicePanelModel {
  const d = state.device
  if (!state.midiSupported) {
    return { title: WebText.NO_MIDI_TITLE, sub: '', hint: WebText.NO_MIDI_HINT, fraction: 0, meterText: '', stats: null }
  }
  if (d === null) {
    return {
      title: state.connected ? Strings.READING_DEVICE : Strings.NO_DEVICE,
      sub: '',
      hint: state.connected ? Strings.ONE_MOMENT : Strings.PLUG_IN_HINT,
      fraction: 0,
      meterText: '',
      stats: null,
    }
  }
  return {
    title: d.info.product.length !== 0 ? d.info.product : 'EP-133',
    sub: Strings.osVersion(d.info.osVersion),
    hint: null,
    fraction: d.storage.total !== 0 ? d.storage.used / d.storage.total : 0,
    meterText: Strings.meterDescription(d.storage.used, d.storage.total),
    stats: { sounds: d.sounds, projects: d.projects, free: d.storage.total !== 0 ? d.storage.free : null },
  }
}

/** The library folder's lines under the list (web: the folder is opt-in). */
export interface FolderModel {
  /** The "Reconnect library folder" banner. */
  reconnect: boolean
  /** The empty library's restore hint and key. */
  emptyRestore: boolean
  /** The note under a non-empty list ("" for none). */
  note: string
  /** The quiet key after the note. */
  key: 'pick' | 'export' | null
}

export function folderModel(
  state: Pick<UiState, 'backups' | 'libraryLoaded' | 'folderPicked' | 'folderStatus' | 'canPickFolder' | 'folderName'>,
): FolderModel {
  const reconnect = state.folderStatus === 'prompt'
  const empty = state.backups.length === 0
  const out: FolderModel = { reconnect, emptyRestore: empty && state.libraryLoaded && !reconnect, note: '', key: null }
  if (empty || reconnect) return out
  if (state.folderPicked) {
    if (state.folderName !== null) out.note = WebText.folderNote(state.folderName)
  } else if (state.canPickFolder) {
    out.note = WebText.FOLDER_NOTE_OFF
    out.key = 'pick'
  } else {
    out.note = WebText.EXPORT_LIBRARY_NOTE
    out.key = 'export'
  }
  return out
}

export function MainScreen(props: MainScreenProps): JSX.Element {
  const { state } = props
  const hasBackups = state.backups.length > 0
  const folder = folderModel(state)
  const totalSize = state.backups.reduce((sum, b) => sum + b.size, 0)
  const note = WebText.storageNote(state.backups.length, totalSize, state.spaceLeft)
  return (
    <div class="main-screen" data-screen="backups">
      <div class="main-screen__column">
        <Caption text={NavText.DEVICE_CAPTION} />
        <DevicePanel state={state} />

        {/* The top bar's Back up block does this too; the big key stays until the first backup. */}
        {!hasBackups && (
          <Key
            text={Strings.BACK_UP}
            variant="signal"
            size="wide"
            block
            disabled={!(state.midiSupported && state.device !== null && !state.busy)}
            onClick={props.onBackup}
          />
        )}

        <section class="main-screen__library" aria-labelledby="arc-backups-caption">
          {/* The caption with its tools as icons (named on long-press and in the guide overlay). */}
          <div class="main-screen__head">
            <Caption id="arc-backups-caption" as="h2" text={Strings.BACKUPS} align="start" class="main-screen__caption" />
            {/* Addition to the web version: find sounds across backups. */}
            {hasBackups && (
              <span class="main-screen__tool" data-coach="backups.search">
                <IconBlock icon={ArcIcon.SEARCH} label={CoachText.SEARCH} face="var(--tab-off)" ink="var(--navy)" onClick={props.onSearch} />
              </span>
            )}
            <span class="main-screen__tool" data-coach="backups.import">
              <IconBlock icon={ArcIcon.IMPORT} label={CoachText.IMPORT} face="var(--tab-off)" ink="var(--navy)" onClick={props.onImport} />
            </span>
          </div>
          {folder.reconnect && (
            <div class="main-screen__banner" role="status">
              <p class="t-small main-screen__banner-text">{WebText.RECONNECT_HINT}</p>
              <Key text={WebText.RECONNECT_FOLDER} variant="navy" block onClick={props.onReconnectFolder} />
            </div>
          )}
          {hasBackups ? (
            <div data-coach="backups.open">
              <BackupList list={state.backups} freshId={state.freshId} fmtDay={props.fmtDay} onOpen={props.onOpen} />
            </div>
          ) : state.libraryLoaded ? (
            // #empty starts hidden and only shows once the library has loaded.
            <DashedBox>
              <p class="t-bold">{Strings.EMPTY_TITLE}</p>
              <p class="main-screen__muted">{Strings.EMPTY_TEXT}</p>
            </DashedBox>
          ) : null}
          {folder.emptyRestore && (
            <>
              {/* Addition: a new browser can read a library back from an arc folder. */}
              <p class="t-small main-screen__muted">{WebText.RESTORE_HINT}</p>
              <Key text={WebText.RESTORE_FOLDER} block onClick={props.onRestoreFolder} />
            </>
          )}
          {note.length !== 0 && <p class="t-tiny main-screen__muted">{note}</p>}
          {folder.note.length !== 0 && <p class="t-tiny main-screen__muted">{folder.note}</p>}
          {folder.key === 'pick' && (
            <div class="main-screen__quiet">
              <Key text={WebText.PICK_FOLDER} size="small" variant="quiet" onClick={props.onRestoreFolder} />
            </div>
          )}
          {folder.key === 'export' && (
            <div class="main-screen__quiet">
              <Key text={WebText.EXPORT_LIBRARY} size="small" variant="quiet" onClick={props.onExportLibrary} />
              <Key text={WebText.RESTORE_FOLDER} size="small" variant="quiet" onClick={props.onRestoreFolder} />
            </div>
          )}
        </section>

        <p class="t-tiny main-screen__muted main-screen__footer">{Strings.FOOTER}</p>
      </div>
    </div>
  )
}

function DevicePanel(props: { state: UiState }): JSX.Element {
  const m = devicePanel(props.state)
  return (
    <DisplayPanel class="device-panel">
      {/* .display-head: space-between, aligned on the text baseline */}
      <div class="device-panel__head">
        <p class="t-display-head device-panel__title">{m.title}</p>
        {m.sub.length !== 0 && <p class="t-display-sub device-panel__sub">{m.sub}</p>}
      </div>
      <div role={m.meterText ? 'img' : undefined} aria-label={m.meterText || undefined}>
        <Meter fraction={m.fraction} />
      </div>
      {m.hint !== null ? (
        // .display-hint { max-width: 34ch }
        <p class="t-display-hint device-panel__hint">{m.hint}</p>
      ) : m.stats !== null ? (
        <div class="device-panel__stats">
          <Stat num={String(m.stats.sounds)} label={Strings.soundsLabel(m.stats.sounds)} />
          <Stat num={String(m.stats.projects)} label={Strings.projectsLabel(m.stats.projects)} />
          {m.stats.free !== null && (
            <div class="device-panel__free">
              <span class="t-stat-free device-panel__num">{bytes(m.stats.free)}</span>
              <span class="t-stat-label device-panel__label">{Strings.FREE}</span>
            </div>
          )}
        </div>
      ) : null}
    </DisplayPanel>
  )
}

function Stat(props: { num: string; label: string }): JSX.Element {
  return (
    <div class="device-panel__stat">
      <span class="t-stat-num device-panel__num">{props.num}</span>
      <span class="t-stat-label device-panel__label">{props.label}</span>
    </div>
  )
}

export interface BackupListProps {
  list: readonly BackupRecord[]
  freshId: string | null
  fmtDay: (ms: number) => string
  onOpen: (b: BackupRecord) => void
}

/** The library rows on a plate (also the compare picker's list). */
export function BackupList(props: BackupListProps): JSX.Element {
  return (
    <GridPlate class="backup-list" role="list">
      {props.list.map((b, i) => (
        <div key={b.id} role="listitem" class="backup-list__item">
          {i > 0 && <PlateLine />}
          {/* .backup-row:active { background: key-edge at 35% } instead of a ripple */}
          <button type="button" class="backup-row" onClick={() => props.onOpen(b)}>
            <span class="backup-row__top">
              <span class="backup-row__title">
                {b.id === props.freshId && <span class="backup-row__fresh" aria-hidden="true" />}
                <span class="t-bold backup-row__name">{b.title}</span>
              </span>
              <span class="t-small backup-row__day">{props.fmtDay(b.createdAt)}</span>
            </span>
            <span class="t-small backup-row__meta">{Strings.backupRowMeta(b.soundCount, b.projectCount, b.size)}</span>
          </button>
        </div>
      ))}
    </GridPlate>
  )
}
