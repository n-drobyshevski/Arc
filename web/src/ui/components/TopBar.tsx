// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Chrome.kt (TopBar)
//
// The section tag, then icon keys as in the pocket operator app's top row: the
// orange REC-style dot backs up, the connection key is green with a dot while
// the EP-133 is connected (a tap disconnects) and navy with a ring when not,
// then the guide overlay (?) and settings. Their names show on long-press,
// in the overlay and to screen readers. Long-pressing the tag opens the
// debug screen.
//
// Web only, on the desk (from 1024px wide, [themeSwitch] set by Shell): the
// theme switch (ThemeSwitch.tsx: System / Light / Dark) in the settings key's
// place; the nav rail's Settings key opens Settings there.
import type { JSX } from 'preact'
import { CoachText } from '../../core/text/coachText'
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
  canBackup: boolean
  onBackup: () => void
  onConnect: () => void
  onDebug: () => void
  onSettings: () => void
  onHelp: () => void
  /** The desk: the theme switch in place of the settings key. */
  themeSwitch?: ThemeSwitchProps
}

export function TopBar(props: TopBarProps): JSX.Element {
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
        <span class="top-bar__spacer" />
        <span data-coach="top.backup" class="top-bar__item">
          <IconBlock
            icon={ArcIcon.DOT}
            label={CoachText.BACK_UP}
            face="var(--signal)"
            ink="var(--on-signal)"
            onClick={props.onBackup}
            disabled={!props.canBackup}
          />
        </span>
        <span class="top-bar__gap" />
        <span data-coach="top.connection" class="top-bar__item">
          {props.connected ? (
            <IconBlock
              key="on"
              icon={ArcIcon.DOT}
              label={CoachText.CONNECTED}
              face="var(--ok)"
              ink="var(--on-ok)"
              onClick={props.onConnect}
              disabled={!props.canConnect}
              iconSize={16}
            />
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
        {props.themeSwitch ? (
          <>
            <span class="top-bar__gap top-bar__gap--wide" />
            <span class="top-bar__item">
              <ThemeSwitch {...props.themeSwitch} />
            </span>
          </>
        ) : (
          <>
            <span class="top-bar__gap" />
            <span data-coach="top.settings" class="top-bar__item">
              <IconBlock
                icon={ArcIcon.GEAR}
                label={CoachText.SETTINGS}
                face="var(--tab-off)"
                ink="var(--navy)"
                onClick={props.onSettings}
                round
                iconSize={24}
              />
            </span>
          </>
        )}
      </div>
    </header>
  )
}
