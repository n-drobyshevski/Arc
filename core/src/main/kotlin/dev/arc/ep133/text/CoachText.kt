package dev.arc.ep133.text

/**
 * The guide overlay's tags and the icon keys' names (an addition to the web
 * version). The icons carry no words, so these are what long-press, screen
 * readers and the overlay say.
 */
object CoachText {
    const val HELP = "What's what"
    const val CLOSE_HINT = "Tap anywhere to close"

    const val BACK_UP = "Back up"
    /** The connection key while connected: a tap only says to hold ([NavText.HOLD_TO_DISCONNECT]), so its name does too. */
    const val CONNECTED = "EP-133 connected: hold to disconnect"
    /** The web's connected key for a screen reader, which hears [NavText.HOLD_TO_DISCONNECT] as its description. */
    const val CONNECTED_NAME = "EP-133 connected"
    const val CONNECTION = "Connection"
    /** The guide overlay's tag on the connection key while connected. */
    const val CONNECTION_HOLD = "Connection: hold to disconnect"
    /** The connection key's action for a screen reader, which disconnects without the timed hold. */
    const val DISCONNECT = "Disconnect"
    const val DISCONNECTED = "Connect the EP-133"
    const val SETTINGS = "Settings"
    /** The web's desktop top bar: its System / Light / Dark switch, in the settings key's place. */
    const val THEME = "Light or dark"
    const val SECTIONS = "Sections"
    const val GUIDE_TAB = "EP-133 shortcuts"
    const val MODE = "Pads or keys"
    /** Live's function keys beside MODE (now the KEYS key). */
    const val PROJECT = "Next project: tap; hold + pad 1–9 to pick"
    const val TEMPO = "Click: tap; hold for tempo"
    /** The mic key in Live's top bar: a tap opens the SAMPLE panel, another closes it. */
    const val SAMPLE = "Sample"
    /** The amber Bluetooth key in Live's top bar, while the sound goes to Bluetooth: a tap says that it plays late. */
    const val BLUETOOTH = "Bluetooth delay"
    /** The pattern's keys on Live's display line: RECORD arms (a hold opens the pattern sheet), PLAY starts at bar 1. */
    const val RECORD = "Record a pattern: tap, then PLAY; hold for its settings"
    const val PATTERN_PLAY = "Play the pattern from bar 1"
    const val ERASE = "Erase a pad's notes"
    /** The STEP chip beside ERASE while the pattern is stopped: the STEP panel. */
    const val STEP = "Step through the pattern"
    /** The scene chip beside it (and the readout while the pattern plays): the scene panel. */
    const val SCENE = "Pick patterns and scenes, copy and paste"
    const val OCTAVE = "Octave"
    const val SCALE = "Scale"
    const val KEY = "Key"
    const val PIANO = "Play, or slide across the keys"
    const val KEYS_VIEW = "Pads or piano"
    /** The EDIT edge tab's side tag. */
    const val EDIT = "Change a pad's sound"
    /** The ARP / RPT switch on the pads' plate, and LATCH under it. */
    const val ARP = "Arp or repeat: hold pads"
    /** The beat cards' card in Live tools: share a pattern or scene to Claude, paste Claude's card back. */
    const val CLAUDE = "Share a beat with Claude, paste one back"

    const val SEARCH = "Search sounds"
    const val IMPORT = "Import a .pak"
    const val OPEN_BACKUP = "Tap a backup to open it"

    const val VIEW = "All groups or one"
    const val GROUPS = "Pick a group"
    const val FOLLOW = "Follow the group played"
    const val PADS = "Pads light as you play"
    const val MORE_TOOLS = "More tools"
    const val SOUNDS_TAB = "Drag a sound onto a pad"

    const val REFRESH = "Read the device again"
    const val ADD_SAMPLES = "Add samples"
    const val PLAY = "Play on the phone"
    const val SOUNDS_PROJECTS = "Sounds or projects"
}
