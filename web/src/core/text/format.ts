// Port of core/src/main/kotlin/dev/arc/ep133/text/Format.kt (+ reference/src/app.js)
//
// Formatting helpers from app.js. All locale-independent except the dates.
//
// Web deltas:
// - The Kotlin jsRound/jsToFixed/jsNumberToString helpers only copy JS on the
//   JVM, so `bytes` uses Math.round, toFixed and String directly (one `number`
//   overload instead of Double and Long).
// - `date` takes Intl.DateTimeFormat options instead of a java.time pattern.
//   DATE_TIME_PATTERN and DAY_PATTERN are the options of the reference
//   fmtDate/fmtDay (app.js:21-22), which Android matches with
//   getBestDateTimePattern("MMMdjmm" / "MMMdyyyy"). The narrow and no-break
//   space replacement is the Kotlin addition (the reference does not do it).

/** `plural(n, one, many)`: "1 sound", "0 sounds". */
export function plural(n: number, one: string, many: string = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`
}

/** `fmtBytes`. */
export function bytes(b: number): string {
  if (b >= 1048576) return `${(b / 1048576).toFixed(b >= 10485760 ? 0 : 1)} MB`
  if (b >= 1024) return `${Math.round(b / 1024)} KB`
  return `${b} B`
}

/** `new Intl.ListFormat('en', { type: 'conjunction' })`, spelled out. */
export function list(items: readonly string[]): string {
  switch (items.length) {
    case 0:
      return ''
    case 1:
      return items[0] as string
    case 2:
      return `${items[0]} and ${items[1]}`
    default:
      return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1]
  }
}

/** Month, day and time: "Oct 4, 1:05 PM" in en-US (reference fmtDate). */
export const DATE_TIME_PATTERN: Readonly<Intl.DateTimeFormatOptions> = Object.freeze({
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** Month, day and year: "Oct 4, 2026" in en-US (reference fmtDay). */
export const DAY_PATTERN: Readonly<Intl.DateTimeFormatOptions> = Object.freeze({
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

/**
 * A date in the given (default: the browser's) locale and time zone.
 * Narrow and no-break spaces become plain spaces, so titles and file names
 * do not depend on the ICU version.
 */
export function date(
  ms: number,
  pattern: Readonly<Intl.DateTimeFormatOptions> = DATE_TIME_PATTERN,
  locale: string | readonly string[] | undefined = undefined,
  timeZone: string | undefined = undefined,
): string {
  const options: Intl.DateTimeFormatOptions = timeZone === undefined ? { ...pattern } : { ...pattern, timeZone }
  return new Intl.DateTimeFormat(locale as string | string[] | undefined, options)
    .format(ms)
    .replace(/[\u202F\u00A0]/g, ' ')
}

/** The Kotlin `object Format`, for call sites that read `Format.plural(...)`. */
export const Format = {
  plural,
  bytes,
  list,
  date,
  DATE_TIME_PATTERN,
  DAY_PATTERN,
} as const
