package dev.arc.ep133.text

import dev.arc.ep133.text.Format.plural

/** The theme the app uses (an addition to the web version). */
enum class ThemeChoice { SYSTEM, LIGHT, DARK }

/** The settings page (an addition to the web version). */
object SettingsText {
    const val TITLE = "Settings"
    const val CLOSE = "Close settings"

    const val APPEARANCE = "Appearance"
    const val THEME = "Theme"
    fun theme(t: ThemeChoice) = when (t) {
        ThemeChoice.SYSTEM -> "System"
        ThemeChoice.LIGHT -> "Light"
        ThemeChoice.DARK -> "Dark"
    }

    const val DEVICE = "Device"
    const val AUTO_CONNECT = "Connect when plugged in"
    const val AUTO_CONNECT_NOTE = "arc connects by itself when an EP-133 is plugged in."
    const val KEEP_SCREEN_ON = "Keep the screen on in Live"
    const val KEEP_SCREEN_ON_NOTE = "The phone doesn't sleep while the Live tab is open."
    const val ON = "On"
    const val OFF = "Off"

    const val LIBRARY = "Library"
    const val KEEP = "Keep"
    const val KEEP_NOTE = "After each backup or import, older backups beyond this many are deleted, here and in Documents/arc."

    /** null keeps every backup. */
    val KEEP_CHOICES: List<Int?> = listOf(null, 5, 10, 20)
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

    const val ABOUT = "About"
    fun version(v: String) = "arc $v"
    const val LICENCE_NOTE = "Free and open source (MIT). Not affiliated with teenage engineering."
    const val SOURCE = "Source code"
    const val SOURCE_URL = "https://github.com/n-drobyshevski/arc"
    const val FONT_LICENCE = "Font licence"
    const val DEBUG_LOG = "Debug log"
}
