// Port of app/src/test/kotlin/dev/arc/ep133/controller/VoiceShapeTest.kt: how a pad's sound settings play
// on the phone; plus sameShape, the web's VoiceShape equality.
import { describe, expect, it } from 'vitest'
import { ENV_MS_PER_TICK, PadSettings } from '../../src/core/features/padSettings'
import { VoiceMixer, VoiceMode } from '../../src/core/formats/voiceMixer'
import { sameShape, voiceShape } from '../../src/state/padShape'

describe('voiceShape', () => {
  it('the settings carry over - pitch, level, pan, trim, envelope ticks, mute group by pad group', () => {
    const s: PadSettings = { ...PadSettings.DEFAULT, pitch: -2.5, level: 50, pan: -8, mode: 'key', start: 100, end: 900, attack: 3, release: 40, muteGroup: true }
    const v = voiceShape(s, 2)
    expect(v.semitones).toBe(-2.5)
    expect(v.gain).toBe(0.5)
    expect(v.pan).toBe(-8)
    expect(v.start).toBe(100)
    expect(v.end).toBe(900)
    expect(v.attackMs).toBe(3 * ENV_MS_PER_TICK)
    expect(v.releaseMs).toBe(40 * ENV_MS_PER_TICK)
    expect(v.mode).toBe(VoiceMode.KEY)
    expect(v.muteGroup).toBe(3)
  })

  it('the defaults play the whole sample once, and release never fades quicker than a pad always has', () => {
    const v = voiceShape({ ...PadSettings.DEFAULT, release: 0 }, 0)
    expect(v.mode).toBe(VoiceMode.ONESHOT)
    expect(v.start).toBe(0)
    expect(v.end).toBe(2147483647)
    expect(v.releaseMs).toBe(VoiceMixer.FADE_MS)
    expect(v.muteGroup).toBe(0)
  })

  it('KEYS plays LEGATO as held notes, each note being its own voice', () => {
    const s = PadSettings.withMode(PadSettings.DEFAULT, 'legato')
    expect(voiceShape(s, 0).mode).toBe(VoiceMode.LEGATO)
    expect(voiceShape(s, 0, true).mode).toBe(VoiceMode.GATE)
  })

  it("KEYS leaves the mute group out, so a chord on a muted pad isn't cut to one note", () => {
    const s = { ...PadSettings.DEFAULT, muteGroup: true }
    expect(voiceShape(s, 2).muteGroup).toBe(3)
    expect(voiceShape(s, 2, true).muteGroup).toBe(0)
  })

  it("a pad plays on its group's FX bus, and ducks only when it is the sidechain's source", () => {
    const s = { ...PadSettings.DEFAULT, muteGroup: true }
    expect(voiceShape(s, 1).bus).toBe(1)
    expect(voiceShape(s, 3, true).bus).toBe(3)
    expect(voiceShape(s, 1).duckSource).toBe(false)
    expect(voiceShape(s, 1, false, true).duckSource).toBe(true)
  })
})

describe('sameShape', () => {
  it('compares the fields, a missing one being the default', () => {
    expect(sameShape({ bus: 1 }, { bus: 1, gain: 1 })).toBe(true)
    expect(sameShape({ bus: 1 }, { bus: 2 })).toBe(false)
    expect(sameShape(voiceShape(PadSettings.DEFAULT, 0), voiceShape(PadSettings.DEFAULT, 0))).toBe(true)
    expect(sameShape(undefined, {})).toBe(true)
  })
})
