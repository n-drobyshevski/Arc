// Port of core/src/main/kotlin/dev/arc/ep133/protocol/PortMatch.kt (+ reference/src/webmidi.js)
//
// Which MIDI port is the EP-133 (webmidi.js pickPort). JS `\s` and `/i` are what the
// Kotlin spells out by hand (JS_SPACE_CLASS and the [eE] style letter classes).

export const EP_PORT = /EP[- ]?(?:133|1320|40)|K\.?O\.?\s?II/i

export function matches(name: string | null | undefined): boolean {
  return name != null && EP_PORT.test(name)
}

/** First candidate whose name matches; otherwise the only candidate; otherwise null. */
export function pick<T>(candidates: readonly T[], nameOf: (c: T) => string | null | undefined): T | null {
  for (const c of candidates) if (matches(nameOf(c))) return c
  return candidates.length === 1 ? (candidates[0] as T) : null
}
