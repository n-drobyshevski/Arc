// Port of app/src/main/kotlin/dev/arc/ep133/audio/OutputDelay.kt
//
// The delay Live makes up for when its sound goes to Bluetooth (an
// addition): the maths, with no browser in it. The output's own stamp says
// when a frame is heard (liveAudio.ts heardAt: the output timestamp, or the
// latency the context reports), and how much of a wireless link it counts is
// up to the browser. The latency the context reports is the part the stamp
// counts; what is made up for ([ms]) is the rest of the delay a wireless
// output is taken to have ([TYPICAL_MS] at least), never the counted part
// twice. Live's mix is not moved: only what is lined up with something else
// is (the playhead and a press's place on the timeline, to what is heard; the
// click on the EP-133's clock, sent earlier).
//
// Web deltas:
// - Milliseconds (performance.now()'s clock), not nanoseconds: no nanos().
// - No latencyMs(): the browser reports the output's latency itself.
// - Whether the output is wireless is a guess from a long latency (liveAudio.ts
//   isSlowOutput); browsers don't name the route.

import { Seq } from './pattern'
import type { BeatGrid } from './tempo'

/**
 * What a wireless output is taken to delay in all, at least, in ms: a
 * typical A2DP link with a common codec, the buffers included.
 */
export const TYPICAL_MS = 180

function counted(countedMs: number | null): number {
  return countedMs !== null && countedMs > 0 ? countedMs : 0
}

/** The delay a wireless output is taken to have in all (ms): [TYPICAL_MS], or what the output [countedMs] when longer. */
function totalMs(countedMs: number | null): number {
  return Math.max(counted(countedMs), TYPICAL_MS)
}

/**
 * The delay to make up for (ms): 0 unless the output is [wireless] and the
 * setting is [on]; then [totalMs] less the part the output's stamp already
 * [countedMs]. Never the measured latency itself.
 */
function ms(on: boolean, wireless: boolean, countedMs: number | null): number {
  return !on || !wireless ? 0 : totalMs(countedMs) - counted(countedMs)
}

/** [delayMs] as ticks of the pattern at [bpm] (Seq.PPQN a beat), fractional. */
function ticks(delayMs: number, bpm: number): number {
  return (delayMs * bpm * Seq.PPQN) / 60_000
}

/**
 * Where a press is recorded: [heard], the tick the player hears at the press
 * (the stamp's [tick] less the delay). Only a [heard] below 0 has no earlier
 * pass to be in: counted in ([countedIn]) the player hears the count-in, so it
 * stays as heard; in a run a press started, it counts as the stamp has it, no
 * earlier than the start.
 */
function placed(tick: number, heard: number, countedIn: boolean): number {
  return heard >= 0 || countedIn ? heard : Math.max(heard, Math.min(tick, 0))
}

/** The EP-133's beats sent [delayMs] earlier, so they are heard on the device's. */
function earlier(grid: BeatGrid, delayMs: number): BeatGrid {
  return delayMs === 0 ? grid : { ...grid, anchor: grid.anchor - delayMs }
}

export const OutputDelay = { TYPICAL_MS, totalMs, ms, ticks, placed, earlier } as const
