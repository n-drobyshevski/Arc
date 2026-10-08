// Tests for platform/audio/fxSetup.ts (port of FxSetup.kt), the same cases as FxSetupTest.kt.

import { describe, expect, it } from 'vitest'
import { FxControl } from '../../src/core/formats/fx/fxBus'
import { VoiceMixer, VoiceShape } from '../../src/core/formats/voiceMixer'
import { FxSetup } from '../../src/platform/audio/fxSetup'

describe('FxSetup', () => {
  it('nothing sent, nothing replayed', () => {
    expect(new FxSetup().commands()).toEqual([])
  })

  it("each setting's last value, the effect first", () => {
    const fx = new FxSetup()
    fx.record(FxControl.TEMPO, 0, 140, 0)
    fx.record(FxControl.SEND, 2, 0.3, 0)
    fx.record(FxControl.SEND, 2, 0.6, 0)
    fx.record(FxControl.SEND, 0, 0.1, 0)
    fx.record(FxControl.FX_TYPE, FxControl.DELAY, 0.2, 0.4)
    fx.record(FxControl.COMP, 1, 0.7, 0.1)
    fx.record(FxControl.SIDECHAIN, 0b0110, 0.3, 0.5)
    fx.record(FxControl.SIDECHAIN, 0, 0.3, 0.5)
    expect(fx.commands()).toEqual([
      { what: FxControl.FX_TYPE, index: FxControl.DELAY, x: 0.2, y: 0.4 },
      { what: FxControl.SEND, index: 0, x: 0.1, y: 0 },
      { what: FxControl.SEND, index: 2, x: 0.6, y: 0 },
      { what: FxControl.COMP, index: 1, x: 0.7, y: 0.1 },
      { what: FxControl.SIDECHAIN, index: 0, x: 0.3, y: 0.5 },
      { what: FxControl.TEMPO, index: 0, x: 140, y: 0 },
    ])
  })

  it("a drag moves the effect's knobs, a new type brings its own", () => {
    const fx = new FxSetup()
    // Knobs before any type: the effect is still none.
    fx.record(FxControl.FX_XY, 0, 0.9, 0.8)
    expect(fx.commands()).toEqual([{ what: FxControl.FX_TYPE, index: FxControl.NONE, x: 0.9, y: 0.8 }])
    fx.record(FxControl.FX_TYPE, FxControl.REVERB, 0.5, 0.5)
    fx.record(FxControl.FX_XY, 0, 0.25, 0.75)
    expect(fx.commands()).toEqual([{ what: FxControl.FX_TYPE, index: FxControl.REVERB, x: 0.25, y: 0.75 }])
    // The type's own knobs win over the older drag.
    fx.record(FxControl.FX_TYPE, FxControl.CHORUS, 0.1, 0.2)
    expect(fx.commands()).toEqual([{ what: FxControl.FX_TYPE, index: FxControl.CHORUS, x: 0.1, y: 0.2 }])
  })

  it("punch-ins and unknown commands aren't kept", () => {
    const fx = new FxSetup()
    fx.record(FxControl.PUNCH, FxControl.STUTTER, 1, 0)
    fx.record(FxControl.SEND, 4, 1, 0)
    fx.record(FxControl.SEND, -1, 1, 0)
    fx.record(99, 0, 1, 1)
    expect(fx.commands()).toEqual([])
  })

  it('a mixer given the replay plays as one given the settings as they ended', () => {
    const history: [number, number, number, number][] = [
      [FxControl.FX_TYPE, FxControl.DISTORTION, 0.8, 0.5],
      [FxControl.SEND, 1, 0.4, 0],
      [FxControl.FX_XY, 0, 0.6, 0.3],
      [FxControl.SEND, 1, 0.9, 0],
      [FxControl.COMP, 1, 0.5, 0.5],
      [FxControl.PUNCH, FxControl.DECIMATOR, 1, 0],
    ]
    const fx = new FxSetup()
    for (const [w, i, x, y] of history) fx.record(w, i, x, y)
    const replayed = new VoiceMixer(48000)
    for (const c of fx.commands()) replayed.control(c.what, c.index, c.x, c.y)
    const settled = new VoiceMixer(48000)
    settled.control(FxControl.FX_TYPE, FxControl.DISTORTION, 0.6, 0.3)
    settled.control(FxControl.SEND, 1, 0.9, 0)
    settled.control(FxControl.COMP, 1, 0.5, 0.5)
    const dry = new VoiceMixer(48000)
    const pcm = new Int16Array(4800).map((_, i) => (i % 40 < 20 ? 12000 : -12000))
    const outs = [replayed, settled, dry].map((m) => {
      m.start('a', pcm, 1, 48000, 0, 0, VoiceShape.of({ bus: 1 }))
      const out = new Int16Array(2 * 2048)
      m.render(out, 2048)
      return out
    })
    expect(outs[0]).toEqual(outs[1])
    expect(outs[0]).not.toEqual(outs[2])
  })
})
