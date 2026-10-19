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
// bar has the theme switch (Settings → Theme, marked top.theme) after the ? key,
// and the rail's Settings key stands for the phone's entries. Below 1024px the tree is the phone's, unchanged.
//
// Live's EDIT (Root's editPads): on while Live shows its pads; its tab is the
// shell's second edge tab (on the desk, MirrorScreen hangs it on the K.O. II
// panel), its pad sheet 'edit:<group>:<offset>' (ui/sheets/PadEditSheet), and
// a new sample goes through the Device tab's upload sheet, mounted on Live too.
// EDIT's sheet closes when the EP-133 comes or goes, and EDIT ends when it goes (Root's
// LaunchedEffect(ready)). Web delta: EDIT stays on when the EP-133 comes, since on the web
// it can be switched on before the first read (the keyboard's E as the page opens), and
// waits for that read rather than being turned off by it.
// Offline the pads change in arc only; once the EP-133 is read again a dialog
// asks whether to write those changes (state.offlinePrompt: Write, or Discard
// with Esc, the scrim or its other key; not a navigation layer).
//
// On a phone on its side (ui/live/window.ts liveInBar; never on the desk),
// Live's display line rides in the top bar's middle (LiveBar, MirrorScreen's
// LivePill) and the page leaves it out.
//
// Web only, the drawn EP-133's keys (ui/live/deviceKeys.ts, DeviceKeys.tsx):
// [deviceKeysUi] is their layer, carrying the device's combos out on the
// controller (the pattern, the FX bus, SAMPLE, KEYS, a pad's sound through
// assignPad), and [DevicePages] keeps the pad played last open for the SOUND
// and EDIT pages' knobs. Arc's sound gives it solo, the fader's assignments
// and their reset ([fxSoundHooks], on the FX bus), and the drawn knobs the
// click's level and the assigned fader (deviceControlsUi's click and
// faderAssigned).
//
// Try arc (the first-run tour) runs here, as in Root on Android: the
// first-run decision ([useTourFirstRun]: the tour for a new install, else the
// "?" guide once), the run on screen ([useTourRun]: the session, the snapshot
// of the app it reads, the ticks it keeps in settings) and its overlay, the
// guide overlay in tour mode with the step card (ui/components/Tour.tsx).
// While the tour shows, Live is on one group with the pads (not the keys) and
// the toast sits at the top. Back up's step shows on Backups, its spotlight on
// the Back up key there, and the run goes back to Live after it ([tourTab]). While what an offline step points at is open
// (Live tools, the section list, the guide) the tour steps aside, and its next
// card shows when that closes.
import { computed, signal, useComputed } from '@preact/signals'
import { Component, type ComponentChildren, type JSX } from 'preact'
import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks'
import { FactoryKit, FactorySounds } from './core/features/factorySounds'
import { FirstRun, Tour, TourStep, type TourProgress, type TourSession, type TourSnapshot } from './core/features/tour'
import { TourText } from './core/text/tourText'
import { MirrorText } from './core/text/mirrorText'
import { SettingsText } from './core/text/settingsText'
import { Strings } from './core/text/strings'
import { WebText } from './core/text/webText'
import { attachDrop, isPakName } from './platform/files/pick'
import { supported as hapticsSupported } from './platform/haptics'
import { REVIEW_KEY, type ArcController } from './state/controller'
import { emptyMirrorState, type MirrorUi, type TaskUi, type UiState } from './state/types'
import { APP_BUILD } from './version'
import { AppProvider, useController, useNav } from './ui/AppContext'
import { FactoryKitContext } from './ui/FactoryKitContext'
import { HapticsContext } from './ui/useHaptic'
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
import { CoachHost, tourCardLow, useCoachFirstRun } from './ui/components/Coach'
import { Dialog } from './ui/components/Dialog'
import { TourCard, tourMode, type TourActions } from './ui/components/Tour'
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
import { EDIT_PREFIX, editPadOf, PadEditSheet } from './ui/sheets/PadEditSheet'
import { BackupPadsSheet, DevicePadsSheet } from './ui/sheets/PadsSheet'
import { FontLicenceSheet } from './ui/sheets/FontLicenceSheet'
import { DeviceUploadSheet } from './ui/sheets/UploadSheet'
import { useDesk, useFinePointer, useWindowSize } from './ui/useDesk'
import { useAppKeys } from './ui/useAppKeys'
import { KeyboardKeysSheet } from './ui/sheets/KeyboardKeysSheet'
import { PatternSheet } from './ui/sheets/PatternSheet'
import { TransportContext, type TransportUi } from './ui/live/PatternLine'
import { FunctionKeysContext, ProjectHold, ProjectHoldContext, TempoContext, type FunctionKeysUi, type ProjectUi, type TempoUi } from './ui/live/FunctionRow'
import { assignedTarget, DeviceControlsContext, type DeviceControlsUi } from './ui/live/DeviceControls'
import type { GroupParamSnapshot } from './state/fx'
import { DeviceKeysContext, type DeviceKeysUi } from './ui/live/DeviceKeys'
import { DeviceKeys, slotStep, type DeviceAction, type DevicePage, type DeviceSoundHooks } from './ui/live/deviceKeys'
import { editWord, pageWord } from './ui/live/DeviceView'
import { EDIT_PAGES, padPage, setPadPage } from './ui/sheets/PadEditPages'
import { FX_TYPES } from './core/features/fxSettings'
import { Keys } from './core/features/keys'
import { padKey, physicalPad, type PhysicalPad } from './core/features/padNotes'
import { SoundSource } from './core/features/offlinePads'
import { Tempo } from './core/features/tempo'
import { SAMPLE_BARS } from './platform/storage/settings'
import { ClipMode } from './state/scenePlan'
import { PunchContext, type PunchUi } from './ui/live/LivePunch'
import { StepContext, type StepActions } from './ui/live/StepPanel'
import { SceneContext, type SceneActions } from './ui/live/ScenePanel'
import { ArpContext, type ArpActions } from './ui/live/ArpWords'
import { ClaudeContext, learnUrl, type ClaudeActions } from './ui/live/ClaudeSection'
import { BeatImportSheet } from './ui/sheets/BeatImportSheet'
import { SampleContext, type SampleActions } from './ui/live/SamplePanel'
import { SampleReviewSheet } from './ui/sheets/SampleReviewSheet'
import { BeatCards } from './core/features/beatCard'
import { stepWord } from './state/stepPlan'
import { projectChoicesOf, projectKeyOf, projectKeyState } from './ui/live/projectKey'
import { ProjectSheet } from './ui/sheets/ProjectSheet'
import { TempoSheet } from './ui/sheets/TempoSheet'
import { FxSheet } from './ui/sheets/FxSheet'
import { patternBpm } from './state/patternPlan'
import { computerKeys, setComputerKeys } from './ui/keyPrefs'
import './app.css'

/** The progress sheet's layer id. */
const PROGRESS = 'progress'
/** The Keyboard keys sheet (web, desktop: ?). */
const KEYS_SHEET = 'keys'
/** Live's pattern sheet (RECORD held). */
const PATTERN_SHEET = 'pattern'
const BEAT_SHEET = 'beat'
/** SAMPLE's review sheet after a take. */
const REVIEW_SHEET = 'sample-review'
/** Live's tempo sheet (TEMPO held). */
const TEMPO_SHEET = 'tempo'
/** Live's project sheet (PROJECT held). */
const PROJECT_SHEET = 'project'
/** FX tapped: the effect, its sends, the compressor and the sidechain. */
const FX_SHEET = 'fx'

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
    // A beat card file (.txt or .md, as Claude may give one) dropped anywhere opens on the card's sheet.
    const offCardDrop = typeof document === 'undefined'
      ? () => undefined
      : attachDrop(document.body, { onFiles: (f) => void c.receiveBeatFile(f[0]!), filter: (f) => BeatCards.isCardFile(f.name) })
    return () => {
      off()
      offDrop()
      offCardDrop()
      nav.setBackGuard(() => false)
      if (!props.nav) nav.dispose()
    }
  }, [])

  return (
    <AppProvider controller={c} nav={nav}>
      <FactoryKitContext.Provider value={() => c.factoryKit}>
        <ErrorBoundary>
          <Root />
        </ErrorBoundary>
      </FactoryKitContext.Provider>
    </AppProvider>
  )
}

/** Root(): the screens by priority, the sheets over them, the toast over everything. */

/** The guide's search when a device key's card asks for it (web only). */
const guideSearch = signal<{ readonly query: string } | null>(null)

/** Live's device view on the desk (web only): the drawn EP-133 unless the grid was chosen, remembered in this browser. */
const DEVICE_VIEW_KEY = 'arc.liveDeviceView'
const deviceView = signal<boolean>(readDeviceView())

function readDeviceView(): boolean {
  try {
    return globalThis.localStorage?.getItem(DEVICE_VIEW_KEY) !== '0'
  } catch {
    return true
  }
}

function setDeviceView(on: boolean): void {
  deviceView.value = on
  try {
    globalThis.localStorage?.setItem(DEVICE_VIEW_KEY, on ? '1' : '0')
  } catch {
    // Kept for this page only.
  }
}

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
  // PATTERN: RECORD and PLAY on Live's display lines, read through the context (its signal re-renders the lines only).
  const transport = useMemo(() => transportUi(c, () => nav.open(sheetLayer(PATTERN_SHEET))), [c])
  const tempo = useMemo(() => tempoUi(c, () => nav.open(sheetLayer(TEMPO_SHEET))), [c])
  // The drawn EP-133's knobs and fader (web only), read where each is drawn.
  const controls = useMemo(() => deviceControlsUi(c), [c])
  const step = useMemo(() => stepUi(c), [c])
  const scenes = useMemo(() => sceneUi(c), [c])
  const arp = useMemo(() => arpUi(c), [c])
  const claude = useMemo(() => claudeUi(c), [c])
  const sample = useMemo(() => sampleUi(c), [c])
  // The top bar's mic key: its light read there alone.
  const micKey = useMemo(() => (sample === null ? null : { on: computed(() => c.sample.ui.value.on), onTap: () => c.toggleSample() }), [c, sample])
  // PROJECT held: the pads printed 1 to 9 pick a project instead of sounding.
  const projectHold = useMemo(() => new ProjectHold(), [])
  // The drawn EP-133's keys (web only): the device's combos, carried out here; what Root holds is read at each press.
  const deviceActs = useRef<DeviceKeysActs | null>(null)
  const deviceKeys = useMemo(() => deviceKeysUi(c, () => deviceActs.current, fxSoundHooks(c)), [c])
  // Live's EDIT (giving a pad another sound): on Live, in PADS, until switched off or left.
  const [editPads, setEditPads] = useState(false)
  const canEdit = v.tab === 'live' && !settings.liveKeys
  useEffect(() => {
    if (!canEdit && editPads) setEditPads(false)
  }, [canEdit, editPads])
  // EDIT writes to the device, or offline changes pads in arc only: its pad sheet closes when the
  // device comes or goes, so none stays open on the other side, and EDIT ends when it goes.
  const ready = state.device !== null
  const editReady = useRef(ready)
  useEffect(() => {
    if (editReady.current === ready) return
    editReady.current = ready
    if (!ready) setEditPads(false)
    const pad = editPadOf(v.sheets)
    if (pad !== null) nav.close(sheetLayer(`${EDIT_PREFIX}${pad.group}:${pad.offset}`))
  }, [ready])
  // FX held: the pads play the punch-ins until it lets go, which lets go of every one held (MainActivity punchMode).
  const [fxHeld, setFxHeld] = useState(false)
  const punchOff = (): void => {
    c.fx.desk.punchAllUp()
    setFxHeld(false)
  }
  useEffect(() => {
    if (v.tab !== 'live' && fxHeld) punchOff()
  }, [v.tab])
  // Only the effect's type re-renders the shell (its knobs turn many times a second).
  const fxType = useComputed(() => c.fx.desk.fx.value.type).value
  const punches = c.fx.desk.punches.value
  const punchOn = fxHeld && v.tab === 'live' && !settings.liveKeys
  const punch: PunchUi | null = useMemo(
    () =>
      punchOn
        ? {
            held: punches,
            onDown: (slot, depth) => c.fx.desk.punchDown(slot, depth),
            onMove: (slot, depth) => c.fx.desk.punchMove(slot, depth),
            onUp: (slot) => c.fx.desk.punchUp(slot),
            haptic: settings.haptics,
          }
        : null,
    [c, punchOn, punches, settings.haptics],
  )
  // Live's function keys over the pads: SOUND (EDIT, and the pad played last's sheet); TEMPO is [tempo].
  const fnKeys: FunctionKeysUi = {
    sound: {
      editOn: editPads && !settings.liveKeys,
      enabled: v.tab === 'live',
      onTap: () => {
        // In KEYS it goes back to the pads with EDIT on.
        if (settings.liveKeys) {
          c.setLiveKeys(false)
          setEditPads(true)
        } else {
          setEditPads(!editPads)
        }
      },
      onHold: () => {
        const pad = state.keysPad
        if (pad === null) c.toast(MirrorText.PLAY_A_PAD)
        else if (c.editTarget(pad) !== null) nav.open(sheetLayer(`${EDIT_PREFIX}${pad.group}:${pad.offset}`))
      },
    },
    project: v.tab === 'live' ? projectUi(c, state.busy, () => nav.open(sheetLayer(PROJECT_SHEET))) : null,
    fx:
      v.tab === 'live'
        ? {
            label: MirrorText.fxKeyLabel(fxType),
            name: MirrorText.fxName(fxType),
            on: fxType !== 'NONE',
            held: fxHeld,
            onSheet: () => nav.open(sheetLayer(FX_SHEET)),
            onHold: (down) => (down ? setFxHeld(true) : punchOff()),
          }
        : null,
  }
  deviceActs.current = {
    projectHold,
    punch: (on) => (on ? setFxHeld(true) : punchOff()),
    openPadSheet: (pad) => {
      if (c.editTarget(pad) !== null) nav.open(sheetLayer(`${EDIT_PREFIX}${pad.group}:${pad.offset}`))
    },
    openSheet: (id) => nav.open(sheetLayer(id)),
  }
  // On a phone on its side, Live's display line rides in the top bar; the piano's
  // notes (while it shows) let it name a device note past them.
  const win = useWindowSize()
  const liveBar = v.tab === 'live' && !desk && liveInBar(win)
  const [pianoRange, setPianoRange] = useState<NoteRange | null>(null)

  // The guide overlay is saved as seen when it closes; Try arc (or the guide) opens
  // by itself on the first start (useTourFirstRun).
  useCoachFirstRun(c.coach, v.coach)
  useTourFirstRun(state.libraryChecked)
  const tour = useTourRun()
  // The tour steps aside while Live tools, the section list or the guide is open.
  const tourShown = tour.shown && !tourAway(v)
  // The guide overlay's host: the "?" guide, or Try arc's veil and card (tour mode).
  const tourOn = !v.coach && tour.step !== null
  const coachHost = {
    visible: v.coach || tourShown,
    onDismiss: () => (v.coach ? nav.close(overlayLayer('coach')) : nav.back()),
    mode: tourOn && tour.step !== null ? tourMode(tour.step) : undefined,
    card: tourOn ? tour.card : undefined,
    label: tourOn ? TourText.TITLE : undefined,
    describedBy: tourOn ? tour.headingId : undefined,
  }

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
        onSkin={(s) => c.setSkin(s)}
        onAutoConnect={(on) => c.setAutoConnect(on)}
        onKeepScreenOn={(on) => c.setKeepScreenOn(on)}
        pruneCount={(keep) => c.pruneCount(keep)}
        onKeepLast={(keep) => void c.setKeepLast(keep)}
        onPadOrder={(o) => c.setPadOrder(o)}
        onForgetNames={() => c.forgetLearned()}
        padSoundsSize={() => c.padSoundsSize()}
        onClearPadSounds={() => void c.clearPadSounds()}
        factorySounds={
          c.canGetFactory ? { saved: FactorySounds.inLibrary(state.backups, FactoryKit.EP133) !== null, onGet: () => void c.getFactorySounds() } : undefined
        }
        factorySounds40={
          c.canGetFactory
            ? { saved: FactorySounds.inLibrary(state.backups, FactoryKit.EP40) !== null, onGet: () => void c.getFactorySounds(FactoryKit.EP40) }
            : undefined
        }
        factoryKits={{
          saved1320: FactorySounds.inLibrary(state.backups, FactoryKit.EP1320) !== null,
          saved: FactorySounds.savedKits(state.backups),
          kit: c.factoryKit,
          onKit: (k) => c.setFactoryKit(k),
        }}
        computerKeys={desk || fine ? { on: computerKeys.value, onChange: setComputerKeys, onShow: () => nav.open(sheetLayer(KEYS_SHEET)) } : undefined}
        onNoteNames={(n) => c.setKeysNames(n)}
        onShowNames={(on) => c.setKeysShowNames(on)}
        onPianoWhites={(w) => c.setPianoWhites(w)}
        hapticsSupported={hapticsSupported()}
        onHaptics={(on) => c.setHaptics(on)}
        onMakeUpDelay={(on) => c.setMakeUpDelay(on)}
        onReviewSamples={c.sample.available ? (on) => c.sample.setReviewSamples(on) : undefined}
        bluetooth={c.liveBluetooth.value}
        onRestoreFolder={() => void c.pickFolder()}
        onReconnectFolder={() => void c.reconnectFolder()}
        onExportLibrary={() => void c.exportLibrary()}
        onSource={() => { window.open(SettingsText.SOURCE_URL, '_blank', 'noopener') }}
        onFontLicence={() => nav.open(sheetLayer('licence'))}
        onDebug={() => nav.openScreen({ kind: 'debug' })}
        onTryAgain={() => tour.restart()}
        onShowGuide={() => {
          nav.selectTab('live')
          nav.open(overlayLayer('coach'))
        }}
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
        onConnect={() => void c.connect()}
        onNote={(text) => c.toast(text)}
        // Read by the top bar alone, so a new delay re-renders only that.
        late={v.tab === 'live' ? c.liveLate : null}
        madeUp={v.tab === 'live' ? c.delayMadeUpFor : null}
        sample={v.tab === 'live' ? micKey : null}
        onDebug={() => nav.openScreen({ kind: 'debug' })}
        // The section list's last entry: the list closes and Settings opens in its place.
        onSettings={() => nav.replace(overlayLayer('menu'), screenLayer({ kind: 'settings' }))}
        onHelp={() => nav.open(overlayLayer('coach'))}
        theme={settings.theme}
        onTheme={(t) => c.setTheme(t)}
        guideOpen={v.guide}
        onGuide={(open) => (open ? nav.openScreen({ kind: 'guide' }) : nav.close(screenLayer({ kind: 'guide' })))}
        guide={<GuideScreen onBack={() => nav.close(screenLayer({ kind: 'guide' }))} search={guideSearch.value} />}
        desk={desk}
        // Live's EDIT tab under GUIDE (on the desk it hangs on the K.O. II panel instead).
        middle={liveBar ? <LiveBar pianoRange={pianoRange} editing={editPads} /> : undefined}
      >
        <TabScreen view={v} editPads={editPads} onEditPads={setEditPads} inBar={liveBar} onPianoRange={setPianoRange} />
      </Shell>
    )
    // On the desk the overlay's host is around the whole desk instead (the rail's marks too).
    if (!desk) page = <CoachHost {...coachHost} visible={coachHost.visible}>{page}</CoachHost>
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
    <HapticsContext.Provider value={settings.haptics && hapticsSupported()}>
    <TransportContext.Provider value={transport}>
    <StepContext.Provider value={step}>
    <SceneContext.Provider value={scenes}>
    <SampleContext.Provider value={sample}>
    <ArpContext.Provider value={arp}>
    <ClaudeContext.Provider value={claude}>
    <TempoContext.Provider value={tempo}>
    <FunctionKeysContext.Provider value={fnKeys}>
    <DeviceControlsContext.Provider value={controls}>
    <DeviceKeysContext.Provider value={deviceKeys}>
    <ProjectHoldContext.Provider value={projectHold}>
    <PunchContext.Provider value={punch}>
    <div class={desk ? 'app is-desk' : 'app'}>
      {desk ? (
        <CoachHost {...coachHost} visible={coachHost.visible && view === 'shell'}>
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
      {tabs && v.tab === 'live' && <><PadEditSheet view={v} /><DeviceUploadSheet view={v} /><LivePatternSheet view={v} /><LiveTempoSheet view={v} /><LiveProjectSheet view={v} /><LiveFxSheet view={v} /><LiveBeatSheet view={v} /><LiveReviewSheet view={v} /></>}
      {/* The drawn device's pages: SOUND and EDIT keep the pad played last open for its knobs (after the pad sheet, which has it while open). */}
      {v.tab === 'live' && <DevicePages dk={deviceKeys} view={v} />}
      {/* The Backups tab's sheets: detail 'detail:<id>', compare picker 'comparePick:<id>',
          restore 'restore:<id>', the delete dialog 'delete'. */}
      {tabs && v.tab === 'backups' && <BackupsSheets view={v} />}
      {/* The Keyboard keys sheet 'keys' (?), over whatever screen it was opened on. */}
      <KeyboardKeysSheet open={v.sheets.includes(KEYS_SHEET)} onDismiss={() => nav.close(sheetLayer(KEYS_SHEET))} />
      <ProgressSlot task={progressShown ? state.task : null} onCancel={() => c.cancelTask()} />
      {/* The EP-133 connected with offline pad changes kept: write them, or discard them. */}
      <Dialog
        open={state.offlinePrompt !== null}
        text={MirrorText.putOffline(state.offlinePrompt?.changes ?? 0, state.offlinePrompt?.samples ?? 0)}
        confirm={MirrorText.WRITE}
        cancel={MirrorText.DISCARD}
        confirmColor="var(--navy)"
        onConfirm={() => void c.writeOfflinePads()}
        onDismiss={() => void c.discardOfflinePads()}
      />
      <ToastLayer raise={state.toast?.id ?? null} top={tourShown && tourCardLow.value}>
        <ControllerToast controller={c} />
        <UpdatePrompt />
      </ToastLayer>
    </div>
    </PunchContext.Provider>
    </ProjectHoldContext.Provider>
    </DeviceKeysContext.Provider>
    </DeviceControlsContext.Provider>
    </FunctionKeysContext.Provider>
    </TempoContext.Provider>
    </ClaudeContext.Provider>
    </ArpContext.Provider>
    </SampleContext.Provider>
    </SceneContext.Provider>
    </StepContext.Provider>
    </TransportContext.Provider>
    </HapticsContext.Provider>
  )
}

/** TEMPO's key over the pads (Kotlin FunctionKeysUi's TEMPO part), read from the controller's signals as it renders. */
function tempoUi(c: ArcController, openSheet: () => void): TempoUi | null {
  const p = c.pattern
  if (!p.canClick) return null
  return {
    get clickOn() {
      return p.metronome.value.on
    },
    get bpm() {
      return p.metronome.value.bpm
    },
    get deviceBpm() {
      return c.state.value.mirror?.state.bpm ?? null
    },
    get beat() {
      return p.beats.value
    },
    onClick: (on) => p.setClick(on),
    onSheet: openSheet,
  }
}

/**
 * The drawn EP-133's VOLUME, X and Y knobs and fader (web only): arc's own
 * volume, the effect's knobs and the groups' levels, the pad sheet, the tempo,
 * each read as a control renders.
 */
function deviceControlsUi(c: ArcController): DeviceControlsUi {
  return {
    get volume() {
      return c.liveVolume.value
    },
    setVolume: (v) => c.setLiveVolume(v),
    get fx() {
      return c.fx.desk.fx.value
    },
    get bpm() {
      return patternBpm(c.state.value.mirror?.state.bpm, c.pattern.metronome.value.bpm)
    },
    setFxXY: (x, y) => c.fx.desk.setXY(x, y),
    setGroupLevel: (g, v) => c.fx.desk.setGroupLevel(g, v),
    setSend: (g, v) => c.fx.desk.setSend(g, v),
    setComp: (x, y) => c.fx.desk.setComp({ on: true, x, y }),
    setSidechainXY: (x, y) => c.fx.desk.setSidechainXY(x, y),
    get padEdit() {
      return c.padEdit.edit.value
    },
    adjustPad: (s) => c.adjustPad(s),
    setTempo: (bpm) => c.pattern.setTempo(bpm),
    get keys() {
      const s = c.settings.value
      return { root: s.keysRoot, scale: s.keysScale, names: s.keysNames }
    },
    setKeysRoot: (r) => c.setKeysRoot(r),
    setKeysScale: (sc) => c.setKeysScale(sc),
    get timing() {
      return c.pattern.ui.value.timingSettings
    },
    setTimingInterval: (t) => c.pattern.setTimingInterval(t),
    setTimingSwing: (v) => c.pattern.setTimingSwing(v),
    // TEMPO's Y: the click's level, off at the bottom; turned up from there the click comes on, down to it it goes off.
    get click() {
      const p = c.pattern
      if (!p.canClick) return null
      const on = p.metronome.value.on
      return {
        level: on ? c.clickLevel.value : 0,
        set: (v: number) => {
          if (v <= 0) {
            if (p.metronome.peek().on) p.setClick(false)
            return
          }
          c.setClickLevel(v)
          if (!p.metronome.peek().on) p.setClick(true)
        },
      }
    },
    // The shown group's fader assigned (FADER + a pad) to other than LEVEL: that parameter.
    faderAssigned: (g) => {
      const d = c.fx.desk
      const param = d.faderAssign.value[g] ?? 'LEVEL'
      return param === 'LEVEL' ? null : assignedTarget(g, param, d.groupParam(g, param), (v) => d.setGroupParam(g, param, v))
    },
  }
}

/** What the drawn device's key layer needs of Root beside the controller (kept up to date as Root renders). */
interface DeviceKeysActs {
  /** PROJECT's hold: MAIN held, a pad 1 to 9 picks a project (the row's PROJECT too). */
  readonly projectHold: ProjectHold
  /** FX's punch-ins on or off. */
  punch(on: boolean): void
  openPadSheet(pad: PhysicalPad): void
  openSheet(id: string): void
}

/**
 * What arc's sound gives the drawn device's combos, on the FX bus: FX + the
 * group keys solo (FxDesk.setSolo, for the session), FADER + a pad assigns the
 * shown group's fader (false for what arc hasn't: TIME, VEL, MOD), and SHIFT +
 * FADER resets the group's parameters (RES), its next press puts them back
 * (SET), the snapshot kept per project and group meanwhile.
 */
function fxSoundHooks(c: ArcController): DeviceSoundHooks {
  const d = c.fx.desk
  const snapshots = new Map<string, GroupParamSnapshot>()
  return {
    solo: (groups) => d.setSolo(groups),
    assignFader: (g, param) => d.setFaderAssign(g, param),
    resetFader: (g) => {
      const key = `${d.project}:${g}`
      const snap = snapshots.get(key)
      if (snap !== undefined) {
        snapshots.delete(key)
        d.restoreGroupParams(g, snap)
        return 'SET'
      }
      snapshots.set(key, d.resetGroupParams(g))
      return 'RES'
    },
  }
}

/** SOUND's − / + write the slot stepped to once the stepping rests this long (one write, one UNDO). */
const SLOT_REST_MS = 400

/**
 * The drawn EP-133's key layer (web only, ui/live/deviceKeys.ts) and what it
 * does: the device's combos carried out on the controller (the pattern, the
 * FX bus, SAMPLE, KEYS, the pads' sounds), its changes said on the plate and
 * shown on the digits. SOUND's − / + step the pad played last through the
 * device's sounds, the slot and name at once, written (assignPad, with its
 * UNDO) once the stepping rests. [hooks]: what arc's sound adds (solo, the
 * fader's assignments): none yet.
 */
function deviceKeysUi(c: ArcController, acts: () => DeviceKeysActs | null, hooks: DeviceSoundHooks = {}): DeviceKeysUi {
  const p = c.pattern
  const d = c.fx.desk
  // The slot SOUND's − / + stepped to, waiting for the stepping to rest, in the project it was stepped in.
  const pending = signal<{ readonly pad: PhysicalPad; readonly slot: number; readonly project: number } | null>(null)
  let pendingTimer: ReturnType<typeof setTimeout> | null = null
  const sounds = () => [...c.liveSounds()].sort((a, b) => a.slot - b.slot)
  // Offline the pads change in arc only, from the list they show.
  const source = (): SoundSource => {
    const st = c.state.peek()
    const off = st.device === null ? (st.mirror?.offlineSounds ?? null) : null
    return off !== null ? off.base : SoundSource.DEVICE
  }
  const samePad = (a: PhysicalPad, b: PhysicalPad): boolean => a.group === b.group && a.offset === b.offset
  const slotOf = (pad: PhysicalPad): number | null => {
    const w = pending.peek()
    return w !== null && samePad(w.pad, pad) ? w.slot : (c.editTarget(pad, true)?.slot ?? null)
  }
  // Written once the stepping rests; another project by then is not the one it was stepped in: dropped.
  const writeSlot = (): void => {
    pendingTimer = null
    const w = pending.peek()
    pending.value = null
    if (w !== null && c.editTarget(w.pad, true)?.project === w.project) void c.assignPad(w.pad, w.slot, source())
  }
  const flushSlot = (): void => {
    if (pendingTimer !== null) clearTimeout(pendingTimer)
    writeSlot()
  }
  const dropSlot = (): void => {
    if (pendingTimer !== null) clearTimeout(pendingTimer)
    pendingTimer = null
    pending.value = null
  }
  const pad3 = (n: number): string => String(n).padStart(3, '0').slice(-3)
  const say = (text: string): void => layer.say(text)
  const sayPattern = (g: number): void => {
    const col = p.scene.peek().groups[g]
    if (col === undefined) return
    const n = col.queued ?? col.number
    layer.show(pad3(n))
    say(WebText.deviceSet(`${MirrorText.GROUP} ${MirrorText.groupKey(g)}`.toUpperCase(), MirrorText.patternNumber(n)))
  }
  const sayBars = (g: number): void => {
    const bars = p.ui.peek().bars[g] ?? 1
    layer.show(String(bars).padStart(3, ' '))
    say(WebText.deviceSet(MirrorText.LENGTH.toUpperCase(), WebText.barsShown(bars)))
  }
  const run = (a: DeviceAction): void => {
    const keysPad = c.state.peek().keysPad
    switch (a.kind) {
      case 'enter': {
        // A page has the plate's place: the panels there close.
        if (a.page !== 'MAIN') {
          c.sample.exit()
          if (p.step.peek().open) p.setStepOpen(false)
          if (p.scene.peek().open) p.setSceneOpen(false)
        }
        const i = EDIT_PAGES.indexOf(padPage.peek())
        if (a.page === 'EDIT') layer.show('EDT', undefined, editWord(i))
        else {
          const word = pageWord(a.page, d.fx.peek().type, i)
          if (word !== null) layer.show(word)
        }
        return
      }
      case 'sheet':
        if (a.sheet === 'SOUND') {
          if (keysPad === null) c.toast(MirrorText.PLAY_A_PAD)
          else acts()?.openPadSheet(keysPad)
        } else if (a.sheet === 'TEMPO') {
          if (p.canClick) acts()?.openSheet(TEMPO_SHEET)
        } else acts()?.openSheet(PROJECT_SHEET)
        return
      case 'keysMode':
        c.setLiveKeys(a.on)
        return
      case 'group':
        return
      case 'octave': {
        const o = Math.min(Keys.MAX_OCTAVE, Math.max(Keys.MIN_OCTAVE, c.settings.peek().keysOctave + a.step))
        c.setKeysOctave(o)
        layer.show(String(o).padStart(3, ' '))
        say(MirrorText.octave(o).toUpperCase())
        return
      }
      case 'pattern':
        p.scenePatternStep(a.group, a.step)
        sayPattern(a.group)
        return
      case 'patternPick':
        p.scenePatternPick(a.group, a.n)
        sayPattern(a.group)
        return
      case 'nextFree':
        p.scenePatternNextFree(a.group)
        sayPattern(a.group)
        return
      case 'scene':
        p.sceneStep(a.step)
        layer.show(p.scene.peek().label.slice(-3))
        say(p.scene.peek().label.toUpperCase())
        return
      case 'sceneCommit':
        p.sceneCommit()
        say(WebText.deviceSet('COMMIT', p.scene.peek().label.toUpperCase()))
        return
      case 'sceneErase':
        p.sceneEraseHold()
        return
      case 'length':
        p.setLength(a.group, (p.ui.peek().bars[a.group] ?? 1) + a.step)
        sayBars(a.group)
        return
      case 'double':
        p.double(a.group)
        sayBars(a.group)
        return
      case 'stepBy':
        p.stepBy(a.step)
        return
      case 'sampleSource':
        c.sample.stepInput(a.step)
        return
      case 'sampleBars': {
        const choices: (number | null)[] = [null, ...SAMPLE_BARS]
        const i = Math.max(0, choices.indexOf(c.sample.ui.peek().bars))
        const next = choices[Math.min(choices.length - 1, Math.max(0, i + a.step))] ?? null
        c.sample.setBars(next)
        say(WebText.deviceSet('BARS', next === null ? 'FREE' : String(next)))
        return
      }
      case 'slot': {
        if (keysPad === null) {
          say(WebText.DEVICE_PLAY_A_PAD)
          return
        }
        // Not changeable (offline with nothing read, the project not read): the toast says why.
        const target = c.editTarget(keysPad)
        if (target === null) return
        // Another pad's step (or another project's) is written first: one step never takes another's place.
        const w = pending.peek()
        if (w !== null && (!samePad(w.pad, keysPad) || w.project !== target.project)) flushSlot()
        const list = sounds()
        const next = slotStep(
          list.map((snd) => snd.slot),
          slotOf(keysPad) ?? 0,
          a.step,
        )
        if (next === null) return
        pending.value = { pad: keysPad, slot: next, project: target.project }
        layer.show(pad3(next))
        say(WebText.slotShown(next, list.find((snd) => snd.slot === next)?.name ?? null))
        if (pendingTimer !== null) clearTimeout(pendingTimer)
        pendingTimer = setTimeout(writeSlot, SLOT_REST_MS)
        return
      }
      case 'assign': {
        if (keysPad === null) {
          say(WebText.DEVICE_PLAY_A_PAD)
          return
        }
        const snd = sounds().find((e) => e.slot === a.slot)
        if (snd === undefined) {
          say(WebText.noSoundAt(a.slot))
          return
        }
        // The slot typed is the pad's now: a step waiting on it goes (another pad's is written).
        const w = pending.peek()
        if (w !== null && samePad(w.pad, keysPad)) dropSlot()
        else if (w !== null) flushSlot()
        layer.show(pad3(a.slot))
        say(WebText.slotShown(a.slot, snd.name))
        void c.assignPad(keysPad, a.slot, source())
        return
      }
      case 'editPage': {
        const i = Math.min(EDIT_PAGES.length - 1, Math.max(0, EDIT_PAGES.indexOf(padPage.peek()) + a.step))
        setPadPage(EDIT_PAGES[i]!)
        layer.show(editWord(i))
        say(WebText.deviceSet(WebText.DEVICE_PAGES.EDIT!, MirrorText.pageName(i).toUpperCase()))
        return
      }
      case 'quantize':
        p.setTimingQuantize(a.on)
        say((a.on ? MirrorText.QUANTIZE : MirrorText.FREE_TIME).toUpperCase())
        return
      case 'fxType': {
        const cur = d.fx.peek().type
        const t = FX_TYPES[Math.min(FX_TYPES.length - 1, Math.max(0, FX_TYPES.indexOf(cur) + a.step))]!
        // An effect put on with no send anywhere: the group of the pad played last sends to it (as the FX sheet).
        if (t !== cur) d.setType(t, keysPad?.group ?? null)
        layer.show(MirrorText.fxCode(t))
        say(WebText.deviceSet('FX', MirrorText.fxName(t).toUpperCase()))
        return
      }
      case 'tapTempo': {
        const bpm = p.tapTempo(performance.now())
        if (bpm !== null) say(WebText.deviceSet(MirrorText.FN_TEMPO.toUpperCase(), String(bpm)))
        return
      }
      case 'tempo':
        p.setTempo(a.bpm)
        say(WebText.deviceSet(MirrorText.FN_TEMPO.toUpperCase(), String(Tempo.clamp(a.bpm))))
        return
      case 'keysRoot':
        c.setKeysRoot(a.root)
        say(WebText.deviceSet(MirrorText.KEY.toUpperCase(), Keys.name(a.root, c.settings.peek().keysNames)))
        return
      case 'erase':
        p.setErase(a.on)
        return
      case 'clear':
        p.clear(a.group)
        return
      case 'undo':
        p.undo()
        say(MirrorText.UNDO.toUpperCase())
        return
      case 'copy':
        p.setSceneGroup(a.group)
        p.setClipMode(a.pattern ? ClipMode.PTN : ClipMode.BAR)
        p.clipCopy()
        layer.blink('COPY')
        say(WebText.deviceSet('COPY', a.pattern ? 'PATTERN' : 'BAR'))
        return
      case 'paste':
        p.setSceneGroup(a.group)
        p.clipPaste()
        layer.blink('PASTE')
        say('PASTE')
        return
      case 'correct': {
        const on = !p.step.peek().correct
        p.setStepCorrect(on)
        // Stopped, timing correct works in the STEP panel (a pad tapped corrects its notes); never over a take going on.
        if (on && p.ui.peek().phase === 'STOPPED' && !p.step.peek().open && !sampleBusy()) {
          c.sample.exit()
          p.setStepOpen(true)
        }
        say(WebText.deviceSet('CORRECT', MirrorText.onOff(on).toUpperCase()))
        return
      }
      case 'repeat':
        p.setArpOn(a.on)
        return
      case 'sample':
        c.toggleSample()
        return
      case 'sampleStop':
        c.sample.stop()
        return
      case 'leaveSample':
        c.sample.exit()
        return
      case 'handsFree':
        c.sample.latchTake(physicalPad(a.group, a.offset))
        return
      case 'punch':
        acts()?.punch(a.on)
        return
      case 'mainHold': {
        const h = acts()?.projectHold
        if (a.on) h?.down()
        else h?.cancel()
        return
      }
      case 'saved':
        say(WebText.DEVICE_SAVED)
        return
      case 'solo':
        if (hooks.solo !== undefined) {
          hooks.solo(a.groups)
          say(WebText.soloShown([...a.groups].sort().map((g) => MirrorText.groupKey(g))))
        } else if (a.groups.size > 0) say(WebText.notInArc(WebText.DEVICE_NOT_IN_ARC.SOLO!))
        return
      case 'faderAssign':
        if (hooks.assignFader?.(a.group, a.param) === true) {
          layer.show(a.param.slice(0, 3))
          say(WebText.deviceSet(`FADER ${MirrorText.groupKey(a.group)}`, a.param))
        } else say(WebText.notInArc(a.param))
        return
      case 'faderReset': {
        const word = hooks.resetFader?.(a.group) ?? null
        if (word === null) {
          say(WebText.notInArc(WebText.DEVICE_NOT_IN_ARC.FADER_RESET!))
          return
        }
        layer.show(word)
        say(WebText.deviceSet(`FADER ${MirrorText.groupKey(a.group)}`, word))
        return
      }
      case 'sidechainSource':
        d.setSidechainSource(a.group, a.offset)
        say(WebText.deviceSet(MirrorText.SIDECHAIN.toUpperCase(), physicalPad(a.group, a.offset).groupLetter + ' ' + physicalPad(a.group, a.offset).label))
        return
      case 'sidechainDest':
        d.toggleSidechainDest(a.group)
        say(WebText.deviceSet(MirrorText.SIDECHAIN.toUpperCase(), MirrorText.groupKey(a.group)))
        return
      case 'notInArc':
        say(WebText.notInArc(WebText.DEVICE_NOT_IN_ARC[a.what] ?? a.what))
        return
      case 'sampleBusy':
        say(WebText.DEVICE_TAKE_GOING)
        return
    }
  }
  // A take going on (waiting for its sound or PLAY, counting in, recording): SAMPLE's panel stays.
  function sampleBusy(): boolean {
    const sample = c.sample.ui.value
    const t = sample.phase.type
    return sample.on && (t === 'Waiting' || t === 'WaitingForPlay' || t === 'CountIn' || t === 'Recording')
  }
  const layer = new DeviceKeys({
    context: () => {
      const settings = c.settings.value
      const ui = p.ui.value
      const sample = c.sample.ui.value
      const ph = sample.phase
      return {
        keysOn: settings.liveKeys,
        octave: settings.keysOctave,
        bars: ui.bars,
        stepOpen: p.step.value.open,
        sampleOn: sample.on,
        handsFree: sample.latch,
        sampleTaking: ((ph.type === 'Recording' || ph.type === 'Waiting') && ph.latched) || ph.type === 'CountIn' || ph.type === 'WaitingForPlay',
        sampleBusy: sampleBusy(),
        recordArmed: ui.phase === 'ARMED',
        erase: ui.erase,
        arpOn: p.arp.value.on,
        fxIndex: FX_TYPES.indexOf(d.fx.value.type),
        editPage: EDIT_PAGES.indexOf(padPage.value),
        quantize: ui.timingSettings.quantize,
      }
    },
    run,
  })
  return {
    layer,
    get selected() {
      const pad = c.state.value.keysPad
      if (pad === null) return null
      // Read, so a step re-renders the slot shown.
      void pending.value
      const slot = slotOf(pad)
      const name = slot !== null ? (c.liveSounds().find((snd) => snd.slot === slot)?.name ?? null) : null
      return { pad, slot, name: name ?? c.mirrorName(pad) }
    },
    get quantize() {
      return p.ui.value.timingSettings.quantize
    },
    get fxType() {
      return d.fx.value.type
    },
    get muted() {
      return d.silenced.value.size > 0 || d.soloed.value.size > 0
    },
    get silenced() {
      return d.silenced.value
    },
    get soloed() {
      return d.soloed.value
    },
    get faderAssign() {
      return d.faderAssign.value
    },
    projectChanged: () => {
      dropSlot()
      layer.endSolo()
    },
    openSheet: (page: DevicePage) => {
      const a = acts()
      if (a === null) return
      if (page === 'SOUND' || page === 'EDIT') {
        const pad = c.state.peek().keysPad
        if (pad === null) c.toast(MirrorText.PLAY_A_PAD)
        else a.openPadSheet(pad)
      } else if (page === 'TEMPO' || page === 'TIMING') {
        if (p.canClick) a.openSheet(TEMPO_SHEET)
      } else a.openSheet(FX_SHEET)
    },
  }
}

/** On SOUND and EDIT, a pad played after another opens for the knobs once the playing settles this long (one read, not one a hit). */
const PAD_SETTLE_MS = 250

/**
 * The drawn device's pages beside the sheets (web only): on SOUND and EDIT the
 * pad played last is open for the knobs (PadEditDesk, as its sheet opens it;
 * the sheet has it while open), at once as the page opens and, as other pads
 * are played, once the playing settles (each open reads the pad from the
 * EP-133; the knobs stay on the pad open until then); SAMPLE, STEP or SCENE
 * opening takes the page back to MAIN (they share the plate's place); and
 * another project drops SOUND's step waiting and FX's solos.
 */
function DevicePages(props: { dk: DeviceKeysUi; view: NavView }): null {
  const c = useController()
  const page = props.dk.layer.state.value.page
  const pad = c.state.value.keysPad
  const sheet = editPadOf(props.view.sheets) !== null
  const slot = pad !== null ? (c.editTarget(pad, true)?.slot ?? null) : null
  const connected = c.state.value.device !== null
  const sound = page === 'SOUND' || page === 'EDIT'
  const padId = pad !== null ? padKey(pad) : null
  // The sheet opening takes the pad over (its own effect, before this one, has opened it): left open for it.
  const sheetNow = useRef(sheet)
  sheetNow.current = sheet
  // Whether a pad is open for the page: the first opens at once, the next ones once the playing settles.
  const opened = useRef(false)
  useEffect(() => {
    if (!sound || sheet) return
    return () => {
      opened.current = false
      if (!sheetNow.current) c.closePadEdit()
    }
  }, [sound, sheet])
  useEffect(() => {
    if (!sound || sheet || pad === null) return
    const open = (): void => {
      opened.current = true
      c.openPadEdit(pad)
    }
    if (!opened.current) {
      open()
      return
    }
    const t = setTimeout(open, PAD_SETTLE_MS)
    return () => clearTimeout(t)
  }, [sound, sheet, padId, slot, connected])
  const panel = c.sample.ui.value.on || c.pattern.step.value.open || c.pattern.scene.value.open
  useEffect(() => {
    if (panel) props.dk.layer.panelOpened()
  }, [panel])
  const project = c.state.value.mirror?.state.activeProject ?? null
  const projectWas = useRef(project)
  useEffect(() => {
    if (projectWas.current === project) return
    projectWas.current = project
    props.dk.projectChanged()
  }, [project])
  return null
}

/** PROJECT as its key shows it (Kotlin projectKeyOf), and what it does. */
function projectUi(c: ArcController, busy: boolean, openSheet: () => void): ProjectUi {
  const k = projectKeyOf(liveMirror(c), busy)
  return {
    shown: k.shown,
    state: projectKeyState(k),
    enabled: k.enabled,
    switching: k.switching,
    onStep: () => c.stepProject(),
    onPick: openSheet,
    onSelect: (n) => c.selectProject(n),
  }
}

/** PROJECT held and let go of: the project sheet 'project', on Live. */
function LiveProjectSheet(props: { view: NavView }): JSX.Element {
  const c = useController()
  const nav = useNav()
  return (
    <ProjectSheet
      open={props.view.sheets.includes(PROJECT_SHEET)}
      choices={projectChoicesOf(liveMirror(c), c.state.value.busy)}
      onPick={(n) => c.selectProject(n)}
      onDismiss={() => nav.close(sheetLayer(PROJECT_SHEET))}
    />
  )
}

/** TEMPO held: the tempo sheet 'tempo', on Live. */
function LiveTempoSheet(props: { view: NavView }): JSX.Element | null {
  const c = useController()
  const nav = useNav()
  const p = c.pattern
  if (!p.canClick) return null
  const m = p.metronome.value
  return (
    <TempoSheet
      open={props.view.sheets.includes(TEMPO_SHEET)}
      bpm={m.bpm}
      deviceBpm={c.state.value.mirror?.state.bpm ?? null}
      clickOn={m.on}
      timing={p.ui.value.timingSettings}
      onClick={(on) => p.setClick(on)}
      onBpm={(bpm) => p.setTempo(bpm)}
      onTap={(at) => p.tapTempo(at)}
      onInterval={(t) => p.setTimingInterval(t)}
      onSwing={(v) => p.setTimingSwing(v)}
      onQuantize={(on) => p.setTimingQuantize(on)}
      arp={p.arp.value.settings}
      onArpOrder={(o) => p.setArpOrder(o)}
      onArpOctaves={(n) => p.setArpOctaves(n)}
      onArpGate={(v) => p.setArpGate(v)}
      onArpLatch={(on) => p.setArpLatch(on)}
      onDismiss={() => nav.close(sheetLayer(TEMPO_SHEET))}
    />
  )
}

/** FX tapped: the project's effect, its sends, the compressor and the sidechain; the pad played last to hear them on. */
function LiveFxSheet(props: { view: NavView }): JSX.Element {
  const c = useController()
  const nav = useNav()
  const d = c.fx.desk
  const fx = d.fx.value
  const state = c.state.value
  const selected = state.keysPad
  return (
    <FxSheet
      open={props.view.sheets.includes(FX_SHEET)}
      settings={fx}
      bpm={patternBpm(state.mirror?.state.bpm, c.pattern.metronome.value.bpm)}
      selected={selected}
      nameOf={(pad) => c.mirrorName(pad)}
      // An effect put on with no send anywhere: the group of the pad played last sends to it.
      onType={(t) => d.setType(t, selected?.group ?? null)}
      onXY={(x, y) => d.setXY(x, y)}
      onSend={(g, v) => d.setSend(g, v)}
      onComp={(on, x, y) => d.setComp({ on, x, y })}
      onSidechainOn={(on) => d.setSidechainOn(on)}
      onSidechainSource={(g, pad) => d.setSidechainSource(g, pad)}
      onSidechainDest={(g) => d.toggleSidechainDest(g)}
      onSidechainXY={(x, y) => d.setSidechainXY(x, y)}
      // The cap plays the pad as Live does, through the effects (a try, never a pattern's note).
      onPadDown={(pad, at) => void c.tryPad(pad, at)}
      onPadUp={(pad) => c.releaseTry(pad)}
      onDismiss={() => nav.close(sheetLayer(FX_SHEET))}
    />
  )
}

/** SCENES' chip and panel for Live (Kotlin LiveScene), its state read from the controller's signals as each part renders. */
function sceneUi(c: ArcController): SceneActions | null {
  const p = c.pattern
  if (!p.available) return null
  return {
    get ui() {
      return p.scene.value
    },
    get running() {
      const ph = p.ui.value.phase
      return ph === 'PLAYING' || ph === 'COUNT_IN'
    },
    onOpen: () => {
      // The panels share the function keys' place.
      c.sample.exit()
      p.setSceneOpen(true)
    },
    onClose: () => p.setSceneOpen(false),
    onGroup: (g) => p.setSceneGroup(g),
    onPlay: () => p.play(),
    onScene: (dir) => p.sceneStep(dir),
    onPatternStep: (g, dir) => p.scenePatternStep(g, dir),
    onPatternPick: (g, n) => p.scenePatternPick(g, n),
    onNextFree: (g) => p.scenePatternNextFree(g),
    onGrid: (g) => p.sceneGrid(g),
    onCommit: () => p.sceneCommit(),
    onErase: () => p.sceneEraseHold(),
    onSwitch: (t) => p.setSceneSwitch(t),
    onClipMode: (m) => p.setClipMode(m),
    onBar: (b) => p.setClipBar(b),
    onCopy: () => p.clipCopy(),
    onPaste: () => p.clipPaste(),
  }
}

/** SAMPLE's panel and pads for Live (Kotlin SampleUi), its state read from the controller's signals as each part renders. */
function sampleUi(c: ArcController): SampleActions | null {
  const d = c.sample
  if (!d.available) return null
  return {
    get ui() {
      return d.ui.value
    },
    level: d.level,
    get lastTake() {
      return d.lastTake.value
    },
    onToggle: () => c.toggleSample(),
    onClose: () => d.exit(),
    onStop: () => d.stop(),
    onSource: (step) => d.stepInput(step),
    onStereo: (on) => d.setInput({ source: d.ui.peek().input.source, stereo: on }),
    onGain: (db) => d.setGain(db),
    onThreshold: (db) => d.setThreshold(db),
    onLatch: (on) => d.setLatch(on),
    onBars: (bars) => d.setBars(bars),
    onPattern: (on) => d.setPattern(on),
    get hasPattern() {
      return c.pattern.ui.value.hasNotes.some(Boolean)
    },
  }
}

// ---------- Try arc ----------

/** The tour's layer. */
const TOUR = overlayLayer('tour')

/** How long the Pad card waits before ?demo presses a pad by itself. */
export const DEMO_PRESS_DELAY_MS = 800

/**
 * The first-run decision (MainActivity's LaunchedEffect(libraryChecked)): once
 * the library has been read (or failed to), Tour.firstRun picks the tour, the
 * "?" guide or nothing. Only in a visible tab, over the shell, when no guide or
 * tour layer was restored by a reload, and not for automated browsers
 * (screenshots, e2e), where it would only be in the way.
 */
function useTourFirstRun(libraryChecked: boolean): void {
  const c = useController()
  const nav = useNav()
  const decided = useRef(false)
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible')
  useEffect(() => {
    if (typeof document === 'undefined') return
    const on = (): void => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  useEffect(() => {
    if (decided.current || !libraryChecked || !visible) return
    decided.current = true
    const automated = typeof navigator !== 'undefined' && navigator.webdriver === true
    const cur = nav.current
    if (automated || cur.coach || cur.tour) return
    if (rootView(cur, () => false) !== 'shell' || cur.guide) return
    const s = c.settings.peek()
    const first = Tour.firstRun(c.coach.seen, s.tourDone, s.tourSteps, c.state.peek().backups.length, c.demo)
    if (first === FirstRun.TOUR) {
      nav.selectTab('live')
      nav.open(TOUR)
    } else if (first === FirstRun.COACH) nav.open(overlayLayer('coach'))
  }, [libraryChecked, visible])
}

/** The section [step] is shown on (null: wherever the user is): Backups for Back up, Live for the pads. */
export function tourTab(step: TourStep): 'live' | 'backups' | null {
  if (step === TourStep.BACKUP) return 'backups'
  if (step === TourStep.PAD || step === TourStep.HEAR) return 'live'
  return null
}

/** Live tools, the section list or the guide is open: the tour steps aside (TourHost's `away`). */
export function tourAway(v: NavView): boolean {
  return v.side || v.menu || v.guide
}

/** What the tour reads of the app now (MainActivity's snapshot); [v] gives what is open. */
export function tourSnapshot(
  state: UiState,
  heard: boolean,
  demo: boolean,
  nameOf: (pad: { group: number; offset: number }) => string | null,
  v: Pick<NavView, 'side' | 'guide' | 'tab'>,
): TourSnapshot {
  const m = state.mirror?.state ?? null
  const hit = m?.lastHit ?? null
  const pad = hit?.pad ?? null
  return {
    backups: state.backups.length,
    // Web: a folder can be picked (File System Access), once the remembered one was looked at.
    canRestore: state.folderChecked && !state.folderPicked && state.canPickFolder,
    midi: state.midiSupported,
    connected: state.connected && state.device !== null,
    busy: state.busy,
    hitAt: pad !== null && m !== null ? (m.pads.get(padKey(pad))?.onAt ?? null) : null,
    hitNamed: pad !== null && nameOf(pad) !== null,
    heard,
    demo,
    toolsOpen: v.side,
    guideOpen: v.guide,
    onBackups: v.tab === 'backups',
  }
}

interface TourRun {
  /** The tour's layer is open and its run has started. */
  readonly shown: boolean
  /** The step on screen, null while closed. */
  readonly step: TourStep | null
  readonly headingId: string
  readonly card: (slot: { headingOnly: boolean; measuring: boolean; ready: boolean }) => JSX.Element | null
  /** Settings → Try arc again. */
  restart(): void
}

/**
 * The tour on screen (MainActivity's session state, the latch effect and the
 * card's actions). The session lives here, never stored; the progress is the
 * tourSteps setting, so it survives a reload, another tab and a restore.
 */
function useTourRun(): TourRun {
  const c = useController()
  const nav = useNav()
  const v = nav.view.value
  const state = c.state.value
  const settings = c.settings.value
  const heard = c.liveVoices.value.size > 0
  const headingId = useId()
  const [session, setSession] = useState<TourSession | null>(null)
  const [runs, setRuns] = useState(0)
  /** The next close is the tour's own (finished, or closed elsewhere): Back on Welcome is Not now otherwise. */
  const quiet = useRef(false)
  const sessionRef = useRef(session)
  sessionRef.current = session

  const open = v.tour
  // Open: a fresh run with the settings as they are now. Closed: Back on the welcome counts as Not now.
  useEffect(() => {
    if (open) {
      quiet.current = false
      const s = c.settings.peek()
      setSession(Tour.open(Tour.decode(s.tourSteps), c.coach.seen, s.tourDone, c.state.peek().backups.length))
      return
    }
    const was = sessionRef.current
    if (was !== null && !was.welcomed && !quiet.current) c.finishTour()
    quiet.current = false
    setSession(null)
  }, [open, runs])

  const snap = tourSnapshot(state, heard, c.demo, (pad) => c.mirrorName(pad), v)
  const progress: TourProgress = Tour.decode(settings.tourSteps)
  const step = open && session !== null ? Tour.current(progress, session, snap) : null
  const snapKey = JSON.stringify(snap)

  // The latch: the step's baseline when it comes up, then ticks, kept in settings.
  useEffect(() => {
    if (!open || session === null) return
    if (Tour.closes(session, c.coach.seen, settings.tourDone)) {
      quiet.current = true
      nav.close(TOUR)
      return
    }
    const [np, ns] = Tour.advance(Tour.decode(settings.tourSteps), session, snap, performance.now())
    if (ns !== session) setSession(ns)
    const enc = Tour.encode(np)
    if (enc !== settings.tourSteps) c.setTourSteps(enc)
  }, [open, session, snapKey, settings.tourSteps, settings.tourDone, settings.guideSeen])

  // The step's own section: Back up is on Backups (its caption row's first key), the pads on Live.
  // Once past Back up, the tour takes the user back to Live (Done's tags are there). Not while
  // the tour steps aside (what the user opened stays open).
  const away = tourAway(v)
  const tookToBackups = useRef(false)
  useEffect(() => {
    if (step === null || away) return
    const want = tourTab(step) ?? (tookToBackups.current ? 'live' : null)
    tookToBackups.current = want === 'backups' && (tookToBackups.current || nav.current.tab !== 'backups')
    if (want !== null && nav.current.tab !== want) nav.selectTab(want)
  }, [step, away])

  // ?demo: the Pad card presses a pad by itself.
  const ready = snap.connected
  useEffect(() => {
    if (step !== TourStep.PAD || !c.demo || !ready) return
    const t = window.setTimeout(() => c.demoPress(), DEMO_PRESS_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [step, ready])

  const actions: TourActions = {
    start: () => setSession((s) => (s ? Tour.welcome(s) : s)),
    finish: () => {
      quiet.current = true
      c.finishTour()
      nav.close(TOUR)
    },
    skip: () => {
      if (step === null) return
      c.setTourSteps(Tour.encode(Tour.skip(Tour.decode(c.settings.peek().tourSteps), step)))
    },
    next: () => setSession((s) => (s ? Tour.ackConnect(s) : s)),
    connect: () => void c.connectIfNeeded(),
    restore: () => void c.pickFolder(),
    tryDemo: () => {
      window.open(new URL('?demo', location.href).href, '_blank', 'noopener')
    },
    playIt: () => {
      const pad = c.state.peek().mirror?.state.lastHit?.pad ?? null
      if (pad !== null) void c.playPad(pad, false)
    },
    backup: () => void c.backup(),
    offline: () => setSession((s) => (s ? Tour.goOffline(s) : s)),
    open: () => {
      // What the step points at, opened the way its own control does (Open it).
      if (step === TourStep.TOOLS) {
        if (nav.current.tab !== 'live') nav.selectTab('live')
        nav.open(overlayLayer('side'))
      } else if (step === TourStep.GUIDE) nav.openScreen({ kind: 'guide' })
      else if (step === TourStep.SECTIONS) nav.selectTab('backups')
    },
    tryPads: () => tryPads(),
    connectNow: () => {
      tryPads()
      void c.connectIfNeeded()
    },
  }
  /** On to the device's steps, on Live where the pads are. */
  function tryPads(): void {
    if (nav.current.tab !== 'live') nav.selectTab('live')
    setSession((s) => (s ? Tour.goDevice(s) : s))
  }

  return {
    shown: open && session !== null && step !== null,
    step,
    headingId,
    card: (slot) =>
      session === null || step === null ? null : (
        <TourCard
          {...slot}
          step={step}
          session={session}
          progress={progress}
          state={state}
          demo={c.demo}
          headingId={headingId}
          actions={actions}
        />
      ),
    restart: () => {
      c.restartTour()
      nav.selectTab('live')
      nav.open(TOUR)
      setRuns((n) => n + 1)
    },
  }
}

/**
 * SAMPLE's review sheet (Kotlin's review sheet layer): open while a take
 * waits on it. Back, or the scrim, is a DISCARD (with UNDO on the toast).
 */
function LiveReviewSheet(props: { view: NavView }): JSX.Element | null {
  const c = useController()
  const nav = useNav()
  const d = c.sample
  const review = d.review.value
  const playing = c.playing.value === REVIEW_KEY
  const has = props.view.sheets.includes(REVIEW_SHEET)
  const opened = useRef(false)
  useEffect(() => {
    if (review !== null && !has) {
      if (opened.current) {
        // The layer closed (Back) while the take waits.
        opened.current = false
        c.stopReview()
        d.discardSample()
      } else {
        nav.open(sheetLayer(REVIEW_SHEET))
      }
    } else if (review === null && has) {
      nav.close(sheetLayer(REVIEW_SHEET))
    }
    if (has) opened.current = true
    if (review === null && !has) opened.current = false
  }, [review !== null, has])
  if (!d.available) return null
  const done = (run: () => void) => () => {
    c.stopReview()
    run()
  }
  return (
    <SampleReviewSheet
      open={review !== null && has}
      review={review}
      playing={playing}
      onTrim={(start, length) => d.setReviewTrim(start, length)}
      onNormalize={(on) => d.setReviewNormalize(on)}
      onTrimSilence={(on) => d.setReviewTrimSilence(on)}
      onSlot={(step) => d.stepReviewSlot(step)}
      onPlay={() => c.playReview()}
      onStop={() => c.stopReview()}
      onRetake={done(() => d.retakeSample())}
      onKeep={done(() => d.keepSample())}
      onDiscard={done(() => d.discardSample())}
    />
  )
}

/** Live tools' CLAUDE (Kotlin ClaudeUi), its state read from the controller's signals as the section renders. */
function claudeUi(c: ArcController): ClaudeActions | null {
  const p = c.pattern
  if (!p.available) return null
  return {
    get scene() {
      return p.scene.value.label
    },
    get numbers() {
      return p.scene.value.groups.map((g) => g.number)
    },
    get hasNotes() {
      return p.ui.value.hasNotes
    },
    onShareScene: () => void c.shareBeat(null),
    onSharePattern: (g) => void c.shareBeat(g),
    onPaste: () => void c.pasteBeat(),
    onOpenFile: () => void c.openBeatFile(),
    learnUrl: learnUrl(),
  }
}

/** ARP / RPT and LATCH for Live (Kotlin LiveArp), its state read from the controller's signal as each part renders. */
function arpUi(c: ArcController): ArpActions | null {
  const p = c.pattern
  if (!p.available) return null
  return {
    get ui() {
      return p.arp.value
    },
    onOn: (on) => p.setArpOn(on),
    onLatch: (on) => p.setArpLatch(on),
  }
}

/** STEP's chip, panel and pads for Live (Kotlin LiveStep), its state read from the controller's signal as each part renders. */
function stepUi(c: ArcController): StepActions | null {
  const p = c.pattern
  if (!p.available) return null
  return {
    get ui() {
      return p.step.value
    },
    get pickedWord() {
      const n = p.step.value.picked
      return n === null ? null : stepWord(n, n.semitones === null ? c.mirrorName(n.pad) : null, c.settings.value.keysNames)
    },
    onOpen: () => {
      c.sample.exit()
      p.setStepOpen(true)
    },
    onClose: () => p.setStepOpen(false),
    onRecordDown: () => p.stepRecordDown(),
    onRecordUp: () => p.stepRecordUp(),
    onPlay: () => p.stepPlay(),
    onMinus: () => p.stepBy(-1),
    onPlus: () => p.stepBy(1),
    onJump: (step) => p.stepJump(step),
    onPage: (bar) => p.stepPageTo(bar),
    onVelocity: (v) => p.setStepVelocity(v),
    onGate: (t) => p.setStepGate(t),
    onKnobEnd: () => p.stepKnobEnd(),
    onNudge: (on) => p.setStepNudge(on),
    onCorrect: (on) => p.setStepCorrect(on),
    onPadPick: (pad) => c.stepPadPick(pad),
    onNotePick: (note) => c.stepNotePick(note),
    onGroup: (g) => p.setStepGroup(g),
  }
}

/** PATTERN's keys for Live's lines (Kotlin TransportUi), its state read from the controller's signal as each line renders. */
function transportUi(c: ArcController, openSheet: () => void): TransportUi | null {
  const p = c.pattern
  if (!p.available) return null
  return {
    get ui() {
      return p.ui.value
    },
    position: (ms) => p.position(ms),
    onRecordDown: (at) => p.recordDown(at),
    onRecordUp: (at) => p.recordUp(at),
    onPlay: (held) => p.play(held),
    onSheet: openSheet,
    onErase: (on) => p.setErase(on),
    onUndo: () => p.undo(),
  }
}

/** RECORD held: the pattern sheet 'pattern', on Live. */
/**
 * A beat card's sheet over Live, open while a card waits (pasted, or read from
 * PASTE BEAT) or PASTE BEAT waits for a paste; a layer of its own, so Back
 * closes it as CANCEL does.
 */
function LiveBeatSheet(props: { view: NavView }): JSX.Element | null {
  const c = useController()
  const nav = useNav()
  const p = c.pattern
  const beat = p.beat.value
  const pasting = c.beatPasting.value
  const shown = beat !== null || pasting
  const has = props.view.sheets.includes(BEAT_SHEET)
  // The layer opens with the card; the layer closed (Back) while the card waits is a CANCEL.
  const opened = useRef(false)
  useEffect(() => {
    if (shown && !has) {
      if (opened.current) {
        opened.current = false
        p.dismissBeat()
        c.cancelBeatPaste()
      } else {
        nav.open(sheetLayer(BEAT_SHEET))
      }
    } else if (!shown && has) {
      nav.close(sheetLayer(BEAT_SHEET))
    }
    if (has) opened.current = true
    if (!shown && !has) opened.current = false
  }, [shown, has])
  // Web delta (no ACTION_SEND): a paste anywhere on Live with an ARC BEAT line in it opens the card's
  // sheet; one into a text field, or without a card, is left alone.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      const t = e.target
      if (t instanceof HTMLElement && (t.isContentEditable || t.closest('input, textarea, select') !== null)) return
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (!BeatCards.hasCard(text)) return
      e.preventDefault()
      void c.receiveBeat(text)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [c])
  if (!p.available) return null
  return (
    <BeatImportSheet
      open={shown && has}
      ui={beat}
      pasting={pasting}
      onCancel={() => {
        p.dismissBeat()
        c.cancelBeatPaste()
      }}
      onImport={(setTempo) => p.importBeat(setTempo)}
      onCopyProblems={(problems) => void c.copyProblems(problems)}
      onPaste={(text) => void c.receiveBeat(text)}
    />
  )
}

function LivePatternSheet(props: { view: NavView }): JSX.Element | null {
  const c = useController()
  const nav = useNav()
  const p = c.pattern
  if (!p.available) return null
  return (
    <PatternSheet
      open={props.view.sheets.includes(PATTERN_SHEET)}
      ui={p.ui.value}
      onDismiss={() => nav.close(sheetLayer(PATTERN_SHEET))}
      actions={{
        onLength: (g, bars) => p.setLength(g, bars),
        onDouble: (g) => p.double(g),
        onTiming: (t) => p.setTiming(t),
        onCountIn: (on) => p.setCountIn(on),
        onAutoLength: (on) => p.setAutoLength(on),
        onUndo: () => p.undo(),
        onClear: (g) => p.clear(g),
        onErase: (on) => {
          p.setErase(on)
          // On, the sheet makes way for the pads.
          if (on) nav.close(sheetLayer(PATTERN_SHEET))
        },
      }}
    />
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
  return { pads: c.playingPads, notes: c.playingNotes, arpPads: c.arpPads, arpNotes: c.arpNotes }
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
          take={c.canRecord ? { state: c.rec.value, onTake: () => c.toggleTake() } : null}
          deviceView={deviceView.value}
          onDeviceView={(on) => setDeviceView(on)}
          onGuide={(query) => {
            guideSearch.value = { query }
            nav.openScreen({ kind: 'guide' })
          }}
          takes={{
            list: state.takes,
            playing: c.playing.value,
            keyOf: (t) => c.takeKey(t),
            fmtWhen: (ms) => c.fmtDateTime(ms),
            connected: state.device !== null,
            canShare: c.canShareTakes,
            canVoice: c.canShareVoice,
            onPlay: (t) => void c.playTake(t),
            onStop: () => c.stopPlayback(),
            onShare: (t) => void c.shareTake(t),
            onVoice: (t) => void c.shareTakeVoice(t),
            onSave: (t) => void c.saveTake(t),
            onToDevice: (t) => {
              void c.takeToDevice(t)
              nav.selectTab('device')
            },
            onDelete: (t) => void c.deleteTake(t),
          }}
          onGetFactory={c.canGetFactory && FactorySounds.inLibrary(state.backups, FactoryKit.EP133) === null ? () => void c.getFactorySounds() : null}
          factoryKit={
            FactorySounds.savedKits(state.backups).length >= 2
              ? { kit: c.factoryKit, kits: FactorySounds.savedKits(state.backups), onKit: (k) => c.setFactoryKit(k) }
              : null
          }
          offlinePads={state.offlinePads > 0 ? { count: state.offlinePads, onReset: () => void c.resetOfflinePads() } : null}
          onStop={() => c.stopPlayback()}
          nameOf={(pad) => c.mirrorName(pad)}
          oneGroup={settings.liveOneGroup || v.tour}
          onOneGroup={(on) => c.setLiveOneGroup(on)}
          follow={settings.liveFollow}
          onFollow={(on) => c.setLiveFollow(on)}
          toolsOpen={v.side}
          onTools={(open) => (open ? nav.open(overlayLayer('side')) : nav.close(overlayLayer('side')))}
          // The tools' first row: they close and Settings opens in their place.
          onSettings={() => nav.replace(overlayLayer('side'), screenLayer({ kind: 'settings' }))}
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
          onPadHear={(pad) => void c.hearPad(pad)}
          onPadKept={(pad) => void c.keepPad(pad)}
          onPadUp={(pad) => c.releasePad(pad)}
          onPadCut={(pad) => c.cutPad(pad)}
          onPadPressure={(pad, p) => c.padPressure(pad, p)}
          // Signals, read by each pad and key: a voice doesn't re-render this screen.
          playing={livePlaying(c)}
          haptics={settings.haptics}
          // Try arc shows the pads.
          keys={v.tour ? { ...liveKeys(c), on: false } : liveKeys(c)}
          inBar={props.inBar}
          onPianoRange={props.onPianoRange}
          keysViewWide={settings.keysViewWide}
          keysViewTall={settings.keysViewTall}
          edit={{
            on: props.editPads,
            connected: state.device !== null,
            offline: state.device === null ? (state.mirror?.offlineSounds ?? null) : null,
            onChange: props.onEditPads,
            onPad: (pad) => {
              if (c.editTarget(pad) !== null) nav.open(sheetLayer(`${EDIT_PREFIX}${pad.group}:${pad.offset}`))
            },
            onDropSlot: (pad, slot, source) => void c.assignPad(pad, slot, source),
            onDropFile: (pad, file) => void c.uploadForPad(pad, [file]),
            sounds: c.liveSounds(),
            playing: c.playing.value,
            onPlay: (slot, source) => void c.playLiveSound(slot, source),
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
            onNotePressure: (n, p) => c.notePressure(n, p),
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
function ToastLayer(props: { raise: number | null; top?: boolean; children: ComponentChildren }): JSX.Element {
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
    <div ref={ref} class={`toast-layer${props.top ? ' toast-layer--top' : ''}`} popover="manual">
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
