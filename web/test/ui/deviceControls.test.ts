// The drawn EP-133's knobs and fader (web only: ui/live/DeviceControls.tsx): what each turns, by
// what is open, and how a turn reaches the controller.
import { describe, expect, it, vi } from 'vitest'
import { FxSettings, FxType } from '../../src/core/features/fxSettings'
import { NoteNames, Scale, SCALES } from '../../src/core/features/keys'
import { TIMING_INTERVALS, TimingSettings } from '../../src/core/features/pattern'
import { PadSettings } from '../../src/core/features/padSettings'
import { Tempo } from '../../src/core/features/tempo'
import { MirrorText } from '../../src/core/text/mirrorText'
import { WebText } from '../../src/core/text/webText'
import { SAMPLE_UI } from '../../src/state/samplePlan'
import { STEP_GATES, STEP_UI } from '../../src/state/stepPlan'
import { faderTarget, knobTarget, sendTarget, share, volumeTarget, type KnobInputs, type KnobPage } from '../../src/ui/live/DeviceControls'
import { THRESHOLD_OFF } from '../../src/ui/live/SamplePanel'

/** Nothing open: the effect's knobs; [over] opens what a case needs. */
function inputs(over: Partial<KnobInputs> = {}): KnobInputs & { setXY: ReturnType<typeof vi.fn> } {
  const setXY = vi.fn()
  return {
    keys: null,
    pad: null,
    page: null,
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

  it('follows what is held, then what is open: KEYS, TEMPO, the pad sheet, the page, SAMPLE, STEP', () => {
    const keys = { root: 2, scale: Scale.MINOR, names: NoteNames.LETTERS, setRoot: vi.fn(), setScale: vi.fn() }
    const all = inputs({ keys, tempo: tempo(), pad: pad(), page: { kind: 'TIMING', timing: TimingSettings.DEFAULT, setInterval: vi.fn(), setSwing: vi.fn() }, sample: sample(), step: step() })
    expect(knobTarget('x', all)!.name).toBe(MirrorText.KEY.toUpperCase())
    expect(knobTarget('y', all)!.name).toBe(MirrorText.SCALE.toUpperCase())
    const noKeys = { ...all, keys: null }
    expect(knobTarget('x', noKeys)!.name).toBe(MirrorText.FN_TEMPO.toUpperCase())
    // TEMPO held: Y has nothing while arc's click has no level.
    expect(knobTarget('y', noKeys)).toBeNull()
    const noTempo = { ...noKeys, tempo: null }
    expect(knobTarget('x', noTempo)!.name).toBe(MirrorText.MODE.toUpperCase())
    expect(knobTarget('y', noTempo)!.name).toBe(MirrorText.PAN.toUpperCase())
    const noPad = { ...noTempo, pad: null }
    expect(knobTarget('x', noPad)!.name).toBe(MirrorText.INTERVAL.toUpperCase())
    const noPage = { ...noPad, page: null }
    expect(knobTarget('x', noPage)!.name).toBe(MirrorText.LEVEL.toUpperCase())
    expect(knobTarget('y', noPage)!.name).toBe(MirrorText.THRESHOLD.toUpperCase())
    const noSample = { ...noPage, sample: sample(false) }
    expect(knobTarget('x', noSample)!.name).toBe(MirrorText.VEL.toUpperCase())
    expect(knobTarget('y', noSample)!.name).toBe(MirrorText.LEN.toUpperCase())
    expect(knobTarget('x', { ...noSample, step: step(false) })!.name).toBe('FX X')
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

describe("knobTarget on the drawn device's pages and keys held", () => {
  const padKnobs = (adjust = vi.fn()) => ({ settings: PadSettings.DEFAULT, frames: 46875, sampleRate: 46875, enabled: true, adjust })

  it("KEYS held: X the key (0..11, named), Y the scale, each set as turned", () => {
    const keys = { root: 4, scale: Scale.MAJOR, names: NoteNames.LETTERS, setRoot: vi.fn(), setScale: vi.fn() }
    const x = knobTarget('x', inputs({ keys }))!
    expect(x).toMatchObject({ value: 4, min: 0, max: 11, step: 1, readout: 'E', what: WebText.TURN_KEY })
    x.set(7.4)
    expect(keys.setRoot).toHaveBeenLastCalledWith(7)
    const y = knobTarget('y', inputs({ keys }))!
    expect(y).toMatchObject({ value: SCALES.indexOf(Scale.MAJOR), max: SCALES.length - 1, readout: MirrorText.scaleName(Scale.MAJOR) })
    y.set(SCALES.indexOf(Scale.BLUES))
    expect(keys.setScale).toHaveBeenLastCalledWith(Scale.BLUES)
    // Past the ends it stays on the last scale.
    y.set(99)
    expect(keys.setScale).toHaveBeenLastCalledWith(SCALES[SCALES.length - 1])
  })

  it("SOUND: X the played pad's LEVEL, Y its PITCH; nothing with no pad open", () => {
    const adjust = vi.fn()
    const page: KnobPage = { kind: 'SOUND', pad: padKnobs(adjust) }
    const x = knobTarget('x', inputs({ page }))!
    expect(x).toMatchObject({ name: MirrorText.LEVEL.toUpperCase(), value: PadSettings.DEFAULT.level, max: PadSettings.LEVEL_MAX })
    x.set(72.3)
    expect(adjust).toHaveBeenLastCalledWith({ ...PadSettings.DEFAULT, level: 72 })
    const y = knobTarget('y', inputs({ page }))!
    expect(y).toMatchObject({ name: MirrorText.PITCH.toUpperCase(), step: 0.1, min: -PadSettings.PITCH_MAX })
    y.set(-2)
    expect(adjust).toHaveBeenLastCalledWith({ ...PadSettings.DEFAULT, pitch: -2 })
    expect(knobTarget('x', inputs({ page: { kind: 'SOUND', pad: null } }))).toBeNull()
  })

  it("EDIT: the page's X and Y on the played pad, as the sheet's", () => {
    expect(knobTarget('x', inputs({ page: { kind: 'EDIT', page: 'TRIM', pad: padKnobs() } }))!.name).toBe(MirrorText.START.toUpperCase())
    expect(knobTarget('y', inputs({ page: { kind: 'EDIT', page: 'TRIM', pad: padKnobs() } }))!.name).toBe(MirrorText.LENGTH.toUpperCase())
    expect(knobTarget('y', inputs({ page: { kind: 'EDIT', page: 'MUTE', pad: padKnobs() } }))).toBeNull()
    // The pad sheet open has the knobs before the page.
    expect(knobTarget('x', inputs({ pad: pad(), page: { kind: 'EDIT', page: 'TRIM', pad: padKnobs() } }))!.name).toBe(MirrorText.MODE.toUpperCase())
  })

  it("TEMPO: X the tempo; Y the click's level once there is one", () => {
    const t = tempo()
    expect(knobTarget('x', inputs({ page: { kind: 'TEMPO', tempo: t } }))!.value).toBe(128)
    expect(knobTarget('y', inputs({ page: { kind: 'TEMPO', tempo: t } }))).toBeNull()
    const click = { level: 0.4, set: vi.fn() }
    const y = knobTarget('y', inputs({ page: { kind: 'TEMPO', tempo: { ...t, click } } }))!
    expect(y).toMatchObject({ name: MirrorText.CLICK.toUpperCase(), value: 0.4, readout: '40' })
    y.set(0.2)
    expect(click.set).toHaveBeenLastCalledWith(0.2)
  })

  it('TIMING: X the interval, Y the swing (resting where the interval does not swing)', () => {
    const setInterval = vi.fn()
    const setSwing = vi.fn()
    const page: KnobPage = { kind: 'TIMING', timing: TimingSettings.DEFAULT, setInterval, setSwing }
    const x = knobTarget('x', inputs({ page }))!
    expect(x).toMatchObject({ value: TIMING_INTERVALS.indexOf('1/16'), readout: '1/16', max: TIMING_INTERVALS.length - 1 })
    x.set(TIMING_INTERVALS.indexOf('1/8T'))
    expect(setInterval).toHaveBeenLastCalledWith('1/8T')
    const y = knobTarget('y', inputs({ page }))!
    expect(y).toMatchObject({ value: 50, min: 50, max: 75, readout: '50%', enabled: true })
    y.set(62.4)
    expect(setSwing).toHaveBeenLastCalledWith(62)
    const triplets: KnobPage = { ...page, timing: TimingSettings.withInterval(TimingSettings.DEFAULT, '1/16T') }
    expect(knobTarget('y', inputs({ page: triplets }))!.enabled).toBe(false)
  })

  it("FX the effect's knobs, OUTPUT the compressor, SIDECHAIN the duck", () => {
    const setComp = vi.fn()
    const setSidechainXY = vi.fn()
    const fx = { settings: FxSettings.DEFAULT, bpm: 120, setXY: vi.fn(), setComp, setSidechainXY }
    expect(knobTarget('x', inputs({ fx, page: { kind: 'FX' }, sample: sample() }))!.name).toBe('FX X')
    const drive = knobTarget('x', inputs({ fx, page: { kind: 'OUTPUT' } }))!
    expect(drive).toMatchObject({ name: MirrorText.DRIVE.toUpperCase(), readout: FxSettings.xReadout(FxType.COMPRESSOR, FxSettings.DEFAULT.comp.x) })
    drive.set(0.8)
    expect(setComp).toHaveBeenLastCalledWith(0.8, FxSettings.DEFAULT.comp.y)
    const shape = knobTarget('y', inputs({ fx, page: { kind: 'SIDECHAIN' } }))!
    expect(shape).toMatchObject({ name: MirrorText.SHAPE.toUpperCase(), readout: MirrorText.sidechainShape(FxSettings.DEFAULT.sidechain.y) })
    shape.set(0.1)
    expect(setSidechainXY).toHaveBeenLastCalledWith(FxSettings.DEFAULT.sidechain.x, 0.1)
  })

  it("the fader on the FX page is the group's send", () => {
    const set = vi.fn()
    const fx = FxSettings.withSend(FxSettings.DEFAULT, 2, 0.35)
    const c = sendTarget(2, fx, set)
    expect(c).toMatchObject({ name: '→FX C', value: Math.fround(0.35), def: 0, what: WebText.turnSend('C') })
    c.set(0.6)
    expect(set).toHaveBeenLastCalledWith(2, 0.6)
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
