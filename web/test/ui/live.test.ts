// Tests for web/src/ui/live/glow.ts (the pure parts of MirrorScreen.kt).
import { describe, expect, it } from 'vitest'
import type { Hit, MirrorState, PadLight } from '../../src/core/features/liveMirror'
import { physicalPad } from '../../src/core/features/padNotes'
import { MirrorText } from '../../src/core/text/mirrorText'
import { emptyMirrorState, type MirrorUi } from '../../src/state/types'
import {
  FADE_MS,
  displayLine,
  displayLineSmall,
  fading,
  glow,
  glowCss,
  groupGlow,
  keysLayout,
  keysStart,
  showNoPushes,
  transportText,
} from '../../src/ui/live/glow'

const light = (velocity: number, offAt: number | null = null): PadLight => ({ velocity, channel: 1, onAt: 0, offAt })

describe('glow', () => {
  it('is brighter with velocity while held', () => {
    expect(glow(light(127), 0)).toBeCloseTo(1)
    expect(glow(light(1), 0)).toBeCloseTo(0.45 + 0.55 / 127)
    // Out-of-range velocities are clamped (0 counts as 1).
    expect(glow(light(0), 0)).toBeCloseTo(glow(light(1), 0))
    expect(glow(light(200), 0)).toBeCloseTo(1)
  })

  it('fades out over FADE_MS after release', () => {
    const l = light(70, 1000)
    const strength = 0.45 + 0.55 * (70 / 127)
    expect(glow(l, 1000)).toBeCloseTo(strength)
    // The screenshot state: released 120 ms ago.
    expect(glow(l, 1120)).toBeCloseTo(strength * 0.6)
    expect(glow(l, 1000 + FADE_MS)).toBe(0)
    expect(glow(l, 5000)).toBe(0)
    // A release stamped a little after "now" (clock skew) never goes above 1.
    expect(glow(light(127, 1000), 900)).toBe(1)
  })

  it('takes the brightest pad of a group', () => {
    const pads = new Map<number, PadLight>([
      [9, light(124)],
      [6, light(70, 0)],
      [12 + 9, light(100)],
    ])
    expect(groupGlow(pads, 0, 120)).toBeCloseTo(glow(light(124), 0))
    expect(groupGlow(pads, 1, 120)).toBeCloseTo(glow(light(100), 0))
    expect(groupGlow(pads, 2, 120)).toBe(0)
    expect(groupGlow(pads, 3, 120)).toBe(0)
  })

  it('runs the frame loop only while a released pad is still fading', () => {
    expect(fading(new Map([[0, light(100)]]), 0)).toBe(false)
    expect(fading(new Map([[0, light(100, 0)]]), 100)).toBe(true)
    expect(fading(new Map([[0, light(100, 0)]]), FADE_MS)).toBe(false)
    expect(fading(new Map(), 0)).toBe(false)
  })

  it('writes a short CSS number', () => {
    expect(glowCss(0)).toBe('0')
    expect(glowCss(1)).toBe('1')
    expect(glowCss(0.123456)).toBe('0.1235')
    expect(glowCss(-1)).toBe('0')
    expect(glowCss(2)).toBe('1')
  })
})

describe('keys strip', () => {
  it('shows the octave below and the one of the note', () => {
    expect(keysStart(77)).toBe(60) // F5 → C4..C6
    expect(keysStart(5)).toBe(0)
    expect(keysStart(127)).toBe(103)
  })

  it('lays out 15 white and 10 black keys', () => {
    const keys = keysLayout(77)
    const whites = keys.filter((k) => !k.black)
    const blacks = keys.filter((k) => k.black)
    expect(whites).toHaveLength(15)
    expect(blacks).toHaveLength(10)
    // Whites first, so the blacks draw over them.
    expect(keys.slice(0, 15).every((k) => !k.black)).toBe(true)
    expect(whites[0]).toEqual({ note: 60, x: 0, w: 1 / 15, black: false })
    // C#4 sits on the line between C4 and D4, 0.6 of a white wide.
    const cs = blacks[0]!
    expect(cs.note).toBe(61)
    expect(cs.x).toBeCloseTo(1 / 15 - 0.3 / 15)
    expect(cs.w).toBeCloseTo(0.6 / 15)
  })
})

describe('display', () => {
  const hit: Hit = { pad: physicalPad(0, 9), note: 45, channel: 1, velocity: 124, slot: 1, name: 'kick' }
  const st = (patch: Partial<MirrorState> = {}): MirrorState => ({ ...emptyMirrorState(), ...patch })
  const ui = (patch: Partial<MirrorUi> = {}): MirrorUi => ({ state: st(), loading: false, error: null, ...patch })

  it('says the error, then reading, then the hit, then waiting', () => {
    expect(displayLine(st({ lastHit: hit }), ui({ error: 'Nope' }))).toBe('Nope')
    expect(displayLine(st(), ui({ loading: true }))).toBe(MirrorText.READING)
    expect(displayLine(st({ lastHit: hit }), ui({ loading: true }))).toBe('A 7 · 001 kick · 124')
    expect(displayLine(st(), ui())).toBe(MirrorText.WAITING)
    expect(displayLine(st(), null)).toBe(MirrorText.WAITING)
  })

  it('says the sound plays late after the hit, before offline and waiting, a size down', () => {
    const offline = ui({ offline: MirrorText.lastSeen('5 Oct, 14:02') })
    expect(displayLine(st(), ui(), 140)).toBe('Sound plays 140 ms late: wired output is quicker')
    expect(displayLine(st(), offline, 140)).toBe(MirrorText.slowOutput(140))
    expect(displayLine(st(), null, 140)).toBe(MirrorText.slowOutput(140))
    expect(displayLine(st({ lastHit: hit }), ui(), 140)).toBe('A 7 · 001 kick · 124')
    expect(displayLine(st(), ui({ loading: true }), 140)).toBe(MirrorText.READING)
    expect(displayLine(st(), ui({ error: 'Nope' }), 140)).toBe('Nope')
    expect(displayLine(st(), offline, null)).toBe(MirrorText.lastSeen('5 Oct, 14:02'))
    expect(displayLineSmall(st(), ui(), 140)).toBe(true)
    expect(displayLineSmall(st(), ui(), null)).toBe(false)
    expect(displayLineSmall(st({ lastHit: hit }), ui(), 140)).toBe(false)
    expect(displayLineSmall(st(), ui({ loading: true }), 140)).toBe(false)
    expect(displayLineSmall(st(), offline)).toBe(true)
  })

  it('shows the transport only once the clock said something', () => {
    expect(transportText(true)).toBe('▶ ' + MirrorText.PLAYING)
    expect(transportText(false)).toBe('■ ' + MirrorText.STOPPED)
    expect(transportText(null)).toBe('')
  })

  it('says no pushes came only after a pad hit with nothing learned, once loaded', () => {
    const s = st({ lastHit: hit })
    expect(showNoPushes(s, ui())).toBe(true)
    expect(showNoPushes(s, ui({ loading: true }))).toBe(false)
    expect(showNoPushes(s, null)).toBe(false)
    expect(showNoPushes(st({ lastHit: hit, pushesSeen: true }), ui())).toBe(false)
    expect(showNoPushes(st({ lastHit: hit, learned: new Map([[0, 1]]) }), ui())).toBe(false)
    expect(showNoPushes(st({ lastHit: { ...hit, pad: null } }), ui())).toBe(false)
  })
})
