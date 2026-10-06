package dev.arc.ep133.text

import dev.arc.ep133.features.Piano
import dev.arc.ep133.text.Format.plural

/** The theme the app uses (an addition to the web version). */
enum class ThemeChoice { SYSTEM, LIGHT, DARK }

/** The settings page (an addition to the web version). */
object SettingsText {
    const val TITLE = "Settings"
    const val CLOSE = "Close settings"
    /** A screen reader's action on a toast. */
    const val DISMISS = "Dismiss"

    const val APPEARANCE = "Appearance"
    const val THEME = "Theme"
    fun theme(t: ThemeChoice) = when (t) {
        ThemeChoice.SYSTEM -> "System"
        ThemeChoice.LIGHT -> "Light"
        ThemeChoice.DARK -> "Dark"
    }

    const val DEVICE = "Device"
    const val AUTO_CONNECT = "Auto-connect"
    const val AUTO_CONNECT_NOTE = "arc connects by itself when an EP-133 is plugged in."
    const val KEEP_SCREEN_ON = "Screen on in Live"
    const val KEEP_SCREEN_ON_NOTE = "The phone doesn't sleep while the Live tab is open."
    const val ON = "On"
    const val OFF = "Off"

    // Each row: its name and the control on the right; an info key opens its
    // one-line note under the row (and the long note, where there is more to say).
    /** The info key, for screen readers; it says whether the note is open. */
    const val MORE_INFO = "More about this"

    const val LIBRARY = "Library"
    const val KEEP = "Keep"
    const val KEEP_NOTE = "After each backup or import, older backups beyond this many are deleted, here and in Documents/arc."

    /** null keeps every backup. */
    val KEEP_CHOICES: List<Int?> = listOf(null, 5, 10, 20)
    /** The row's short note; [KEEP_NOTE] is the long one. */
    const val KEEP_SHORT = "Older backups beyond this many are deleted."
    fun keepLabel(n: Int?) = n?.toString() ?: "All"

    fun pruneConfirm(n: Int) =
        (if (n == 1) "This deletes the oldest backup" else "This deletes the $n oldest backups") + ", also from Documents/arc."
    const val PRUNE = "Delete"
    fun pruned(n: Int) = "Removed ${plural(n, "old backup")}."

    const val LIVE = "Live"
    const val FORGET_NAMES = "Forget learned sample names"
    const val FORGET_CONFIRM = "Forget which pad is which? Names come back as you press pads in Live."
    const val FORGET = "Forget"
    const val FORGOTTEN = "Learned sample names forgotten."
    const val PAD_SOUNDS = "Pad sounds saved on the phone"
    const val PAD_SOUNDS_NOTE = "Live keeps a copy of the samples on your pads, so they play without the EP-133."
    const val CLEAR = "Clear"
    fun padSounds(size: String) = "$PAD_SOUNDS: $size"

    // Live's choices as short rows, and what arc keeps on the phone in a group of its own.
    const val NOTE_NAMES_SHORT = "DO is C (fixed-do), or letters."
    const val SHOW_NAMES_SHORT = "Off: rings and octave numbers only."
    const val PIANO_KEYS = "Piano keys"
    const val PIANO_KEYS_SHORT = "Auto shows as many as fit."
    const val PIANO_KEYS_NOTE = "How many keys Live's piano shows. A key is never narrower than a fingertip, so a size the window is too narrow for falls back to the largest that fits."
    /** null is Auto; the rest are white keys (Piano.WHITES). */
    val PIANO_CHOICES: List<Int?> = Piano.CHOICES
    fun pianoKeys(whites: Int?) = when (whites) {
        null -> "Auto"
        8 -> "1 octave"
        12 -> "1\u00BD"
        15 -> "2"
        22 -> "3 octaves"
        else -> "$whites keys"
    }
    /** The same, spelt out for screen readers. */
    fun pianoKeysDescription(whites: Int?) = when (whites) {
        null -> "Auto: as many keys as fit"
        8 -> "1 octave"
        12 -> "1\u00BD octaves"
        15 -> "2 octaves"
        22 -> "3 octaves"
        else -> "$whites white keys"
    }
    /** Why a piano size is greyed out. */
    const val DOESNT_FIT = "Too wide for this window"
    const val HAPTICS = "Haptics"
    const val HAPTICS_NOTE = "A light tick when a pad or key goes down."

    const val SAVED_HERE = "Saved on the phone"
    const val LEARNED_NAMES = "Learned sample names"
    const val LEARNED_NAMES_SHORT = "They come back as you press pads in Live."
    const val PAD_SOUNDS_SHORT = "Pad sounds"
    /** "Pad sounds \u00B7 69 KB". */
    fun padSoundsShort(size: String) = "$PAD_SOUNDS_SHORT \u00B7 $size"
    const val PAD_SOUNDS_SHORT_NOTE = "Copies of your pad samples, to play without the EP-133."

    const val ABOUT = "About"
    fun version(v: String) = "arc $v"
    const val LICENCE_NOTE = "Free and open source (MIT). Not affiliated with teenage engineering."
    const val SOURCE = "Source code"
    const val SOURCE_URL = "https://github.com/n-drobyshevski/arc"
    const val FONT_LICENCE = "Font licence"
    const val DEBUG_LOG = "Debug log"
}
