// Port of core/src/main/kotlin/dev/arc/ep133/text/ClaudeText.kt
//
// Live tools' CLAUDE section and the beat card sheet (an addition): sharing a
// pattern or a scene to Claude as an ARC BEAT card, and pasting Claude's card
// back in. The card's own text is the spec's (skill/arc-beats); these are the
// words around it.
//
// Web deltas:
// - [places] in `imported` are [group, number] tuples where the Kotlin has Pairs.
// - CANCEL is Strings.CANCEL and the new scene's words are MirrorText's, as in
//   the Kotlin.

import type { CardProblem } from '../features/beatCard'
import type { PhysicalPad } from '../features/padNotes'
import { FeatureText } from './featureText'
import { plural } from './format'
import { MirrorText } from './mirrorText'

const groupLetter = (group: number) => String.fromCharCode(65 + group)

function twoDigits(n: number): string {
  return String(n).padStart(2, '0')
}

/** "A · 01": [group]'s pattern [n], as the keys and rows say it. */
function place(group: number, n: number): string {
  return `${groupLetter(group)} · ${twoDigits(n)}`
}

/** A pad's row on the grid: "A7", and "AE" for ENTER (as the card writes it). */
function padLabel(pad: PhysicalPad): string {
  return `${pad.groupLetter}${pad.offset === 2 ? 'E' : pad.label}`
}

const NOTHING_TO_SHARE = ', no notes yet'

export const ClaudeText = {
  // ---------- Live tools: the CLAUDE section ----------
  CLAUDE: 'Claude',

  /** The notes behind the info key after CLAUDE: what a beat card is, and how to give Claude the skill. */
  INFO_CARDS:
    'A beat card is a beat as plain text: the tempo, the swing and a row of steps for each pad, named by its sound. ' +
    'Claude reads one to analyse or improve it, and writes one back. Pasting it brings it into Arc as a new pattern.',
  INFO_SKILL:
    'Claude knows the cards through the arc-beats skill. In the Claude app, download its zip below, then open ' +
    'claude.ai → Settings → Capabilities → Skills and upload it. In Claude Code, put the arc-beats folder in ~/.claude/skills.',

  /** The card's title and its one-line hint. */
  BEAT_CARDS: 'Beat cards',
  BEAT_HINT: "Share a beat to Claude to analyse or improve it. Paste Claude's card to get it back as a new pattern.",

  /** SHARE SCENE S02: the scene playing, its four patterns (the blank ones left out). [scene] is its label, "S02". */
  shareScene(scene: string): string {
    return `Share scene ${scene}`
  },

  /** SHARE A · 01: the playing pattern of the group shown. */
  sharePattern(group: number, n: number): string {
    return `Share ${place(group, n)}`
  },

  PASTE_BEAT: 'Paste beat',

  /** The keys for screen readers: what they share, or that there is nothing to. */
  shareSceneName(scene: string, empty: boolean): string {
    return `Share scene ${scene} with Claude` + (empty ? NOTHING_TO_SHARE : '')
  },
  sharePatternName(group: number, n: number, empty: boolean): string {
    return `Share ${place(group, n)} with Claude` + (empty ? NOTHING_TO_SHARE : '')
  },
  PASTE_BEAT_NAME: 'Paste a beat card from the clipboard',
  NOTHING_TO_SHARE,

  /** The two links under the card. */
  GET_SKILL: 'Get the arc-beats skill',
  LEARN: 'Learn with Claude',

  /** Where the skill's zip is (the web app's public folder). */
  SKILL_URL: 'https://arc-pi-mauve.vercel.app/arc-beats-skill.zip',

  /** What Learn with Claude shares, to be sent to the Claude app as the first message. */
  LEARN_PROMPT: 'Use the arc-beats skill. Teach me the EP-133 K.O. II from lesson 1, one step at a time. I use the Arc app on Android.',
  LEARN_TITLE: 'Learn the EP-133 with Claude',

  /** Said when no app can take the link or the text. */
  NO_APP: 'No app can open that.',

  // ---------- Sharing ----------
  /** The line before the card in the shared text. */
  SHARE_PROMPT:
    'Analyse this EP-133 beat from Arc with the arc-beats skill, then suggest 2-3 edits as a new card. ' +
    'Keep its sound lines, or choose sounds from my sound list if one follows the card:',
  SHARE_TITLE: 'Share beat card',

  /** "P01 S02": pattern [n] (1..99) of the scene at [scene] (from 0), a card's name. */
  patternCardName(n: number, scene: number): string {
    return `P${twoDigits(n)} S${twoDigits(scene + 1)}`
  },

  /** "S02": a scene's card, whose patterns have numbers of their own. */
  sceneCardName(scene: number): string {
    return `S${twoDigits(scene + 1)}`
  },

  /** The share's subject: "Arc beat P01 S02". */
  shareSubject(cardName: string): string {
    return `Arc beat ${cardName}`
  },

  /** The shared text: [prompt], a blank line and [card] (which ends in a newline) in a fenced block. */
  shareText(prompt: string, card: string): string {
    return prompt + '\n\n```\n' + card + '```\n'
  },

  // ---------- The sound list ----------
  /** Where the sound list Arc adds after a shared card came from: the EP-133 itself, its last read, or the factory pack. */
  SOUNDS_FROM_DEVICE: 'the EP-133',
  SOUNDS_FROM_LAST_READ: 'the last read',
  SOUNDS_FROM_FACTORY: 'the factory pack',

  /** The line before the sound list (the spec's): "My EP-133's sounds (slot name), from the EP-133:". [source] is one of the three above. */
  soundListHeader(source: string): string {
    return `My EP-133's sounds (slot name), from ${source}:`
  },

  /**
   * The tick box under the share keys: "With my sound list · 212 sounds" ([count] is how many Arc knows: the EP-133's,
   * the last read's or the factory pack's). Off, the card is shared with its sound lines alone.
   */
  withSoundList(count: number): string {
    return `With my sound list \u00B7 ${plural(count, 'sound')}`
  },

  // ---------- Receiving ----------
  /** A text with no ARC BEAT line in it: from PASTE BEAT, or shared to Arc. */
  NO_CARD: 'No beat card in that text.',

  // ---------- The sheet ----------
  /** The title when the card has no name. */
  CARD: 'Beat card',

  /** "Beat card · 4 bars · 5 pads · 23 hits": under the title; [bars] is the longest section's (the scene loops over it). */
  summary(bars: number, pads: number, hits: number): string {
    return `Beat card · ${plural(bars, 'bar')} · ${plural(pads, 'pad')} · ${plural(hits, 'hit')}`
  },

  place,

  /** A section's heading: "Group A · 2 bars · 1/16" (its group, length and the step its grid reads in). */
  sectionTitle(group: number, bars: number, step: string): string {
    return `Group ${groupLetter(group)} · ${plural(bars, 'bar')} · ${step}`
  },

  /** What a long pattern shows: the first bars, and "+3 bars" for the rest. */
  moreBars(n: number): string {
    return `+${plural(n, 'bar')}`
  },

  padLabel,

  /** That row for screen readers: "A7 kick: 4 hits", "A enter: 1 hit". */
  rowName(pad: PhysicalPad, name: string | null, hits: number): string {
    const label = pad.offset === 2 ? `${pad.groupLetter} enter` : padLabel(pad)
    return label + (name != null ? ` ${name}` : '') + ': ' + plural(hits, 'hit')
  },

  /** The grid for screen readers: "Group A, 2 bars, 1/16, 3 pads". */
  gridName(group: number, bars: number, step: string, pads: number): string {
    return `Group ${groupLetter(group)}, ${plural(bars, 'bar')}, ${step}, ${plural(pads, 'pad')}`
  },

  /** "Goes to  A · 04 (next free)": where a section's pattern lands. */
  GOES_TO: 'Goes to',
  goesTo(group: number, n: number): string {
    return `${place(group, n)} (next free)`
  },

  // "New scene  S03": the scene a card of several groups adds is MirrorText.NEW_SCENE and MirrorText.sceneLabel.

  /** "Tempo  92": the card's tempo, whole BPM; and the chip that sets it, "SET · NOW 122" ([now] is Arc's). */
  TEMPO: 'Tempo',
  tempoChip(now: number): string {
    return `Set · now ${now}`
  },
  tempoChipName(card: string, now: number, on: boolean): string {
    return on ? `Set the tempo to ${card}, now ${now}` : `Keep the tempo at ${now}, the card says ${card}`
  },

  /** "Swing 58 · placed in the notes": the swing is already in where the hits sit, so nothing is set. */
  swingLine(swing: number): string {
    return `Swing ${swing} · placed in the notes`
  },

  /** A problem as listed: "Line 7: Unknown word 'foo', ignored." */
  problemLine(p: CardProblem): string {
    return `Line ${p.line}: ${p.message}`
  },

  /** A problem for screen readers: "Error, line 7: ..." / "Warning, line 7: ...". */
  problemName(p: CardProblem): string {
    const line = ClaudeText.problemLine(p)
    return (p.error ? 'Error' : 'Warning') + ', ' + line.charAt(0).toLowerCase() + line.slice(1)
  },

  COPY_PROBLEMS: 'Copy problems',
  PROBLEMS_COPIED: 'Problems copied. Paste them to Claude.',

  /** What COPY PROBLEMS copies, for Claude to read: each problem with its line (counted in the card as pasted). */
  problemsReport(problems: readonly CardProblem[]): string {
    return (
      'Arc found problems in the beat card:\n' +
      problems.map((p) => `- Line ${p.line} (${p.error ? 'error' : 'warning'}): ${p.message}\n`).join('') +
      'Please fix them and send the whole card again.'
    )
  },

  // ---------- The sheet: sounds ----------
  /** The block's header, and the chip beside it that decides whether the ticked sounds go onto the pads (on to begin with). */
  SOUNDS: 'Sounds',
  PUT_ON_PADS: 'Put on pads',
  putOnPadsName(on: boolean, count: number): string {
    return on ? `Put ${plural(count, 'sound')} on the pads` : "Leave the pads' sounds as they are"
  },

  /** A sound as the rows write it: "012 Micro kick", just "012" when the card or the list gives no name. */
  soundName(slot: number, name: string | null): string {
    return FeatureText.slot(slot) + (name != null ? ` ${name}` : '')
  },

  /** What a row says in place of a new sound: the pad plays it already. */
  ALREADY_THERE: 'Already there',

  /** What a row says when the sound is nowhere in the user's list: "Not on your EP-133: 301 Rim dusty". */
  soundMissing(slot: number, name: string | null): string {
    return `Not on your EP-133: ${ClaudeText.soundName(slot, name)}`
  },

  /** A row for screen readers: "A7: Kick dusty becomes 012 Micro kick", "A7: 012 Micro kick, already there", or the missing reason. */
  soundRowName(pad: PhysicalPad, old: string | null, change: string): string {
    return `${padLabel(pad)}: ` + (old != null ? `${old} becomes ` : '') + change
  },
  soundRowSame(pad: PhysicalPad, sound: string): string {
    return `${padLabel(pad)}: ${sound}, ${ClaudeText.ALREADY_THERE.toLowerCase()}`
  },
  soundRowMissing(pad: PhysicalPad, slot: number, name: string | null): string {
    return `${padLabel(pad)}: ${ClaudeText.soundMissing(slot, name)}`
  },

  /** The note under the rows, connected: [pads] ticked, in [project] (null while it isn't known). */
  soundsNote(pads: number, project: number | null): string {
    return (
      `Writes ${plural(pads, 'pad')} in ${project != null ? `project ${project}` : 'the active project'} on the EP-133. ` +
      "Their pitch, level and other settings reset to the sound's. UNDO puts the old sounds back."
    )
  },

  /** The same, offline: the changes are Arc's own until the EP-133 connects. */
  SOUNDS_OFFLINE_NOTE: 'Saved as offline pad changes; they go to the EP-133 when you reconnect.',

  // CANCEL is Strings.CANCEL.
  IMPORT: 'Import',

  /** The reason IMPORT is off when the card can't be read (its errors are listed), and when a group is full. */
  FIX_ERRORS: 'Fix the errors to import this card.',
  groupFull(group: number): string {
    return `Group ${groupLetter(group)} has no free pattern.`
  },

  /**
   * IMPORT's toast: where it went, and how to take it back. One pattern is
   * named; several go in the scene they made ([scene], "S03"), or are listed
   * where there was no room for a scene. [sounds] put on pads are counted,
   * and so are the [skipped] ones that had no pad to go on.
   */
  imported(places: readonly (readonly [number, number])[], scene: string | null, sounds = 0, skipped = 0): string {
    const where = scene != null ? `scene ${scene}` : places.map(([g, n]) => place(g, n)).join(', ')
    let extra = ''
    if (sounds > 0 && skipped > 0) extra = ` and ${plural(sounds, 'sound')}, ${skipped} skipped`
    else if (sounds > 0) extra = ` and ${plural(sounds, 'sound')}`
    else if (skipped > 0) extra = `, ${plural(skipped, 'sound')} skipped`
    return `Imported to ${where}${extra}. UNDO takes it back.`
  },

  /**
   * IMPORT's toast when a pad's sound couldn't be written ([reason]): the patterns stay in, with the [written] pads
   * that did change, and UNDO takes all of it back.
   */
  soundsFailed(reason: string, written: number): string {
    return MirrorText.assignFailed(reason) + '. The patterns stay imported' + (written > 0 ? ` and ${plural(written, 'pad')} changed` : '') + '. UNDO takes it back.'
  },

  /** After UNDO took an import back: the old sounds on [back] pads again, and the [empty] ones that had none before can't be emptied again. */
  soundsRestored(back: number, empty: number): string {
    return `Old sounds back on ${plural(back, 'pad')}` + (empty > 0 ? `, ${empty} had none before` : '') + '.'
  },
} as const
