// Live's all-groups view in one row: on the desk (the desktop layout, from
// 1024px wide; web only) and on a phone on its side (Android's sideways
// all-groups row, ui/screens/MirrorScreen.kt allGroupsSideways): the four
// groups side by side in one row that doesn't scroll, as long as every pad
// keeps 40 px both ways, its rows no taller than square pads; else the
// scrolling grid stays. On its side the function keys are a column left of
// the groups (or the open panel in its place).
//
// The numbers are the row's CSS (MirrorScreen.css, .live-row and
// .live__side--row) and the side page's (.live__one): change both together.

/** Android's floor: a pad smaller than this either way and the row gives way to the scrolling grid. */
export const ROW_PAD_MIN = 40

/** The paper card's padding, the gap between the groups and between a deck's pads. */
const CARD_PAD = 20
const GROUP_GAP = 14
const PAD_GAP = 6
/** A small deck's padding across (8 + 8 and the caps' 2 px edge) and down (8 + 8 and their 3 px edge). */
const DECK_X = 18
const DECK_Y = 19
/** Down the card, all but the pads: its padding, the display line (56) and the mode row (44) with their
 * 6 px gaps, a group's caption (its line and 8 px gap) and the deck's padding and three gaps. */
const CAPTION = 26
const FIXED_H = 2 * CARD_PAD + 56 + 6 + 44 + 6 + CAPTION + DECK_Y + 3 * PAD_GAP

/**
 * The pads' side in the one-row all-groups view of a [width] x [height] room
 * (whole pixels), or null when they would be under [ROW_PAD_MIN]: then the
 * view scrolls as on the phone. Width and height each give a size; the smaller wins.
 */
export function rowPadSize(width: number, height: number): number | null {
  const byWidth = ((width - 2 * CARD_PAD - 3 * GROUP_GAP) / 4 - DECK_X - 2 * PAD_GAP) / 3
  const byHeight = (height - FIXED_H) / 4
  const side = Math.floor(Math.min(byWidth, byHeight))
  return side >= ROW_PAD_MIN ? side : null
}

/** The side page's padding across (the edge tab's 22 + 8 at the start, the strip's 24 + 4 at the end) and down (4 + 12). */
const PAGE_X = 22 + 8 + 24 + 4
const PAGE_Y = 4 + 12
/** The mode row over the groups (its 44 to touch) and the page's 10 gap under it; the display line (56) and its gap, when on the page. */
const MODE_ROW = 44 + 10
const LINE = 56 + 10
/** The function keys' column and its gap (FunctionRow.css, Kotlin SideFunctions and SideControlsGap). */
const COLUMN = 60 + 12
/** The column's least height that keeps its LED lines (Kotlin FunctionColumnLed). */
export const COLUMN_LED_HEIGHT = 226
/** An open panel in the column's place: as wide as the groups at three fifths of the room leave, 240 to 380 (Kotlin sidePanelWidth). */
const panelWidth = (room: number): number => Math.min(380, Math.max(240, room * 0.4))

/**
 * The pads' side in the one-row all-groups view on a phone on its side, in
 * Live's [width] x [height] box ([line]: with the display line on the page,
 * not in the top bar), whole pixels; null when the row doesn't fit (a pad
 * under [ROW_PAD_MIN] either way, or too short a room for the column's LED
 * lines): then the page scrolls. [panel]: a panel open in the column's
 * place, the groups narrower beside it (no floor then: the row stays, as
 * Android's).
 */
export function sidewaysRowPad(width: number, height: number, line: boolean, panel = false): number | null {
  const roomW = width - PAGE_X
  const roomH = height - PAGE_Y - MODE_ROW - (line ? LINE : 0)
  if (roomW <= 0 || roomH < COLUMN_LED_HEIGHT) return null
  const pad = (columnW: number): number => ((roomW - columnW - 3 * GROUP_GAP) / 4 - DECK_X - 2 * PAD_GAP) / 3
  const byHeight = (roomH - CAPTION - DECK_Y - 3 * PAD_GAP) / 4
  const closed = Math.floor(Math.min(pad(COLUMN), byHeight))
  if (closed < ROW_PAD_MIN) return null
  return panel ? Math.max(1, Math.floor(Math.min(pad(panelWidth(roomW) + 12), byHeight))) : closed
}
