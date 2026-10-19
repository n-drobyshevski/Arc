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
// Try arc (the first-run tour) runs here, as in Root on Android: the
// first-run decision ([useTourFirstRun]: the tour for a new install, else the
// "?" guide once), the run on screen ([useTourRun]: the session, the snapshot
// of the app it reads, the ticks it keeps in settings) and its overlay, the
// guide overlay in tour mode with the step card (ui/components/Tour.tsx).
// While the tour shows, Live is on one group with the pads (not the keys) and
// the toast sits at the top.
import { Component, type ComponentChildren, type JSX } from 'preact'
import { useEffect, useId, useRef, useState } from 'preact/hooks'
import { FirstRun, Tour, TourStep, type TourProgress, type TourSession, type TourSnapshot } from './core/features/tour'
import { padKey } from './core/features/padNotes'
import { TourText } from './core/text/tourText'
import { MirrorText } from './core/text/mirrorText'
import { SettingsText } from './core/text/settingsText'
import { Strings } from './core/text/strings'
import { WebText } from './core/text/webText'
import { attachDrop, isPakName } from './platform/files/pick'
import type { ArcController } from './state/controller'
import { emptyMirrorState, type MirrorUi, type TaskUi, type UiState } from './state/types'
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
  sheetLayer,
  type NavView,
} from './ui/nav'
import { CoachHost, tourCardLow, useCoachFirstRun } from './ui/components/Coach'
import { TourCard, tourMode, type TourActions } from './ui/components/Tour'
import { Key } from './ui/components/Key'
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
import { MirrorScreen } from './ui/screens/MirrorScreen'
import { PICK_PREFIX as PICK, keysPickerOf } from './ui/live/keys'
import { SearchScreen } from './ui/screens/SearchScreen'
import { SettingsScreen } from './ui/screens/SettingsScreen'
import { BackupPadsSheet, DevicePadsSheet } from './ui/sheets/PadsSheet'
import { FontLicenceSheet } from './ui/sheets/FontLicenceSheet'
import { DeviceUploadSheet } from './ui/sheets/UploadSheet'
import './app.css'

/** The progress sheet's layer id. */
const PROGRESS = 'progress'

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

  // The guide overlay is saved as seen when it closes; Try arc (or the guide) opens
  // by itself on the first start (useTourFirstRun).
  useCoachFirstRun(c.coach, v.coach)
  useTourFirstRun(state.libraryChecked)
  const tour = useTourRun()

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
        onNoteNames={(n) => c.setKeysNames(n)}
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
      <CoachHost
        visible={v.coach || tour.shown}
        onDismiss={() => (v.coach ? nav.close(overlayLayer('coach')) : nav.back())}
        mode={!v.coach && tour.step !== null ? tourMode(tour.step) : undefined}
        card={!v.coach && tour.step !== null ? tour.card : undefined}
        label={!v.coach && tour.step !== null ? TourText.TITLE : undefined}
        describedBy={!v.coach && tour.step !== null ? tour.headingId : undefined}
      >
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
          guideOpen={v.guide}
          onGuide={(open) => (open ? nav.openScreen({ kind: 'guide' }) : nav.close(screenLayer({ kind: 'guide' })))}
          guide={<GuideScreen onBack={() => nav.close(screenLayer({ kind: 'guide' }))} />}
        >
          <TabScreen view={v} />
        </Shell>
      </CoachHost>
    )
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
  return (
    <div class="app">
      <div class="app__screen" data-view={view}>{page}</div>
      {/* The Device tab's sheets: pads 'pads:device:<n>', upload / trim from state.browser.draft. */}
      {tabs && v.tab === 'device' && <><DevicePadsSheet view={v} /><DeviceUploadSheet view={v} /></>}
      {/* The Backups tab's sheets: detail 'detail:<id>', compare picker 'comparePick:<id>',
          restore 'restore:<id>', the delete dialog 'delete'. */}
      {tabs && v.tab === 'backups' && <BackupsSheets view={v} />}
      <ProgressSlot task={progressShown ? state.task : null} onCancel={() => c.cancelTask()} />
      <ToastLayer raise={state.toast?.id ?? null} top={tour.shown && tourCardLow.value}>
        <ControllerToast controller={c} />
        <UpdatePrompt />
      </ToastLayer>
    </div>
  )
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

/** What the tour reads of the app now (MainActivity's snapshot). */
export function tourSnapshot(state: UiState, heard: boolean, demo: boolean, nameOf: (pad: { group: number; offset: number }) => string | null): TourSnapshot {
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

  const snap = tourSnapshot(state, heard, c.demo, (pad) => c.mirrorName(pad))
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

/** The section under the top bar (Root's `when (tab)`). */
function TabScreen(props: { view: NavView }): JSX.Element {
  const c = useController()
  const nav = useNav()
  const v = props.view
  const state = c.state.value
  const settings = c.settings.value
  switch (v.tab) {
    case 'live': {
      const mirror: MirrorUi | null = state.mirror ?? (state.device === null
        ? { state: emptyMirrorState(c.padOrder()), loading: false, error: MirrorText.NOT_CONNECTED }
        : null)
      return (
        <MirrorScreen
          mirror={mirror}
          nameOf={(pad) => c.mirrorName(pad)}
          onPadOrder={(o) => c.setPadOrder(o)}
          oneGroup={settings.liveOneGroup || v.tour}
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
          onPad={(pad, hold) => void c.playPad(pad, hold)}
          onPadUp={(pad) => c.releasePad(pad)}
          playingPads={c.playingPads.value}
          keys={{
            // Try arc shows the pads.
            on: settings.liveKeys && !v.tour,
            root: settings.keysRoot,
            scale: settings.keysScale,
            octave: settings.keysOctave,
            names: settings.keysNames,
            pad: state.keysPad,
            padName: state.keysPad ? c.mirrorName(state.keysPad) : null,
            playingKeys: c.playingKeys.value,
          }}
          keysActions={{
            onMode: (on) => c.setLiveKeys(on),
            onRoot: (r) => c.setKeysRoot(r),
            onScale: (s) => c.setKeysScale(s),
            onOctave: (o) => c.setKeysOctave(o),
            onKey: (k, hold) => void c.playKey(k, hold),
            onKeyUp: (k) => c.releaseKey(k),
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
