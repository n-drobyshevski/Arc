// Port of core/src/main/kotlin/dev/arc/ep133/protocol/Packed7.kt (+ reference/src/protocol/packed7.js)
//
// 7-bit packing used inside TE SysEx frames.
// Every group of up to 7 data bytes is preceded by one byte that carries
// their high bits (bit n = high bit of the n-th byte in the group).

export function packedLength(n: number): number {
  return n + Math.ceil(n / 7)
}

export function pack7(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(packedLength(data.length))
  let o = 0
  for (let i = 0; i < data.length; i += 7) {
    const flagsAt = o++
    let flags = 0
    const end = Math.min(i + 7, data.length)
    for (let j = i; j < end; j++) {
      const b = data[j] ?? 0
      if (b & 0x80) flags |= 1 << (j - i)
      out[o++] = b & 0x7f
    }
    out[flagsAt] = flags
  }
  return out
}

/**
 * Inverse of [pack7]. Like the Kotlin it does no validation: data high bits are
 * masked off and a trailing lone flags byte yields nothing.
 */
export function unpack7(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.max(0, data.length - Math.ceil(data.length / 8)))
  let o = 0
  let i = 0
  while (i < data.length) {
    const flags = data[i++] ?? 0
    for (let bit = 0; bit < 7 && i < data.length; bit++, i++) {
      out[o++] = ((data[i] ?? 0) & 0x7f) | (((flags >> bit) & 1) << 7)
    }
  }
  return o === out.length ? out : out.slice(0, o)
}
