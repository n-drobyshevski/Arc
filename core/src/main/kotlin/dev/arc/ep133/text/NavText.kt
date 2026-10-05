package dev.arc.ep133.text

/**
 * The top bar and the tabs along the bottom (an addition to the web version,
 * which is a single page; the layout follows teenage engineering's pocket
 * operator app).
 */
object NavText {
    const val BACKUPS = Strings.BACKUPS
    const val LIVE = MirrorText.LIVE
    const val DEVICE = "Device"
    const val GUIDE = "Guide"
    const val BACK_UP = "Back up"
    const val TABS = "Sections"
    /** The section tag's spoken name: "Live, sections". */
    fun sectionTag(section: String) = "$section, $TABS"
    /** The left-edge tab that slides the EP-133 shortcut guide in. */
    const val GUIDE_TAB = "Guide"

    /** The device panel's caption on the Backups tab. */
    const val DEVICE_CAPTION = "EP-133"
}
