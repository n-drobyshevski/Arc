// Web only: the desktop top bar's theme switch (no Kotlin counterpart; the
// Android app sets the theme in Settings only).
//
// On the desk (from 1024px wide, ui/useDesk.ts) the top bar shows it after the
// ? key, where the phone has no such switch (Settings has the theme; the nav
// rail has the Settings key). Three small
// icon keys, System / Light / Dark (SettingsText.theme), the chosen one held
// down, navy: the same setting as Settings → Theme (controller.setTheme), so
// the two always agree. A radio group, as Segmented: one tab stop, the arrow
// keys move the choice. Each key's name shows on long-press and as its title,
// as the other top bar keys'. The guide overlay marks it top.theme.
import type { JSX } from 'preact'
import { useRef } from 'preact/hooks'
import { SettingsText, THEME_CHOICES, type ThemeChoice } from '../../core/text/settingsText'
import { ArcIcon } from './Icons'
import { IconBlock } from './IconBlock'
import { handleRovingKey } from './Segmented'
import './ThemeSwitch.css'

/** Each choice's icon: a half-filled ring, a sun, a moon. */
export const THEME_ICONS: Readonly<Record<ThemeChoice, ArcIcon>> = Object.freeze({
  SYSTEM: ArcIcon.SYSTEM,
  LIGHT: ArcIcon.SUN,
  DARK: ArcIcon.MOON,
})

/** One key of the switch. */
export interface ThemeKey {
  readonly choice: ThemeChoice
  readonly icon: ArcIcon
  /** Its name (aria-label, title, tooltip). */
  readonly label: string
  readonly checked: boolean
  /** The roving tab stop: the chosen key's, or the first's when none is. */
  readonly tabIndex: 0 | -1
}

/** The keys in THEME_CHOICES order, [theme] checked. */
export function themeKeys(theme: ThemeChoice): ThemeKey[] {
  const at = THEME_CHOICES.indexOf(theme)
  return THEME_CHOICES.map((choice, i) => ({
    choice,
    icon: THEME_ICONS[choice],
    label: SettingsText.theme(choice),
    checked: i === at,
    tabIndex: i === Math.max(0, at) ? 0 : -1,
  }))
}

export interface ThemeSwitchProps {
  theme: ThemeChoice
  onTheme: (t: ThemeChoice) => void
}

export function ThemeSwitch(props: ThemeSwitchProps): JSX.Element {
  const row = useRef<HTMLDivElement | null>(null)
  const keys = themeKeys(props.theme)
  const pick = (i: number): void => {
    const k = keys[i]
    if (k && !k.checked) props.onTheme(k.choice)
  }
  return (
    <div
      ref={row}
      class="theme-switch"
      role="radiogroup"
      aria-label={SettingsText.THEME}
      data-coach="top.theme"
      onKeyDown={(e) => handleRovingKey(e, THEME_CHOICES.indexOf(props.theme), keys.length, row.current, pick)}
    >
      {keys.map((k, i) => (
        <IconBlock
          key={k.choice}
          icon={k.icon}
          label={k.label}
          face={k.checked ? 'var(--navy)' : 'var(--tab-off)'}
          ink={k.checked ? 'var(--on-navy)' : 'var(--navy)'}
          checked={k.checked}
          tabIndex={k.tabIndex}
          size={36}
          iconSize={18}
          onClick={() => pick(i)}
        />
      ))}
    </div>
  )
}
