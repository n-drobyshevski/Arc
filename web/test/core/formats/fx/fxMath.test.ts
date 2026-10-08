// A replay of the FX arithmetic's vectors (app/src/test/cpp/fx-math.golden,
// written by the Kotlin FxMath through FxMathGoldenTest), so the web port is
// held to it bit for bit as the C++ one is, plus a few cases of its own.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DENORMAL,
  Lcg,
  PI_F,
  clamp01,
  flush,
  knobHz,
  lerp,
  onePoleCoef,
  parabolicSine,
  semitoneRatio,
  softClip,
  svfG,
  tanApprox,
  triangle,
  wrap01,
} from '../../../../src/core/formats/fx/fxMath'
import { Svf } from '../../../../src/core/formats/fx/svf'

// app/src/test/cpp/fx-math.golden, read in place (like voice-mixer.golden).
const goldenPath = fileURLToPath(new URL('../../../../../app/src/test/cpp/fx-math.golden', import.meta.url))

const bitsView = new DataView(new ArrayBuffer(4))

/** A float's bits, as the golden file writes them (Integer.toHexString). */
function bits(v: number): string {
  bitsView.setFloat32(0, v)
  return bitsView.getUint32(0).toString(16)
}

function fromBits(hex: string): number {
  bitsView.setUint32(0, parseInt(hex, 16) >>> 0)
  return bitsView.getFloat32(0)
}

/** Replays the file; returns how many vectors matched, throwing at the first that doesn't. */
function replayGolden(text: string): number {
  let vectors = 0
  let ended = false
  for (const line of text.split('\n')) {
    if (line === '' || line.startsWith('#')) continue
    const w = line.split(' ')
    const op = w[0]
    const fl = (i: number): number => fromBits(w[i] as string)
    const int = (i: number): number => Number(w[i])
    const want = (got: number, at: number): void => {
      if (bits(got) !== w[at]) throw new Error(`fx-math.golden: ${line}: Kotlin ${w[at]}, web ${bits(got)}`)
    }
    switch (op) {
      case 'const':
        if (w[1] === 'DENORMAL') want(DENORMAL, 2)
        else if (w[1] === 'PI_F') want(PI_F, 2)
        else throw new Error(`fx-math.golden: unknown constant: ${line}`)
        break
      case 'flush':
        want(flush(fl(1)), 2)
        break
      case 'clamp01':
        want(clamp01(fl(1)), 2)
        break
      case 'lerp':
        want(lerp(fl(1), fl(2), fl(3)), 4)
        break
      case 'onePoleCoef':
        want(onePoleCoef(fl(1), int(2)), 3)
        break
      case 'tanApprox':
        want(tanApprox(fl(1)), 2)
        break
      case 'svfG':
        want(svfG(fl(1), int(2)), 3)
        break
      case 'softClip':
        want(softClip(fl(1)), 2)
        break
      case 'knobHz':
        want(knobHz(fl(1), fl(2), fl(3)), 4)
        break
      case 'triangle':
        want(triangle(fl(1)), 2)
        break
      case 'parabolicSine':
        want(parabolicSine(fl(1)), 2)
        break
      case 'wrap01':
        want(wrap01(fl(1)), 2)
        break
      case 'semitoneRatio':
        want(semitoneRatio(int(1)), 2)
        break
      case 'lcg':
      case 'lcgunit': {
        const lcg = new Lcg(int(1))
        const n = int(2)
        for (let i = 0; i < n; i++) {
          if (op === 'lcg') {
            const got = lcg.next()
            if (got !== int(3 + i)) throw new Error(`fx-math.golden: lcg ${w[1]}, number ${i}: Kotlin ${w[3 + i]}, web ${got}`)
          } else {
            want(lcg.unit(), 3 + i)
          }
        }
        break
      }
      case 'svf': {
        // As FxMathGoldenTest: noise (retuned halfway to half the cutoff), then silence; a hash of every output.
        const hz = fl(1)
        const q = fl(2)
        const rate = int(3)
        const n = int(5)
        const tail = int(6)
        const svf = new Svf()
        svf.tune(hz, q, rate)
        const lcg = new Lcg(int(4))
        let h = 0x811c9dc5 | 0
        const hash = (v: number): void => {
          h = Math.imul(h ^ parseInt(bits(v), 16), 16777619)
        }
        for (let i = 0; i < n + tail; i++) {
          if (i === n >> 1) svf.tune(Math.fround(hz * 0.5), q, rate)
          svf.process(i < n ? Math.fround(Math.fround(Math.fround(lcg.unit() * 2) - 1) * 32768) : 0)
          hash(svf.lp)
          hash(svf.bp)
          hash(svf.hp)
        }
        want(svf.lp, 8)
        want(svf.bp, 9)
        want(svf.hp, 10)
        if ((h >>> 0).toString(16) !== w[7]) throw new Error(`fx-math.golden: ${line}: web hash ${(h >>> 0).toString(16)}`)
        break
      }
      case 'end':
        ended = true
        continue
      default:
        throw new Error(`fx-math.golden: unknown line: ${line}`)
    }
    vectors++
  }
  if (!ended) throw new Error('fx-math.golden: no end line')
  return vectors
}

describe('FxMath', () => {
  it('gives what the Kotlin FxMath wrote, bit for bit', () => {
    expect(replayGolden(readFileSync(goldenPath, 'utf8'))).toBeGreaterThan(500)
  })

  it('keeps its constants as the frozen floats', () => {
    expect(bits(PI_F)).toBe('40490fdb')
    expect(semitoneRatio(0)).toBe(1)
    expect(semitoneRatio(12)).toBe(2)
    expect(semitoneRatio(-12)).toBe(0.5)
    expect(semitoneRatio(99)).toBe(2)
  })

  it('flushes tiny values and holds 0..1', () => {
    expect(flush(Math.fround(1e-16))).toBe(0)
    expect(flush(Math.fround(-1e-16))).toBe(0)
    expect(flush(0.5)).toBe(0.5)
    expect(clamp01(Number.NaN)).toBe(0)
    expect(clamp01(-0)).toBe(0)
    expect(Object.is(clamp01(-0), 0)).toBe(true)
    expect(clamp01(2)).toBe(1)
  })

  it('wraps like Kotlin Int and stays in 0..1', () => {
    const lcg = new Lcg(0)
    expect(lcg.next()).toBe(1013904223)
    expect(lcg.next()).toBe(1196435762)
    const u = new Lcg(-1)
    for (let i = 0; i < 1000; i++) {
      const v = u.unit()
      expect(v >= 0 && v < 1).toBe(true)
    }
  })
})
