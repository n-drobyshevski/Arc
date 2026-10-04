package dev.arc.ep133.text

import dev.arc.ep133.text.Format.plural

/**
 * Interface text, word for word from the web version (index.html, app.js).
 * The few web-only sentences are reworded for Android, as agreed; they are
 * marked "Android".
 */
object Strings {
    const val WORDMARK = "arc"
    const val CONNECT = "Connect"
    const val DISCONNECT = "Disconnect"
    const val NO_DEVICE = "No device"
    const val READING_DEVICE = "Reading device"
    const val PLUG_IN_HINT = "Plug in the EP-133 with a USB-C cable and turn it on, then tap Connect."
    const val ONE_MOMENT = "One moment."
    const val BACK_UP = "Back up device"
    const val BACKUPS = "Backups"
    const val IMPORT = "Import .pak"
    const val EMPTY_TITLE = "No backups yet."
    const val EMPTY_TEXT = "Connect your EP-133 and back it up, or import a .pak file from the official Sample Tool or a friend."
    const val FOOTER = "Free and open source. Not affiliated with teenage engineering."

    // Android: replaces "No MIDI in this browser" and its hint.
    const val NO_MIDI_TITLE = "No MIDI on this phone"
    const val NO_MIDI_HINT = "This phone can't connect to your EP-133. Your saved backups still work here."

    fun osVersion(v: String) = if (v.isNotEmpty()) "OS $v" else ""
    fun soundsLabel(n: Int) = if (n == 1) "sound" else "sounds"
    fun projectsLabel(n: Int) = if (n == 1) "project" else "projects"
    const val FREE = "free"
    fun meterDescription(used: Double, total: Double) =
        if (total != 0.0) "${Format.bytes(used)} of ${Format.bytes(total)} used" else ""

    fun backupRowMeta(sounds: Int, projects: Int, size: Long) =
        "${plural(sounds, "sound")}, ${plural(projects, "project")}, ${Format.bytes(size)}"

    /** "3 backups, 1.2 MB stored on this phone (4.1 GB space left)." or "" when empty. */
    fun storageNote(count: Int, totalSize: Long, spaceLeft: Long?) =
        if (count == 0) "" else "${plural(count, "backup")}, ${Format.bytes(totalSize)} stored on this phone" +
            (if (spaceLeft != null) " (${Format.bytes(maxOf(0L, spaceLeft))} space left)" else "") + "."

    // Detail sheet
    const val NAME = "Name"
    const val NOTES = "Notes"
    const val NOTES_PLACEHOLDER = "What's in this backup?"
    const val RESTORE_TO_DEVICE = "Restore to device"
    const val CONNECT_TO_RESTORE = "Connect a device to restore"
    const val SHARE = "Share"
    const val SAVE_PAK = "Save .pak file"
    const val DELETE = "Delete"
    const val DONE = "Done"
    const val CLOSE = "Close"
    const val CANCEL = "Cancel"
    fun deleteConfirm(title: String) = "Delete \"$title\" from this phone? This can't be undone."
    fun projectLine(n: Int) = "Project $n"

    // Restore sheet
    const val EVERYTHING = "Everything in this backup"
    const val PICK_PROJECTS = "Pick projects"
    const val ALSO_OTHER_SOUNDS = "Also restore sounds no picked project uses"
    const val PICK_SOMETHING = "Pick something to restore"

    // Progress sheet
    const val BACKING_UP = "Backing up"
    const val RESTORING = "Restoring"
    const val KEEP_SCREEN_ON = "Keep the screen on and the cable plugged in."
    const val STOPPING = "Stopping after the current item"

    // Toasts
    const val CANCELLED = "Cancelled. Nothing after that point was changed."
    const val DISCONNECTED = "The EP-133 was disconnected."
    const val BACKUP_DELETED = "Backup deleted."
    const val SHARE_FAILED = "Sharing failed. Use Save .pak file instead."
    fun saved(sounds: Int, projects: Int) = "Saved ${plural(sounds, "sound")} and ${plural(projects, "project")}."
    fun restored(sounds: Int, projects: Int) = "Restored ${plural(sounds, "sound")} and ${plural(projects, "project")}."
    fun imported(sounds: Int, projects: Int) = "Imported ${plural(sounds, "sound")} and ${plural(projects, "project")}."
    fun importFailed(name: String, message: String) = "Couldn't import $name: $message"
    fun libraryFailed(message: String) = "Couldn't open saved backups: $message"
    const val FILE_MISSING = "The backup file is missing from this device"

    // Android-only text
    const val SHARE_TITLE_PREFIX = "EP-133 backup: "
    const val NOTIFICATION_CHANNEL = "Backups and restores"
    const val DEBUG_TITLE = "SysEx log"
    const val DEBUG_SHARE = "Share log"
    const val DEBUG_SAVE = "Save log"
    const val DEBUG_COPY = "Copy"
    const val DEBUG_CLEAR = "Clear"
    const val DEBUG_TOGGLE = "Log traffic"
    const val DEBUG_EMPTY = "Nothing logged yet. Connect the EP-133 to see SysEx traffic."
    const val DEBUG_COPIED = "Log copied."
}
