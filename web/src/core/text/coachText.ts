// Port of core/src/main/kotlin/dev/arc/ep133/text/CoachText.kt
//
// The guide overlay's tags and the icon keys' names (an addition to the web
// version). The icons carry no words, so these are what long-press, screen
// readers and the overlay say.

export const CoachText = {
  HELP: "What's what",
  CLOSE_HINT: 'Tap anywhere to close',

  BACK_UP: 'Back up',
  /** The connection key while connected: a tap only says to hold (NavText.HOLD_TO_DISCONNECT), so its name does too. */
  CONNECTED: 'EP-133 connected: hold to disconnect',
  /** The web's connected key for a screen reader, which hears NavText.HOLD_TO_DISCONNECT as its description. */
  CONNECTED_NAME: 'EP-133 connected',
  CONNECTION: 'Connection',
  /** The guide overlay's tag on the connection key while connected. */
  CONNECTION_HOLD: 'Connection: hold to disconnect',
  /** The connection key's action for a screen reader, which disconnects without the timed hold. */
  DISCONNECT: 'Disconnect',
  DISCONNECTED: 'Connect the EP-133',
  SETTINGS: 'Settings',
  /** The web's desktop top bar: its System / Light / Dark switch, in the settings key's place. */
  THEME: 'Light or dark',
  SECTIONS: 'Sections',
  GUIDE_TAB: 'EP-133 shortcuts',
  MODE: 'Pads or keys',
  /** Live's function keys beside MODE (now the KEYS key). */
  PROJECT: 'Next project: tap; hold + pad 1–9 to pick',
  TEMPO: 'Click: tap; hold for tempo',
  /** The mic key in Live's top bar: a tap opens the SAMPLE panel, another closes it. */
  SAMPLE: 'Sample',
  /** The amber Bluetooth key in Live's top bar, while the sound goes to Bluetooth: a tap says that it plays late. */
  BLUETOOTH: 'Bluetooth delay',
  /** The pattern's keys on Live's display line: RECORD arms (a hold opens the pattern sheet), PLAY starts at bar 1. */
  RECORD: 'Record a pattern: tap, then PLAY; hold for its settings',
  PATTERN_PLAY: 'Play the pattern from bar 1',
  ERASE: "Erase a pad's notes",
  /** The STEP chip beside ERASE while the pattern is stopped: the STEP panel. */
  STEP: 'Step through the pattern',
  /** The scene chip beside it (and the readout while the pattern plays): the scene panel. */
  SCENE: 'Pick patterns and scenes, copy and paste',
  OCTAVE: 'Octave',
  SCALE: 'Scale',
  KEY: 'Key',
  PIANO: 'Play, or slide across the keys',
  KEYS_VIEW: 'Pads or piano',
  /** The EDIT edge tab's side tag. */
  EDIT: "Change a pad's sound",
  /** The ARP / RPT switch on the pads' plate, and LATCH under it. */
  ARP: 'Arp or repeat: hold pads',
  /** The beat cards' card in Live tools: share a pattern or scene to Claude, paste Claude's card back. */
  CLAUDE: 'Share a beat with Claude, paste one back',

  SEARCH: 'Search sounds',
  IMPORT: 'Import a .pak',
  OPEN_BACKUP: 'Tap a backup to open it',

  VIEW: 'All groups or one',
  GROUPS: 'Pick a group',
  FOLLOW: 'Follow the group played',
  PADS: 'Pads light as you play',
  MORE_TOOLS: 'More tools',
  SOUNDS_TAB: 'Drag a sound onto a pad',

  REFRESH: 'Read the device again',
  ADD_SAMPLES: 'Add samples',
  PLAY: 'Play on the phone',
  SOUNDS_PROJECTS: 'Sounds or projects',
} as const
