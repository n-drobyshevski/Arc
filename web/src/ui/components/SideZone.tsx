// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/SideZone.kt
//
// A side zone after the pocket operator app's "more tools": a thin hatched
// strip along the right edge that opens a panel of secondary controls, so the
// page itself needs no buttons for them. It opens on a tap. The panel closes
// on Back (the 'side' navigation layer: the caller's onClose), on Escape, on a
// tap outside it, or with its close key.
//
// Like the Android panel it covers only the zone: what is outside the zone
// (the top bar) stays usable, so the panel is a non-modal dialog.
//
// Web only, the desktop layout: [docked] (the page passes useDesk()) shows the
// panel for good as a paper column on the zone's right, a complementary
// region under the title's name, with no strip, scrim, slide or close key
// (and no side.more mark, as there is no strip to point at). An open overlay
// left from a narrower window is closed then, so Back has nothing hidden to undo.
import type { ComponentChildren, JSX } from 'preact'
import { useEffect, useId, useRef, useState } from 'preact/hooks'
import { CoachText } from '../../core/text/coachText'
import { CLOSE as GUIDE_CLOSE } from '../../core/text/guideText'
import { Caption } from './Caption'
import { COACH_MARKS, useCoachMark } from './Coach'
import { CloseKey } from './GuideKeys'
import './SideZone.css'

/** How much of the screen's right edge the strip takes (its touch area). */
export const SIDE_STRIP_WIDTH = 24

/** slideInHorizontally / slideOutHorizontally: Compose's default spring settles in about this long. */
export const SIDE_SLIDE_MS = 300

export interface SideZoneProps {
  open: boolean
  onOpen: () => void
  onClose: () => void
  /** The panel's caption, and the strip's name for screen readers. */
  title: string
  /** The panel's controls, stacked 10px apart under the caption. */
  panel: ComponentChildren
  /** The page under the strip. It fills the zone and scrolls inside it. */
  children?: ComponentChildren
  class?: string
  /** Web only (the desk): the panel always shown as a column beside the page, no strip. */
  docked?: boolean
}

export function SideZone(props: SideZoneProps): JSX.Element {
  const { open, title, docked = false } = props
  const panelId = useId()
  const titleId = useId()
  const more = COACH_MARKS['side.more']
  const coachRef = useCoachMark('side.more', CoachText.MORE_TOOLS, more.face, more.ink)
  const strip = useRef<HTMLButtonElement | null>(null)
  const stripRef = (el: HTMLButtonElement | null): void => {
    strip.current = el
    coachRef(el)
  }
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(open)
  const last = useRef<ComponentChildren>(null)
  if (open) last.current = props.panel
  const panel = useRef<HTMLDivElement | null>(null)
  const closeKey = useRef<HTMLButtonElement | null>(null)

  // AnimatedVisibility: mounted while open or sliding out.
  useEffect(() => {
    if (open) {
      setMounted(true)
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(raf)
    }
    setShown(false)
    const t = window.setTimeout(() => setMounted(false), SIDE_SLIDE_MS)
    return () => window.clearTimeout(t)
  }, [open])

  // Docked, the overlay means nothing: a layer left open closes.
  useEffect(() => {
    if (docked && open) props.onClose()
  }, [docked, open])

  // Focus moves into the panel when it opens and back to the strip when it closes.
  useEffect(() => {
    if (!open || !mounted || docked) return
    closeKey.current?.focus({ preventScroll: true })
    return () => {
      const inside = panel.current?.contains(document.activeElement) ?? false
      if (inside || document.activeElement === document.body) strip.current?.focus({ preventScroll: true })
    }
  }, [open, mounted])

  // Escape closes it wherever focus is (Android's Back does), except inside
  // another dialog (the guide overlay, a sheet), which handles its own.
  const close = useRef(props.onClose)
  close.current = props.onClose
  useEffect(() => {
    if (!open || docked) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const t = e.target instanceof Element ? e.target : null
      const dialog = t?.closest('[role="dialog"], [role="alertdialog"], dialog') ?? null
      if (dialog && dialog !== panel.current) return
      e.preventDefault()
      close.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, docked])

  if (docked) {
    return (
      <div class={`side-zone side-zone--docked${props.class ? ` ${props.class}` : ''}`}>
        <div class="side-zone__content">{props.children}</div>
        <aside class="side-zone__dock desk-paper" aria-label={title}>
          {props.panel}
        </aside>
      </div>
    )
  }

  return (
    <div class={`side-zone${props.class ? ` ${props.class}` : ''}`}>
      <div class="side-zone__content" inert={open || undefined}>
        {props.children}
      </div>
      {/* The strip: hatched like the PO's side panels, with a small arrow pointing in. */}
      <button
        ref={stripRef}
        type="button"
        class="side-zone__strip"
        aria-label={title}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={mounted ? panelId : undefined}
        onClick={() => props.onOpen()}
      >
        <span class="side-zone__hatch hatch-7" aria-hidden="true" />
        <svg class="side-zone__arrow" width="8" height="12" viewBox="0 0 8 12" aria-hidden="true">
          <path d="M8 0L0 6L8 12Z" />
        </svg>
      </button>
      {mounted && (
        <>
          <div class={`side-zone__scrim${shown && open ? ' is-shown' : ''}`} aria-hidden="true" onClick={() => props.onClose()} />
          <div
            ref={panel}
            id={panelId}
            class={`side-zone__panel${shown && open ? ' is-shown' : ''}`}
            role="dialog"
            aria-labelledby={titleId}
            aria-hidden={open ? undefined : 'true'}
            inert={!open || undefined}
          >
            <div class="side-zone__head">
              <Caption text={title} align="start" as="h2" id={titleId} class="side-zone__title" />
              <CloseKey ref={closeKey} description={GUIDE_CLOSE} onClick={() => props.onClose()} />
            </div>
            {open ? props.panel : last.current}
          </div>
        </>
      )}
    </div>
  )
}
