// Port of core/src/main/kotlin/dev/arc/ep133/text/ShareText.kt
//
// The text "Copy for Claude" puts on the clipboard (an addition to the web
// version), in the form the arc-beats skill reads:
//
// - kit(): a project's pads as an ARC BEAT card holding only `sound` lines
//   (`sound A7 12 Kick`, one section per group), with a `# no sound on: …`
//   comment for the empty pads, then the sound list after the card's fence.
// - sounds(): a backup's sound list on its own.
// - compare(): what changed between two backups, one `+`, `-` or `~` line each.
//
// The sound list is the skill's: a line `My EP-133's sounds (slot name), from
// …:` and one `slot name` line for each sound, in slot order. Long lists are
// cut, and a `#` line says how many were left out, so a share stays a few
// thousand characters (a full EP-133 is under 20k).
//
// Pad labels: a project file numbers its pads (pads/a/p01 …), and community
// notes disagree on how those numbers map to the keys (see PadOrder). The
// labels here follow the same pad order setting as Live, and the share says so.
//
// Web delta: the names maps are ReadonlyMap; Kotlin's trim() is ktTrim.

import type { PadOrder } from '../features/padPush'
import { ChangeKind, type PakCompareResult } from '../features/pakCompare'
import type { PadGroup } from '../features/projectPads'
import { LABELS } from '../features/padNotes'
import { ktTrim } from '../util/kotlinText'
import { FeatureText } from './featureText'
import { plural } from './format'
import { Strings } from './strings'

/** At most this many `slot name` lines in a sound list. */
const MAX_SOUNDS = 400
/** At most this many change lines in a compare. */
const MAX_CHANGES = 150

/** Keypad offsets (PadNotes.LABELS) of pad files 1-12 counted from the top: p01 is 7, p10 is '.'. */
const FROM_TOP: readonly number[] = [9, 10, 11, 6, 7, 8, 3, 4, 5, 0, 1, 2]

/**
 * A name as a card keeps it (the skill's clean_text, beatCard.ts cleanText):
 * no #, | or line breaks, single spaces. A ' #' would start a comment and cut
 * a sound line's name short, so the sound list is cleaned the same way and the
 * two agree.
 */
function clean(name: string): string {
  return ktTrim(name.replace(/[#|\t\r\n\u00a0 ]+/g, ' '))
}

/** The keypad offset (0-11) of pad file [pad], or null outside 1-12. */
function offsetOf(pad: number, order: PadOrder): number | null {
  if (pad < 1 || pad > 12) return null
  return order === 'FROM_TOP' ? FROM_TOP[pad - 1]! : pad - 1
}

/** "A7", "A." or "AE" (ENTER) for a pad of group a-d; null for anything else. */
function padLabel(group: string, pad: number, order: PadOrder): string | null {
  const g = ['a', 'b', 'c', 'd'].indexOf(group)
  const offset = offsetOf(pad, order)
  if (g < 0 || offset === null) return null
  const label = LABELS[offset]!
  return String.fromCharCode(65 + g) + (label === 'ENTER' ? 'E' : label)
}

/** Where a pad sits on the keypad, top row first (7 8 9 / 4 5 6 / 1 2 3 / . 0 E). */
function keypadRank(offset: number): number {
  return FROM_TOP.indexOf(offset)
}

function header(what: string, version: string): string {
  return `${what}, shared from arc ${version}`
}

function padOrderNote(order: PadOrder): string {
  const way = order === 'FROM_TOP' ? 'from the top (pad file 1 is 7)' : 'from the bottom (pad file 1 is .)'
  return `Pads are named by arc's pad order setting, ${way}; community notes disagree on it.`
}

/** "My EP-133's sounds (slot name), from the EP-133:" and its lines, cut at MAX_SOUNDS. */
function soundList(names: ReadonlyMap<number, string>, from: string): string[] {
  const slots = [...names.keys()].sort((a, b) => a - b)
  const out = [`My EP-133's sounds (slot name), from ${from}:`]
  if (slots.some((s) => /^[0-9]{1,3}\.pcm$/i.test(clean(names.get(s)!)))) out.push(ShareText.FACTORY_NAMES)
  for (const s of slots.slice(0, MAX_SOUNDS)) out.push(slotName(s, names.get(s)!))
  if (slots.length > MAX_SOUNDS) out.push(ShareText.leftOut(slots.length - MAX_SOUNDS, 'sound'))
  return out
}

/** "12 Kick", or "12" for a sound with no name. */
function slotName(slot: number, name: string): string {
  const n = clean(name)
  return n === '' ? String(slot) : `${slot} ${n}`
}

/** A pad's side of a pad change: "1 kick", "1" when the name is not known, or "empty". */
function side(slot: number | null, names: ReadonlyMap<number, string>): string {
  if (slot === null) return 'empty'
  return slotName(slot, names.get(slot) ?? '')
}

export const ShareText = {
  /** The key on the pads sheet, a backup's contents and the compare screen. */
  COPY: 'Copy for Claude',
  COPIED: 'Copied. Paste it into a chat with Claude.',
  /** Where the device's lists come from. */
  FROM_DEVICE: 'the EP-133',
  FACTORY_NAMES:
    'Names like 200.pcm are factory sounds the EP-133 keeps without a name. By slot: kicks 1-99, snares 100-199, hats 200-299, percussion 300-399, bass 400-499, melodic 500-599.',
  MAX_SOUNDS,
  MAX_CHANGES,

  /** 'the backup "Friday"' */
  fromBackup(title: string): string {
    return `the backup "${clean(title)}"`
  },

  /** "# 12 more sounds left out" */
  leftOut(n: number, what: string): string {
    return `# ${plural(n, `more ${what}`)} left out`
  },

  padLabel,

  /**
   * A project's pads as a card of sound lines, then the sound list [names]
   * (taken [from] the device or a backup). A pad with a slot whose sound is not
   * in a non-empty [names] gets a comment saying so; an empty pad goes in the
   * `# no sound on` comment. Pads outside groups a-d or files 1-12 are left out.
   */
  kit(
    version: string,
    project: number,
    groups: readonly PadGroup[],
    names: ReadonlyMap<number, string>,
    order: PadOrder,
    from: string,
  ): string {
    const silent: string[] = []
    const sections: string[] = []
    for (const g of groups) {
      const pads = [...g.pads.entries()]
        .filter(([pad]) => padLabel(g.name, pad, order) !== null)
        .sort((x, y) => keypadRank(offsetOf(x[0], order)!) - keypadRank(offsetOf(y[0], order)!))
      const lines: string[] = []
      for (const [pad, slot] of pads) {
        const label = padLabel(g.name, pad, order)!
        if (slot === null) {
          silent.push(label)
          continue
        }
        const name = names.get(slot)
        if (name !== undefined) lines.push(`sound ${label} ${slotName(slot, name)}`)
        else lines.push(`sound ${label} ${slot}` + (names.size > 0 ? ' # not in the sound list' : ''))
      }
      if (lines.length > 0) sections.push(`[${g.name.toUpperCase()}]`, ...lines)
    }
    const out = [header('My EP-133 kit', version), `The pads of project ${project}, from ${from}. ${padOrderNote(order)}`, '']
    if (sections.length === 0) {
      out.push(`No sound on any pad of project ${project}.`)
    } else {
      out.push('```', 'ARC BEAT 1', `name Project ${project} kit`)
      if (silent.length > 0) out.push(`# no sound on: ${silent.join(' ')}`)
      out.push(...sections, '```')
    }
    if (names.size > 0) out.push('', ...soundList(names, from))
    return out.join('\n') + '\n'
  },

  /** A backup's (or the device's) sounds as the skill's sound list. */
  sounds(version: string, names: ReadonlyMap<number, string>, from: string): string {
    const out = [header('My EP-133 sounds', version), '']
    if (names.size === 0) out.push(`No sounds in ${from}.`)
    else out.push(...soundList(names, from))
    return out.join('\n') + '\n'
  },

  /**
   * What changed between two backups: [fromTo] is the screen's line
   * (FeatureText.compareHeader), then one line for each sound or project, a
   * changed project's pads under it (named by [order]), cut at MAX_CHANGES.
   */
  compare(
    version: string,
    fromTo: string,
    r: PakCompareResult,
    oldNames: ReadonlyMap<number, string>,
    newNames: ReadonlyMap<number, string>,
    order: PadOrder,
  ): string {
    const out = [header('Two of my EP-133 backups compared', version), fromTo, '']
    if (r.nothingChanged) {
      out.push(FeatureText.NOTHING_CHANGED)
      return out.join('\n') + '\n'
    }
    const lines: string[] = []
    const sounds = (kind: ChangeKind) => r.sounds.filter((s) => s.kind === kind)
    const projects = (kind: ChangeKind) => r.projects.filter((p) => p.kind === kind)
    const section = (title: string, rows: readonly string[]): void => {
      if (rows.length > 0) lines.push(`${title}:`, ...rows)
    }
    section(FeatureText.SOUNDS_ADDED, sounds(ChangeKind.ADDED).map((s) => `+ ${slotName(s.slot, s.newName ?? '')}`))
    section(FeatureText.SOUNDS_REMOVED, sounds(ChangeKind.REMOVED).map((s) => `- ${slotName(s.slot, s.oldName ?? '')}`))
    section(
      FeatureText.SOUNDS_CHANGED,
      sounds(ChangeKind.CHANGED).map((s) => {
        const what = FeatureText.soundChange(s)
        return `~ ${slotName(s.slot, s.newName ?? '')}` + (what !== '' ? `: ${what}` : '')
      }),
    )
    section(FeatureText.PROJECTS_ADDED, projects(ChangeKind.ADDED).map((p) => `+ ${Strings.projectLine(p.project)}`))
    section(FeatureText.PROJECTS_REMOVED, projects(ChangeKind.REMOVED).map((p) => `- ${Strings.projectLine(p.project)}`))
    section(
      FeatureText.PROJECTS_CHANGED,
      projects(ChangeKind.CHANGED).flatMap((p) => {
        if (p.padChanges.length === 0) {
          // Only claim the pads kept their sounds when both layouts could be read (as the screen does).
          const what = p.padsRead ? FeatureText.PATTERNS_CHANGED : FeatureText.PROJECT_CHANGED
          return [`~ ${Strings.projectLine(p.project)}: ${what}`]
        }
        return [
          `~ ${Strings.projectLine(p.project)}:`,
          ...p.padChanges.map((c) => {
            const label = padLabel(c.group, c.pad, order) ?? `${c.group.toUpperCase()} pad ${c.pad}`
            return `  ${label} ${side(c.oldSlot, oldNames)} → ${side(c.newSlot, newNames)}`
          }),
        ]
      }),
    )
    out.push(...lines.slice(0, MAX_CHANGES))
    if (lines.length > MAX_CHANGES) out.push(ShareText.leftOut(lines.length - MAX_CHANGES, 'line'))
    const same = FeatureText.unchanged(r.sameSounds, r.sameProjects)
    if (same !== '') out.push(same)
    return out.join('\n') + '\n'
  },
} as const
