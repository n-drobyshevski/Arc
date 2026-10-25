// The words of arc's MCP server (mcp/, a web-only addition with no Kotlin
// twin): what the model reads about the show_beat_card tool and what the
// beat-card view says to the user. Same tone as web/src/core/text: short and
// plain, and arc in lower case.
//
// ServerText goes to the model (tool and resource descriptions), BeatText to
// the user (views/beat). The view imports this file too, so keep it free of
// Node APIs.

export const SERVER_NAME = 'arc'
export const SERVER_VERSION = '0.1.0'

/** The view's resource. The tool's _meta.ui.resourceUri names it. */
export const BEAT_URI = 'ui://arc/beat.html'
export const BEAT_TOOL = 'show_beat_card'
/** The tool's input: the whole card text, as the arc-beats skill writes it. */
export const CARD_MIN = 10
export const CARD_MAX = 20000

export const ServerText = {
  INSTRUCTIONS:
    "arc's beat-card preview for the EP-133 K.O. II. After you write an ARC BEAT card (the arc-beats skill's " +
    'format), or when the user pastes one, call show_beat_card with the card so the user can see and hear it.',

  BEAT_TITLE: 'Preview beat card',
  BEAT_DESCRIPTION:
    'Show an ARC BEAT card (the plain-text EP-133 K.O. II beat of the arc-beats skill) as a step grid the user ' +
    'can play, mute and solo. Call it right after you write an ARC BEAT card, or when the user pastes or asks ' +
    'about one, so they can see and hear it. Pass the whole card, from the "ARC BEAT 1" line to its last line. ' +
    "It is a preview only: nothing goes to the EP-133 and nothing is saved, and the sounds are stand-ins. The " +
    'reply sums up the card: its sections and rows, then any errors and warnings with their line numbers. When ' +
    'it lists errors, fix those lines and call the tool again with the corrected card.',
  CARD_DESCRIPTION: 'The ARC BEAT card text, starting with the line "ARC BEAT 1".',

  VIEW_NAME: 'ARC BEAT card preview',
  VIEW_DESCRIPTION: 'A step grid that plays an ARC BEAT card with stand-in drum sounds.',
} as const

export const BeatText = {
  APP_NAME: 'arc beat preview',
  WAITING: 'Waiting for a beat card…',
  CANCELLED: 'The card was not sent.',
  NO_NAME: 'Untitled beat',
  PREVIEW_NOTE: "Preview only — arc can't import cards yet. Sounds are stand-ins, not your EP-133's.",

  TEMPO: 'Tempo',
  SWING: 'Swing',
  bpm: (n: number): string => `${n} BPM`,
  /** A card without a tempo line plays at this one. */
  NO_TEMPO: 'no tempo in the card',
  PLAY: 'Play',
  STOP: 'Stop',
  /** Web Audio is missing or the context would not start. */
  NO_AUDIO: "This browser can't play sound here.",

  GROUPS: 'Groups',
  groupTab: (bars: number, step: string): string => `${bars} bar${bars === 1 ? '' : 's'} · ${step}`,
  GRID: 'Steps',
  MUTE: 'M',
  SOLO: 'S',
  mute: (pad: string, label: string): string => `Mute ${pad}${label ? ` ${label}` : ''}`,
  solo: (pad: string, label: string): string => `Solo ${pad}${label ? ` ${label}` : ''}`,
  /** A row that only the notes list plays (no grid row). */
  NOTES_ROW: 'notes',
  cell: (pad: string, step: number, vel: number, len: number): string =>
    vel > 0 ? `${pad} step ${step}: velocity ${vel}${len > 1 ? `, ${len} steps long` : ''}` : `${pad} step ${step}: rest`,
  notesPlayed: (n: number): string =>
    `${n} note${n === 1 ? '' : 's'} from the notes list play${n === 1 ? 's' : ''} too; off-grid ones show on the nearest step.`,
  KEYS_NOTES: 'KEYS notes play at their pitch on bass and keys rows; drum rows ignore the pitch.',
  scenes: (n: number): string => `The card has ${n} scenes; only the first plays here.`,

  ERRORS: 'Errors',
  WARNINGS: 'Warnings',
  line: (n: number): string => `line ${n}`,
  INVALID: "This card can't be read yet. Fix the lines below, or ask Claude to.",

  COPY: 'Copy card',
  COPIED: 'Copied',
  COPY_FAILED: 'Select the card below and copy it.',
  CARD_TEXT: 'Card text',

  ASK: 'Ask Claude to change this',
  ASK_PLACEHOLDER: 'e.g. busier hats, half-time feel',
  ASK_LABEL: 'What should change?',
  SEND: 'Send',
  SENT: 'Sent to Claude.',
  ASK_FAILED: "Couldn't send. Type your request in the chat instead.",
  NO_MESSAGE: 'This chat app does not take messages from previews. Type your request in the chat.',
  /** The message the view sends: the user's request plus what they changed while listening. */
  askMessage: (name: string, request: string, heard: string[]): string => {
    const lines = [`Please change the ARC BEAT card${name ? ` "${name}"` : ''}: ${request.trim()}`]
    if (heard.length > 0) lines.push(`(In the preview I had ${heard.join(', ')}.)`)
    lines.push('Show me the new card with show_beat_card.')
    return lines.join('\n')
  },
  heardTempo: (n: number): string => `tempo ${n}`,
  heardSwing: (n: number): string => `swing ${n}`,
  heardMuted: (pads: string[]): string => `${pads.join(' ')} muted`,
  heardSolo: (pads: string[]): string => `${pads.join(' ')} soloed`,
} as const
