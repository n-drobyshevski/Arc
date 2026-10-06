// Tests for the desktop top bar's theme switch (web only, src/ui/components/ThemeSwitch.tsx).
import { describe, expect, it } from 'vitest'
import { CoachText } from '../../src/core/text/coachText'
import { SettingsText, THEME_CHOICES } from '../../src/core/text/settingsText'
import { COACH_IDS, COACH_MARKS } from '../../src/ui/components/Coach'
import { ArcIcon } from '../../src/ui/components/Icons'
import { THEME_ICONS, themeKeys } from '../../src/ui/components/ThemeSwitch'

describe('ThemeSwitch', () => {
  it('has a key per theme choice, in the Settings row order, named as there', () => {
    const keys = themeKeys('SYSTEM')
    expect(keys.map((k) => k.choice)).toEqual([...THEME_CHOICES])
    expect(keys.map((k) => k.label)).toEqual(['System', 'Light', 'Dark'])
    expect(keys.map((k) => k.label)).toEqual(THEME_CHOICES.map((c) => SettingsText.theme(c)))
    expect(keys.map((k) => k.icon)).toEqual([ArcIcon.SYSTEM, ArcIcon.SUN, ArcIcon.MOON])
    expect(new Set(Object.values(THEME_ICONS)).size).toBe(3)
  })

  it('checks the setting, and makes it the one tab stop', () => {
    for (const theme of THEME_CHOICES) {
      const keys = themeKeys(theme)
      expect(keys.filter((k) => k.checked).map((k) => k.choice)).toEqual([theme])
      expect(keys.filter((k) => k.tabIndex === 0).map((k) => k.choice)).toEqual([theme])
    }
  })

  it('an unknown stored value checks nothing, and the first key takes the tab stop', () => {
    const keys = themeKeys('PURPLE' as never)
    expect(keys.some((k) => k.checked)).toBe(false)
    expect(keys.map((k) => k.tabIndex)).toEqual([0, -1, -1])
  })

  it('is marked for the guide overlay', () => {
    expect(COACH_IDS).toContain('top.theme')
    expect(COACH_MARKS['top.theme'].label).toBe(CoachText.THEME)
  })
})
