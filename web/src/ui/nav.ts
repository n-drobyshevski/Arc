// Port of the navigation state of app/src/main/kotlin/dev/arc/ep133/MainActivity.kt (Root(): the
// rememberSaveable flags debug / settingsOpen / search / contentsId / compareIds / guideOpen / tab /
// coach, selectTab, every BackHandler) and of ArcSheet's BackHandler (ui/components/Components.kt).
//
// Web model: the app's navigation is a stack of layers, one browser history
// entry per layer, and every entry carries the whole stack in history.state
// (so a reload restores it, as rememberSaveable does):
//
//   [ {tab backups} , {tab live}? , screens / overlays ... ]
//
// - Layer 0 is always the Backups tab. Another tab is one layer on top of it,
//   so Back from a non-Backups tab lands on Backups (Root's
//   BackHandler(tab != BACKUPS) { selectTab(BACKUPS) }).
// - Full screens (settings, debug, search, guide, contents, compare) are
//   layers with their own hash route; the render priority stays Root's
//   if-chain (see [viewOf] and app.tsx), whatever order they were opened in.
// - Overlays (sheets, dialogs, the section menu, the Live side panel, the
//   guide overlay) are layers that keep the hash of the layer below.
// - Back (popstate) removes one layer, chosen in Android's order ([backStack]):
//   dialog, side panel, menu, guide overlay, sheet, full screen, tab.
//
// The pure functions are tested in test/ui/nav.test.ts; [Nav] binds them to
// window.history (an injected [NavEnv], so it is tested with a fake too).

import { computed, signal, type ReadonlySignal } from '@preact/signals'
import type { Tab } from '../state/types'

export const TABS: readonly Tab[] = ['backups', 'live', 'device']

/** The full screens (Root's exclusive if-chain, plus the guide that slides in over the shell). */
export type Screen =
  | { readonly kind: 'settings' }
  | { readonly kind: 'debug' }
  | { readonly kind: 'search' }
  | { readonly kind: 'guide' }
  | { readonly kind: 'contents'; readonly id: string }
  | { readonly kind: 'compare'; readonly a: string; readonly b: string }

/**
 * The overlay layers. [id] says which one, for sheets and dialogs:
 * 'detail:<backupId>', 'restore:<backupId>', 'comparePick:<backupId>',
 * 'pads:backup:<id>:<n>', 'pads:device:<n>', 'upload', 'trim:<i>', 'licence', 'progress' (app.tsx keeps it in step with state.task);
 * dialogs: 'delete', 'prune:<keep>', 'forget'.
 */
export type OverlayKind = 'dialog' | 'side' | 'menu' | 'coach' | 'sheet'

export type Layer =
  | { readonly kind: 'tab'; readonly tab: Tab }
  | { readonly kind: 'screen'; readonly screen: Screen }
  | { readonly kind: 'overlay'; readonly overlay: OverlayKind; readonly id?: string }

export type Stack = readonly Layer[]

const BASE: Layer = Object.freeze({ kind: 'tab', tab: 'backups' }) as Layer

// ---------- layer helpers ----------

export const tabLayer = (tab: Tab): Layer => ({ kind: 'tab', tab })
export const screenLayer = (screen: Screen): Layer => ({ kind: 'screen', screen })
export const overlayLayer = (overlay: OverlayKind, id?: string): Layer =>
  id === undefined ? { kind: 'overlay', overlay } : { kind: 'overlay', overlay, id }
export const sheetLayer = (id: string): Layer => overlayLayer('sheet', id)
export const dialogLayer = (id: string): Layer => overlayLayer('dialog', id)

/** A string that identifies a layer (equal layers, equal keys). */
export function layerKey(l: Layer): string {
  switch (l.kind) {
    case 'tab':
      return `tab:${l.tab}`
    case 'screen':
      return `screen:${screenHash(l.screen)}`
    case 'overlay':
      return l.id === undefined ? `overlay:${l.overlay}` : `overlay:${l.overlay}:${l.id}`
  }
}

export const sameLayer = (a: Layer, b: Layer): boolean => layerKey(a) === layerKey(b)

export function sameStack(a: Stack, b: Stack): boolean {
  return a.length === b.length && a.every((l, i) => sameLayer(l, b[i] as Layer))
}

/** How many layers from the bottom two stacks share. */
export function commonPrefix(a: Stack, b: Stack): number {
  let i = 0
  while (i < a.length && i < b.length && sameLayer(a[i] as Layer, b[i] as Layer)) i++
  return i
}

// ---------- routes (hash) ----------

function screenHash(s: Screen): string {
  switch (s.kind) {
    case 'contents':
      return `#/contents/${encodeURIComponent(s.id)}`
    case 'compare':
      return `#/compare/${encodeURIComponent(s.a)}/${encodeURIComponent(s.b)}`
    default:
      return `#/${s.kind}`
  }
}

/** The route a hash names: a tab, a full screen, or null for anything else. */
export function parseHash(hash: string): Layer | null {
  const path = hash.replace(/^#?\/?/, '').replace(/\/+$/, '')
  const parts = path.split('/').map((p) => {
    try {
      return decodeURIComponent(p)
    } catch {
      return p
    }
  })
  const [head, a, b] = parts
  switch (head) {
    case 'backups':
    case 'live':
    case 'device':
      return parts.length === 1 ? tabLayer(head) : null
    case 'settings':
    case 'debug':
    case 'search':
    case 'guide':
      return parts.length === 1 ? screenLayer({ kind: head }) : null
    case 'contents':
      return parts.length === 2 && a ? screenLayer({ kind: 'contents', id: a }) : null
    case 'compare':
      return parts.length === 3 && a && b ? screenLayer({ kind: 'compare', a, b }) : null
    default:
      return null
  }
}

/** The hash of a stack: its topmost tab or screen (overlays keep the hash below them). */
export function hashOf(stack: Stack): string {
  for (let i = stack.length - 1; i >= 0; i--) {
    const l = stack[i] as Layer
    if (l.kind === 'tab') return `#/${l.tab}`
    if (l.kind === 'screen') return screenHash(l.screen)
  }
  return '#/backups'
}

/** The stack a fresh page load (or a typed-in hash) starts with: Backups, then the route. */
export function initialStack(hash: string): Stack {
  const route = parseHash(hash)
  if (!route || sameLayer(route, BASE)) return [BASE]
  return [BASE, route]
}

/** Puts the Backups tab at the bottom whatever came in (a damaged history.state). */
export function normalize(stack: Stack): Stack {
  const rest = stack.filter((l, i) => !(i === 0 && sameLayer(l, BASE)))
  return [BASE, ...rest]
}

/** Reads a stack back from history.state, or null when the entry is not ours. */
export function stackFromState(state: unknown): Stack | null {
  if (!state || typeof state !== 'object') return null
  const s = (state as { arc?: unknown; stack?: unknown })
  if (s.arc !== 1 || !Array.isArray(s.stack)) return null
  const out: Layer[] = []
  for (const raw of s.stack as unknown[]) {
    const l = validLayer(raw)
    if (!l) return null
    out.push(l)
  }
  return out.length > 0 ? normalize(out) : null
}

function validLayer(raw: unknown): Layer | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.kind === 'tab') return TABS.includes(r.tab as Tab) ? tabLayer(r.tab as Tab) : null
  if (r.kind === 'screen') {
    const s = r.screen as Record<string, unknown> | undefined
    if (!s || typeof s !== 'object') return null
    switch (s.kind) {
      case 'settings':
      case 'debug':
      case 'search':
      case 'guide':
        return screenLayer({ kind: s.kind })
      case 'contents':
        return typeof s.id === 'string' ? screenLayer({ kind: 'contents', id: s.id }) : null
      case 'compare':
        return typeof s.a === 'string' && typeof s.b === 'string' ? screenLayer({ kind: 'compare', a: s.a, b: s.b }) : null
      default:
        return null
    }
  }
  if (r.kind === 'overlay') {
    const kinds: readonly OverlayKind[] = ['dialog', 'side', 'menu', 'coach', 'sheet']
    if (!kinds.includes(r.overlay as OverlayKind)) return null
    if (r.id !== undefined && typeof r.id !== 'string') return null
    return overlayLayer(r.overlay as OverlayKind, r.id as string | undefined)
  }
  return null
}

/** What history.state holds for an entry. */
export function stateOf(stack: Stack): { arc: 1; stack: Layer[] } {
  // Plain copies: history.state is structured-cloned.
  return { arc: 1, stack: stack.map((l) => JSON.parse(JSON.stringify(l)) as Layer) }
}

// ---------- the view (Root's flags) ----------

/** Root's navigation flags, derived from the stack. */
export interface NavView {
  /** The section under the top bar (last tab layer). */
  readonly tab: Tab
  readonly debug: boolean
  readonly settings: boolean
  readonly search: boolean
  readonly guide: boolean
  /** contentsId */
  readonly contentsId: string | null
  /** compareIds, in the order they were picked (the screen orders them by date). */
  readonly compare: readonly [string, string] | null
  readonly menu: boolean
  readonly side: boolean
  readonly coach: boolean
  /** Open sheet ids, bottom first. */
  readonly sheets: readonly string[]
  /** Open dialog ids, bottom first. */
  readonly dialogs: readonly string[]
}

export function viewOf(stack: Stack): NavView {
  let tab: Tab = 'backups'
  let debug = false
  let settings = false
  let search = false
  let guide = false
  let contentsId: string | null = null
  let compare: [string, string] | null = null
  let menu = false
  let side = false
  let coach = false
  const sheets: string[] = []
  const dialogs: string[] = []
  for (const l of stack) {
    if (l.kind === 'tab') tab = l.tab
    else if (l.kind === 'screen') {
      const s = l.screen
      if (s.kind === 'debug') debug = true
      else if (s.kind === 'settings') settings = true
      else if (s.kind === 'search') search = true
      else if (s.kind === 'guide') guide = true
      else if (s.kind === 'contents') contentsId = s.id
      else compare = [s.a, s.b]
    } else if (l.overlay === 'menu') menu = true
    else if (l.overlay === 'side') side = true
    else if (l.overlay === 'coach') coach = true
    else if (l.overlay === 'sheet') sheets.push(l.id ?? '')
    else dialogs.push(l.id ?? '')
  }
  return { tab, debug, settings, search, guide, contentsId, compare, menu, side, coach, sheets, dialogs }
}

/** Root's `live`: the Live tab is in front (not under the debug, settings or guide screen). */
export function isLive(v: NavView): boolean {
  return v.tab === 'live' && !v.debug && !v.settings && !v.guide
}

/** Root's `onTabs`: no full screen of the if-chain is open (the guide slides over the shell, so it doesn't count). */
export function onTabs(v: NavView): boolean {
  return !v.debug && !v.settings && v.compare === null && v.contentsId === null && !v.search
}

/** Which branch of Root's if-chain renders. compare/contents fall through when their backups are unknown. */
export type RootView = 'debug' | 'settings' | 'compare' | 'contents' | 'search' | 'shell'

export function rootView(v: NavView, hasBackup: (id: string) => boolean): RootView {
  if (v.debug) return 'debug'
  if (v.settings) return 'settings'
  if (v.compare && hasBackup(v.compare[0]) && hasBackup(v.compare[1])) return 'compare'
  if (v.contentsId !== null && hasBackup(v.contentsId)) return 'contents'
  if (v.search) return 'search'
  return 'shell'
}

// ---------- transitions (pure) ----------

/** selectTab: the section switch from the menu; closes everything above the shell. */
export function selectTab(_stack: Stack, t: Tab): Stack {
  return t === 'backups' ? [BASE] : [BASE, tabLayer(t)]
}

export function push(stack: Stack, layer: Layer): Stack {
  const top = stack[stack.length - 1]
  if (top && sameLayer(top, layer)) return stack
  return [...stack, layer]
}

/** Removes the topmost layer that matches (and only it); the stack is unchanged when none does. */
export function remove(stack: Stack, match: (l: Layer) => boolean): Stack {
  for (let i = stack.length - 1; i >= 1; i--) {
    if (match(stack[i] as Layer)) return [...stack.slice(0, i), ...stack.slice(i + 1)]
  }
  return stack
}

/** Removes the topmost copy of [layer]. */
export function close(stack: Stack, layer: Layer): Stack {
  const key = layerKey(layer)
  return remove(stack, (l) => layerKey(l) === key)
}

/** The order Back closes things in (Android: dialog window, side panel, menu, overlay, sheet, screen, tab). */
const BACK_ORDER: readonly ((l: Layer) => boolean)[] = [
  (l) => l.kind === 'overlay' && l.overlay === 'dialog',
  (l) => l.kind === 'overlay' && l.overlay === 'side',
  (l) => l.kind === 'overlay' && l.overlay === 'menu',
  (l) => l.kind === 'overlay' && l.overlay === 'coach',
  (l) => l.kind === 'overlay' && l.overlay === 'sheet',
  (l) => l.kind === 'screen',
  (l) => l.kind === 'tab',
]

/**
 * What Back leaves: the stack without the layer Android would close first.
 * Null when nothing is left to close (Back leaves the app).
 */
export function backStack(stack: Stack): Stack | null {
  for (const match of BACK_ORDER) {
    const next = remove(stack, match)
    if (next !== stack) return next
  }
  return null
}

// ---------- the browser binding ----------

/** The parts of window.history / location / window that [Nav] uses. */
export interface NavEnv {
  readonly history: {
    readonly state: unknown
    pushState(data: unknown, unused: string, url?: string): void
    replaceState(data: unknown, unused: string, url?: string): void
    go(delta: number): void
  }
  readonly location: { readonly hash: string }
  addEventListener(type: 'popstate', fn: (e: { state: unknown }) => void): void
  removeEventListener(type: 'popstate', fn: (e: { state: unknown }) => void): void
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(h: unknown): void
}

export type NavListener = (prev: Stack, next: Stack) => void

/** How long to wait for the popstate after history.go before carrying on anyway. */
const TRAVEL_TIMEOUT_MS = 1000

/**
 * The navigation stack bound to the browser history. [stack] changes at once
 * on every call (the UI never waits); the history entries follow in order.
 */
export class Nav {
  private readonly stackSignal = signal<Stack>([BASE])
  readonly stack: ReadonlySignal<Stack> = this.stackSignal
  readonly view: ReadonlySignal<NavView> = computed(() => viewOf(this.stackSignal.value))
  /** The stack the browser's current entry holds (lags [stack] while history work is queued). */
  private applied: Stack = [BASE]
  private queue: Promise<void> = Promise.resolve()
  private travelling: (() => void) | null = null
  private listeners = new Set<NavListener>()
  private started = false
  private backGuard: () => boolean = () => false

  constructor(private readonly env: NavEnv) {}

  /** Reads the current entry (restoring the stack after a reload) and starts following Back. */
  start(): void {
    if (this.started) return
    this.started = true
    const h = this.env.history
    const saved = stackFromState(h.state)
    if (saved) {
      this.applied = saved
      if (this.env.location.hash !== hashOf(saved)) h.replaceState(stateOf(saved), '', hashOf(saved))
      this.set(saved)
    } else {
      // A fresh load: Backups underneath, so Back from any route lands there first.
      const target = initialStack(this.env.location.hash)
      h.replaceState(stateOf([BASE]), '', hashOf([BASE]))
      this.applied = [BASE]
      for (let i = 1; i < target.length; i++) {
        const s = target.slice(0, i + 1)
        h.pushState(stateOf(s), '', hashOf(s))
      }
      this.applied = target
      this.set(target)
    }
    this.env.addEventListener('popstate', this.onPop)
  }

  dispose(): void {
    this.env.removeEventListener('popstate', this.onPop)
    this.listeners.clear()
  }

  /** Called with the old and new stack on every change, after [stack] has changed. */
  subscribe(fn: NavListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** While it answers true, Back does nothing (the modal progress sheet: ArcSheet(onDismiss = null)). */
  setBackGuard(fn: () => boolean): void {
    this.backGuard = fn
  }

  get current(): NavView {
    return this.view.peek()
  }

  // ---- the moves ----

  selectTab(t: Tab): void {
    this.go(selectTab(this.stackSignal.peek(), t))
  }

  open(layer: Layer): void {
    this.go(push(this.stackSignal.peek(), layer))
  }

  openScreen(screen: Screen): void {
    this.open(screenLayer(screen))
  }

  close(layer: Layer): void {
    this.go(close(this.stackSignal.peek(), layer))
  }

  /** Removes [from] and opens [to] in its place in one move (Detail → Contents; Detail → Restore). */
  replace(from: Layer, to: Layer): void {
    this.go(push(close(this.stackSignal.peek(), from), to))
  }

  /** The app's own Back (a Done or close key): closes what the system Back would. */
  back(): void {
    const next = backStack(this.stackSignal.peek())
    if (next) this.go(next)
  }

  /** Moves to [target]: the stack changes now, the history follows (popping what is gone, pushing what is new). */
  go(target: Stack): void {
    const next = normalize(target)
    if (sameStack(next, this.stackSignal.peek())) return
    this.set(next)
    this.enqueue(() => this.applyHistory(next))
  }

  /** Resolves when the queued history work is done (tests, and before reading location). */
  settled(): Promise<void> {
    return this.queue
  }

  // ---- internals ----

  private set(next: Stack): void {
    const prev = this.stackSignal.peek()
    if (sameStack(prev, next)) return
    this.stackSignal.value = next
    for (const fn of [...this.listeners]) fn(prev, next)
  }

  private enqueue(work: () => Promise<void>): void {
    this.queue = this.queue.then(work).catch(() => undefined)
  }

  private async applyHistory(queued: Stack): Promise<void> {
    const h = this.env.history
    // The latest stack wins: a Back that arrived while this work was queued
    // (or a later move) makes the queued target stale.
    const latest = this.stackSignal.peek()
    const target = sameStack(latest, queued) ? queued : latest
    const from = this.applied
    if (sameStack(from, target)) return
    const p = Math.max(1, commonPrefix(from, target))
    const n = from.length - p
    const m = target.length - p
    if (n === 0) {
      for (let i = p; i < target.length; i++) {
        const s = target.slice(0, i + 1)
        h.pushState(stateOf(s), '', hashOf(s))
      }
    } else {
      // Back to the entry at index p (the first one that differs), then rewrite from there.
      if (n > 1) await this.travel(-(n - 1))
      if (m === 0) {
        await this.travel(-1)
      } else {
        const first = target.slice(0, p + 1)
        h.replaceState(stateOf(first), '', hashOf(first))
        for (let i = p + 1; i < target.length; i++) {
          const s = target.slice(0, i + 1)
          h.pushState(stateOf(s), '', hashOf(s))
        }
      }
    }
    this.applied = target
  }

  /** history.go(delta), resolved by its popstate (or a timeout, should none come). */
  private travel(delta: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = this.env.setTimeout(() => {
        this.travelling = null
        resolve()
      }, TRAVEL_TIMEOUT_MS)
      this.travelling = () => {
        this.env.clearTimeout(timer)
        this.travelling = null
        resolve()
      }
      this.env.history.go(delta)
    })
  }

  private readonly onPop = (e: { state: unknown }): void => {
    if (this.travelling) {
      // Our own history.go: the stack already shows where we are going.
      this.travelling()
      return
    }
    const h = this.env.history
    const old = this.applied
    const arrived = stackFromState(e.state)
    if (!arrived) {
      // A hash typed into the address bar (or a link): start a stack for it.
      const target = initialStack(this.env.location.hash)
      h.replaceState(stateOf(target), '', hashOf(target))
      this.applied = target
      this.set(target)
      return
    }
    const isBack = arrived.length === old.length - 1 && commonPrefix(arrived, old) === arrived.length
    if (isBack && this.backGuard()) {
      // Modal: put the entry back and stay.
      h.pushState(stateOf(old), '', hashOf(old))
      return
    }
    let next = arrived
    if (isBack) {
      // Close what Android would close first, which is not always the top entry.
      const wanted = backStack(old)
      if (wanted && !sameStack(wanted, arrived)) {
        next = wanted
        h.replaceState(stateOf(next), '', hashOf(next))
      }
    }
    this.applied = next
    // A Back while our own history work is queued: the queued moves are stale
    // now, and applyHistory follows the stack set here instead.
    this.set(next)
  }
}

/** The controller's view hooks (state/README: required wiring). */
export interface ViewHooks {
  tabChanged(prev: Tab, next: Tab): void
  setLive(live: boolean): void
  /** The contents screen went away (its Done key or Back): ContentsScreen's onBack. */
  closeContents?(): void
  /** The compare screen went away: CompareScreen's onBack. */
  closeCompare?(): void
}

/**
 * Wires the stack to the controller: every tab switch calls tabChanged (selectTab's
 * side effects), setLive follows Root's `live`, and a contents or compare screen
 * leaving the stack (by its Done key or the browser Back alike) runs its onBack's
 * controller call. A page loaded on another tab counts as a switch from Backups
 * (Android always starts there). Returns the unsubscribe.
 */
export function bindViewHooks(nav: Nav, hooks: ViewHooks): () => void {
  const start = nav.current
  if (start.tab !== 'backups') hooks.tabChanged('backups', start.tab)
  hooks.setLive(isLive(start))
  return nav.subscribe((prev, next) => {
    const a = viewOf(prev)
    const b = viewOf(next)
    if (a.tab !== b.tab) hooks.tabChanged(a.tab, b.tab)
    if (isLive(a) !== isLive(b)) hooks.setLive(isLive(b))
    if (a.contentsId !== null && b.contentsId !== a.contentsId) hooks.closeContents?.()
    if (a.compare !== null && (b.compare === null || b.compare[0] !== a.compare[0] || b.compare[1] !== a.compare[1])) {
      hooks.closeCompare?.()
    }
  })
}

/** The browser's NavEnv. */
export function browserNavEnv(): NavEnv {
  return {
    history: window.history,
    location: window.location,
    addEventListener: (type, fn) => window.addEventListener(type, fn),
    removeEventListener: (type, fn) => window.removeEventListener(type, fn),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (h) => window.clearTimeout(h as number),
  }
}
