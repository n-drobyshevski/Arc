// Port of core/src/main/kotlin/dev/arc/ep133/util/Bytes.kt
//
// Byte helpers. JS reads bytes as 0..255 natively and `Uint8Array.subarray`
// already clamps, so only the helpers the Kotlin adds on top are here.

/** One part of [bytes]: a number (wrapped mod 256), a byte/number list, or a string (UTF-8). */
export type BytePart = number | Uint8Array | ArrayLike<number> | string

const utf8 = new TextEncoder()

/**
 * Builds a Uint8Array from numbers (wrapped mod 256, like `Uint8Array.from`),
 * Uint8Arrays, number arrays and strings (UTF-8 encoded). Replaces array spreading.
 */
export function bytes(...parts: BytePart[]): Uint8Array {
  const chunks: (number | Uint8Array | ArrayLike<number>)[] = []
  let length = 0
  for (const p of parts) {
    if (typeof p === 'number') {
      chunks.push(p)
      length += 1
    } else if (typeof p === 'string') {
      const b = utf8.encode(p)
      chunks.push(b)
      length += b.length
    } else {
      chunks.push(p)
      length += p.length
    }
  }
  const out = new Uint8Array(length)
  let o = 0
  for (const c of chunks) {
    if (typeof c === 'number') {
      out[o++] = c & 0xff
    } else if (c instanceof Uint8Array) {
      out.set(c, o)
      o += c.length
    } else {
      for (let i = 0; i < c.length; i++) out[o++] = (c[i] ?? 0) & 0xff
    }
  }
  return out
}

/** Unsigned byte at [i], or 0 when [i] is out of range (like `undefined | 0` in JS). */
export function u8(b: ArrayLike<number>, i: number): number {
  return (b[i] ?? 0) & 0xff
}

/** Joins byte arrays into one. */
export function concat(...parts: Uint8Array[]): Uint8Array {
  let length = 0
  for (const p of parts) length += p.length
  const out = new Uint8Array(length)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** Whether two byte arrays hold the same bytes. */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

const HEX = '0123456789ABCDEF'

/** "F0 00 20" style uppercase hex, used by the debug log and tests. */
export function toHex(b: Uint8Array, sep = ' '): string {
  let s = ''
  for (let i = 0; i < b.length; i++) {
    if (i > 0) s += sep
    const v = b[i] ?? 0
    s += HEX[v >>> 4]! + HEX[v & 0xf]!
  }
  return s
}

/** Parses whitespace separated hex bytes ("F0 7E 7F"). Throws on a part that is not hex. */
export function hexBytes(s: string): Uint8Array {
  const parts = s.trim().split(/[ \t\r\n]+/).filter((p) => p.length > 0)
  const out = new Uint8Array(parts.length)
  parts.forEach((p, i) => {
    // Kotlin's String.toInt(16): optional sign, then hex digits only.
    if (!/^[+-]?[0-9a-fA-F]+$/.test(p)) throw new Error(`For input string: "${p}"`)
    out[i] = parseInt(p, 16) & 0xff
  })
  return out
}
