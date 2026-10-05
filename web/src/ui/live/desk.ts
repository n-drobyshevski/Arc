// Web only: Live's all-groups view on the desk (the desktop layout, from
// 1024px wide). It ports the rule of Android's sideways all-groups row
// (ui/screens/MirrorScreen.kt, allGroupsSideways): the four groups side by side
// in one row that doesn't scroll, as long as every pad keeps 40 px both ways,
// its rows no taller than square pads; else the scrolling grid stays.
//
// The numbers are the row's CSS (MirrorScreen.css, .live-row): change both together.

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
