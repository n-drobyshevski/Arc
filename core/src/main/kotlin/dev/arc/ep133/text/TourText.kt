package dev.arc.ep133.text

/** "Try arc", the first-run tour (an addition to the web version). */
object TourText {
    const val TITLE = "Try arc"

    const val WELCOME_SUB = "for the EP-133 K.O. II"
    const val WELCOME_HINT = "arc keeps backups of your EP-133 and shows it live as you play."
    const val WELCOME_STEPS = "A few short steps. You do each one."
    const val RESUME_HEAD = "Welcome back"
    fun resumeHint(n: Int, of: Int) = "Try arc stopped at step $n of $of."

    const val START = "Start"
    const val CONTINUE = "Continue"
    const val NOT_NOW = "Not now"
    const val SKIP = "Skip"
    const val LATER = "Later"
    const val NEXT = "Next"
    const val PLAY_IT = "Play it"
    const val OFFLINE = "Without the EP-133"
    const val OPEN_IT = "Open it"

    fun stepOf(n: Int, of: Int) = "Step $n of $of"

    const val RESTORE_HEAD = "Used arc before?"
    const val FIRST_TIME = "First time here"

    const val CONNECT_HEAD = "Connect your EP-133"
    const val CONNECT_HINT = "Plug in the EP-133 with a USB-C cable and turn it on, then tap Connect."
    const val ROW_MIDI = "MIDI allowed"
    const val ROW_PLUGGED = "EP-133 plugged in"
    const val ROW_CONNECTED = "Connected"
    /** What a screen reader says for a check row. */
    fun row(label: String, done: Boolean) = "$label: " + if (done) "done" else "not yet"
    const val NEEDS_DEVICE = "This step needs the EP-133 connected."

    const val PAD_HEAD = "Play on the EP-133"
    const val PAD_NOTE = "The same pad lights here."

    const val HEAR_HEAD = "Hear it here"
    const val HEAR_HINT = "Hold the pad that lit to hear it. The first time takes a moment."

    const val BACKUP_HEAD = "Back up your EP-133"
    const val BACKUP_HINT = "arc saves every sound and project on the EP-133 to the phone. Nothing on it is changed."

    const val NEEDS_MIDI = "Needs MIDI"

    // Without the EP-133.
    const val TOOLS_HEAD = "More tools"
    const val TOOLS_HINT = "Tap the strip on the right for the view, Follow and pad numbering. Close it to go on."
    const val GUIDE_HEAD = "EP-133 shortcuts"
    const val GUIDE_HINT = "Tap GUIDE on the left for the EP-133's key combinations. Close it to go on."
    const val SECTIONS_HEAD = "Backups"
    const val SECTIONS_HINT = "Tap the tag at the top and pick Backups. Your backups and Import are there."
    const val DEVICE_HERE = "Your EP-133 is connected."
    const val TRY_PADS = "Try the pads"
    const val CONNECT_NOW = "Connect and try the pads"
    const val OFFLINE_NOTE = "Settings has Try arc again for when the EP-133 is here."

    const val DONE_HEAD = "That's the basics"
    const val DONE_HINT = "? names every control. GUIDE has the EP-133's own shortcuts, and the strip on the right has more tools."
    const val LATER_NOTE = "Settings has Try arc again for the steps you skipped."
}
