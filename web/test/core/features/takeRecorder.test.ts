// Port of core/src/test/kotlin/dev/arc/ep133/features/TakeRecorderTest.kt
import { describe, expect, it } from 'vitest'
import { TakeRecorder } from '../../../src/core/features/takeRecorder'
import { VoiceMixer } from '../../../src/core/formats/voiceMixer'
import { decodeWav, encodeWav, wavHeader } from '../../../src/core/formats/wav'

const burst = (frames: number, v = 0): Int16Array => new Int16Array(frames * 2).fill(v)
const firstStart = (m: VoiceMixer): number | null => (m.started.length === 0 ? null : Math.min(...m.started.map((s) => s.frame)))

describe('TakeRecorder', () => {
  it('nothing is recorded until armed, and armed waits for the first sound', () => {
    const r = new TakeRecorder(1000)
    expect(r.onBurst(burst(16, 5), 16, 0, 0)).toBeNull()
    r.arm()
    expect(r.state).toBe('ARMED')
    expect(r.onBurst(burst(16), 16, 16, null)).toBeNull()
    expect(r.onBurst(burst(16), 16, 32, null)).toBeNull()
    expect(r.frames).toBe(0)
  })

  it('the take starts at the frame the first sound starts', () => {
    const r = new TakeRecorder(1000)
    r.arm()
    const k = r.onBurst(burst(16, 7), 16, 64, 70)!
    expect(k.from).toBe(6)
    expect(k.frames).toBe(10)
    expect(r.state).toBe('RECORDING')
    // From then on every burst is kept whole, silent or not.
    const k2 = r.onBurst(burst(16), 16, 80, null)!
    expect(k2.from).toBe(0)
    expect(k2.frames).toBe(16)
    expect(r.frames).toBe(26)
  })

  it('silence after the last sound is left out', () => {
    const r = new TakeRecorder(1000)
    r.arm()
    const out = burst(8)
    out[2 * 2] = 100 // frame 2 left
    out[2 * 4 + 1] = -3 // frame 4 right
    r.onBurst(out, 8, 0, 0)
    r.onBurst(burst(8), 8, 8, null)
    expect(r.frames).toBe(16)
    expect(r.stop()).toBe(5)
    expect(r.state).toBe('IDLE')
  })

  it('stopping before anything played keeps nothing', () => {
    const r = new TakeRecorder(1000)
    r.arm()
    r.onBurst(burst(8), 8, 0, null)
    expect(r.stop()).toBe(0)
    // And it can be armed again.
    r.arm()
    expect(r.state).toBe('ARMED')
  })

  it('a take stops by itself at the limit', () => {
    const r = new TakeRecorder(1000, 20)
    r.arm()
    expect(r.onBurst(burst(16, 1), 16, 0, 0)!.last).toBe(false)
    const k = r.onBurst(burst(16, 1), 16, 16, null)!
    expect(k.frames).toBe(4)
    expect(k.last).toBe(true)
    expect(r.state).toBe('IDLE')
    expect(r.audible).toBe(20)
    expect(r.onBurst(burst(16, 1), 16, 32, null)).toBeNull()
    expect(TakeRecorder.MAX_SECONDS).toBe(600)
  })

  it('the device starting to play starts an armed take at the next burst', () => {
    const r = new TakeRecorder(1000)
    r.transportStart() // Not armed: nothing happens.
    r.arm()
    expect(r.onBurst(burst(8), 8, 0, null)).toBeNull()
    r.transportStart()
    expect(r.state).toBe('ARMED')
    // The whole burst is kept, silent as it is, so the take lines up with the device.
    const k = r.onBurst(burst(8), 8, 8, null)!
    expect(k.from).toBe(0)
    expect(k.frames).toBe(8)
    expect(r.byTransport).toBe(true)
    const out = burst(8)
    out[2 * 3] = 9
    r.onBurst(out, 8, 16, 18)
    // The silence in front is kept, the silence after the last sound isn't.
    expect(r.stop()).toBe(12)
  })

  it("a take started by a sound doesn't follow the device", () => {
    const r = new TakeRecorder(1000)
    r.arm()
    r.onBurst(burst(8, 1), 8, 0, 0)
    r.transportStart()
    expect(r.byTransport).toBe(false)
    // A start that came too late for its take is forgotten once it stops.
    r.stop()
    r.arm()
    expect(r.onBurst(burst(8), 8, 8, null)).toBeNull()
    expect(r.byTransport).toBe(false)
  })

  it('seconds count the recorded frames', () => {
    const r = new TakeRecorder(10)
    r.arm()
    for (let i = 0; i < 3; i++) r.onBurst(burst(10, 1), 10, i * 10, i === 0 ? 0 : null)
    expect(r.seconds).toBe(3)
  })

  it('recording the mixer from the first press', () => {
    const m = new VoiceMixer(1000)
    const r = new TakeRecorder(1000)
    const out = new Int16Array(32)
    r.arm()
    m.render(out, 16)
    expect(r.onBurst(out, 16, m.frame - 16, firstStart(m))).toBeNull()
    m.start('a', new Int16Array(20).fill(500), 1, 1000)
    m.render(out, 16)
    const k = r.onBurst(out, 16, m.frame - 16, firstStart(m))!
    expect(k.from).toBe(0)
    expect(out[0]).toBe(500)
    m.render(out, 16)
    r.onBurst(out, 16, m.frame - 16, firstStart(m))
    // The sound's 20 frames, then silence that isn't kept.
    expect(r.stop()).toBe(20)
  })

  it('armed at a frame, the take starts there, sound or not', () => {
    const r = new TakeRecorder(1000)
    r.armAt(40)
    // A sound before the frame doesn't start it.
    expect(r.onBurst(burst(16, 5), 16, 16, 20)).toBeNull()
    expect(r.state).toBe('ARMED')
    const k = r.onBurst(burst(16), 16, 32, null)!
    expect(k.from).toBe(8)
    expect(k.frames).toBe(8)
    expect(r.state).toBe('RECORDING')
  })

  it('armed at a frame already gone, the take starts with the next burst', () => {
    const r = new TakeRecorder(1000)
    r.arm()
    r.armAt(10)
    const k = r.onBurst(burst(16), 16, 32, null)!
    expect(k.from).toBe(0)
    expect(k.frames).toBe(16)
  })

  it('stopped at a frame, the take keeps the silence up to it', () => {
    const r = new TakeRecorder(1000)
    r.armAt(8)
    const out = burst(16)
    out[2 * 9] = 100 // frame 9: the take's second
    r.onBurst(out, 16, 0, null)
    r.stopAt(40)
    expect(r.onBurst(burst(16), 16, 16, null)!.last).toBe(false)
    const k = r.onBurst(burst(16), 16, 32, null)!
    expect(k.from).toBe(0)
    expect(k.frames).toBe(8)
    expect(k.last).toBe(true)
    expect(r.state).toBe('IDLE')
    // Frames 8 to 40, silent or not.
    expect(r.frames).toBe(32)
    expect(r.stop()).toBe(32)
  })

  it('a take armed and stopped at frames is exactly the frames between', () => {
    const r = new TakeRecorder(1000)
    r.armAt(100)
    r.stopAt(110)
    expect(r.onBurst(burst(64), 64, 0, null)).toBeNull()
    const k = r.onBurst(burst(64), 64, 64, null)!
    expect(k.from).toBe(36)
    expect(k.frames).toBe(10)
    expect(k.last).toBe(true)
    expect(r.stop()).toBe(10)
  })

  it('stopped at a frame already recorded past, the take ends there', () => {
    const r = new TakeRecorder(1000)
    r.armAt(0)
    r.onBurst(burst(16, 1), 16, 0, null)
    r.stopAt(10)
    // Stopped before the next burst: what was recorded up to the frame.
    expect(r.stop()).toBe(10)
    r.armAt(100)
    r.onBurst(burst(16), 16, 100, null)
    r.stopAt(104)
    const k = r.onBurst(burst(16), 16, 116, null)!
    expect(k.frames).toBe(0)
    expect(k.last).toBe(true)
    expect(r.stop()).toBe(4)
  })

  it('stopped before its stop frame, the take keeps all it recorded, silence too', () => {
    const r = new TakeRecorder(1000)
    r.armAt(0)
    const out = burst(16)
    out[2 * 2] = 100
    r.onBurst(out, 16, 0, null)
    r.stopAt(1000)
    expect(r.onBurst(burst(16), 16, 16, null)!.last).toBe(false)
    // Only frame 2 sounds, yet the take was locked to frames: all 32 are kept.
    expect(r.audible).toBe(3)
    expect(r.stop()).toBe(32)
    expect(r.state).toBe('IDLE')
  })

  it("a take already recording isn't armed again at a frame", () => {
    const r = new TakeRecorder(1000)
    r.arm()
    r.onBurst(burst(16, 3), 16, 0, 0)
    r.armAt(100)
    expect(r.state).toBe('RECORDING')
    expect(r.onBurst(burst(16, 3), 16, 16, null)!.frames).toBe(16)
    expect(r.frames).toBe(32)
  })

  it('a plain arm after a take locked to frames waits for a sound and has no stop frame', () => {
    const r = new TakeRecorder(1000)
    r.armAt(0)
    r.stopAt(8)
    expect(r.onBurst(burst(16), 16, 0, null)!.last).toBe(true)
    r.arm()
    expect(r.onBurst(burst(16), 16, 16, null)).toBeNull()
    const k = r.onBurst(burst(16, 4), 16, 32, 40)!
    expect(k.from).toBe(8)
    expect(k.last).toBe(false)
    expect(r.onBurst(burst(16, 4), 16, 48, null)!.last).toBe(false)
    expect(r.stop()).toBe(24)
  })

  it('a header for audio written as it is recorded', () => {
    const h = wavHeader(4000, 2, 48000)
    expect(h.length).toBe(44)
    const dv = new DataView(h.buffer)
    expect(dv.getInt32(4, true)).toBe(36 + 4000)
    expect(dv.getInt16(22, true)).toBe(2)
    expect(dv.getInt32(24, true)).toBe(48000)
    expect(dv.getInt32(28, true)).toBe(48000 * 4)
    expect(dv.getInt32(40, true)).toBe(4000)
    const pcm = Uint8Array.from({ length: 4000 }, (_, i) => i & 0xff)
    const whole = new Uint8Array(44 + 4000)
    whole.set(h)
    whole.set(pcm, 44)
    expect(whole).toEqual(encodeWav(pcm, 2, 48000))
    const w = decodeWav(whole)
    expect(w.channels).toBe(2)
    expect(w.sampleRate).toBe(48000)
  })
})
