// Port of core/src/main/kotlin/dev/arc/ep133/formats/Tar.kt (+ reference/src/formats/tar.js)
//
// Read-only ustar parsing, just enough to see which sample slots a project uses.

/** Reads a TAR into name → bytes, in file order. Only regular files are kept. */
export function readTar(data: Uint8Array): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>()
  let off = 0
  const field = (h: Uint8Array, s: number, l: number): string => {
    let t = ''
    for (let i = s; i < s + l && h[i]; i++) t += String.fromCharCode(h[i]!)
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
    // Deviation (agreed, Tar.kt): a negative size moves `off` backwards and the
    // reference loops forever on a crafted file; stop reading instead.
    if (size < 0) break
    // h[156] || 48: a NUL type byte reads as '0', so the '\0' test never fires.
    const type = String.fromCharCode(h[156] || 48)
    if (type === '0' || type === '\0') out.set(name, data.subarray(off, off + size))
    off += Math.ceil(size / 512) * 512
  }
  return out
}

/**
 * Pad record paths: `/(^|\/)pads\/.+\/p\d+$/` from the reference, with capture
 * groups for the pad group (1) and pad number (2) that ProjectPads reads.
 */
export const PAD_RE = /(?:^|\/)pads\/(.+)\/p(\d+)$/

/** Sample slots (1..999) referenced by pads in a project TAR, sorted and de-duplicated. */
export function slotsUsedByProject(tar: Uint8Array): number[] {
  const slots = new Set<number>()
  try {
    for (const [name, rec] of readTar(tar)) {
      if (!PAD_RE.test(name) || rec.length < 3) continue
      const slot = rec[1]! | (rec[2]! << 8)
      if (slot >= 1 && slot <= 999) slots.add(slot)
    }
  } catch {
    // Unknown layout; caller treats as "no information".
  }
  return [...slots].sort((a, b) => a - b)
}
