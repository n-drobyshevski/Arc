// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Chrome.kt (ArcFrame, ArcShell)
//
// The page under the top bar: TopBar, then the section's page with the GUIDE
// tab on the left edge (centred, 80px up) and the section list over it (under
// the top bar, so the tag stays in view). The guide slides in from the left
// over everything. The page box has a fixed height; [children] scroll inside
// .shell__page (screens that fill it, like Live's one-group view, use height: 100%).
//
// Web only, on the desk ([desk], from 1024px wide; app.tsx puts the shell in
// the page column right of the nav rail): no GUIDE edge tab (the rail's Guide
// key opens the guide, and gets the focus back), the guide is a panel docked
// on the left of the page column instead of covering it, and the top bar's row
// widens to 1200 (Shell.css, TopBar.css). The shell's own --shell page goes
// transparent, so the desk shows through.
import type { ComponentChildren, JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import type { Tab } from '../../state/types'
import { GuideEdgeTab } from './GuideEdgeTab'
import { SectionMenu } from './SectionMenu'
import { TopBar } from './TopBar'
import './Shell.css'

export interface ShellProps {
  tab: Tab
  onTab: (t: Tab) => void
  /** The section list (a navigation layer, so Back closes it). */
  menuOpen: boolean
  onMenu: (open: boolean) => void
  connected: boolean
  canConnect: boolean
  canBackup: boolean
  onBackup: () => void
  onConnect: () => void
  onDebug: () => void
  onSettings: () => void
  onHelp: () => void
  guideOpen: boolean
  onGuide: (open: boolean) => void
  /** The guide screen, slid in while [guideOpen]. */
  guide: ComponentChildren
  children?: ComponentChildren
  /** The desktop layout (ui/useDesk.ts): the nav rail's Guide key opens the guide, not the edge tab. */
  desk?: boolean
}

/** slideInHorizontally / slideOutHorizontally: Compose's default spring settles in about this long. */
const GUIDE_SLIDE_MS = 300
const MENU_ID = 'arc-section-menu'

export function Shell(props: ShellProps): JSX.Element {
  const { tab, menuOpen, guideOpen } = props
  const root = useRef<HTMLDivElement | null>(null)
  // Focus goes back to what opened a layer once it closes (the list's items
  // hide and the guide unmounts, which would drop focus onto <body>).
  useReturnFocus(root, menuOpen, '.section-tag', '.section-menu')
  useReturnFocus(root, guideOpen, props.desk ? '.nav-rail__guide' : '.guide-edge-tab', '.shell__guide')
  return (
    <div class="shell" ref={root}>
      <div class="shell__top" inert={guideOpen || undefined}>
        <TopBar
          section={tab}
          onSections={() => props.onMenu(!menuOpen)}
          sectionsOpen={menuOpen}
          sectionsId={MENU_ID}
          connected={props.connected}
          canConnect={props.canConnect}
          canBackup={props.canBackup}
          onBackup={props.onBackup}
          onConnect={props.onConnect}
          onDebug={props.onDebug}
          onSettings={props.onSettings}
          onHelp={props.onHelp}
        />
      </div>
      <div class="shell__body" inert={guideOpen || undefined}>
        <main class="shell__page" id="arc-page" inert={menuOpen || undefined}>
          {props.children}
        </main>
        <GuideEdgeTab class="shell__edge-tab" inert={menuOpen} onClick={() => props.onGuide(true)} />
        <SectionMenu
          id={MENU_ID}
          open={menuOpen}
          current={tab}
          onPick={(t) => props.onTab(t)}
          onDismiss={() => props.onMenu(false)}
        />
      </div>
      <GuideSlide open={guideOpen}>{props.guide}</GuideSlide>
    </div>
  )
}

/**
 * When [open] turns false and focus was inside [inside] (or already dropped to
 * <body>), focuses [opener]. Both are selectors; [inside] under [root], [opener]
 * under [root] or, failing that, anywhere in the document (the desk's rail is outside the shell).
 */
function useReturnFocus(root: { current: HTMLElement | null }, open: boolean, opener: string, inside: string): void {
  const was = useRef(open)
  useEffect(() => {
    const closed = was.current && !open
    was.current = open
    if (!closed || typeof document === 'undefined') return
    const active = document.activeElement
    const lost = active === null || active === document.body || (active instanceof Element && active.closest(inside) !== null)
    if (!lost) return
    const el = root.current?.querySelector<HTMLElement>(opener) ?? document.querySelector<HTMLElement>(opener)
    el?.focus({ preventScroll: true })
  }, [open])
}

/** AnimatedVisibility(guideOpen, slideIn { -it }, slideOut { -it }): mounted while open or sliding out. */
function GuideSlide(props: { open: boolean; children: ComponentChildren }): JSX.Element | null {
  const [mounted, setMounted] = useState(props.open)
  const [shown, setShown] = useState(props.open)
  const last = useRef<ComponentChildren>(null)
  if (props.open) last.current = props.children
  useEffect(() => {
    if (props.open) {
      setMounted(true)
      // Next frame, so the transform transitions from off-screen.
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(raf)
    }
    setShown(false)
    const t = window.setTimeout(() => setMounted(false), GUIDE_SLIDE_MS)
    return () => window.clearTimeout(t)
  }, [props.open])
  if (!mounted) return null
  return (
    <div class={`shell__guide${shown ? ' is-shown' : ''}`} aria-hidden={props.open ? undefined : 'true'}>
      {props.open ? props.children : last.current}
    </div>
  )
}
