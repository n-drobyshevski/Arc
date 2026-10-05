// Tests for web/src/core/util/bytes.ts (port of core/src/main/kotlin/dev/arc/ep133/util/Bytes.kt).
// The Kotlin has no dedicated test file; these pin the helpers' documented behaviour.

import { describe, expect, it } from 'vitest'
import { bytes, concat, equalBytes, hexBytes, toHex, u8 } from '../../../src/core/util/bytes'

describe('Bytes', () => {
  it('bytes wraps numbers and joins arrays and strings', () => {
    expect([...bytes(0xf0, 256 + 7, -1, [1, 0x1ff], new Uint8Array([9]), 'é')]).toEqual([0xf0, 7, 0xff, 1, 0xff, 9, 0xc3, 0xa9])
    expect(bytes().length).toBe(0)
  })

  it('u8 reads 0 out of range', () => {
    const b = new Uint8Array([0xff])
    expect(u8(b, 0)).toBe(0xff)
    expect(u8(b, 1)).toBe(0)
    expect(u8(b, -1)).toBe(0)
  })

  it('hex round trip', () => {
    expect(toHex(new Uint8Array([0xf0, 0x00, 0x20, 0x7e]))).toBe('F0 00 20 7E')
    expect(toHex(new Uint8Array([0xab, 1]), '')).toBe('AB01')
    expect(toHex(new Uint8Array(0))).toBe('')
    expect([...hexBytes('  F0 7e\n\t7F  ')]).toEqual([0xf0, 0x7e, 0x7f])
    expect(hexBytes('').length).toBe(0)
    expect(() => hexBytes('zz')).toThrow()
  })

  it('concat and equalBytes', () => {
    const c = concat(new Uint8Array([1, 2]), new Uint8Array(0), new Uint8Array([3]))
    expect(equalBytes(c, new Uint8Array([1, 2, 3]))).toBe(true)
    expect(equalBytes(c, new Uint8Array([1, 2]))).toBe(false)
    expect(equalBytes(c, new Uint8Array([1, 2, 4]))).toBe(false)
  })
})
