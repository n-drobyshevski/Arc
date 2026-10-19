// Web addition: DeckStrip's row rule (DeckKeys.kt has no test of its own).
import { describe, expect, it } from 'vitest'
import { deckPerRow } from '../../src/ui/live/DeckKeys'

describe('the strip under the glass', () => {
  it('puts every key in one row where each gets 48, else two rows of half (rounded up)', () => {
    // Six keys need 6 × 48 + 5 × 7 = 323.
    expect(deckPerRow(323, 6)).toBe(6)
    expect(deckPerRow(322, 6)).toBe(3)
    // Seven: 7 × 48 + 6 × 7 = 378; under it, four over three.
    expect(deckPerRow(378, 7)).toBe(7)
    expect(deckPerRow(377, 7)).toBe(4)
    // Not measured yet: two rows.
    expect(deckPerRow(0, 5)).toBe(3)
  })
})
