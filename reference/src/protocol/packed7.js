// 7-bit packing used inside TE SysEx frames.
// Every group of up to 7 data bytes is preceded by one byte that carries
// their high bits (bit n = high bit of the n-th byte in the group).

export function packedLength(n) {
  return n + Math.ceil(n / 7)
}

export function pack7(data) {
  const out = new Uint8Array(packedLength(data.length))
  let o = 0
  for (let i = 0; i < data.length; i += 7) {
    const flagsAt = o++
    let flags = 0
    const end = Math.min(i + 7, data.length)
    for (let j = i; j < end; j++) {
      const b = data[j]
      if (b & 0x80) flags |= 1 << (j - i)
      out[o++] = b & 0x7f
    }
    out[flagsAt] = flags
  }
  return out
}

export function unpack7(data) {
  const out = new Uint8Array(Math.max(0, data.length - Math.ceil(data.length / 8)))
  let o = 0
  let i = 0
  while (i < data.length) {
    const flags = data[i++]
    for (let bit = 0; bit < 7 && i < data.length; bit++, i++) {
      out[o++] = (data[i] & 0x7f) | (((flags >> bit) & 1) << 7)
    }
  }
  return out.subarray(0, o)
}
