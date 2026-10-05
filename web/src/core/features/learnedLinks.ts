// Port of core/src/main/kotlin/dev/arc/ep133/features/LearnedLinks.kt
//
// Live's learned pad links as kept in preferences and library.json (an
// addition): "offset:pad" pairs, offset 0..11 to the pad's number 1..12 in
// project files. See liveMirror.
//
// Web delta: Kotlin's String.toIntOrNull (which reads any Unicode decimal
// digits) is the local ktToIntOrNull below.

const ND = /\p{Nd}/u
const isDigitUnit = (u: number): boolean => u >= 0 && ND.test(String.fromCharCode(u))
// Unicode decimal digits come in runs of ten from zero: a digit's value is how far it is from its run's start.
function digitValue(u: number): number {
  let d = 0
  while (d < 9 && isDigitUnit(u - d - 1)) d++
  return d
}

/** Kotlin String.toIntOrNull(): an optional sign then decimal digits, null past the Int range. */
function ktToIntOrNull(s: string): number | null {
  if (s.length === 0) return null
  let i = 0
  let negative = false
  if (s.charCodeAt(0) < 0x30) {
    if (s.length === 1) return null
    if (s[0] === '-') negative = true
    else if (s[0] !== '+') return null
    i = 1
  }
  let n = 0
  for (; i < s.length; i++) {
    const u = s.charCodeAt(i)
    if (!isDigitUnit(u)) return null
    n = n * 10 + digitValue(u)
    if (n > 2 ** 31) return null
  }
  if (negative) return n === 0 ? 0 : -n
  return n > 2 ** 31 - 1 ? null : n
}

export function parse(text: string | null | undefined): Map<number, number> {
  const out = new Map<number, number>()
  for (const pair of (text ?? '').split(',')) {
    const parts = pair.split(':')
    if (parts.length !== 2) continue
    const offset = ktToIntOrNull(parts[0]!)
    if (offset === null) continue
    const pad = ktToIntOrNull(parts[1]!)
    if (pad === null) continue
    if (offset >= 0 && offset <= 11 && pad >= 1 && pad <= 12) out.set(offset, pad)
  }
  return out
}

export function format(learned: ReadonlyMap<number, number>): string {
  return [...learned].map(([k, v]) => `${k}:${v}`).join(',')
}

/**
 * Links brought back from the folder, with the ones learned here on top.
 * A pad number belongs to one key only, so a restored link to a number
 * learned here for another key is dropped.
 */
export function merge(restored: ReadonlyMap<number, number>, local: ReadonlyMap<number, number>): Map<number, number> {
  const taken = new Set(local.values())
  const out = new Map<number, number>()
  for (const [o, p] of restored) if (!local.has(o) && !taken.has(p)) out.set(o, p)
  for (const [o, p] of local) out.set(o, p)
  return out
}

/** The Kotlin `LearnedLinks` object. */
export const LearnedLinks = { parse, format, merge } as const
