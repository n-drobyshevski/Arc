// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Chrome.kt (TopBar)
//
// The section tag, then icon keys as in the pocket operator app's top row: on
// Live, while the sound plays late, an amber key with a Bluetooth glyph and a
// clock (a tap says why, in the toast); the connection key, green with a dot
// while the EP-133 is connected (a tap says "Hold to disconnect"; holding it
// for a second, with the ring filling, disconnects) and navy with a ring when
// not (a tap connects); then the guide overlay (?). Their names show on
// long-press, in the overlay and to screen readers. Back up lives on the
// Backups screen, and Settings in Live's tools and the section list under the
// tag (SectionMenu). Long-pressing the tag opens the debug screen (as the
// wordmark did).
//
// Web deltas: the Bluetooth key shows when Live's output delay is long enough
// to be heard (LiveAudio.late), as the web can't tell Bluetooth from any other
// slow output, and it never makes up for it, so its sentence is always
// MirrorText.WIRELESS_DELAY (never wirelessMadeUp). Screen readers, for whom a
// hold is no gesture, hear the hint as the connected key's description and find
// a Disconnect button of its own beside it (visually hidden, out of the tab
// order: the keyboard holds Enter or Space).
//
// Web only, on the desk (from 1024px wide, [themeSwitch] set by Shell): the
// theme switch (ThemeSwitch.tsx: System / Light / Dark) after the ? key; the
// nav rail's Settings key opens Settings there. Live's mic key (SAMPLE) isn't
// ported.
import type { ComponentChildren, JSX } from 'preact'
import type { ReadonlySignal } from '@preact/signals'
import { CoachText } from '../../core/text/coachText'
import { NavText } from '../../core/text/navText'
import { MirrorText } from '../../core/text/mirrorText'
import type { Tab } from '../../state/types'
import { ArcIcon } from './Icons'
import { IconBlock } from './IconBlock'
import { SectionTag } from './SectionTag'
import { ThemeSwitch, type ThemeSwitchProps } from './ThemeSwitch'
import './TopBar.css'

export interface TopBarProps {
  section: Tab
  /** The tag: opens and closes the section list. */
  onSections: () => void
  /** Whether the section list is open. */
  sectionsOpen?: boolean
  /** Id of the section list element (aria-controls). */
  sectionsId?: string
  connected: boolean
  canConnect: boolean
  /** Connects, or (connected) disconnects: the key's hold, and the Disconnect button for screen readers. */
  onConnect: () => void
  /** A short note in the toast: a tap on the connected key says "Hold to disconnect", one on the Bluetooth key says why. */
  onNote: (text: string) => void
  /**
   * Live's output delay in ms while it is long enough to be heard, null when
   * it isn't; null (not a signal) off Live. Read here alone: a new delay
   * re-renders the bar, not the page.
   */
  late?: ReadonlySignal<number | null> | null
  onDebug: () => void
  onHelp: () => void
  /** The desk: the theme switch after the ? key. */
  themeSwitch?: ThemeSwitchProps
  /** In place of the gap after the tag: Live's display line on a phone on its side. */
  middle?: ComponentChildren
}

/** Id of the hint a screen reader hears with the connected key. */
const HOLD_HINT_ID = 'arc-hold-to-disconnect'

export function TopBar(props: TopBarProps): JSX.Element {
  const wireless = (props.late?.value ?? null) !== null
  return (
    <header class="top-bar">
      <div class="top-bar__row">
        <SectionTag
          section={props.section}
          onClick={props.onSections}
          onLongPress={props.onDebug}
          expanded={props.sectionsOpen ?? false}
          {...(props.sectionsId ? { controls: props.sectionsId } : {})}
        />
        {props.middle ? <div class="top-bar__middle">{props.middle}</div> : <span class="top-bar__spacer" />}
        {wireless && (
          <>
            <span data-coach="top.bluetooth" class="top-bar__item">
              <IconBlock
                icon={ArcIcon.BLUETOOTH}
                iconAlso={ArcIcon.CLOCK}
                label={CoachText.BLUETOOTH}
                ariaLabel={MirrorText.WIRELESS_DELAY}
                face="var(--warn)"
                ink="var(--tag-ink)"
                onClick={() => props.onNote(MirrorText.WIRELESS_DELAY)}
                iconSize={20}
              />
            </span>
            <span class="top-bar__gap" />
          </>
        )}
        <span data-coach="top.connection" class="top-bar__item">
          {props.connected ? (
            <>
              <IconBlock
                key="on"
                icon={ArcIcon.DOT}
                label={CoachText.CONNECTED}
                ariaLabel={CoachText.CONNECTED_NAME}
                face="var(--ok)"
                ink="var(--on-ok)"
                onClick={() => props.onNote(NavText.HOLD_TO_DISCONNECT)}
                onHold={props.onConnect}
                describedBy={HOLD_HINT_ID}
                disabled={!props.canConnect}
                iconSize={16}
              />
              <span id={HOLD_HINT_ID} class="sr-only">{NavText.HOLD_TO_DISCONNECT}</span>
              <button type="button" class="sr-only" tabIndex={-1} disabled={!props.canConnect} onClick={props.onConnect}>
                {CoachText.DISCONNECT}
              </button>
            </>
          ) : (
            <IconBlock
              key="off"
              icon={ArcIcon.RING}
              label={CoachText.DISCONNECTED}
              face="var(--navy)"
              ink="var(--on-navy)"
              onClick={props.onConnect}
              disabled={!props.canConnect}
              iconSize={18}
            />
          )}
        </span>
        <span class="top-bar__gap top-bar__gap--wide" />
        <span data-coach="top.help" class="top-bar__item">
          <IconBlock
            icon={ArcIcon.HELP}
            label={CoachText.HELP}
            face="var(--tab-off)"
            ink="var(--navy)"
            onClick={props.onHelp}
            round
          />
        </span>
        {props.themeSwitch && (
          <>
            <span class="top-bar__gap top-bar__gap--wide" />
            <span class="top-bar__item">
              <ThemeSwitch {...props.themeSwitch} />
            </span>
          </>
        )}
      </div>
    </header>
  )
}
