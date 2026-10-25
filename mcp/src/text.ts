// The words of arc's MCP server (mcp/, a web-only addition with no Kotlin
// twin): what the model reads about the show_beat_card tool and what the
// beat-card view says to the user. Same tone as web/src/core/text: short and
// plain, and arc in lower case.
//
// ServerText goes to the model (tool and resource descriptions), BeatText to
// the user (views/beat). The view imports this file too, so keep it free of
// Node APIs.

import {
  SIDECHAIN_LENGTH,
  SIDECHAIN_SHAPE,
  chainText,
  type BeatCardChainStep,
  type BeatCardComp,
  type BeatCardFx,
  type BeatCardPad,
  type BeatCardSends,
  type BeatCardSidechain,
} from '../../web/src/core/formats/beatCard'

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
    "arc's beat-card preview and key-combo guide for the EP-133 K.O. II. After you write an ARC BEAT card (the " +
    "arc-beats skill's format), or when the user pastes one, call show_beat_card with the card so the user can " +
    'see and hear it. When the user asks how to do something on the EP-133, call lookup_combo before you write ' +
    'any key combo, and give only the combos it returns. When the user wants beat ideas or a genre to start ' +
    'from, call browse_grooves to show the groove gallery.',

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

/** How many errors a "Fix errors" message lists. */
const FIX_MAX = 10

/** ` "name"` for a card with a name, else nothing. */
function quoted(name: string): string {
  return name ? ` "${name}"` : ''
}

/** A pad's pitch as the badge writes it: −7, +3.5, 0 (a real minus sign). */
function semitones(n: number): string {
  return `${n < 0 ? '−' : n > 0 ? '+' : ''}${Math.abs(n)}`
}

/** A scene as the view names it: its name, else "Scene 3" (index from 0). */
function sceneName(index: number, name: string): string {
  return name || `Scene ${index + 1}`
}

/** A scene in a message to Claude: "scene 2 (Drop)". */
function sceneRef(index: number, name: string): string {
  return `scene ${index + 1}${name ? ` (${name})` : ''}`
}

/** A pad's pan as the pad sheet writes it: L4, R4, C. */
function panText(n: number): string {
  return n < 0 ? `L${-n}` : n > 0 ? `R${n}` : 'C'
}

/** A message to Claude: the request, what the user changed while listening, and the ask to show the new card. */
function message(request: string, heard: string[]): string {
  const lines = [request]
  if (heard.length > 0) lines.push(`(In the preview I had ${heard.join(', ')}.)`)
  lines.push('Show me the new card with show_beat_card.')
  return lines.join('\n')
}

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

  /** The scene strip: a chip per scene, the play mode and where the chain is. */
  SCENES: 'Scenes',
  sceneName,
  /** A chip's label: "Scene 2: Drop", or "Scene 3" for a scene without a name. */
  sceneChip: (index: number, name: string): string => `Scene ${index + 1}${name ? `: ${name}` : ''}`,
  PLAY_MODE: 'Play mode',
  CHAIN: 'Chain',
  SCENE: 'Scene',
  CHAIN_TITLE: 'Play the chain: each scene for its passes, then the next, looping at the end',
  SCENE_TITLE: 'Loop the selected scene',
  /** Where the chain is: "Drop · pass 2/4 · step 3/5". */
  chainPosition: (index: number, name: string, pass: number, passes: number, step: number, steps: number): string =>
    `${sceneName(index, name)} · pass ${pass}/${passes} · step ${step + 1}/${steps}`,
  /** A scene looping by hand: "Drop · on loop". */
  scenePosition: (index: number, name: string): string => `${sceneName(index, name)} · on loop`,
  /** The chain, stopped: "Chain 1x2 2x2 3", or each scene once without a chain line. */
  chainOrder: (chain: readonly BeatCardChainStep[] | null): string =>
    chain !== null && chain.length > 0 ? `Chain ${chainText(chain)}` : 'Chain: each scene once, in order',
  /** A tab's mark for a group the scene leaves out: it plays an earlier scene's pattern. */
  fromScene: (index: number): string => `from scene ${index + 1}`,
  carried: (group: string, index: number, name: string): string =>
    `This scene leaves ${group} out: it plays the pattern of ${sceneRef(index, name)}.`,
  EMPTY_SCENE: 'This scene has no sections.',

  /** The FX switch's text and tooltip; it shows only when the card has effect lines. */
  FX: 'FX',
  FX_SWITCH: "Hear the beat with the card's FX, or dry",
  /** Added to the footer note when the card has effect lines. */
  FX_NOTE: "FX are an approximation of arc's, made in the browser.",
  /** The card's effect lines under the header: "reverb 60/40 · sends A 20 B 40 · comp 40/60 · sidechain A7 → B C". */
  fxSummary: (fx: {
    readonly fx: BeatCardFx | null
    readonly sends: BeatCardSends | null
    readonly comp: BeatCardComp | 'off' | null
    readonly sidechain: BeatCardSidechain | 'off' | null
  }): string => {
    const parts: string[] = []
    if (fx.fx !== null) parts.push(fx.fx.type === 'none' ? 'no effect' : `${fx.fx.type} ${fx.fx.x}/${fx.fx.y}`)
    if (fx.sends !== null) parts.push(`sends ${Object.entries(fx.sends).map(([g, v]) => `${g} ${v}`).join(' ')}`)
    if (fx.comp !== null) parts.push(fx.comp === 'off' ? 'comp off' : `comp ${fx.comp.drive}/${fx.comp.speed}`)
    const side = fx.sidechain
    if (side === 'off') parts.push('sidechain off')
    else if (side !== null) {
      // Length and shape only when the line changed them.
      const knobs =
        side.length !== SIDECHAIN_LENGTH || side.shape !== SIDECHAIN_SHAPE ? ` ${side.length}/${side.shape}` : ''
      parts.push(`sidechain ${side.pad} → ${side.groups.join(' ')}${knobs}`)
    }
    return parts.join(' · ')
  },
  /** A shaped pad's badge on its row: "−7 st · 80%", the settings its pad line gives. */
  shapeBadge: (p: BeatCardPad): string => {
    const parts: string[] = []
    if (p.pitch !== undefined) parts.push(`${semitones(p.pitch)} st`)
    if (p.level !== undefined) parts.push(`${p.level}%`)
    if (p.pan !== undefined) parts.push(panText(p.pan))
    if (p.attack !== undefined) parts.push(`att ${p.attack}`)
    if (p.release !== undefined) parts.push(`rel ${p.release}`)
    if (p.mode !== undefined) parts.push(p.mode)
    return parts.join(' · ')
  },
  /** The badge's tooltip and label: "A4 shaping: pitch −7 semitones, level 80". */
  shapeText: (p: BeatCardPad): string => {
    const parts: string[] = []
    if (p.pitch !== undefined) parts.push(`pitch ${semitones(p.pitch)} semitones`)
    if (p.level !== undefined) parts.push(`level ${p.level}`)
    if (p.pan !== undefined) parts.push(`pan ${panText(p.pan)}`)
    if (p.attack !== undefined) parts.push(`attack ${p.attack}`)
    if (p.release !== undefined) parts.push(`release ${p.release}`)
    if (p.mode !== undefined) parts.push(`mode ${p.mode}`)
    return `${p.pad} shaping: ${parts.join(', ')}`
  },

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
  REGENERATE: 'Regenerate',
  IMPROVE: 'Improve',
  FIX: 'Fix errors',
  TWEAKS_LABEL: 'Quick changes',
  /** One-tap changes in the Ask panel: the chip's label and the request it sends. */
  TWEAKS: [
    { label: 'Busier hats', request: 'busier hats' },
    { label: 'Add a fill', request: 'add a fill in the last bar' },
    { label: 'Simpler', request: 'make it simpler' },
    { label: 'More swing', request: 'more swing' },
    { label: 'Half-time', request: 'half-time feel' },
    { label: 'Add a bassline', request: 'add a bassline' },
  ] as readonly { readonly label: string; readonly request: string }[],
  tweakAria: (request: string): string => `Ask Claude: ${request}`,
  /** The message the view sends: the user's request plus what they changed while listening. */
  askMessage: (name: string, request: string, heard: string[]): string =>
    message(`Please change the ARC BEAT card${quoted(name)}: ${request.trim()}`, heard),
  /** Regenerate: a new take on the same idea. */
  regenerateMessage: (name: string, heard: string[]): string =>
    message(`Please write a new take on the ARC BEAT card${quoted(name)}: same tempo and feel, a different pattern.`, heard),
  /** Improve: the arc-beats skill's ANALYSE job, then a better card. */
  improveMessage: (name: string, heard: string[]): string =>
    message(
      `Please improve the ARC BEAT card${quoted(name)}: make it groove and sound more finished, and tell me in one line each what you changed.`,
      heard,
    ),
  /** Fix errors: the card's errors by line, at most FIX_MAX of them. */
  fixMessage: (name: string, errors: readonly { line: number; msg: string }[]): string => {
    const shown = errors.slice(0, FIX_MAX).map((e) => `line ${e.line}: ${e.msg}`)
    if (errors.length > FIX_MAX) shown.push(`and ${errors.length - FIX_MAX} more`)
    return message(`Please fix the ARC BEAT card${quoted(name)}: ${shown.join('; ')}`, [])
  },
  heardTempo: (n: number): string => `tempo ${n}`,
  heardSwing: (n: number): string => `swing ${n}`,
  heardMuted: (pads: string[]): string => `${pads.join(' ')} muted`,
  heardSolo: (pads: string[]): string => `${pads.join(' ')} soloed`,
  HEARD_FX_OFF: 'the FX off',
  /** The scene heard, for a card of several: looped by hand, or where the chain was. */
  heardScene: (index: number, name: string): string => `${sceneRef(index, name)} on loop`,
  heardChain: (index: number, name: string): string => `the chain playing, at ${sceneRef(index, name)}`,
} as const
