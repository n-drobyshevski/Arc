// Port of core/src/test/kotlin/dev/arc/ep133/text/TourTextTest.kt
//
// Web additions: the TS copies say exactly what the Kotlin const vals say
// (TourText.kt, the Help strings of SettingsText.kt, Strings.PLUG_IN_HINT,
// CoachText.kt), and the web rewordings (WebText.TOUR_*) follow the same rules.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CoachText } from '../../../src/core/text/coachText'
import { MirrorText } from '../../../src/core/text/mirrorText'
import { SettingsText } from '../../../src/core/text/settingsText'
import { Strings } from '../../../src/core/text/strings'
import { TourText } from '../../../src/core/text/tourText'
import { WebText } from '../../../src/core/text/webText'

const sentences = [
  TourText.WELCOME_HINT, TourText.WELCOME_STEPS, TourText.CONNECT_HINT, TourText.NEEDS_DEVICE,
  TourText.PAD_NOTE, TourText.HEAR_HINT, TourText.BACKUP_HINT, TourText.DONE_HINT, TourText.LATER_NOTE,
  SettingsText.TRY_AGAIN_NOTE, SettingsText.SHOW_NOTE, Strings.PLUG_IN_HINT,
  TourText.TOOLS_HINT, TourText.GUIDE_HINT, TourText.SECTIONS_HINT, TourText.DEVICE_HERE, TourText.OFFLINE_NOTE,
]
const labels = [
  TourText.TITLE, TourText.WELCOME_SUB, TourText.RESUME_HEAD, TourText.START, TourText.CONTINUE, TourText.NOT_NOW,
  TourText.SKIP, TourText.LATER, TourText.NEXT, TourText.PLAY_IT, TourText.RESTORE_HEAD, TourText.FIRST_TIME,
  TourText.CONNECT_HEAD, TourText.ROW_MIDI, TourText.ROW_PLUGGED, TourText.ROW_CONNECTED, TourText.PAD_HEAD,
  TourText.HEAR_HEAD, TourText.BACKUP_HEAD, TourText.NEEDS_MIDI, TourText.DONE_HEAD,
  TourText.OFFLINE, TourText.OPEN_IT, TourText.TOOLS_HEAD, TourText.GUIDE_HEAD, TourText.SECTIONS_HEAD,
  TourText.TRY_PADS, TourText.CONNECT_NOW,
]

describe('TourTextTest', () => {
  it("sentences end with a full stop, headings and keys don't", () => {
    for (const s of sentences) expect(s.endsWith('.'), s).toBe(true)
    for (const l of labels) expect(l.endsWith('.') || (l.endsWith('?') && l !== TourText.RESTORE_HEAD), l).toBe(false)
    for (const s of [...sentences, ...labels]) expect(s.includes('!'), s).toBe(false)
  })

  it("the compact cards' bodies fit two lines", () => {
    // PAD and HEAR sit in a short card over the A-D keys.
    expect((MirrorText.WAITING + ' ' + TourText.PAD_NOTE).length).toBeLessThanOrEqual(64)
    expect(TourText.HEAR_HINT.length).toBeLessThanOrEqual(64)
  })

  it('formatted text', () => {
    expect(TourText.stepOf(2, 4)).toBe('Step 2 of 4')
    expect(TourText.row(TourText.ROW_CONNECTED, true)).toBe('Connected: done')
    expect(TourText.row(TourText.ROW_MIDI, false)).toBe('MIDI allowed: not yet')
    expect(TourText.resumeHint(3, 4)).toBe('Try arc stopped at step 3 of 4.')
    // The hint names the key the card has.
    expect(TourText.CONNECT_HINT).toContain(`tap ${Strings.CONNECT}.`)
  })
})

describe('the web tour text (web)', () => {
  it('the rewordings follow the same rules, and the demo line fits the compact card', () => {
    for (const s of [WebText.TOUR_MIDI_ASK, WebText.TOUR_BACKUP_HINT, WebText.TOUR_DEMO_PAD]) {
      expect(s.endsWith('.'), s).toBe(true)
      expect(s.includes('!'), s).toBe(false)
    }
    expect(WebText.TOUR_TRY_DEMO.endsWith('.')).toBe(false)
    expect(WebText.TOUR_DEMO_PAD.length).toBeLessThanOrEqual(64)
    expect(WebText.TOUR_BACKUP_HINT).not.toContain('phone')
  })
})

// ---------- Kotlin <-> TS parity ----------

const kt = (file: string): string =>
  readFileSync(new URL(`../../../../core/src/main/kotlin/dev/arc/ep133/text/${file}`, import.meta.url), 'utf8')

/** Kotlin string literal → its value (the escapes these files use). */
function unescape(lit: string): string {
  return lit.replace(/\\(["\\$nt])/g, (_, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c))
}

/** Every `const val NAME = "…"` of a Kotlin object, by name. */
function constVals(src: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of src.matchAll(/const val ([A-Z0-9_]+)\s*=\s*"((?:[^"\\]|\\.)*)"/g)) out.set(m[1] as string, unescape(m[2] as string))
  return out
}

/** The TS object's string values, by key. */
function stringsOf(o: Record<string, unknown>): Map<string, string> {
  return new Map(Object.entries(o).filter((e): e is [string, string] => typeof e[1] === 'string'))
}

describe('Kotlin and TS say the same (web)', () => {
  it('TourText: every const val, both ways', () => {
    const k = constVals(kt('TourText.kt'))
    expect(k.size).toBeGreaterThan(20)
    expect(stringsOf(TourText)).toEqual(k)
  })

  it('SettingsText: the Help strings', () => {
    const k = constVals(kt('SettingsText.kt'))
    for (const key of ['HELP', 'TRY_AGAIN', 'TRY_AGAIN_NOTE', 'SHOW', 'SHOW_NOTE'] as const) {
      expect(SettingsText[key], key).toBe(k.get(key))
    }
  })

  it('Strings: the reworded PLUG_IN_HINT and the Connect key', () => {
    const k = constVals(kt('Strings.kt'))
    expect(Strings.PLUG_IN_HINT).toBe(k.get('PLUG_IN_HINT'))
    expect(Strings.CONNECT).toBe(k.get('CONNECT'))
  })

  it('CoachText: every const val', () => {
    const k = constVals(kt('CoachText.kt'))
    expect(k.size).toBeGreaterThan(10)
    for (const [key, value] of k) expect((CoachText as Record<string, unknown>)[key], key).toBe(value)
  })

  it('the formatters', () => {
    const src = kt('TourText.kt')
    expect(src).toContain('fun resumeHint(n: Int, of: Int) = "Try arc stopped at step $n of $of."')
    expect(src).toContain('fun stepOf(n: Int, of: Int) = "Step $n of $of"')
    expect(src).toContain('fun row(label: String, done: Boolean) = "$label: " + if (done) "done" else "not yet"')
  })
})
