// The drawn EP-133's knobs and fader (web only: ui/live/DeviceControls.tsx): what each turns, by
// what is open, and how a turn reaches the controller.
import { describe, expect, it, vi } from 'vitest'
import { FxSettings, FxType } from '../../src/core/features/fxSettings'
import { PadSettings } from '../../src/core/features/padSettings'
import { Tempo } from '../../src/core/features/tempo'
import { MirrorText } from '../../src/core/text/mirrorText'
import { WebText } from '../../src/core/text/webText'
import { SAMPLE_UI } from '../../src/state/samplePlan'
import { STEP_GATES, STEP_UI } from '../../src/state/stepPlan'
import { faderTarget, knobTarget, share, volumeTarget, type KnobInputs } from '../../src/ui/live/DeviceControls'
import { THRESHOLD_OFF } from '../../src/ui/live/SamplePanel'

/** Nothing open: the effect's knobs; [over] opens what a case needs. */
function inputs(over: Partial<KnobInputs> = {}): KnobInputs & { setXY: ReturnType<typeof vi.fn> } {
  const setXY = vi.fn()
  return {
    pad: null,
    sample: null,
    step: null,
    tempo: null,
    fx: { settings: FxSettings.withXY(FxSettings.DEFAULT, 0.62, 0.3), bpm: 120, setXY },
    setXY,
    ...over,
  }
}

const pad = (adjust = vi.fn()) => ({ page: 'SOUND' as const, settings: PadSettings.DEFAULT, frames: 46875, sampleRate: 46875, enabled: true, adjust })
const sample = (on = true) => ({ ui: { ...SAMPLE_UI, on, gainDb: 6, thresholdDb: -24 }, onGain: vi.fn(), onThreshold: vi.fn() })
const step = (open = true) => ({ ui: { ...STEP_UI, open, velocity: 90, gate: 24 }, onVelocity: vi.fn(), onGate: vi.fn(), onKnobEnd: vi.fn() })
const tempo = () => ({ bpm: 128, set: vi.fn() })

describe('knobTarget', () => {
  it("with nothing open turns the effect's X and Y, each leaving the other where it is", () => {
    const s = inputs()
    const x = knobTarget('x', s)!
    expect(x).toMatchObject({ name: 'FX X', what: WebText.TURN_FX_X, min: 0, max: 1, def: 0.5, readout: '62', spoken: '62%', enabled: true })
    expect(x.value).toBeCloseTo(0.62)
    x.set(0.7)
    expect(s.setXY).toHaveBeenLastCalledWith(0.7, Math.fround(0.3))
    const y = knobTarget('y', s)!
    expect(y.name).toBe('FX Y')
    y.set(0.1)
    expect(s.setXY).toHaveBeenLastCalledWith(Math.fround(0.62), 0.1)
  })

  it("names an effect's knobs and reads them as the FX sheet does", () => {
    const settings = FxSettings.withXY(FxSettings.withType(FxSettings.DEFAULT, FxType.DELAY), 0.62, 0.5)
    const x = knobTarget('x', inputs({ fx: { settings, bpm: 120, setXY: vi.fn() } }))!
    expect(x.name).toBe(FxSettings.xLabel(FxType.DELAY))
    expect(x.readout).toBe(FxSettings.xReadout(FxType.DELAY, settings.x, 120))
    expect(x.what).toBe(`${MirrorText.fxName(FxType.DELAY)} ${FxSettings.xLabel(FxType.DELAY).toLowerCase()}`)
  })

  it('follows what is open, first the pad sheet, then SAMPLE, STEP and TEMPO held', () => {
    const all = inputs({ pad: pad(), sample: sample(), step: step(), tempo: tempo() })
    expect(knobTarget('x', all)!.name).toBe(MirrorText.MODE.toUpperCase())
    expect(knobTarget('y', all)!.name).toBe(MirrorText.PAN.toUpperCase())
    const noPad = { ...all, pad: null }
    expect(knobTarget('x', noPad)!.name).toBe(MirrorText.LEVEL.toUpperCase())
    expect(knobTarget('y', noPad)!.name).toBe(MirrorText.THRESHOLD.toUpperCase())
    const noSample = { ...noPad, sample: sample(false) }
    expect(knobTarget('x', noSample)!.name).toBe(MirrorText.VEL.toUpperCase())
    expect(knobTarget('y', noSample)!.name).toBe(MirrorText.LEN.toUpperCase())
    const noStep = { ...noSample, step: step(false) }
    expect(knobTarget('x', noStep)!.name).toBe(MirrorText.FN_TEMPO.toUpperCase())
    // TEMPO held: Y has nothing (arc's click has no level).
    expect(knobTarget('y', noStep)).toBeNull()
    expect(knobTarget('x', { ...noStep, tempo: null })!.name).toBe('FX X')
  })

  it("on the pad sheet turns the page's X and Y into the pad's settings, and rests while it is read", () => {
    const adjust = vi.fn()
    const s = inputs({ pad: pad(adjust) })
    knobTarget('y', s)!.set(-7.4)
    expect(adjust).toHaveBeenLastCalledWith({ ...PadSettings.DEFAULT, pan: -7 })
    expect(knobTarget('x', inputs({ pad: { ...pad(), page: 'ENV' } }))!.name).toBe(MirrorText.ATTACK.toUpperCase())
    // MIDI and MUTE have no Y.
    expect(knobTarget('y', inputs({ pad: { ...pad(), page: 'MIDI' } }))).toBeNull()
    expect(knobTarget('x', inputs({ pad: { ...pad(), enabled: false } }))!.enabled).toBe(false)
  })

  it("SAMPLE's LEVEL and THRESH, STEP's VEL and LEN (ending each turn), TEMPO's beats", () => {
    const sm = sample()
    const level = knobTarget('x', inputs({ sample: sm }))!
    expect(level).toMatchObject({ value: 6, readout: MirrorText.gainReadout(6) })
    level.set(9)
    expect(sm.onGain).toHaveBeenLastCalledWith(9)
    const thresh = knobTarget('y', inputs({ sample: sm }))!
    expect(thresh).toMatchObject({ value: -24, min: THRESHOLD_OFF, def: THRESHOLD_OFF })
    thresh.set(THRESHOLD_OFF)
    expect(sm.onThreshold).toHaveBeenLastCalledWith(null)

    const st = step()
    const vel = knobTarget('x', inputs({ step: st }))!
    vel.set(100)
    vel.end?.()
    expect(st.onVelocity).toHaveBeenLastCalledWith(100)
    expect(st.onKnobEnd).toHaveBeenCalledTimes(1)
    const len = knobTarget('y', inputs({ step: st }))!
    expect(len.max).toBe(STEP_GATES.length - 1)
    len.set(STEP_GATES.indexOf(48))
    expect(st.onGate).toHaveBeenLastCalledWith(48)
    // No note on the step: they rest.
    expect(knobTarget('x', inputs({ step: { ...st, ui: { ...st.ui, velocity: null } } }))!.enabled).toBe(false)

    const t = tempo()
    const bpm = knobTarget('x', inputs({ tempo: t }))!
    expect(bpm).toMatchObject({ value: 128, min: Tempo.MIN, max: Tempo.MAX, readout: '128', spoken: MirrorText.tempoValue(128) })
    bpm.set(140.4)
    expect(t.set).toHaveBeenLastCalledWith(140)
  })
})

describe('VOLUME and the fader', () => {
  it("VOLUME is arc's, 0 to 100 %, back to 100 %", () => {
    const set = vi.fn()
    const v = volumeTarget(0.7, set)
    expect(v).toMatchObject({ name: 'VOLUME', what: WebText.TURN_VOLUME, value: 0.7, def: 1, readout: '70', spoken: '70%' })
    v.set(0.5)
    expect(set).toHaveBeenLastCalledWith(0.5)
  })

  it("the fader is the shown group's level", () => {
    const set = vi.fn()
    const fx = FxSettings.withLevel(FxSettings.DEFAULT, 1, 0.8)
    const b = faderTarget(1, fx, set)
    expect(b).toMatchObject({ name: 'GROUP B', what: WebText.turnGroup('B'), readout: '80', def: 1 })
    expect(faderTarget(0, fx, set).value).toBe(1)
    b.set(0.25)
    expect(set).toHaveBeenLastCalledWith(1, 0.25)
  })

  it('share is where the cap or the mark sits, 0..1', () => {
    expect(share(null)).toBe(0)
    expect(share(volumeTarget(0.25, vi.fn()))).toBe(0.25)
    expect(share(knobTarget('x', inputs({ tempo: { bpm: 140, set: vi.fn() } })))).toBe(0.5)
  })
})
