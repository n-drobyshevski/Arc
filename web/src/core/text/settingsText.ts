// Port of core/src/main/kotlin/dev/arc/ep133/text/SettingsText.kt
//
// The settings page (an addition to the web version).
//
// Web delta: the Kotlin `enum class ThemeChoice` is a const object plus a
// string-union type of the same name (the values are the enum names, so they
// persist as the same strings).

import { plural } from './format'

/** The theme the app uses (an addition to the web version). */
export const ThemeChoice = {
  SYSTEM: 'SYSTEM',
  LIGHT: 'LIGHT',
  DARK: 'DARK',
} as const
export type ThemeChoice = (typeof ThemeChoice)[keyof typeof ThemeChoice]

/** ThemeChoice.entries, in declaration order. */
export const THEME_CHOICES: readonly ThemeChoice[] = [ThemeChoice.SYSTEM, ThemeChoice.LIGHT, ThemeChoice.DARK]

/** null keeps every backup. */
const KEEP_CHOICES: readonly (number | null)[] = Object.freeze([null, 5, 10, 20])

export const SettingsText = {
  TITLE: 'Settings',
  CLOSE: 'Close settings',

  APPEARANCE: 'Appearance',
  THEME: 'Theme',
  theme(t: ThemeChoice): string {
    switch (t) {
      case ThemeChoice.SYSTEM:
        return 'System'
      case ThemeChoice.LIGHT:
        return 'Light'
      case ThemeChoice.DARK:
        return 'Dark'
    }
  },

  DEVICE: 'Device',
  AUTO_CONNECT: 'Connect when plugged in',
  AUTO_CONNECT_NOTE: 'arc connects by itself when an EP-133 is plugged in.',
  KEEP_SCREEN_ON: 'Keep the screen on in Live',
  KEEP_SCREEN_ON_NOTE: "The phone doesn't sleep while the Live tab is open.",
  ON: 'On',
  OFF: 'Off',

  LIBRARY: 'Library',
  KEEP: 'Keep',
  KEEP_NOTE: 'After each backup or import, older backups beyond this many are deleted, here and in Documents/arc.',

  /** null keeps every backup. */
  KEEP_CHOICES,
  keepLabel(n: number | null | undefined): string {
    return n != null ? String(n) : 'All'
  },

  pruneConfirm(n: number): string {
    return (n === 1 ? 'This deletes the oldest backup' : `This deletes the ${n} oldest backups`) + ', also from Documents/arc.'
  },
  PRUNE: 'Delete',
  pruned(n: number): string {
    return `Removed ${plural(n, 'old backup')}.`
  },

  LIVE: 'Live',
  FORGET_NAMES: 'Forget learned sample names',
  FORGET_CONFIRM: 'Forget which pad is which? Names come back as you press pads in Live.',
  FORGET: 'Forget',
  FORGOTTEN: 'Learned sample names forgotten.',

  ABOUT: 'About',
  version(v: string): string {
    return `arc ${v}`
  },
  LICENCE_NOTE: 'Free and open source (MIT). Not affiliated with teenage engineering.',
  SOURCE: 'Source code',
  SOURCE_URL: 'https://github.com/n-drobyshevski/arc',
  FONT_LICENCE: 'Font licence',
  DEBUG_LOG: 'Debug log',
} as const
