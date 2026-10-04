// Read-only ustar parsing, just enough to see which sample slots a project uses.

export function readTar(data) {
  const out = new Map()
  let off = 0
  const field = (h, s, l) => {
    let t = ''
    for (let i = s; i < s + l && h[i]; i++) t += String.fromCharCode(h[i])
    return t
  }
  while (off + 512 <= data.length) {
    const h = data.subarray(off, off + 512)
    off += 512
    if (h.every((b) => b === 0)) break
    const prefix = field(h, 345, 155)
    const base = field(h, 0, 100)
    const name = (prefix ? `${prefix}/${base}` : base).replace(/^\.\//, '')
    const size = parseInt(field(h, 124, 12).trim() || '0', 8) || 0
    const type = String.fromCharCode(h[156] || 48)
    if (type === '0' || type === '\0') out.set(name, data.subarray(off, off + size))
    off += Math.ceil(size / 512) * 512
  }
  return out
}

/** Sample slots (1..999) referenced by pads in a project TAR. */
export function slotsUsedByProject(tar) {
  const slots = new Set()
  try {
    for (const [name, rec] of readTar(tar)) {
      if (!/(^|\/)pads\/.+\/p\d+$/.test(name) || rec.length < 3) continue
      const slot = rec[1] | (rec[2] << 8)
      if (slot >= 1 && slot <= 999) slots.add(slot)
    }
  } catch {
    // Unknown layout; caller treats as "no information".
  }
  return [...slots].sort((a, b) => a - b)
}
