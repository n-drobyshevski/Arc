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
// - The Step 1c rows: each setting is a SettingRow (name, one-line note, the
//   control on the right, the long note behind an ⓘ key) in a RowCard. What
//   arc keeps in the browser (learned names, pad sounds) is its own danger
//   group, "Saved in this browser" (WebText.SAVED_HERE), with red text actions.
// - "Piano keys" greys out the sizes that don't fit Live's piano in this
//   window. The piano's real width is only known in Live, so it is estimated
//   from the window ([pianoRoomEstimate]: the window less Live's chrome); on a
//   portrait phone, which plays on the grid, from the window turned sideways.
// - "Haptic feedback" shows only where the browser can vibrate
//   ([SettingsScreenProps.hapticsSupported]): iOS Safari has no vibration
//   API and desktop browsers no motor, so the row is hidden there rather than
//   left dead.
// - The keys view (keysViewWide / keysViewTall) has no row here: Live's
//   Pads / Piano switch remembers it per window shape.
// - Web only, the desktop page (from 1024px wide, theme/desk.css): one paper
//   card, a section nav on its left (the section in view lit by its LED, as
//   the nav rail's keys) and the sections scrolling in the pane beside it.
import type { ComponentChildren, JSX } from 'preact'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { NOTE_NAMES, type NoteNames } from '../../core/features/keys'
import type { PadOrder } from '../../core/features/padPush'
import { choiceOf as pianoChoiceOf, fits as pianoFits, switchShown } from '../../core/features/piano'
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
import { HwToggle } from '../components/HwToggle'
import { Key } from '../components/Key'
import { Segmented } from '../components/Segmented'
import { LinkRow, RowAction, RowCard, SettingRow } from '../components/SettingRow'
import { pianoWidth } from '../live/keyboard'
import { dialogLayer } from '../nav'
import { useDesk } from '../useDesk'
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
  /** Live's piano size: white keys (Piano.CHOICES), null for Auto. */
  onPianoWhites?: (whites: number | null) => void
  /** Web: whether this browser can vibrate (platform/haptics.ts); the Haptic feedback row shows only then. */
  hapticsSupported?: boolean
  onHaptics?: (on: boolean) => void
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

/** The page's sections, in order: the desktop nav's entries and the headings' ids. */
export const SECTIONS = ['appearance', 'device', 'library', 'live', 'saved', 'about'] as const
export type SettingsSection = (typeof SECTIONS)[number]

/** A section's heading. */
export function sectionTitle(s: SettingsSection): string {
  switch (s) {
    case 'appearance':
      return SettingsText.APPEARANCE
    case 'device':
      return SettingsText.DEVICE
    case 'library':
      return SettingsText.LIBRARY
    case 'live':
      return SettingsText.LIVE
    case 'saved':
      return WebText.SAVED_HERE
    case 'about':
      return SettingsText.ABOUT
  }
}

/**
 * The section the desktop nav lights while the pane is scrolled to
 * [scrollTop]: the last one whose top has reached the pane's top (within
 * [slack]), and the last section once the pane can't scroll further.
 * [tops] are the sections' offsets in the pane, in order.
 */
export function sectionInView(tops: readonly number[], scrollTop: number, atEnd: boolean, slack = 24): number {
  if (tops.length === 0) return 0
  if (atEnd) return tops.length - 1
  let at = 0
  tops.forEach((top, i) => {
    if (top - scrollTop <= slack) at = i
  })
  return at
}

// The desk's page column around Live (theme/desk.css): the nav rail, the ruled
// gutters (from 1280) and the top bar's row, which Live's box caps at.
const RAIL = 104
const DESK_GUTTER = 56
const TOP_BAR_MAX = 1200

/**
 * About how wide Live's piano is in a [windowWidth] × [windowHeight] window
 * (Settings can't measure it: Live isn't on screen). The piano spans the
 * page column in Keys mode, its tools behind the edge strip, so this is
 * Live's box less its chrome (live/keyboard.ts pianoWidth, which Live itself
 * uses). A portrait phone plays on the grid; its piano shows only turned
 * sideways, so the window's height stands in for the width.
 */
export function pianoRoomEstimate(windowWidth: number, windowHeight: number): number {
  const landscape = windowWidth > windowHeight
  const width = switchShown(landscape, windowWidth) ? windowWidth : windowHeight
  const desk = width >= 1024
  const live = desk ? Math.min(TOP_BAR_MAX, width - RAIL - (width >= 1280 ? 2 * DESK_GUTTER : 0)) : width
  return pianoWidth(live, desk)
}

/** Per Piano.CHOICES: whether that size can't be had in [room] (Auto always can). */
export function pianoChoicesOff(room: number): boolean[] {
  return SettingsText.PIANO_CHOICES.map((w) => w !== null && !pianoFits(room, w))
}

/** The window's size, kept up to date. */
function useWindowSize(): { width: number; height: number } {
  const read = (): { width: number; height: number } =>
    typeof window === 'undefined' ? { width: 0, height: 0 } : { width: window.innerWidth, height: window.innerHeight }
  const [size, setSize] = useState(read)
  useEffect(() => {
    const on = (): void => setSize((s) => {
      const n = read()
      return n.width === s.width && n.height === s.height ? s : n
    })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return size
}

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
  const desk = useDesk()
  const win = useWindowSize()
  const root = useRef<HTMLDivElement | null>(null)
  const pane = useRef<HTMLDivElement | null>(null)

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

  // The desk's section nav: the section in view is lit; a tap scrolls to one.
  const [active, setActive] = useState(0)
  // After a tap, the tapped section stays lit while the pane scrolls to it.
  const holdUntil = useRef(0)
  useEffect(() => {
    const el = pane.current
    if (!desk || !el) return
    let raf = 0
    const spy = (): void => {
      raf = 0
      if (performance.now() < holdUntil.current) return
      const tops = SECTIONS.map((s) => el.querySelector<HTMLElement>(`[data-section="${s}"]`)?.offsetTop ?? 0)
      const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 2
      // A section counts as in view once its caption is in the pane's top quarter.
      setActive(sectionInView(tops, el.scrollTop, atEnd && el.scrollTop > 0, el.clientHeight / 4))
    }
    const onScroll = (): void => {
      if (!raf) raf = requestAnimationFrame(spy)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [desk])
  const goTo = (i: number): void => {
    const el = pane.current
    const section = el?.querySelector<HTMLElement>(`[data-section="${SECTIONS[i]}"]`)
    if (!el || !section) return
    setActive(i)
    holdUntil.current = performance.now() + 900
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ top: section.offsetTop - 8, behavior: smooth ? 'smooth' : 'auto' })
    section.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
  }

  const confirmKeep = pruneKeepOf(v.dialogs)
  const confirmForget = v.dialogs.includes(FORGET)

  const folderInUse = state.folderPicked
  const totalSize = state.backups.reduce((sum, b) => sum + b.size, 0)
  const storage = WebText.storageNote(state.backups.length, totalSize, state.spaceLeft)
  const folder = settingsFolder(state)
  const folderNote = [storage, folder.note].filter((t) => t.length !== 0).join(' ')

  const pianoChoice = pianoChoiceOf(settings.pianoWhites)
  const pianoOff = pianoChoicesOff(pianoRoomEstimate(win.width, win.height))

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

  const titleId = 'settings-title'
  const title = <Caption text={SettingsText.TITLE} as="h1" id={titleId} class="settings__title" />
  const close = <CloseKey class="settings__close" onClick={props.onBack} description={SettingsText.CLOSE} />

  return (
    <div ref={root} class="settings" data-screen="settings" tabIndex={-1} aria-labelledby={titleId}>
      <div class="settings__column">
        {desk ? (
          <nav class="settings__nav" aria-labelledby={titleId}>
            {title}
            <ul class="settings__nav-list">
              {SECTIONS.map((s, i) => (
                <li key={s}>
                  <button
                    type="button"
                    class={`settings__nav-item${i === active ? ' is-on' : ''}`}
                    aria-current={i === active ? 'true' : undefined}
                    onClick={() => goTo(i)}
                  >
                    <span class="settings__led" aria-hidden="true" />
                    {sectionTitle(s)}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        ) : (
          <header class="settings__head">
            {title}
            {close}
          </header>
        )}

        <div class="settings__pane">
          {desk && <div class="settings__pane-head">{close}</div>}
          <div ref={pane} class="settings__scroll">
            <Section id="appearance">
              <RowCard>
                <SettingRow
                  title={SettingsText.THEME}
                  control={({ titleId: t }) => (
                    <Segmented
                      compact
                      options={THEME_CHOICES.map((c) => SettingsText.theme(c))}
                      selected={Math.max(0, THEME_CHOICES.indexOf(settings.theme))}
                      onSelect={(i) => {
                        const c = THEME_CHOICES[i]
                        if (c !== undefined) props.onTheme(c)
                      }}
                      labelledBy={t}
                    />
                  )}
                />
              </RowCard>
            </Section>

            <Section id="device">
              <RowCard>
                <SettingRow
                  title={SettingsText.AUTO_CONNECT}
                  note={SettingsText.AUTO_CONNECT_NOTE}
                  control={(ids) => (
                    <HwToggle
                      on={settings.autoConnect}
                      onChange={props.onAutoConnect}
                      labelledBy={ids.titleId}
                      describedBy={ids.noteId}
                    />
                  )}
                />
                <SettingRow
                  title={SettingsText.KEEP_SCREEN_ON}
                  note={WebText.KEEP_SCREEN_ON_NOTE}
                  control={(ids) => (
                    <HwToggle
                      on={settings.keepScreenOn}
                      onChange={props.onKeepScreenOn}
                      labelledBy={ids.titleId}
                      describedBy={ids.noteId}
                    />
                  )}
                />
              </RowCard>
            </Section>

            <Section id="library">
              <RowCard>
                <SettingRow
                  title={WebText.LIBRARY_FOLDER}
                  note={folderNote.length !== 0 ? folderNote : undefined}
                  stack
                  control={() => <div class="settings__keys">{folder.keys.map(folderKey)}</div>}
                />
                <SettingRow
                  title={SettingsText.KEEP}
                  note={SettingsText.KEEP_SHORT}
                  info={WebText.keepNote(folderInUse)}
                  control={(ids) => (
                    <Segmented
                      compact
                      options={SettingsText.KEEP_CHOICES.map((k) => SettingsText.keepLabel(k))}
                      selected={keepIndex(settings.keepLast)}
                      onSelect={(i) => {
                        const keep = SettingsText.KEEP_CHOICES[i] ?? null
                        // Fewer than are saved now deletes the oldest: ask first.
                        if (keep !== null && props.pruneCount(keep) > 0) nav.open(dialogLayer(pruneDialogId(keep)))
                        else props.onKeepLast(keep)
                      }}
                      labelledBy={ids.titleId}
                      describedBy={ids.noteId}
                    />
                  )}
                />
              </RowCard>
            </Section>

            <Section id="live">
              <RowCard>
                <SettingRow
                  title={MirrorText.PAD_ORDER}
                  info={MirrorText.ORDER_NOTE}
                  control={(ids) => (
                    <Segmented
                      compact
                      options={[MirrorText.FROM_TOP_SHORT, MirrorText.FROM_BOTTOM_SHORT]}
                      descriptions={[MirrorText.FROM_TOP, MirrorText.FROM_BOTTOM]}
                      selected={Math.max(0, PAD_ORDERS.indexOf(order))}
                      onSelect={(i) => {
                        const o = PAD_ORDERS[i]
                        if (o === undefined) return
                        setOrder(o)
                        props.onPadOrder(o)
                      }}
                      labelledBy={ids.titleId}
                    />
                  )}
                />
                <SettingRow
                  title={MirrorText.NOTE_NAMES}
                  note={SettingsText.NOTE_NAMES_SHORT}
                  info={MirrorText.NOTE_NAMES_NOTE}
                  control={(ids) => (
                    <Segmented
                      compact
                      options={NOTE_NAMES.map((n) => MirrorText.noteNames(n))}
                      selected={Math.max(0, NOTE_NAMES.indexOf(settings.keysNames))}
                      onSelect={(i) => {
                        const n = NOTE_NAMES[i]
                        if (n !== undefined) props.onNoteNames?.(n)
                      }}
                      labelledBy={ids.titleId}
                      describedBy={ids.noteId}
                    />
                  )}
                />
                <SettingRow
                  title={MirrorText.SHOW_NAMES}
                  note={SettingsText.SHOW_NAMES_SHORT}
                  info={MirrorText.SHOW_NAMES_NOTE}
                  control={(ids) => (
                    <HwToggle
                      on={settings.keysShowNames}
                      onChange={(on) => props.onShowNames?.(on)}
                      labelledBy={ids.titleId}
                      describedBy={ids.noteId}
                    />
                  )}
                />
                <SettingRow
                  title={SettingsText.PIANO_KEYS}
                  note={SettingsText.PIANO_KEYS_SHORT}
                  info={SettingsText.PIANO_KEYS_NOTE}
                  stack
                  control={(ids) => (
                    <Segmented
                      compact
                      fill
                      class="settings__piano"
                      options={SettingsText.PIANO_CHOICES.map((w) => SettingsText.pianoKeys(w))}
                      descriptions={SettingsText.PIANO_CHOICES.map((w) => SettingsText.pianoKeysDescription(w))}
                      selected={Math.max(0, SettingsText.PIANO_CHOICES.indexOf(pianoChoice))}
                      disabled={pianoOff}
                      disabledNote={SettingsText.DOESNT_FIT}
                      onSelect={(i) => props.onPianoWhites?.(SettingsText.PIANO_CHOICES[i] ?? null)}
                      labelledBy={ids.titleId}
                      describedBy={ids.noteId}
                    />
                  )}
                />
                {props.hapticsSupported === true && (
                  <SettingRow
                    title={SettingsText.HAPTICS}
                    note={SettingsText.HAPTICS_NOTE}
                    control={(ids) => (
                      <HwToggle
                        on={settings.haptics}
                        onChange={(on) => props.onHaptics?.(on)}
                        labelledBy={ids.titleId}
                        describedBy={ids.noteId}
                      />
                    )}
                  />
                )}
              </RowCard>
            </Section>

            <Section id="saved">
              <RowCard danger>
                <SettingRow
                  title={SettingsText.LEARNED_NAMES}
                  note={SettingsText.LEARNED_NAMES_SHORT}
                  control={(ids) => (
                    <RowAction
                      text={SettingsText.FORGET}
                      danger
                      describedBy={ids.titleId}
                      onClick={() => nav.open(dialogLayer(FORGET))}
                    />
                  )}
                />
                <SettingRow
                  title={SettingsText.padSoundsShort(Format.bytes(soundsSize ?? 0))}
                  note={SettingsText.PAD_SOUNDS_SHORT_NOTE}
                  control={(ids) => (
                    <RowAction
                      text={SettingsText.CLEAR}
                      danger
                      describedBy={ids.titleId}
                      disabled={(soundsSize ?? 0) <= 0}
                      onClick={() => {
                        props.onClearPadSounds?.()
                        setSoundsSize(0)
                      }}
                    />
                  )}
                />
              </RowCard>
            </Section>

            <Section id="about">
              <RowCard>
                <SettingRow title={SettingsText.version(props.version)} note={SettingsText.LICENCE_NOTE} />
                <LinkRow title={SettingsText.SOURCE} onClick={props.onSource} />
                <LinkRow title={SettingsText.FONT_LICENCE} onClick={props.onFontLicence} />
                <LinkRow title={SettingsText.DEBUG_LOG} onClick={props.onDebug} />
              </RowCard>
            </Section>
          </div>
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

/** A section: its caption (a heading the nav moves focus to) over its card. */
function Section(props: { id: SettingsSection; children: ComponentChildren }): JSX.Element {
  const headId = `settings-${props.id}`
  return (
    <section class="settings__group" data-section={props.id} aria-labelledby={headId}>
      <h2 id={headId} class="caption caption--start settings__section" tabIndex={-1}>
        {sectionTitle(props.id)}
      </h2>
      {props.children}
    </section>
  )
}
