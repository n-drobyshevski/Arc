// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/PatternLine.kt
// (ChipSizes, lineFits, lineFit, stepFit, stepRowFit, LineFit, StepFit) and
// MirrorScreen.kt's one-group line (MainMin: the device's ▶/■ and tempo give
// way together; offlineShort where the full "Last seen" would be cut).
//
// What fits on Live's display line, measured as drawn, so the counter is
// never cut: ERASE and ↶, then RECORD's word, then TAKE's word give way where
// the line is short; STEP's cell shows its word on a wide line, its glyph on
// a phone's, or nothing; the scene's cell while the pattern plays shows only
// where everything else fits with it.
//
// Web deltas:
// - Pure functions over a [Measure] (a canvas's measureText in the page, a
//   fixed width per character in tests), on the line's content width (its
//   padding left out, so [lineFits] takes none).
// - A group (RECORD and PLAY, the scene and STEP, ERASE and ↶, CORRECT) is
//   measured with its 1px border either side, as the web draws it; CORRECT is
//   a group of one cell here (a standalone chip on Android).
// - The scene's readout is in its cell (Android: in the words), kept before
//   the keys beside it give way, as Android keeps it.

/** The type the line's words are drawn in: ArcType.displaySub, displayHead, and TAKE's and the readout's 12. */
export type LineFont = 'sub' | 'head' | 'small'

/** A text's width in px as drawn in [font]. */
export type Measure = (text: string, font: LineFont) => number

/** From this wide (px) the line keeps ERASE and ↶ while the pattern is stopped, RECORD its word and STEP its word. */
export const WIDE_LINE = 520
/** The room the stopped line keeps for its own words beside STEP's cell: with its word, and at least, with its glyph. */
export const IDLE_ROOMY = 140
export const IDLE_MIN = 64
/** The room the one-group line keeps for its main line (the hit) before the device's ▶/■ and tempo beside it give way. */
export const MAIN_MIN = 96
/** The line's gap between its keys and words. */
export const LINE_GAP = 10

const CELL_PAD = 10
const CELL_PAD_COMPACT = 7
const CELL_MIN = 32
const GROUP_DIVIDER = 1
const GROUP_BORDER = 2
const DOT_WIDTH = 10
const UNDO_WIDTH = 12
const STEP_GLYPH_WIDTH = 14
const READOUT_GAP = 5

/**
 * The line's keys and words measured as they are drawn ([compact]: the top
 * bar's, in less padding): a word's width, a standalone chip's from its glyph
 * and word, a cell's the same in a group's padding, and a group's from its
 * cells (a hairline between them, the border round them).
 */
export class ChipSizes {
  private readonly pad: number
  private readonly cellPad: number

  constructor(
    readonly measure: Measure,
    compact: boolean,
  ) {
    this.pad = (compact ? 7 : 8) * 2 + 2
    this.cellPad = (compact ? CELL_PAD_COMPACT : CELL_PAD) * 2
  }

  text(s: string, font: LineFont = 'sub'): number {
    return this.measure(s, font)
  }

  /** A standalone chip (TAKE's badge): its glyph (and the gap after it) and its word, in its padding and border. */
  chip(glyph: number, word: number): number {
    return Math.max(CELL_MIN, glyph + (glyph > 0 && word > 0 ? 6 : 0) + word + this.pad)
  }

  /** A cell of a group: as [chip], in the cell's padding. */
  cell(glyph: number, word: number): number {
    return Math.max(CELL_MIN, glyph + (glyph > 0 && word > 0 ? 6 : 0) + word + this.cellPad)
  }

  /** A group of two cells (0 for one not shown): their widths, a divider between them if both show, the border; 0 for none. */
  group(first: number, second = 0): number {
    if (first <= 0 && second <= 0) return 0
    return first + second + (first > 0 && second > 0 ? GROUP_DIVIDER : 0) + GROUP_BORDER
  }

  /** RECORD and PLAY, RECORD with its [word] or its dot alone. */
  transport(word: boolean, recordWord: string): number {
    return this.group(this.cell(DOT_WIDTH, word ? this.text(recordWord) : 0), this.cell(DOT_WIDTH, 0))
  }

  /** The scene's cell for its [label] or [readout] (0 for none). */
  sceneCell(label: string | null, readout: readonly string[] | null = null): number {
    if (readout !== null) return this.cell(0, readoutWidth(this, readout))
    return label !== null ? this.cell(0, this.text(label)) : 0
  }

  /** ERASE and ↶, each where shown. */
  edit(erase: boolean, undo: boolean, eraseWord: string): number {
    return this.group(erase ? this.cell(0, this.text(eraseWord)) : 0, undo ? this.cell(UNDO_WIDTH, 0) : 0)
  }

  /** STEP's cell, with its word or as its glyph. */
  step(word: boolean, stepWord: string): number {
    return this.cell(word ? 0 : STEP_GLYPH_WIDTH, word ? this.text(stepWord) : 0)
  }
}

function readoutWidth(sizes: ChipSizes, readout: readonly string[]): number {
  return readout.reduce((a, w) => a + sizes.text(w, 'small'), 0) + READOUT_GAP * Math.max(0, readout.length - 1)
}

/** Whether [items] (0 for one not shown) fit on a line whose content is [width] wide, the line's gap between them. */
export function lineFits(items: readonly number[], width: number): boolean {
  const shown = items.filter((w) => w > 0)
  return shown.reduce((a, b) => a + b, 0) + LINE_GAP * Math.max(0, shown.length - 1) <= width
}

/**
 * What fits on the line beside the pattern's words: ERASE and ↶ ([edit]),
 * RECORD's word ([recordWord]; only a wide line has it at all) and TAKE's
 * ([takeWord]), given up in that order where the line is short, so the
 * counter is never cut; and the scene's cell ([scene]) while the pattern
 * plays, there only where all the rest fits with it.
 */
export interface LineFit {
  readonly edit: boolean
  readonly recordWord: boolean
  readonly takeWord: boolean
  readonly scene: boolean
}

/** How STEP's cell shows on the stopped line: with its word, as its glyph alone, or not at all. */
export type StepFit = 'WORD' | 'GLYPH' | 'NONE'

/** The words a line's measure needs, from MirrorText (passed in, so this file keeps to layout). */
export interface LineWords {
  readonly record: string
  readonly erase: string
  readonly step: string
  readonly correct: string
  readonly take: string
}

/** The pattern as the measure needs it. */
export interface LineState {
  readonly phase: 'STOPPED' | 'ARMED' | 'COUNT_IN' | 'PLAYING'
  readonly erase: boolean
  readonly hasNotes: boolean
  readonly canUndo: boolean
  /** The pattern's words at their widest: playing, the counter for its length; counting in, "4 of 4"'s words. */
  readonly words: string
}

/** TAKE's badge while it shows: its words with ([word]) and without. */
export interface TakeWords {
  readonly word: string
  readonly short: string
}

/**
 * [LineFit] for [s]'s words on a line [width] wide (its content), with
 * [take]'s badge, CORRECT's key ([correct], which always stays), the scene's
 * cell ([scene] its label, when it has one, the cell coming last) and the
 * scene's readout ([readout] its parts, kept before the keys beside it give
 * way); the counter at its widest so it doesn't flip from bar to bar.
 */
export function lineFit(
  s: LineState,
  words: LineWords,
  measure: Measure,
  compact: boolean,
  width: number,
  opts: { take?: TakeWords | null; correct?: boolean; scene?: string | null; readout?: readonly string[] | null } = {},
): LineFit {
  const sizes = new ChipSizes(measure, compact)
  const said =
    s.phase === 'PLAYING' ? sizes.text(s.words) : s.phase === 'COUNT_IN' ? 40 + LINE_GAP + sizes.text(s.words) : IDLE_MIN // the hints shorten to fit
  const take = opts.take ?? null
  const takeChip = (word: boolean): number => (take === null ? 0 : sizes.chip(10, sizes.text(word ? take.word : take.short, 'small')))
  const editing = s.phase === 'PLAYING' || s.phase === 'STOPPED' || s.erase
  const hasErase = editing && (s.erase || s.hasNotes)
  const edit = sizes.edit(hasErase, editing && s.canUndo, words.erase)
  const erase = s.erase ? sizes.edit(true, false, words.erase) : 0
  // RECORD's word only where the line is wide; a phone has its dot.
  const wordy = !compact && width >= WIDE_LINE
  const record = sizes.transport(wordy, words.record)
  const recordDot = sizes.transport(false, words.record)
  // CORRECT beside the keys while it is lit (it stays: it is what turns timing correct off while playing).
  const correct = opts.correct ? sizes.group(sizes.cell(0, sizes.text(words.correct))) : 0
  const readout = opts.readout ? sizes.group(sizes.sceneCell(null, opts.readout)) : 0
  const sceneKey = sizes.group(sizes.sceneCell(opts.scene ?? null))
  const fits = (items: readonly number[]): boolean => lineFits(items, width)
  const rest = [correct, said, takeChip(true), readout]
  const wordsAndEdit = [record, edit, ...rest]
  const wordsAndErase = [record, erase, ...rest]
  const dotAndErase = [recordDot, erase, ...rest]
  // The cell while it plays comes last: it is there where the line has room left over for it.
  const roomy = (items: readonly number[]): boolean => fits([...items, sceneKey])
  if (fits(wordsAndEdit)) return { edit: true, recordWord: wordy, takeWord: true, scene: roomy(wordsAndEdit) }
  if (fits(wordsAndErase)) return { edit: false, recordWord: wordy, takeWord: true, scene: roomy(wordsAndErase) }
  if (fits(dotAndErase)) return { edit: false, recordWord: false, takeWord: true, scene: roomy(dotAndErase) }
  return { edit: false, recordWord: false, takeWord: false, scene: false }
}

/**
 * How STEP's cell fits on the stopped line [width] wide beside RECORD and
 * PLAY, ERASE and ↶ ([wide]: on the line while stopped, and RECORD with its
 * word), the scene's cell ([scene] its label, in a key with STEP's) and
 * [take]'s badge: with its word on a wide line while the line's own words
 * keep [IDLE_ROOMY], else its glyph alone (a phone's line and [compact]:
 * always) while they keep [IDLE_MIN], else not at all.
 */
export function stepFit(
  s: LineState,
  words: LineWords,
  measure: Measure,
  compact: boolean,
  width: number,
  opts: { take?: TakeWords | null; scene?: string | null } = {},
): StepFit {
  const sizes = new ChipSizes(measure, compact)
  const wide = width >= WIDE_LINE
  const chips = [
    sizes.transport(wide && !compact, words.record),
    sizes.edit(wide && s.hasNotes, wide && s.canUndo, words.erase),
    opts.take ? sizes.chip(10, sizes.text(opts.take.word, 'small')) : 0,
  ]
  const scene = sizes.sceneCell(opts.scene ?? null)
  if (!compact && wide && lineFits([...chips, sizes.group(scene, sizes.step(true, words.step)), IDLE_ROOMY], width)) return 'WORD'
  if (lineFits([...chips, sizes.group(scene, sizes.step(false, words.step)), IDLE_MIN], width)) return 'GLYPH'
  return 'NONE'
}

/**
 * How STEP's cell fits in the all-groups display's pattern row [width] wide
 * (no words of its own while stopped): after RECORD (its word where [fit] has
 * it) and PLAY, with ERASE and ↶ ([edit], where they show): with its word,
 * else its glyph, else not at all.
 */
export function stepRowFit(s: LineState, words: LineWords, measure: Measure, width: number, fit: LineFit, edit: boolean): StepFit {
  const sizes = new ChipSizes(measure, false)
  const chips = [sizes.transport(fit.recordWord, words.record), sizes.edit(edit && (s.erase || s.hasNotes), edit && s.canUndo, words.erase)]
  if (lineFits([...chips, sizes.group(sizes.step(true, words.step))], width)) return 'WORD'
  if (lineFits([...chips, sizes.group(sizes.step(false, words.step))], width)) return 'GLYPH'
  return 'NONE'
}

/**
 * The one-group line's own words: whether the device's ▶/■ and tempo
 * ([clock], each shown with the gap after it) show, leaving the main line
 * ([main]) at least [MAIN_MIN] (or its whole, if shorter), in [width]; and
 * whether the main line, offline, gives way to its short form ([short]: the
 * full one would be cut).
 */
export function idleFit(measure: Measure, clock: readonly string[], main: string, width: number): { clock: boolean; short: boolean } {
  const clockWidth = clock.reduce((a, w) => a + measure(w, 'sub') + LINE_GAP, 0)
  const mainWidth = measure(main, 'head')
  const shown = clockWidth > 0 && width - clockWidth >= Math.min(MAIN_MIN, mainWidth)
  return { clock: shown, short: mainWidth > width - (shown ? clockWidth : 0) }
}

const FONT_SIZE: Record<LineFont, string> = { sub: '600 14px', head: '700 17px', small: '600 12px' }

/**
 * The page's [Measure]: a canvas's measureText in the line's font family,
 * each width kept. Without a canvas (tests), a guess from the length.
 */
export function canvasMeasure(family: string): Measure {
  const cache = new Map<string, number>()
  let ctx: CanvasRenderingContext2D | null = null
  try {
    ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
  } catch {
    ctx = null
  }
  return (text, font) => {
    const key = font + '\u0000' + text
    const kept = cache.get(key)
    if (kept !== undefined) return kept
    let w: number
    if (ctx !== null) {
      ctx.font = `${FONT_SIZE[font]} ${family}`
      w = ctx.measureText(text).width
    } else {
      w = text.length * (font === 'head' ? 10 : font === 'sub' ? 8.4 : 7.2)
    }
    cache.set(key, w)
    return w
  }
}
