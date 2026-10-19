// Port of core/src/main/kotlin/dev/arc/ep133/text/TourText.kt
//
// "Try arc", the first-run tour (an addition to the web version). The few
// sentences about the phone have web rewordings in webText.ts (TOUR_*).

export const TourText = {
  TITLE: 'Try arc',

  WELCOME_SUB: 'for the EP-133 K.O. II',
  WELCOME_HINT: 'arc keeps backups of your EP-133 and shows it live as you play.',
  WELCOME_STEPS: 'A few short steps. You do each one.',
  RESUME_HEAD: 'Welcome back',
  resumeHint(n: number, of: number): string {
    return `Try arc stopped at step ${n} of ${of}.`
  },

  START: 'Start',
  CONTINUE: 'Continue',
  NOT_NOW: 'Not now',
  SKIP: 'Skip',
  LATER: 'Later',
  NEXT: 'Next',
  PLAY_IT: 'Play it',
  OFFLINE: 'Without the EP-133',
  OPEN_IT: 'Open it',

  stepOf(n: number, of: number): string {
    return `Step ${n} of ${of}`
  },

  RESTORE_HEAD: 'Used arc before?',
  FIRST_TIME: 'First time here',

  CONNECT_HEAD: 'Connect your EP-133',
  CONNECT_HINT: 'Plug in the EP-133 with a USB-C cable and turn it on, then tap Connect.',
  ROW_MIDI: 'MIDI allowed',
  ROW_PLUGGED: 'EP-133 plugged in',
  ROW_CONNECTED: 'Connected',
  /** What a screen reader says for a check row. */
  row(label: string, done: boolean): string {
    return `${label}: ` + (done ? 'done' : 'not yet')
  },
  NEEDS_DEVICE: 'This step needs the EP-133 connected.',

  PAD_HEAD: 'Play on the EP-133',
  PAD_NOTE: 'The same pad lights here.',

  HEAR_HEAD: 'Hear it here',
  HEAR_HINT: 'Hold the pad that lit to hear it. The first time takes a moment.',

  BACKUP_HEAD: 'Back up your EP-133',
  BACKUP_HINT: 'arc saves every sound and project on the EP-133 to the phone. Nothing on it is changed.',

  NEEDS_MIDI: 'Needs MIDI',

  // Without the EP-133.
  TOOLS_HEAD: 'More tools',
  TOOLS_HINT: 'Tap the strip on the right for the view, Follow and pad numbering. Close it to go on.',
  GUIDE_HEAD: 'EP-133 shortcuts',
  GUIDE_HINT: "Tap GUIDE on the left for the EP-133's key combinations. Close it to go on.",
  SECTIONS_HEAD: 'Backups',
  SECTIONS_HINT: 'Tap the tag at the top and pick Backups. Your backups and Import are there.',
  DEVICE_HERE: 'Your EP-133 is connected.',
  TRY_PADS: 'Try the pads',
  CONNECT_NOW: 'Connect and try the pads',
  OFFLINE_NOTE: 'Settings has Try arc again for when the EP-133 is here.',

  DONE_HEAD: "That's the basics",
  DONE_HINT: "? names every control. GUIDE has the EP-133's own shortcuts, and the strip on the right has more tools.",
  LATER_NOTE: 'Settings has Try arc again for the steps you skipped.',
} as const
