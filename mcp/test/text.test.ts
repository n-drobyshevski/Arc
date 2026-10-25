// The messages the view sends to Claude: Ask, Regenerate, Improve, Fix errors
// and the quick changes; the effect line and the shaped pads' badges.
import { describe, expect, it } from 'vitest'
import { parseBeatCard } from '../../web/src/core/formats/beatCard'
import { BeatText } from '../src/text'

const SHOW = 'Show me the new card with show_beat_card.'

describe('BeatText messages', () => {
  it('Ask names the card, adds what was heard and asks for the new card', () => {
    expect(BeatText.askMessage('House', ' busier hats ', ['tempo 120', 'A7 muted'])).toBe(
      `Please change the ARC BEAT card "House": busier hats\n(In the preview I had tempo 120, A7 muted.)\n${SHOW}`,
    )
    expect(BeatText.askMessage('', 'simpler', [])).toBe(`Please change the ARC BEAT card: simpler\n${SHOW}`)
  })

  it('Regenerate and Improve keep what was heard', () => {
    expect(BeatText.regenerateMessage('House', ['swing 60'])).toBe(
      `Please write a new take on the ARC BEAT card "House": same tempo and feel, a different pattern.\n(In the preview I had swing 60.)\n${SHOW}`,
    )
    expect(BeatText.improveMessage('House', [])).toBe(
      `Please improve the ARC BEAT card "House": make it groove and sound more finished, and tell me in one line each what you changed.\n${SHOW}`,
    )
  })

  it('Fix errors lists the errors by line, at most ten', () => {
    expect(BeatText.fixMessage('X', [{ line: 2, msg: 'bad tempo' }, { line: 5, msg: 'too few steps' }])).toBe(
      `Please fix the ARC BEAT card "X": line 2: bad tempo; line 5: too few steps\n${SHOW}`,
    )
    const many = Array.from({ length: 13 }, (_, i) => ({ line: i + 1, msg: 'e' }))
    const text = BeatText.fixMessage('', many)
    expect(text).toContain('line 10: e; and 3 more')
    expect(text).not.toContain('line 11')
  })

  it('every quick change has a label and a request', () => {
    expect(BeatText.TWEAKS.length).toBeGreaterThan(0)
    for (const t of BeatText.TWEAKS) {
      expect(t.label.trim()).not.toBe('')
      expect(t.request.trim()).not.toBe('')
    }
    expect(new Set(BeatText.TWEAKS.map((t) => t.label)).size).toBe(BeatText.TWEAKS.length)
  })
})

describe('BeatText FX and pad shaping', () => {
  const read = (...lines: string[]) => parseBeatCard(['ARC BEAT 1', ...lines, '[A] bars 1', 'A4 hat | x... |'].join('\n'))

  it('sums up the effect lines in one line', () => {
    const r = read('fx reverb 60 40', 'send A 20 B 40', 'comp 40 60', 'sidechain A7 BC')
    expect(BeatText.fxSummary(r)).toBe('reverb 60/40 · sends A 20 B 40 · comp 40/60 · sidechain A7 → B C')
    expect(BeatText.fxSummary(read('fx none', 'comp off', 'sidechain A7 B 25 70'))).toBe(
      'no effect · comp off · sidechain A7 → B 25/70',
    )
  })

  it('writes a shaped pad’s badge and its full settings', () => {
    const pad = parseBeatCard(['ARC BEAT 1', '[A] bars 1', 'A4 hat | x... |', 'pad A4 pitch -7 level 80 pan 4 mode key'].join('\n')).pads[0]!
    expect(BeatText.shapeBadge(pad)).toBe('−7 st · 80% · R4 · rel 15 · key')
    expect(BeatText.shapeText(pad)).toBe('A4 shaping: pitch −7 semitones, level 80, pan R4, release 15, mode key')
  })
})
