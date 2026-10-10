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
// - `Change` is a plain interface (`ClaudeText.isSame` is the Kotlin `same`); the FX sheet's texts take FxSettings values.

import type { CardFx, CardProblem } from '../features/beatCard'
import { FxSettings, FxType } from '../features/fxSettings'
import type { PadSettings } from '../features/padSettings'
import { physicalPad, type PhysicalPad } from '../features/padNotes'
import { FeatureText } from './featureText'
import { plural } from './format'
import { MirrorText } from './mirrorText'

const groupLetter = (group: number) => String.fromCharCode(65 + group)

/** A row of the FX or pad shaping blocks: what it is ([label]), and its value [old] and [new]. */
export interface Change {
  readonly label: string
  readonly old: string
  readonly new: string
}

/** One setting of a pad's shaping row: its [name] ("Pitch"), and its value [old] and [new] ("0", "+2"). */
export interface PadPart {
  readonly name: string
  readonly old: string
  readonly new: string
}

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

// The words the factory blocks (FeatureText.FACTORY_BLOCKS, in order) go by in the sound list's note.
const FACTORY_WORDS = ['kicks', 'snares', 'hats', 'percussion', 'bass', 'melodic']

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
    'Keep its sound, FX and pad lines, or choose sounds from my sound list if one follows the card:',
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
   * The line after the header when some listed name is a slot's file name ("200.pcm"): the EP-133 keeps its factory
   * sounds without names, so the slot says what a sound is. "Names like 200.pcm are factory sounds the EP-133 keeps
   * without a name. By slot: kicks 1-99, snares 100-199, ..., melodic 500-599."
   */
  UNNAMED_SOUNDS_NOTE:
    'Names like 200.pcm are factory sounds the EP-133 keeps without a name. By slot: ' +
    FeatureText.FACTORY_BLOCKS.map(([from, to], i) => `${FACTORY_WORDS[i]} ${from}-${to}`).join(', ') +
    '.',

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

  /**
   * The small line under a sound the EP-133 lists without a name ("200.pcm"), used by its slot: "Card says HH CLOSED · name not
   * checked" ([name] is the card's).
   */
  cardSays(name: string): string {
    return `Card says ${name} \u00B7 name not checked`
  },

  /** Under the rows when no sound line of the card is on the user's EP-133. */
  NONE_ON_DEVICE: 'None of these sounds are on your EP-133. Share a beat with your sound list so Claude picks from yours.',

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

  /**
   * The note under the rows, connected: [pads] ticked, in [project] (null while it isn't known). With [keeps] some
   * ticked pad has no sound yet, and UNDO can't empty it again: it keeps the new one.
   */
  soundsNote(pads: number, project: number | null, keeps = false): string {
    return (
      `Writes ${plural(pads, 'pad')} in ${project != null ? `project ${project}` : 'the active project'} on the EP-133. ` +
      "Their pitch, level and other settings reset to the sound's. UNDO puts the old sounds back" +
      (keeps ? ', but a pad that had none keeps its new one.' : '.')
    )
  },

  /** The same, offline: the changes are Arc's own until the EP-133 connects. */
  SOUNDS_OFFLINE_NOTE: 'Saved as offline pad changes; they go to the EP-133 when you reconnect.',

  // ---------- Silent pads ----------
  /**
   * The comment a share carries right after the card's header when Arc knows the pads: the pads the card uses that have no
   * sound, in keypad order for each group ("# no sound on: C7 D7"). Readers ignore comments; Claude reads it.
   */
  noSoundOn(pads: readonly PhysicalPad[]): string {
    return '# no sound on: ' + pads.map(padLabel).join(' ')
  },

  /** The SILENT PADS block's header, and its row: "D7 · 12 notes, no sound: they will be silent". */
  SILENT_PADS: 'Silent pads',
  silentRow(pad: PhysicalPad, notes: number): string {
    return `${padLabel(pad)} \u00B7 ${plural(notes, 'note')}, no sound: ${notes === 1 ? 'it' : 'they'} will be silent`
  },

  /** The row's keys: PICK SOUND opens the picker, CHANGE (once a sound is picked) opens it again. */
  PICK_SOUND: 'Pick sound',
  CHANGE_PICK: 'Change',

  /** Under the block: what a sound picked here does. */
  SILENT_NOTE: "A pad with no sound plays nothing. Pick a sound for it: it goes on the pad with IMPORT, with the card's other sounds.",

  /** A silent row for screen readers: "D7: 12 notes, no sound, they will be silent", and once picked "D7: will get 512 PIANO". */
  silentRowName(pad: PhysicalPad, notes: number): string {
    return `${padLabel(pad)}: ${plural(notes, 'note')}, no sound, ${notes === 1 ? 'it' : 'they'} will be silent`
  },
  pickedRowName(pad: PhysicalPad, sound: string): string {
    return `${padLabel(pad)}: will get ${sound}`
  },
  pickSoundName(pad: PhysicalPad): string {
    return `Pick a sound for ${padLabel(pad)}`
  },
  changePickName(pad: PhysicalPad, sound: string): string {
    return `Pick another sound for ${padLabel(pad)}, now ${sound}`
  },

  /** The picker's title, the line under it, the note under the list, and the key back to the card. */
  pickTitle(pad: PhysicalPad): string {
    return `Sound for ${padLabel(pad)}`
  },
  pickLine(notes: number): string {
    return `${plural(notes, 'note')} of the card play on this pad.`
  },
  PICK_NOTE: 'The sound goes on the pad with IMPORT, in the same step as the card. UNDO takes the patterns back; connected, the pad keeps the sound.',
  PICK_BACK: 'Back to the card',

  /** A picked sound's row in SOUNDS: what the pad has now ("No sound", struck through) and the small line that says who chose it. */
  NO_SOUND: 'No sound',
  PICKED_HERE: 'Picked here',

  // ---------- The sheet: FX and pad shaping ----------
  /** The FX block's header, and the switch beside it that decides whether the card's FX replace the project's (on to begin with). */
  FX: 'FX',
  APPLY_FX: 'Apply FX',
  applyFxName(on: boolean): string {
    return on ? "Apply the card's FX to this project" : "Leave this project's FX as they are"
  },

  /** Under the FX rows: they replace this project's FX in Arc and play on the phone. */
  FX_BLOCK_NOTE: "Replaces this project's FX on the phone (the EP-133's own FX don't change). UNDO puts the old FX back.",

  /** The pad shaping rows' header: each pad's pitch, level, pan, attack, release or mode, old to new, ticked to be applied. */
  PAD_SHAPING: 'Pad shaping',

  /** Under the pad shaping rows, connected and offline. */
  PAD_SHAPING_NOTE: "Writes the ticked pads' settings on the EP-133. UNDO puts the old ones back.",
  PAD_SHAPING_OFFLINE_NOTE: 'Saved as offline pad settings; they go to the EP-133 when you reconnect.',

  /** What a row says when the project has the card's value already. */
  ALREADY_SET: 'Already set',

  /** What a pad shaping row says when the pad has no sound to shape (and no sound row of the card is going onto it). */
  PAD_NO_SOUND: 'No sound on this pad',

  /** A pad shaping row for screen readers: "A9: Pitch 0 becomes Pitch 2", "A9: already set", "A9: no sound on this pad". */
  padRowName(c: Change | null, pad: PhysicalPad, noSound: boolean): string {
    if (noSound) return `${padLabel(pad)}: ${ClaudeText.PAD_NO_SOUND.toLowerCase()}`
    return c === null ? `${padLabel(pad)}: ${ClaudeText.ALREADY_SET.toLowerCase()}` : ClaudeText.changeName(c)
  },

  /** Whether the card leaves a row as it is: it says [ALREADY_SET] and has no tick box. */
  isSame(c: Change): boolean {
    return c.old === c.new
  },

  /** The FX rows' labels. */
  FX_EFFECT: 'Effect',
  FX_SENDS: 'Sends',
  FX_COMP: 'Comp',
  FX_DUCK: 'Duck',

  /** The master effect as a row says it: "DISTORTION \u00B7 DRIVE 12.3x \u00B7 LP 20", "OFF" for none. */
  fxEffectText(s: FxSettings): string {
    if (s.type === FxType.NONE) return MirrorText.fxName(FxType.NONE).toUpperCase()
    return `${MirrorText.fxName(s.type).toUpperCase()} \u00B7 ${FxSettings.xLabel(s.type)} ${FxSettings.xReadout(s.type, s.x)} \u00B7 ${FxSettings.yReadout(s.type, s.y)}`
  },

  /** The four sends as a row says them, the groups above 0 in percent: "A 80% \u00B7 B 20% \u00B7 C 0 \u00B7 D 0". */
  fxSendsText(s: FxSettings): string {
    return s.sends
      .map((v, g) => {
        const p = Math.round(Math.fround(v * 100))
        return `${groupLetter(g)} ` + (p > 0 ? `${p}%` : '0')
      })
      .join(' \u00B7 ')
  },

  /** The master compressor: "OFF", or "ON \u00B7 DRIVE 2.1x \u00B7 5/150" (drive and speed as the XY pad reads them). */
  fxCompText(s: FxSettings): string {
    if (!s.comp.on) return MirrorText.onOff(false).toUpperCase()
    return `${MirrorText.onOff(true).toUpperCase()} \u00B7 ${FxSettings.xLabel(FxType.COMPRESSOR)} ${FxSettings.xReadout(FxType.COMPRESSOR, s.comp.x)} \u00B7 ${FxSettings.yReadout(FxType.COMPRESSOR, s.comp.y)}`
  },

  /** The sidechain, in words: "OFF", or "A7 ducks B C \u00B7 180 ms \u00B7 SNAP 40" (the FX sheet's length and shape). */
  fxSidechainText(s: FxSettings): string {
    const sc = s.sidechain
    if (!sc.on || (sc.dests & FxSettings.ALL_GROUPS) === 0) return MirrorText.onOff(false).toUpperCase()
    const groups = [0, 1, 2, 3].filter((g) => (sc.dests & (1 << g)) !== 0).map(groupLetter).join(' ')
    return `${padLabel(physicalPad(sc.group, sc.pad))} ducks ${groups} \u00B7 ${MirrorText.sidechainLength(sc.x)} \u00B7 ${MirrorText.sidechainShape(sc.y)}`
  },

  /**
   * The FX rows for a card that sets the kinds [fx] gives, from the project's [old] FX to [now] (the card applied,
   * BeatCards.applyFx): the effect, sends, comp and duck, in that order, each only when the card has a line for it. A row
   * the project has already (`isSame`) is kept, to say so.
   */
  fxRows(old: FxSettings, now: FxSettings, fx: CardFx): Change[] {
    const rows: Change[] = []
    if (fx.type !== null) rows.push({ label: ClaudeText.FX_EFFECT, old: ClaudeText.fxEffectText(old), new: ClaudeText.fxEffectText(now) })
    if (fx.sends !== null) rows.push({ label: ClaudeText.FX_SENDS, old: ClaudeText.fxSendsText(old), new: ClaudeText.fxSendsText(now) })
    if (fx.comp !== null) rows.push({ label: ClaudeText.FX_COMP, old: ClaudeText.fxCompText(old), new: ClaudeText.fxCompText(now) })
    if (fx.sidechain !== null) rows.push({ label: ClaudeText.FX_DUCK, old: ClaudeText.fxSidechainText(old), new: ClaudeText.fxSidechainText(now) })
    return rows
  },

  /**
   * The settings of a pad that differ from [old] to [now], as the pad sheet reads them, in the sheet's order. Only pitch,
   * level, pan, attack, release and mode count (the card carries no more). Empty when none differs.
   */
  padParts(old: PadSettings, now: PadSettings): PadPart[] {
    const parts: PadPart[] = []
    if (old.pitch !== now.pitch) parts.push({ name: MirrorText.PITCH, old: MirrorText.pitchLabel(old.pitch), new: MirrorText.pitchLabel(now.pitch) })
    if (old.level !== now.level) parts.push({ name: MirrorText.LEVEL, old: MirrorText.levelLabel(old.level), new: MirrorText.levelLabel(now.level) })
    if (old.pan !== now.pan) parts.push({ name: MirrorText.PAN, old: MirrorText.panLabel(old.pan), new: MirrorText.panLabel(now.pan) })
    if (old.attack !== now.attack) parts.push({ name: MirrorText.ATTACK, old: MirrorText.envLabel(old.attack), new: MirrorText.envLabel(now.attack) })
    if (old.release !== now.release) parts.push({ name: MirrorText.RELEASE, old: MirrorText.envLabel(old.release), new: MirrorText.envLabel(now.release) })
    if (old.mode !== now.mode) parts.push({ name: MirrorText.MODE, old: MirrorText.modeLabel(old.mode), new: MirrorText.modeLabel(now.mode) })
    return parts
  },

  /** A pad's shaping row as text, if the card changes it: the pad ("A7"), "Pitch 0 \u00B7 Level 100" to "Pitch -7 \u00B7 Level 90". */
  padChange(pad: PhysicalPad, old: PadSettings, now: PadSettings): Change | null {
    const parts = ClaudeText.padParts(old, now)
    if (parts.length === 0) return null
    return { label: padLabel(pad), old: parts.map((p) => `${p.name} ${p.old}`).join(' \u00B7 '), new: parts.map((p) => `${p.name} ${p.new}`).join(' \u00B7 ') }
  },

  /** A row for screen readers: "Effect: OFF becomes REVERB \u00B7 SIZE 50% \u00B7 FLAT", "A7: Pitch 0 becomes Pitch -7", or "Comp: OFF, already set". */
  changeName(c: Change): string {
    return ClaudeText.isSame(c) ? `${c.label}: ${c.new}, ${ClaudeText.ALREADY_SET.toLowerCase()}` : `${c.label}: ${c.old} becomes ${c.new}`
  },

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
   * and so are the [skipped] ones that had no pad to go on. The card's [fx]
   * applied and the [pads] shaped are named after them, and the [padsSkipped] that could not be.
   */
  imported(places: readonly (readonly [number, number])[], scene: string | null, sounds = 0, skipped = 0, fx = false, pads = 0, padsSkipped = 0): string {
    const where = scene != null ? `scene ${scene}` : places.map(([g, n]) => place(g, n)).join(', ')
    let extra = ''
    if (sounds > 0 && skipped > 0) extra = ` and ${plural(sounds, 'sound')}, ${skipped} skipped`
    else if (sounds > 0) extra = ` and ${plural(sounds, 'sound')}`
    else if (skipped > 0) extra = `, ${plural(skipped, 'sound')} skipped`
    const applied = [fx ? ClaudeText.FX : null, pads > 0 ? plural(pads, 'pad setting') : null].filter((x) => x !== null).join(' and ')
    const shaping = [applied === '' ? null : `${applied} applied`, padsSkipped > 0 ? `${plural(padsSkipped, 'pad setting')} skipped` : null].filter((x) => x !== null)
    return `Imported to ${where}${extra}.` + (shaping.length === 0 ? '' : ` ${shaping.join(', ')}.`) + ' UNDO takes it back.'
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

  /**
   * After UNDO took an import back, what was put back: the old sounds on [back] pads, with the [empty] ones that had none
   * before (they can't be emptied again), the old settings on [shaped] pads, and the old FX ([fx]). Sounds first. When
   * nothing of that was put back (the shaped pads were turned since), it only says the import is taken back.
   */
  importUndone(back: number, empty: number, shaped: number, fx: boolean): string {
    const parts: string[] = []
    if (back > 0 || empty > 0) parts.push(ClaudeText.soundsRestored(back, empty).replace(/\.$/, ''))
    if (shaped > 0) parts.push(`old settings back on ${plural(shaped, 'pad')}`)
    if (fx) parts.push('old FX back')
    if (parts.length === 0) return 'Import taken back.'
    const text = parts.join(', ')
    return text.charAt(0).toUpperCase() + text.slice(1) + '.'
  },

  /**
   * IMPORT's toast when a pad's settings couldn't be written: [reason], then what stays: the patterns, the pads
   * [written] so far, and the FX if they went on.
   */
  shapingFailed(reason: string, written: number, fx: boolean): string {
    return MirrorText.padSettingsFailed(reason) + '. The patterns stay imported' + (fx ? ', the FX applied' : '') + (written > 0 ? ` and ${plural(written, 'pad')} shaped` : '') + '. UNDO takes it back.'
  },
} as const
