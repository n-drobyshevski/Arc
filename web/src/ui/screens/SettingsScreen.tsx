// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/SettingsScreen.kt
//
// The settings (an addition to the web version): theme, connecting, the
// screen in Live, how many backups to keep, Live's pad numbering, note names
// on the keys, learned names and pad sound copies, and about arc.
//
// Web deltas:
// - Texts that talk about the phone or Documents/arc use WebText: the storage
//   note ("stored in this browser"), the keep-screen-on note, the Keep note and
//   the prune confirmation (they name the library folder only while one is in use).
// - The library folder is opt-in (File System Access), so the Library section
//   shows the folder's state instead of FOLDER_NOTE + "Restore from
//   Documents/arc" ([settingsFolder]): reconnect a remembered folder whose
//   permission lapsed, pick one, restore from another, or, where the browser
//   can't keep a folder, export the library (plus restore from a folder).
// - The two confirm dialogs (rememberSaveable confirmKeep / confirmForget) are
//   navigation layers, dialog 'prune:<keep>' and 'forget', so Back closes them
//   and a reload keeps them.
// - "Pad sounds saved on the phone" counts arc's copies in this browser
//   (IndexedDB store padSounds); the size is read when the screen opens and
//   Clear sets it to nothing, as in Kotlin.
// - The pad order is not a signal (c.padOrder() is read when Root renders), so
//   the screen keeps its own copy from here on, as the Kotlin does.
// - Web only, the desktop page (from 1024px wide, theme/desk.css): each
//   section's lines are wrapped in a .settings__group (display: contents below
//   the breakpoint, so the column is unchanged there), which lets the desk set
//   the sections in two columns on a paper card without splitting one.
import type { JSX } from 'preact'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { NOTE_NAMES, type NoteNames } from '../../core/features/keys'
import type { PadOrder } from '../../core/features/padPush'
import { Format } from '../../core/text/format'
import { MirrorText } from '../../core/text/mirrorText'
import { SettingsText, THEME_CHOICES, type ThemeChoice } from '../../core/text/settingsText'
import { WebText } from '../../core/text/webText'
import type { AppSettings } from '../../platform/storage/settings'
import type { UiState } from '../../state/types'
import { useNav } from '../AppContext'
import { Caption } from '../components/Caption'
import { Dialog } from '../components/Dialog'
import { CloseKey } from '../components/GuideKeys'
import { GridPlate, PlateLine } from '../components/GridPlate'
import { Key } from '../components/Key'
import { Segmented } from '../components/Segmented'
import { SwitchRow } from '../components/SwitchRow'
import { dialogLayer } from '../nav'
import './SettingsScreen.css'

export interface SettingsScreenProps {
  settings: AppSettings
  state: UiState
  padOrder: PadOrder
  version: string
  onTheme: (t: ThemeChoice) => void
  onAutoConnect: (on: boolean) => void
  onKeepScreenOn: (on: boolean) => void
  /** How many backups a new Keep value would delete now. */
  pruneCount: (keep: number | null) => number
  onKeepLast: (keep: number | null) => void
  onPadOrder: (order: PadOrder) => void
  onForgetNames: () => void
  onRestoreFolder: () => void
  /** Space taken by Live's copies of the pad sounds (bytes). */
  padSoundsSize?: () => Promise<number>
  onClearPadSounds?: () => void
  /** Note names on the keys: solfège or letters. */
  onNoteNames?: (names: NoteNames) => void
  onShowNames?: (on: boolean) => void
  /** Web: give the remembered library folder's permission back. */
  onReconnectFolder: () => void
  /** Web: zip of the library where no folder can be picked. */
  onExportLibrary: () => void
  onSource: () => void
  onFontLicence: () => void
  onDebug: () => void
  onBack: () => void
}

/** PadOrder.entries, in declaration order (the Segmented's indices). */
const PAD_ORDERS: readonly PadOrder[] = ['FROM_TOP', 'FROM_BOTTOM']

/** The confirm dialogs' layer ids. */
const FORGET = 'forget'
const PRUNE = 'prune:'

/** The keys under the library folder note, in order. */
export type FolderKey = 'reconnect' | 'pick' | 'restore' | 'export'

/** The Library section's folder lines (web: the folder is opt-in). */
export interface SettingsFolder {
  /** The note above the keys ("" for none). */
  note: string
  /** One full-width key, or two side by side. */
  keys: FolderKey[]
}

/**
 * FOLDER_NOTE + RESTORE_FOLDER on the web: a lapsed permission asks to
 * reconnect; a folder in use is named and another can be restored from; with
 * no folder yet one can be picked (which restores from it too); without a
 * folder picker the library is exported, and a folder can still be read back.
 */
export function settingsFolder(
  state: Pick<UiState, 'folderPicked' | 'folderStatus' | 'canPickFolder' | 'folderName'>,
): SettingsFolder {
  if (state.folderStatus === 'prompt') return { note: WebText.RECONNECT_HINT, keys: ['reconnect'] }
  if (state.folderPicked) {
    return { note: state.folderName !== null ? WebText.folderNote(state.folderName) : '', keys: ['restore'] }
  }
  if (state.canPickFolder) return { note: WebText.FOLDER_NOTE_OFF, keys: ['pick'] }
  return { note: WebText.EXPORT_LIBRARY_NOTE, keys: ['export', 'restore'] }
}

/** The Keep Segmented's selection: KEEP_CHOICES.indexOf(keepLast).coerceAtLeast(0). */
export function keepIndex(keepLast: number | null | undefined): number {
  return Math.max(0, SettingsText.KEEP_CHOICES.indexOf(keepLast ?? null))
}

/** The Keep value of an open 'prune:<keep>' dialog, else null. */
export function pruneKeepOf(dialogs: readonly string[]): number | null {
  for (const d of dialogs) {
    if (!d.startsWith(PRUNE)) continue
    const n = Number(d.slice(PRUNE.length))
    if (Number.isInteger(n) && n > 0) return n
  }
  return null
}

/** The dialog id for a Keep value that would delete backups. */
export function pruneDialogId(keep: number): string {
  return `${PRUNE}${keep}`
}

export function SettingsScreen(props: SettingsScreenProps): JSX.Element {
  const { settings, state } = props
  const nav = useNav()
  const v = nav.view.value
  const root = useRef<HTMLDivElement | null>(null)
  const themeId = useId()
  const keepId = useId()
  const orderId = useId()
  const namesId = useId()

  // Read when the page opens; Clear sets it to nothing.
  const [soundsSize, setSoundsSize] = useState<number | null>(null)
  const readSize = useRef(props.padSoundsSize)
  readSize.current = props.padSoundsSize
  useEffect(() => {
    let alive = true
    const read = readSize.current
    if (read) {
      read().then(
        (n) => alive && setSoundsSize(n),
        () => undefined,
      )
    } else setSoundsSize(0)
    return () => {
      alive = false
    }
  }, [])

  // The pad order is shown from here on (Live keeps its own copy).
  const [order, setOrder] = useState<PadOrder>(props.padOrder)
  useEffect(() => setOrder(props.padOrder), [props.padOrder])

  // Focus moves onto the screen when it opens (no ring: nothing was picked yet).
  useLayoutEffect(() => {
    root.current?.focus({ preventScroll: true })
  }, [])

  const confirmKeep = pruneKeepOf(v.dialogs)
  const confirmForget = v.dialogs.includes(FORGET)

  const folderInUse = state.folderPicked
  const totalSize = state.backups.reduce((sum, b) => sum + b.size, 0)
  const note = WebText.storageNote(state.backups.length, totalSize, state.spaceLeft)
  const folder = settingsFolder(state)

  const folderKey = (k: FolderKey): JSX.Element => {
    switch (k) {
      case 'reconnect':
        return <Key key={k} text={WebText.RECONNECT_FOLDER} size="small" block onClick={props.onReconnectFolder} />
      case 'pick':
        return <Key key={k} text={WebText.PICK_FOLDER} size="small" block onClick={props.onRestoreFolder} />
      case 'restore':
        return <Key key={k} text={WebText.RESTORE_FOLDER} size="small" block onClick={props.onRestoreFolder} />
      case 'export':
        return <Key key={k} text={WebText.EXPORT_LIBRARY} size="small" block onClick={props.onExportLibrary} />
    }
  }

  return (
    <div ref={root} class="settings" data-screen="settings" tabIndex={-1} aria-labelledby={`${themeId}-title`}>
      <div class="settings__column">
        <header class="settings__head">
          <Caption text={SettingsText.TITLE} as="h1" id={`${themeId}-title`} class="settings__title" />
          <CloseKey class="settings__close" onClick={props.onBack} description={SettingsText.CLOSE} />
        </header>

        <div class="settings__group">
          <Section text={SettingsText.APPEARANCE} />
          <Label text={SettingsText.THEME} id={themeId} />
          <Segmented
            options={THEME_CHOICES.map((t) => SettingsText.theme(t))}
            selected={Math.max(0, THEME_CHOICES.indexOf(settings.theme))}
            onSelect={(i) => {
              const t = THEME_CHOICES[i]
              if (t !== undefined) props.onTheme(t)
            }}
            labelledBy={themeId}
          />
        </div>

        <div class="settings__group">
          <Section text={SettingsText.DEVICE} />
          <GridPlate>
            <SwitchRow
              title={SettingsText.AUTO_CONNECT}
              note={SettingsText.AUTO_CONNECT_NOTE}
              on={settings.autoConnect}
              onChange={props.onAutoConnect}
            />
            <PlateLine />
            <SwitchRow
              title={SettingsText.KEEP_SCREEN_ON}
              note={WebText.KEEP_SCREEN_ON_NOTE}
              on={settings.keepScreenOn}
              onChange={props.onKeepScreenOn}
            />
          </GridPlate>
        </div>

        <div class="settings__group">
          <Section text={SettingsText.LIBRARY} />
          {note.length !== 0 && <p class="t-small settings__note">{note}</p>}
          {folder.note.length !== 0 && <p class="t-small settings__note">{folder.note}</p>}
          <div class="settings__row">{folder.keys.map(folderKey)}</div>
          <Label text={SettingsText.KEEP} id={keepId} />
          <Segmented
            options={SettingsText.KEEP_CHOICES.map((k) => SettingsText.keepLabel(k))}
            selected={keepIndex(settings.keepLast)}
            onSelect={(i) => {
              const keep = SettingsText.KEEP_CHOICES[i] ?? null
              // Fewer than are saved now deletes the oldest: ask first.
              if (keep !== null && props.pruneCount(keep) > 0) nav.open(dialogLayer(pruneDialogId(keep)))
              else props.onKeepLast(keep)
            }}
            labelledBy={keepId}
          />
          <p class="t-small settings__note">{WebText.keepNote(folderInUse)}</p>
        </div>

        <div class="settings__group">
          <Section text={SettingsText.LIVE} />
          <Label text={MirrorText.PAD_ORDER} id={orderId} />
          <Segmented
            options={[MirrorText.FROM_TOP, MirrorText.FROM_BOTTOM]}
            selected={Math.max(0, PAD_ORDERS.indexOf(order))}
            onSelect={(i) => {
              const o = PAD_ORDERS[i]
              if (o === undefined) return
              setOrder(o)
              props.onPadOrder(o)
            }}
            labelledBy={orderId}
          />
          <p class="t-small settings__note">{MirrorText.ORDER_NOTE}</p>
          <Label text={MirrorText.NOTE_NAMES} id={namesId} />
          <Segmented
            options={NOTE_NAMES.map((n) => MirrorText.noteNames(n))}
            selected={Math.max(0, NOTE_NAMES.indexOf(settings.keysNames))}
            onSelect={(i) => {
              const n = NOTE_NAMES[i]
              if (n !== undefined) props.onNoteNames?.(n)
            }}
            labelledBy={namesId}
          />
          <p class="t-small settings__note">{MirrorText.NOTE_NAMES_NOTE}</p>
          <GridPlate>
            <SwitchRow
              title={MirrorText.SHOW_NAMES}
              note={MirrorText.SHOW_NAMES_NOTE}
              on={settings.keysShowNames}
              onChange={(on) => props.onShowNames?.(on)}
            />
          </GridPlate>
          <Key text={SettingsText.FORGET_NAMES} size="small" block onClick={() => nav.open(dialogLayer(FORGET))} />
          <div class="settings__sounds">
            <p class="t-body15 settings__sounds-size">
              {WebText.padSounds(Format.bytes(soundsSize ?? 0))}
            </p>
            <Key
              text={SettingsText.CLEAR}
              size="small"
              disabled={(soundsSize ?? 0) <= 0}
              onClick={() => {
                props.onClearPadSounds?.()
                setSoundsSize(0)
              }}
            />
          </div>
          <p class="t-small settings__note">{SettingsText.PAD_SOUNDS_NOTE}</p>
        </div>

        <div class="settings__group">
          <Section text={SettingsText.ABOUT} />
          <p class="t-bold settings__version">{SettingsText.version(props.version)}</p>
          <p class="t-small settings__note">{SettingsText.LICENCE_NOTE}</p>
          <div class="settings__row">
            <Key text={SettingsText.SOURCE} size="small" block onClick={props.onSource} />
            <Key text={SettingsText.FONT_LICENCE} size="small" block onClick={props.onFontLicence} />
          </div>
          <Key text={SettingsText.DEBUG_LOG} size="small" variant="quiet" block onClick={props.onDebug} />
        </div>
      </div>

      <Dialog
        open={confirmKeep !== null}
        text={WebText.pruneConfirm(confirmKeep === null ? 0 : props.pruneCount(confirmKeep), folderInUse)}
        confirm={SettingsText.PRUNE}
        confirmColor="var(--danger)"
        onConfirm={() => {
          if (confirmKeep === null) return
          nav.close(dialogLayer(pruneDialogId(confirmKeep)))
          props.onKeepLast(confirmKeep)
        }}
        onDismiss={() => {
          if (confirmKeep !== null) nav.close(dialogLayer(pruneDialogId(confirmKeep)))
        }}
      />
      <Dialog
        open={confirmForget}
        text={SettingsText.FORGET_CONFIRM}
        confirm={SettingsText.FORGET}
        confirmColor="var(--danger)"
        onConfirm={() => {
          nav.close(dialogLayer(FORGET))
          props.onForgetNames()
        }}
        onDismiss={() => nav.close(dialogLayer(FORGET))}
      />
    </div>
  )
}

/** Caption(text, padding(top = 18), align = Start). */
function Section(props: { text: string }): JSX.Element {
  return <Caption text={props.text} align="start" as="h2" class="settings__section" />
}

/** Text(text, ArcType.semi, ink). */
function Label(props: { text: string; id: string }): JSX.Element {
  return <p id={props.id} class="t-semi settings__label">{props.text}</p>
}
