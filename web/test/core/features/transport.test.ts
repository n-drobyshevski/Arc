// Port of core/src/test/kotlin/dev/arc/ep133/features/TransportTest.kt
//
// Web delta: times are milliseconds where the Kotlin uses nanoseconds.
import { describe, expect, it } from 'vitest'
import { None, PunchIn, PunchOut, Start, Stop, Transport, transportState } from '../../../src/core/features/transport'

const playing = (recording = false): Transport => {
  const t = new Transport()
  t.play(false, true)
  if (recording) {
    t.recordDown(0)
    t.recordUp(10)
  }
  return t
}

describe('TransportTest', () => {
  it('RECORD arms and disarms while stopped', () => {
    const t = new Transport()
    expect(t.state).toEqual(transportState())
    expect(t.recordDown(0)).toEqual(None)
    expect(t.state).toEqual(transportState('ARMED'))
    expect(t.recordUp(10)).toEqual(None)
    expect(t.recordDown(20)).toEqual(None)
    expect(t.state).toEqual(transportState('STOPPED'))
  })

  it('RECORD then PLAY counts a bar in, then records', () => {
    const t = new Transport()
    t.recordDown(0)
    t.recordUp(10)
    expect(t.play(false, true)).toEqual(Start(1, true))
    expect(t.state).toEqual(transportState('COUNT_IN', true))
    expect(t.countedIn()).toEqual(None)
    expect(t.state).toEqual(transportState('PLAYING', true))
    // Not counting in: nothing.
    expect(t.countedIn()).toEqual(None)
    expect(t.state).toEqual(transportState('PLAYING', true))
  })

  it('RECORD and PLAY together, or the count-in off, start at once', () => {
    const held = new Transport()
    held.recordDown(0)
    expect(held.play(true, true)).toEqual(Start(0, true))
    expect(held.state).toEqual(transportState('PLAYING', true))
    // Letting go of the RECORD that armed it doesn't stop the recording.
    expect(held.recordUp(2_000)).toEqual(None)
    expect(held.state).toEqual(transportState('PLAYING', true))
    const off = new Transport()
    off.recordDown(0)
    off.recordUp(10)
    expect(off.play(false, false)).toEqual(Start(0, true))
    expect(off.state).toEqual(transportState('PLAYING', true))
  })

  it('armed, a pad starts the recording at once, bar 1 on its press', () => {
    const t = new Transport()
    t.recordDown(0)
    t.recordUp(10)
    expect(t.padDown(500)).toEqual(Start(0, true, 500))
    expect(t.state).toEqual(transportState('PLAYING', true))
    // Running, a pad is only a pad.
    expect(t.padDown(600)).toEqual(None)
    expect(t.state).toEqual(transportState('PLAYING', true))
    // RECORD let go of after the pad that started it: nothing.
    const held = new Transport()
    held.recordDown(0)
    held.padDown(100)
    expect(held.recordUp(2_000)).toEqual(None)
    expect(held.state).toEqual(transportState('PLAYING', true))
    // Stopped, counting in, or playing without recording: nothing.
    const stopped = new Transport()
    expect(stopped.padDown(0)).toEqual(None)
    expect(stopped.state).toEqual(transportState())
    const counting = new Transport()
    counting.recordDown(0)
    counting.play(false, true)
    expect(counting.padDown(100)).toEqual(None)
    expect(counting.state).toEqual(transportState('COUNT_IN', true))
    const plays = playing()
    expect(plays.padDown(0)).toEqual(None)
    expect(plays.state).toEqual(transportState('PLAYING', false))
    // PLAY's start has no press to put bar 1 on.
    expect(new Transport().play(false, true)).toEqual(Start(0, false, null))
  })

  it('PLAY alone plays from bar 1, and stops whatever runs', () => {
    const t = new Transport()
    expect(t.play(false, true)).toEqual(Start(0, false))
    expect(t.state).toEqual(transportState('PLAYING', false))
    expect(t.play(false, true)).toEqual(Stop)
    expect(t.state).toEqual(transportState())
    // Counting in, or recording: PLAY stops too.
    t.recordDown(0)
    t.play(false, true)
    expect(t.play(false, true)).toEqual(Stop)
    expect(t.state).toEqual(transportState())
    const rec = playing(true)
    expect(rec.play(false, true)).toEqual(Stop)
    expect(rec.state).toEqual(transportState())
  })

  it('RECORD while playing punches in and out', () => {
    const t = playing()
    expect(t.recordDown(0)).toEqual(PunchIn)
    expect(t.state).toEqual(transportState('PLAYING', true))
    expect(t.recordUp(100)).toEqual(None)
    expect(t.state).toEqual(transportState('PLAYING', true))
    expect(t.recordDown(200)).toEqual(PunchOut)
    expect(t.state).toEqual(transportState('PLAYING', false))
    // The up after a punch-out does nothing, however long it was held.
    expect(t.recordUp(2_000)).toEqual(None)
    expect(t.state).toEqual(transportState('PLAYING', false))
  })

  it('RECORD held while playing records only while held', () => {
    const t = playing()
    expect(t.recordDown(1_000)).toEqual(PunchIn)
    expect(t.recordUp(1_000 + Transport.LONG_PRESS_MS - 0.000001)).toEqual(None)
    expect(t.state).toEqual(transportState('PLAYING', true))
    const held = playing()
    held.recordDown(1_000)
    expect(held.recordUp(1_000 + Transport.LONG_PRESS_MS)).toEqual(PunchOut)
    expect(held.state).toEqual(transportState('PLAYING', false))
    const custom = playing()
    custom.recordDown(0)
    expect(custom.recordUp(100, 100)).toEqual(PunchOut)
  })

  it('RECORD during the count-in calls off the recording, and the count goes on', () => {
    const t = new Transport()
    t.recordDown(0)
    t.recordUp(10)
    t.play(false, true)
    expect(t.recordDown(100)).toEqual(PunchOut)
    expect(t.state).toEqual(transportState('COUNT_IN', false))
    // Held: no momentary punch-out of a recording that hasn't started.
    expect(t.recordDown(200)).toEqual(PunchIn)
    expect(t.recordUp(2_000)).toEqual(None)
    expect(t.state).toEqual(transportState('COUNT_IN', true))
    t.recordDown(2_100)
    t.countedIn()
    expect(t.state).toEqual(transportState('PLAYING', false))
  })

  it('stop from outside', () => {
    const t = playing(true)
    expect(t.stop()).toEqual(Stop)
    expect(t.state).toEqual(transportState())
    expect(t.stop()).toEqual(None)
    const armed = new Transport()
    armed.recordDown(0)
    expect(armed.stop()).toEqual(None)
    expect(armed.state).toEqual(transportState())
    const counting = new Transport()
    counting.recordDown(0)
    counting.play(false, true)
    expect(counting.stop()).toEqual(Stop)
    // A held RECORD let go of after it: nothing.
    const held = playing()
    held.recordDown(0)
    held.stop()
    expect(held.recordUp(2_000)).toEqual(None)
  })

  it('SAMPLE opening punches out and plays on', () => {
    const t = playing(true)
    expect(t.punchOut()).toEqual(PunchOut)
    expect(t.state).toEqual(transportState('PLAYING', false))
    expect(t.punchOut()).toEqual(None)
    const armed = new Transport()
    armed.recordDown(0)
    expect(armed.punchOut()).toEqual(None)
    expect(armed.state).toEqual(transportState())
    const counting = new Transport()
    counting.recordDown(0)
    counting.play(false, true)
    expect(counting.punchOut()).toEqual(PunchOut)
    expect(counting.state).toEqual(transportState('COUNT_IN', false))
  })
})
