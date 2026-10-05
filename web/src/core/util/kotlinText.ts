// Kotlin/JVM string semantics shared by the text and features ports (no single
// Kotlin source file: these are the stdlib behaviours the Kotlin code relies on).

/**
 * Kotlin's String.trim(): Char.isWhitespace on the JVM is Character.isWhitespace
 * || isSpaceChar, i.e. Zs, Zl, Zp, \t..\r and \x1C..\x1F (JS trim differs at
 * U+FEFF and \x1C..\x1F).
 */
export const KT_WS = /^[\t\n\v\f\r\x1C-\x1F\p{Zs}\u2028\u2029]+|[\t\n\v\f\r\x1C-\x1F\p{Zs}\u2028\u2029]+$/gu

/** Kotlin `String.trim()`. */
export function ktTrim(s: string): string {
  return s.replace(KT_WS, '')
}

/** Java's `\s+` without UNICODE_CHARACTER_CLASS (ASCII whitespace only), for `split`. */
export const JAVA_WS = /[ \t\n\v\f\r]+/
