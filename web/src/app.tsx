// Port of the UI parts of app/src/main/kotlin/dev/arc/ep133/MainActivity.kt (Root()).
//
// Root's rememberSaveable flags live in the navigation stack (ui/nav.ts): one
// history entry per open screen, sheet or overlay, so the browser Back does what
// Android's BackHandlers do. The render priority is Root's exclusive if-chain:
//
//   debug → settings → compare → contents → search → shell (+ the tab's screen)
//
// then the tab screens' sheets (only while no full screen is open, Root's
// `onTabs`), the modal progress sheet, and the toast over everything.
//
// Sheets live in ui/sheets (Device: pads / upload / trim; Backups: detail,
// compare picker, restore, delete; the font licence and progress sheets).
//
// Web only, the desktop layout (from 1024px wide, ui/useDesk.ts): every screen
// sits in the page column of a "desk" (theme/desk.css) right of the nav rail
// (ui/components/NavRail.tsx), between the ruled edge columns:
//
//   div.app.is-desk > CoachHost > div.desk [ NavRail | div.app__screen ]
//
// The guide overlay's host then holds the rail too (its Guide key carries the
// edge.guide mark); it shows over the shell only, as on the phone. The top
// bar has the theme switch (Settings → Theme, marked top.theme) in place of
// the settings key. Below 1024px the tree is the phone's, unchanged.
//
// Live's EDIT (Root's editPads): on while Live shows its pads; its tab is the
// shell's second edge tab (on the desk, MirrorScreen hangs it on the K.O. II
// panel), its pad sheet 'edit:<group>:<offset>' (ui/sheets/PadEditSheet), and
// a new sample goes through the Device tab's upload sheet, mounted on Live too.
//
// On a phone on its side (ui/live/window.ts liveInBar; never on the desk),
// Live's display line rides in the top bar's middle (LiveBar, MirrorScreen's
// LivePill) and the page leaves it out.
import { Component, type ComponentChildren, type JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { FactorySounds } from './core/features/factorySounds'
import { MirrorText } from './core/text/mirrorText'
import { SettingsText } from './core/text/settingsText'
import { Strings } from './core/text/strings'
import { WebText } from './core/text/webText'
import { attachDrop, isPakName } from './platform/files/pick'
import { supported as hapticsSupported } from './platform/haptics'
import type { ArcController } from './state/controller'
import { emptyMirrorState, type MirrorUi, type TaskUi } from './state/types'
import { APP_BUILD } from './version'
import { AppProvider, useController, useNav } from './ui/AppContext'
import {
  Nav,
  bindViewHooks,
  browserNavEnv,
  dialogLayer,
  onTabs,
  overlayLayer,
  rootView,
  screenLayer,
  selectTab as tabStack,
  sheetLayer,
  type NavView,
} from './ui/nav'
import { CoachHost, useCoachFirstRun } from './ui/components/Coach'
import { EditEdgeTab } from './ui/components/EditEdgeTab'
import { Key } from './ui/components/Key'
import { NavRail } from './ui/components/NavRail'
import { Sheet } from './ui/components/Sheet'
import { Shell } from './ui/components/Shell'
import { ControllerToast } from './ui/components/Toast'
import { UpdatePrompt } from './ui/components/UpdatePrompt'
import { CompareScreen } from './ui/screens/CompareScreen'
import { ContentsScreen } from './ui/screens/ContentsScreen'
import { DebugScreen } from './ui/screens/DebugScreen'
import { DeviceScreen } from './ui/screens/DeviceScreen'
import { GuideScreen } from './ui/screens/GuideScreen'
import { MainScreen } from './ui/screens/MainScreen'
import { BackupsSheets } from './ui/sheets/BackupsSheets'
import { ProgressSheet } from './ui/sheets/ProgressSheet'
import { LivePill, MirrorScreen, type LivePlaying } from './ui/screens/MirrorScreen'
import { PICK_PREFIX as PICK, keysPickerOf, type KeysShown } from './ui/live/keys'
import { liveInBar } from './ui/live/window'
import type { NoteRange } from './core/features/piano'
import { SearchScreen } from './ui/screens/SearchScreen'
import { SettingsScreen } from './ui/screens/SettingsScreen'
import { EDIT_PREFIX, PadEditSheet } from './ui/sheets/PadEditSheet'
import { BackupPadsSheet, DevicePadsSheet } from './ui/sheets/PadsSheet'
import { FontLicenceSheet } from './ui/sheets/FontLicenceSheet'
import { DeviceUploadSheet } from './ui/sheets/UploadSheet'
import { useDesk, useFinePointer, useWindowSize } from './ui/useDesk'
import { useAppKeys } from './ui/useAppKeys'
import { KeyboardKeysSheet } from './ui/sheets/KeyboardKeysSheet'
import { computerKeys, setComputerKeys } from './ui/keyPrefs'
import './app.css'

/** The progress sheet's layer id. */
const PROGRESS = 'progress'
/** The Keyboard keys sheet (web, desktop: ?). */
const KEYS_SHEET = 'keys'

export interface AppProps {
  controller: ArcController
  /** The navigation stack; by default one bound to window.history (started here). */
  nav?: Nav
}

export function App(props: AppProps): JSX.Element {
  const c = props.controller
  const [nav] = useState(() => {
    const n = props.nav ?? new Nav(browserNavEnv())
    n.start()
    return n
  })

  useEffect(() => {
    const off = bindViewHooks(nav, {
      tabChanged: (a, b) => c.tabChanged(a, b),
      setLive: (live) => c.setLive(live),
      closeContents: () => c.closeContents(),
      closeCompare: () => c.closeCompare(),
    })
    // ArcSheet(onDismiss = null): Back does nothing while the progress sheet shows.
    nav.setBackGuard(() => c.state.peek().task !== null && nav.current.sheets.includes(PROGRESS))
    // A .pak dropped anywhere is imported (Android: opened from another app).
    const offDrop = typeof document === 'undefined'
      ? () => undefined
      : attachDrop(document.body, { onFiles: (f) => void c.importFiles(f), filter: (f) => isPakName(f.name) })
    return () => {
      off()
      offDrop()
      nav.setBackGuard(() => false)
      if (!props.nav) nav.dispose()
    }
  }, [])

  return (
    <AppProvider controller={c} nav={nav}>
      <ErrorBoundary>
        <Root />
      </ErrorBoundary>
    </AppProvider>
  )
}

/** Root(): the screens by priority, the sheets over them, the toast over everything. */
function Root(): JSX.Element {
  const c = useController()
  const nav = useNav()
  const v = nav.view.value
  const state = c.state.value
  const settings = c.settings.value
  const playing = c.playing.value
  const desk = useDesk()
  const fine = useFinePointer()
  // The computer keyboard (web, desktop): ? the keys sheet, Esc, Ctrl/Cmd+Z, and the screen's own (Live's).
  useAppKeys(desk || fine, {
    view: v,
    canBack: () => nav.canBack(),
    undo: state.toast?.action != null ? () => c.runToastAction(state.toast!.id) : null,
    openHelp: () => nav.open(sheetLayer(KEYS_SHEET)),
    back: () => nav.back(),
  })
  // Live's EDIT (giving a pad another sound): on Live, in PADS, until switched off or left.
  const [editPads, setEditPads] = useState(false)
  const canEdit = v.tab === 'live' && !settings.liveKeys
  useEffect(() => {
    if (!canEdit && editPads) setEditPads(false)
  }, [canEdit, editPads])
  // On a phone on its side, Live's display line rides in the top bar; the piano's
  // notes (while it shows) let it name a device note past them.
  const win = useWindowSize()
  const liveBar = v.tab === 'live' && !desk && liveInBar(win)
  const [pianoRange, setPianoRange] = useState<NoteRange | null>(null)

  // The guide overlay, once by itself on the first start (coach_seen), over the
  // shell. Not for automated browsers (screenshots, e2e), where it would only be in the way.
  useCoachFirstRun(c.coach, v.coach, () => {
    const automated = typeof navigator !== 'undefined' && navigator.webdriver === true
    if (!automated && rootView(nav.current, () => false) === 'shell' && !nav.current.guide) nav.open(overlayLayer('coach'))
  })

  const backup = (id: string | null) => (id === null ? null : state.backups.find((b) => b.id === id) ?? null)
  const view = rootView(v, (id) => backup(id) !== null)
  const contentsBackup = backup(v.contentsId)
  const compareA = v.compare ? backup(v.compare[0]) : null
  const compareB = v.compare ? backup(v.compare[1]) : null

  // After a reload the opened backup has to be read again (LaunchedEffect(contentsBackup?.id)).
  useEffect(() => {
    if (contentsBackup) void c.openContents(contentsBackup)
  }, [contentsBackup?.id])
  // Also runs again after a reload, when the result is gone.
  useEffect(() => {
    if (compareA && compareB) void c.compareBackups(compareA, compareB)
  }, [compareA?.id, compareB?.id])

  const closeScreen = (layer: Parameters<Nav['close']>[0]) => () => nav.close(layer)

  let page: JSX.Element
  if (view === 'debug') {
    page = (
      <DebugScreen
        log={c.trafficLog}
        onShare={() => void c.shareLog()}
        onSave={() => void c.saveLog()}
        onCopy={() => void c.copyLog()}
        onBack={closeScreen(screenLayer({ kind: 'debug' }))}
        latency={{
          latency: c.liveLatency.value,
          inUse: c.liveEngine.value?.label ?? null,
          hint: c.liveLatencyHint?.value ?? null,
          onHint: (h) => c.setLiveLatencyHint(h),
          onReset: () => c.resetLatency(),
        }}
      />
    )
  } else if (view === 'settings') {
    page = (
      <SettingsScreen
        settings={settings}
        state={state}
        padOrder={c.padOrder()}
        version={APP_BUILD}
        onTheme={(t) => c.setTheme(t)}
        onAutoConnect={(on) => c.setAutoConnect(on)}
        onKeepScreenOn={(on) => c.setKeepScreenOn(on)}
        pruneCount={(keep) => c.pruneCount(keep)}
        onKeepLast={(keep) => void c.setKeepLast(keep)}
        onPadOrder={(o) => c.setPadOrder(o)}
        onForgetNames={() => c.forgetLearned()}
        padSoundsSize={() => c.padSoundsSize()}
        onClearPadSounds={() => void c.clearPadSounds()}
        factorySounds={
          c.canGetFactory ? { saved: FactorySounds.inLibrary(state.backups) !== null, onGet: () => void c.getFactorySounds() } : undefined
        }
        computerKeys={desk || fine ? { on: computerKeys.value, onChange: setComputerKeys, onShow: () => nav.open(sheetLayer(KEYS_SHEET)) } : undefined}
        onNoteNames={(n) => c.setKeysNames(n)}
        onShowNames={(on) => c.setKeysShowNames(on)}
        onPianoWhites={(w) => c.setPianoWhites(w)}
        hapticsSupported={hapticsSupported()}
        onHaptics={(on) => c.setHaptics(on)}
        onRestoreFolder={() => void c.pickFolder()}
        onReconnectFolder={() => void c.reconnectFolder()}
        onExportLibrary={() => void c.exportLibrary()}
        onSource={() => { window.open(SettingsText.SOURCE_URL, '_blank', 'noopener') }}
        onFontLicence={() => nav.open(sheetLayer('licence'))}
        onDebug={() => nav.openScreen({ kind: 'debug' })}
        onBack={closeScreen(screenLayer({ kind: 'settings' }))}
      />
    )
    // The font licence sheet over Settings (Root's fontLicence, the sheet 'licence').
    page = (
      <>
        {page}
        <FontLicenceSheet open={v.sheets.includes('licence')} onDismiss={() => nav.close(sheetLayer('licence'))} />
      </>
    )
  } else if (view === 'compare' && compareA && compareB && v.compare) {
    const [older, newer] = compareB.createdAt < compareA.createdAt ? [compareB, compareA] : [compareA, compareB]
    const pc = state.pakCompare
    page = (
      <CompareScreen
        old={older}
        new={newer}
        compare={pc && pc.oldId === older.id && pc.newId === newer.id ? pc : null}
        fmtDay={(ms) => c.fmtDay(ms)}
        onBack={closeScreen(screenLayer({ kind: 'compare', a: v.compare[0], b: v.compare[1] }))}
      />
    )
  } else if (view === 'contents' && contentsBackup) {
    const b = contentsBackup
    page = (
      <ContentsScreen
        b={b}
        contents={state.contents?.backupId === b.id ? state.contents : null}
        playing={playing}
        onPlay={(slot) => void c.playBackupSound(slot)}
        onStop={() => c.stopPlayback()}
        onShareWav={(snd) => void c.shareWav(b, snd)}
        onSaveWav={(snd) => void c.saveWav(b, snd)}
        onShareProject={(n) => void c.shareProject(b, n)}
        onSaveProject={(n) => void c.saveProject(b, n)}
        onBack={closeScreen(screenLayer({ kind: 'contents', id: b.id }))}
        onPads={(n) => nav.open(sheetLayer(`pads:backup:${b.id}:${n}`))}
      />
    )
    // The backup's pads sheet (v.sheets 'pads:backup:<id>:<n>', playable).
    page = <>{page}<BackupPadsSheet view={v} backupId={b.id} /></>
  } else if (view === 'search') {
    page = (
      <SearchScreen
        search={state.search}
        fmtDay={(ms) => c.fmtDay(ms)}
        onQuery={(q) => c.setSearch(q)}
        onOpen={(b) => nav.openScreen({ kind: 'contents', id: b.id })}
        onBack={closeScreen(screenLayer({ kind: 'search' }))}
      />
    )
  } else {
    page = (
      <Shell
        tab={v.tab}
        onTab={(t) => nav.selectTab(t)}
        menuOpen={v.menu}
        onMenu={(open) => (open ? nav.open(overlayLayer('menu')) : nav.close(overlayLayer('menu')))}
        connected={state.connected}
        canConnect={state.midiSupported && !state.busy}
        canBackup={state.midiSupported && state.device !== null && !state.busy}
        onBackup={() => void c.backup()}
        onConnect={() => void c.connect()}
        onDebug={() => nav.openScreen({ kind: 'debug' })}
        onSettings={() => nav.openScreen({ kind: 'settings' })}
        onHelp={() => nav.open(overlayLayer('coach'))}
        theme={settings.theme}
        onTheme={(t) => c.setTheme(t)}
        guideOpen={v.guide}
        onGuide={(open) => (open ? nav.openScreen({ kind: 'guide' }) : nav.close(screenLayer({ kind: 'guide' })))}
        guide={<GuideScreen onBack={() => nav.close(screenLayer({ kind: 'guide' }))} />}
        desk={desk}
        // Live's EDIT tab under GUIDE (on the desk it hangs on the K.O. II panel instead).
        edgeTab={canEdit && !desk ? <EditEdgeTab on={editPads} onChange={setEditPads} inert={v.menu} /> : undefined}
        middle={liveBar ? <LiveBar pianoRange={pianoRange} editing={editPads} /> : undefined}
      >
        <TabScreen view={v} editPads={editPads} onEditPads={setEditPads} inBar={liveBar} onPianoRange={setPianoRange} />
      </Shell>
    )
    // On the desk the overlay's host is around the whole desk instead (the rail's marks too).
    if (!desk) page = <CoachHost visible={v.coach} onDismiss={() => nav.close(overlayLayer('coach'))}>{page}</CoachHost>
  }

  const tabs = onTabs(v)
  // The progress sheet is a layer too, so the browser Back meets it (and the back
  // guard keeps it) even on the first history entry; a reload drops a stale one.
  const progressShown = tabs && state.task !== null
  useEffect(() => {
    const has = nav.current.sheets.includes(PROGRESS)
    if (progressShown && !has) nav.open(sheetLayer(PROGRESS))
    else if (!progressShown && has) nav.close(sheetLayer(PROGRESS))
  }, [progressShown])
  const screen = <div class="app__screen" data-view={view}>{page}</div>
  const guide = screenLayer({ kind: 'guide' })
  return (
    <div class={desk ? 'app is-desk' : 'app'}>
      {desk ? (
        <CoachHost visible={v.coach && view === 'shell'} onDismiss={() => nav.close(overlayLayer('coach'))}>
          <div class="desk desk-edges">
            <NavRail
              current={view === 'settings' ? 'settings' : v.tab}
              guideOpen={view === 'shell' && v.guide}
              // The section list covers the page and holds the focus: the rail waits under it.
              inert={view === 'shell' && v.menu}
              onTab={(t) => nav.selectTab(t)}
              onGuide={() => {
                if (view === 'shell') {
                  if (v.guide) nav.close(guide)
                  else nav.open(guide)
                } else {
                  // From a full screen: back to its section, the guide over it.
                  nav.go([...tabStack(nav.stack.peek(), v.tab), guide])
                }
              }}
              onSettings={() => nav.openScreen({ kind: 'settings' })}
            />
            {screen}
          </div>
        </CoachHost>
      ) : screen}
      {/* The Device tab's sheets: pads 'pads:device:<n>', upload / trim from state.browser.draft. */}
      {tabs && v.tab === 'device' && <><DevicePadsSheet view={v} /><DeviceUploadSheet view={v} /></>}
      {/* Live's EDIT: the pad sheet 'edit:<group>:<offset>', and the upload / trim sheets for a new sample. */}
      {tabs && v.tab === 'live' && <><PadEditSheet view={v} /><DeviceUploadSheet view={v} /></>}
      {/* The Backups tab's sheets: detail 'detail:<id>', compare picker 'comparePick:<id>',
          restore 'restore:<id>', the delete dialog 'delete'. */}
      {tabs && v.tab === 'backups' && <BackupsSheets view={v} />}
      {/* The Keyboard keys sheet 'keys' (?), over whatever screen it was opened on. */}
      <KeyboardKeysSheet open={v.sheets.includes(KEYS_SHEET)} onDismiss={() => nav.close(sheetLayer(KEYS_SHEET))} />
      <ProgressSlot task={progressShown ? state.task : null} onCancel={() => c.cancelTask()} />
      <ToastLayer raise={state.toast?.id ?? null}>
        <ControllerToast controller={c} />
        <UpdatePrompt />
      </ToastLayer>
    </div>
  )
}

/** Live's display line in the top bar (a phone on its side); it alone re-renders as notes play. */
function LiveBar(props: { pianoRange: NoteRange | null; editing: boolean }): JSX.Element {
  const c = useController()
  return (
    <LivePill
      mirror={liveMirror(c)}
      keys={liveKeys(c)}
      playing={livePlaying(c)}
      late={c.liveLate}
      editing={props.editing}
      pianoRange={props.pianoRange}
    />
  )
}

/** What Live shows: the mirror, or offline its last read, or a note to connect. */
function liveMirror(c: ArcController): MirrorUi | null {
  const state = c.state.value
  return state.mirror ?? (state.device === null
    ? { state: emptyMirrorState(c.padOrder()), loading: false, error: MirrorText.NOT_CONNECTED }
    : null)
}

/** KEYS as the settings and the controller have it (MainActivity's KeysUi, less what plays). */
function liveKeys(c: ArcController): KeysShown {
  const settings = c.settings.value
  const state = c.state.value
  return {
    on: settings.liveKeys,
    root: settings.keysRoot,
    scale: settings.keysScale,
    octave: settings.keysOctave,
    names: settings.keysNames,
    showNames: settings.keysShowNames,
    pad: state.keysPad,
    padName: state.keysPad ? c.mirrorName(state.keysPad) : null,
    pianoWhites: settings.pianoWhites,
  }
}

/** What sounds on the phone, as signals read by each pad and key: a voice doesn't re-render the screen. */
function livePlaying(c: ArcController): LivePlaying {
  return { pads: c.playingPads, notes: c.playingNotes }
}

/** The section under the top bar (Root's `when (tab)`). */
function TabScreen(props: {
  view: NavView
  editPads: boolean
  onEditPads: (on: boolean) => void
  /** Live's display line is in the top bar (a phone on its side). */
  inBar: boolean
  /** The piano's notes while it shows, for the line in the top bar. */
  onPianoRange: (r: NoteRange | null) => void
}): JSX.Element {
  const c = useController()
  const nav = useNav()
  const v = props.view
  const state = c.state.value
  const settings = c.settings.value
  switch (v.tab) {
    case 'live': {
      return (
        <MirrorScreen
          mirror={liveMirror(c)}
          onGetFactory={c.canGetFactory && FactorySounds.inLibrary(state.backups) === null ? () => void c.getFactorySounds() : null}
          onStop={() => c.stopPlayback()}
          nameOf={(pad) => c.mirrorName(pad)}
          oneGroup={settings.liveOneGroup}
          onOneGroup={(on) => c.setLiveOneGroup(on)}
          follow={settings.liveFollow}
          onFollow={(on) => c.setLiveFollow(on)}
          toolsOpen={v.side}
          onTools={(open) => (open ? nav.open(overlayLayer('side')) : nav.close(overlayLayer('side')))}
          picker={keysPickerOf(v.dialogs)}
          onPicker={(p) => {
            // One list at a time: a dialog layer 'pick:<what>', so Back closes it (Kotlin's focusable Popup).
            const cur = nav.current.dialogs.find((d) => d.startsWith(PICK))
            if (p === null) {
              if (cur !== undefined) nav.close(dialogLayer(cur))
            } else if (cur === undefined) nav.open(dialogLayer(PICK + p))
            else if (cur !== PICK + p) nav.replace(dialogLayer(cur), dialogLayer(PICK + p))
          }}
          onPad={(pad, hold, unsure, at) => void c.playPad(pad, hold, unsure, at)}
          onPadKept={(pad) => void c.keepPad(pad)}
          onPadUp={(pad) => c.releasePad(pad)}
          onPadCut={(pad) => c.cutPad(pad)}
          // Signals, read by each pad and key: a voice doesn't re-render this screen.
          playing={livePlaying(c)}
          haptics={settings.haptics}
          // Read by the display line alone, so a new delay re-renders only that.
          outputLate={c.liveLate}
          keys={liveKeys(c)}
          inBar={props.inBar}
          onPianoRange={props.onPianoRange}
          keysViewWide={settings.keysViewWide}
          keysViewTall={settings.keysViewTall}
          edit={{
            on: props.editPads,
            connected: state.device !== null,
            onChange: props.onEditPads,
            onPad: (pad) => {
              if (c.editTarget(pad) !== null) nav.open(sheetLayer(`${EDIT_PREFIX}${pad.group}:${pad.offset}`))
            },
            onDropSlot: (pad, slot) => void c.assignPad(pad, slot),
            onDropFile: (pad, file) => void c.uploadForPad(pad, [file]),
            sounds: c.liveSounds(),
            playing: c.playing.value,
            onPlay: (slot) => void c.playDeviceSound(slot),
            onStop: () => c.stopPlayback(),
            onUpload: (files) => void c.dropSamples(files),
            nameNow: (pad) => c.padSoundName(pad),
          }}
          keysActions={{
            onMode: (on) => c.setLiveKeys(on),
            onRoot: (r) => c.setKeysRoot(r),
            onScale: (s) => c.setKeysScale(s),
            onOctave: (o) => c.setKeysOctave(o),
            onNote: (n, hold, at) => void c.playNote(n, hold, at),
            onNoteUp: (n) => c.releaseNote(n),
            onView: (wide, view) => c.setKeysView(wide, view),
            onSelect: (pad) => c.selectKeysPad(pad),
          }}
        />
      )
    }
    case 'device':
      return (
        <DeviceScreen
          state={state}
          onRefresh={() => void c.refreshBrowser()}
          onSoundDetails={(slot) => void c.loadSoundDetails(slot)}
          onProjectSounds={(p) => void c.loadProjectSounds(p)}
          onAddSamples={() => void c.pickSamples()}
          playing={c.playing.value}
          onPlay={(slot) => void c.playDeviceSound(slot)}
          onStop={() => c.stopPlayback()}
          onPads={(n) => nav.open(sheetLayer(`pads:device:${n}`))}
        />
      )
    case 'backups':
      return (
        <MainScreen
          state={state}
          fmtDay={(ms) => c.fmtDay(ms)}
          onBackup={() => void c.backup()}
          onImport={() => void c.pickImport()}
          onOpen={(b) => nav.open(sheetLayer(`detail:${b.id}`))}
          onSearch={() => nav.openScreen({ kind: 'search' })}
          onRestoreFolder={() => void c.pickFolder()}
          onReconnectFolder={() => void c.reconnectFolder()}
          onExportLibrary={() => void c.exportLibrary()}
        />
      )
  }
}

/** The progress sheet: modal (no Escape, no scrim, no Back), over any tab (ui/sheets/ProgressSheet). */
function ProgressSlot(props: { task: TaskUi | null; onCancel: () => void }): JSX.Element {
  return <ProgressSheet task={props.task} onCancel={props.onCancel} />
}

/**
 * The toast over everything, sheets included: modal <dialog>s sit in the top
 * layer, so the toast lives in a manual popover raised above them whenever a
 * new message shows or a dialog opens.
 */
function ToastLayer(props: { raise: number | null; children: ComponentChildren }): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)
  const raise = (): void => {
    const el = ref.current
    if (!el || typeof el.showPopover !== 'function') return
    try {
      if (el.matches(':popover-open')) el.hidePopover()
      el.showPopover()
    } catch {
      // Not connected yet, or no popover support: the plain fixed toast stays.
    }
  }
  useEffect(() => {
    raise()
    // A dialog opening goes above the popover; put the toast back on top.
    const onToggle = (e: Event): void => {
      if (e.target instanceof HTMLDialogElement && (e as ToggleEvent).newState === 'open') raise()
    }
    document.addEventListener('toggle', onToggle, true)
    return () => document.removeEventListener('toggle', onToggle, true)
  }, [])
  useEffect(() => {
    if (props.raise !== null) raise()
  }, [props.raise])
  return (
    <div ref={ref} class="toast-layer" popover="manual">
      {props.children}
    </div>
  )
}

/** Rendering failed: a plain message instead of a blank page. */
class ErrorBoundary extends Component<{ children: ComponentChildren }, { error: unknown }> {
  override state = { error: null as unknown }

  static override getDerivedStateFromError(error: unknown): { error: unknown } {
    return { error }
  }

  override componentDidCatch(error: unknown): void {
    console.error(error)
  }

  override render(): ComponentChildren {
    if (this.state.error !== null) return <CrashMessage error={this.state.error} />
    return this.props.children
  }
}

/** The plain message main.tsx and the error boundary show. */
export function CrashMessage(props: { error: unknown }): JSX.Element {
  const e = props.error
  const msg = e instanceof Error ? e.message : String(e)
  return (
    <div class="crash" role="alert">
      <p class="t-bold">arc</p>
      <p class="t-body15">{msg}</p>
      <button type="button" class="crash__reload t-caps-key" onClick={() => location.reload()}>
        {WebText.UPDATE_RELOAD}
      </button>
    </div>
  )
}
