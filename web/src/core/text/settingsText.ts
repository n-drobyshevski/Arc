// Port of core/src/main/kotlin/dev/arc/ep133/text/SettingsText.kt
//
// The settings page (an addition to the web version).
//
// Web delta: the Kotlin `enum class ThemeChoice` is a const object plus a
// string-union type of the same name (the values are the enum names, so they
// persist as the same strings).

import { CHOICES as PIANO_CHOICES } from '../features/piano'
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
  /** A screen reader's action on a toast. */
  DISMISS: 'Dismiss',

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

  // Each row: its name with a one-line note, the control on the right, and
  // (where there is more to say) an info key that opens the long note.
  /** The info key, for screen readers; it says whether the long note is open. */
  MORE_INFO: 'More about this',

  LIBRARY: 'Library',
  KEEP: 'Keep',
  KEEP_NOTE: 'After each backup or import, older backups beyond this many are deleted, here and in Documents/arc.',

  /** null keeps every backup. */
  KEEP_CHOICES,
  /** The row's short note; [KEEP_NOTE] is the long one. */
  KEEP_SHORT: 'Older backups beyond this many are deleted.',
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
  PAD_SOUNDS: 'Pad sounds saved on the phone',
  PAD_SOUNDS_NOTE: 'Live keeps a copy of the samples on your pads, so they play without the EP-133.',
  CLEAR: 'Clear',
  padSounds(size: string): string {
    return `${SettingsText.PAD_SOUNDS}: ${size}`
  },

  // Live's choices as short rows, and what arc keeps on the phone in a group of its own.
  NOTE_NAMES_SHORT: 'DO is C (fixed-do), or letters.',
  SHOW_NAMES_SHORT: 'Off: rings and octave numbers only.',
  PIANO_KEYS: 'Piano keys',
  PIANO_KEYS_SHORT: 'Auto shows as many as fit.',
  PIANO_KEYS_NOTE:
    "How many keys Live's piano shows. A key is never narrower than a fingertip, so a size the window is too narrow for falls back to the largest that fits.",
  /** null is Auto; the rest are white keys (Piano.WHITES). */
  PIANO_CHOICES,
  pianoKeys(whites: number | null): string {
    switch (whites) {
      case null:
        return 'Auto'
      case 8:
        return '1 octave'
      case 12:
        return '1\u00BD'
      case 15:
        return '2'
      case 22:
        return '3 octaves'
      default:
        return `${whites} keys`
    }
  },
  /** The same, spelt out for screen readers. */
  pianoKeysDescription(whites: number | null): string {
    switch (whites) {
      case null:
        return 'Auto: as many keys as fit'
      case 8:
        return '1 octave'
      case 12:
        return '1\u00BD octaves'
      case 15:
        return '2 octaves'
      case 22:
        return '3 octaves'
      default:
        return `${whites} white keys`
    }
  },
  /** Why a piano size is greyed out. */
  DOESNT_FIT: 'Too wide for this window',

  SAVED_HERE: 'Saved on the phone',
  LEARNED_NAMES: 'Learned sample names',
  LEARNED_NAMES_SHORT: 'They come back as you press pads in Live.',
  PAD_SOUNDS_SHORT: 'Pad sounds',
  /** "Pad sounds · 69 KB". */
  padSoundsShort(size: string): string {
    return `${SettingsText.PAD_SOUNDS_SHORT} \u00B7 ${size}`
  },
  PAD_SOUNDS_SHORT_NOTE: 'Copies of your pad samples, to play without the EP-133.',

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
