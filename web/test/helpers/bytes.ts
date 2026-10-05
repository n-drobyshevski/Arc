// Port of core/src/test/kotlin/dev/arc/ep133/testing/TestBytes.kt (+ reference/test/e2e.test.js helpers)
//
// Helpers shared by the ported tests.

import { hexBytes } from '../../src/core/util/bytes'

/** "F0 7E 7F" style hex to bytes. */
export function hex(s: string): Uint8Array {
  return hexBytes(s)
}

/** `noise(n)` from e2e.test.js: (i * 31 + 7) & 0xff. */
export function noise(n: number): Uint8Array {
  return Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) & 0xff)
}

/** `pad(slot)` / `padRecord(slot)`: a 26-byte pad record with the slot little-endian in bytes 1..2. */
export function pad(slot: number): Uint8Array {
  const r = new Uint8Array(26)
  r[1] = slot & 0xff
  r[2] = slot >> 8
  return r
}

/** `tarFile(entries)` from the JS tests: ustar headers with name, octal size and type '0'. */
export function tarFile(entries: Iterable<readonly [string, Uint8Array]>): Uint8Array {
  const enc = new TextEncoder()
  const blocks: Uint8Array[] = []
  for (const [name, data] of entries) {
    const h = new Uint8Array(512)
    h.set(enc.encode(name), 0)
    h.set(enc.encode(data.length.toString(8).padStart(11, '0')), 124)
    h[156] = 48
    blocks.push(h, data, new Uint8Array((512 - (data.length % 512)) % 512))
  }
  blocks.push(new Uint8Array(1024))
  const out = new Uint8Array(blocks.reduce((n, b) => n + b.length, 0))
  let o = 0
  for (const b of blocks) {
    out.set(b, o)
    o += b.length
  }
  return out
}

/** Int16 samples to little-endian bytes (`new Uint8Array(new Int16Array(...).buffer)`). */
export function s16(...samples: number[]): Uint8Array {
  const out = new Uint8Array(samples.length * 2)
  const view = new DataView(out.buffer)
  samples.forEach((s, i) => view.setInt16(i * 2, s, true))
  return out
}
