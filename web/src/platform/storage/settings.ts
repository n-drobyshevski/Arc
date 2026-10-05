// Port of app/src/main/kotlin/dev/arc/ep133/data/AppSettings.kt
// (+ the mirror and coach preferences of controller/ArcController.kt and MainActivity.kt)
//
// The settings page's choices, kept in localStorage and copied into
// library.json (as "app.*", next to "mirror.*") so they travel with the
// library, byte-compatible with Android's map.
//
// Web deltas:
// - SharedPreferences "settings" becomes the JSON object under "arc.settings"
//   (same fields, keepLast stored as 0 for "keep all", as Android stores it).
//   SharedPreferences "mirror" (learned, order) becomes "arc.mirror.learned"
//   and "arc.mirror.order"; the activity's coach_seen becomes "arc.coachSeen".
//   asked_notifications has no web equivalent and is dropped.
// - Reads are synchronous (before the first render, so the theme never
//   flashes). The Storage is injectable; tests use [memoryStorage].
// - StateFlow becomes [SettingsStore.subscribe].

import { PadOrder } from '../../core/features/padPush'
import { ThemeChoice } from '../../core/text/settingsText'

/** The settings page's choices (an addition to the web version). */
export interface AppSettings {
  readonly theme: ThemeChoice
  readonly autoConnect: boolean
  readonly keepScreenOn: boolean
  /** How many backups to keep; null keeps all. */
  readonly keepLast: number | null
  /** Live shows one group at a time, large, instead of all four. */
  readonly liveOneGroup: boolean
  /** In that view, switch to the group of the pad just played. */
  readonly liveFollow: boolean
}

export const DEFAULT_SETTINGS: AppSettings = Object.freeze({
  theme: ThemeChoice.SYSTEM,
  autoConnect: true,
  keepScreenOn: true,
  keepLast: null,
  liveOneGroup: false,
  liveFollow: true,
})

export const SETTINGS_KEY = 'arc.settings'
export const LEARNED_KEY = 'arc.mirror.learned'
export const ORDER_KEY = 'arc.mirror.order'
export const COACH_KEY = 'arc.coachSeen'

/** The DOM Storage calls used here. */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** A Storage in memory (tests, or a browser that refuses localStorage). */
export function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { readonly data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
  }
}

/**
 * localStorage, guarded: where it is missing or throws (private modes,
 * blocked storage), settings live in memory for the session.
 */
export function browserStorage(): KeyValueStorage {
  let ls: Storage | null = null
  try {
    ls = globalThis.localStorage ?? null
    if (ls) {
      ls.setItem('arc.probe', '1')
      ls.removeItem('arc.probe')
    }
  } catch {
    ls = null
  }
  if (!ls) return memoryStorage()
  // A value localStorage refused (quota) lives here for the session, and is
  // what reads return until a later write to localStorage succeeds.
  const fallback = memoryStorage()
  const real = ls
  return {
    getItem(k) {
      if (fallback.data.has(k)) return fallback.getItem(k)
      try {
        return real.getItem(k)
      } catch {
        return null
      }
    },
    setItem(k, v) {
      try {
        real.setItem(k, v)
        fallback.removeItem(k)
      } catch {
        fallback.setItem(k, v)
      }
    },
    removeItem(k) {
      fallback.removeItem(k)
      try {
        real.removeItem(k)
      } catch {
        // Nothing kept there anyway.
      }
    },
  }
}

// ---------- Kotlin parsing ----------

const ND = /^\p{Nd}$/u
const isDigitUnit = (u: number): boolean => u >= 0 && ND.test(String.fromCharCode(u))

/** Character.digit(c, 10) for an Nd unit: BMP Nd digits come in runs of ten, 0 first. */
function digitValue(u: number): number {
  let d = 0
  while (d < 9 && isDigitUnit(u - d - 1)) d++
  return d
}

/** Kotlin String.toIntOrNull(): optional sign, Unicode decimal digits, Int range. */
export function ktToIntOrNull(s: string): number | null {
  if (s.length === 0) return null
  let i = 0
  let negative = false
  const first = s.charCodeAt(0)
  if (first < 0x30) {
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

/** Kotlin String.toBooleanStrictOrNull(): exactly "true" or "false". */
export function ktToBooleanStrictOrNull(s: string): boolean | null {
  return s === 'true' ? true : s === 'false' ? false : null
}

/** ThemeChoice.valueOf, or null. */
function themeOf(v: unknown): ThemeChoice | null {
  return v === ThemeChoice.SYSTEM || v === ThemeChoice.LIGHT || v === ThemeChoice.DARK ? v : null
}

/** A stored "arc.settings" value as settings; anything missing or odd takes its default (SettingsStore.read). */
export function readSettings(raw: string | null): AppSettings {
  let o: Record<string, unknown> = {}
  if (raw !== null) {
    try {
      const v: unknown = JSON.parse(raw)
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) o = v as Record<string, unknown>
    } catch {
      // Unreadable: defaults.
    }
  }
  const bool = (k: keyof AppSettings, d: boolean): boolean => (typeof o[k] === 'boolean' ? (o[k] as boolean) : d)
  const keep = o.keepLast
  return {
    theme: themeOf(o.theme) ?? ThemeChoice.SYSTEM,
    autoConnect: bool('autoConnect', true),
    keepScreenOn: bool('keepScreenOn', true),
    // getInt("keepLast", 0).takeIf { it > 0 }
    keepLast: typeof keep === 'number' && Number.isInteger(keep) && keep > 0 && keep <= 2 ** 31 - 1 ? keep : null,
    liveOneGroup: bool('liveOneGroup', false),
    liveFollow: bool('liveFollow', true),
  }
}

/** Settings as stored under "arc.settings" (keepLast 0 keeps all, as on Android). */
export function writeSettings(s: AppSettings): string {
  return JSON.stringify({
    theme: s.theme,
    autoConnect: s.autoConnect,
    keepScreenOn: s.keepScreenOn,
    keepLast: s.keepLast ?? 0,
    liveOneGroup: s.liveOneGroup,
    liveFollow: s.liveFollow,
  })
}

/** As stored in library.json: "app.*", booleans as "true"/"false", keepLast 0 for keep all. */
export function settingsToIndex(s: AppSettings): Record<string, string> {
  return {
    'app.theme': s.theme,
    'app.autoConnect': String(s.autoConnect),
    'app.keepScreenOn': String(s.keepScreenOn),
    'app.keepLast': String(s.keepLast ?? 0),
    'app.liveOneGroup': String(s.liveOneGroup),
    'app.liveFollow': String(s.liveFollow),
  }
}

const has = (map: Readonly<Record<string, string>>, k: string): boolean => Object.hasOwn(map, k)
const get = (map: Readonly<Record<string, string>>, k: string): string | undefined => (has(map, k) ? map[k] : undefined)

/**
 * Takes back what library.json held; anything missing or unreadable stays as
 * it is. Except keepLast: present but unreadable, or 0 or less, means keep all.
 */
export function settingsFromIndex(map: Readonly<Record<string, string>>, cur: AppSettings): AppSettings {
  const b = (k: string): boolean | null => {
    const v = get(map, k)
    return v === undefined ? null : ktToBooleanStrictOrNull(v)
  }
  const keepRaw = get(map, 'app.keepLast')
  const keepN = keepRaw === undefined ? null : ktToIntOrNull(keepRaw)
  const keep = keepN !== null && keepN > 0 ? keepN : null
  return {
    theme: themeOf(get(map, 'app.theme')) ?? cur.theme,
    autoConnect: b('app.autoConnect') ?? cur.autoConnect,
    keepScreenOn: b('app.keepScreenOn') ?? cur.keepScreenOn,
    keepLast: keep ?? (has(map, 'app.keepLast') ? null : cur.keepLast),
    liveOneGroup: b('app.liveOneGroup') ?? cur.liveOneGroup,
    liveFollow: b('app.liveFollow') ?? cur.liveFollow,
  }
}

/** The settings, kept in storage and copied into library.json. */
export class SettingsStore {
  private current: AppSettings
  private listeners = new Set<(s: AppSettings) => void>()

  constructor(private readonly storage: KeyValueStorage = browserStorage()) {
    this.current = readSettings(this.safeGet(SETTINGS_KEY))
  }

  get settings(): AppSettings {
    return this.current
  }

  update(change: (cur: AppSettings) => AppSettings): AppSettings {
    const next = change(this.current)
    try {
      this.storage.setItem(SETTINGS_KEY, writeSettings(next))
    } catch {
      // Kept for this session only.
    }
    this.set(next)
    return next
  }

  /** As stored in library.json. */
  toIndex(): Record<string, string> {
    return settingsToIndex(this.current)
  }

  /** Takes back what library.json held (see [settingsFromIndex]). */
  fromIndex(map: Readonly<Record<string, string>>): AppSettings {
    return this.update((cur) => settingsFromIndex(map, cur))
  }

  /** Reads storage again (another tab changed it: the window "storage" event). */
  reload(): void {
    this.set(readSettings(this.safeGet(SETTINGS_KEY)))
  }

  subscribe(listener: (s: AppSettings) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(next: AppSettings): void {
    const prev = this.current
    this.current = next
    // StateFlow drops equal values.
    if (sameSettings(prev, next)) return
    for (const l of [...this.listeners]) {
      try {
        l(next)
      } catch {
        // One listener's failure doesn't stop the others (or the update that was already stored).
      }
    }
  }

  private safeGet(k: string): string | null {
    try {
      return this.storage.getItem(k)
    } catch {
      return null
    }
  }
}

export function sameSettings(a: AppSettings, b: AppSettings): boolean {
  return (
    a.theme === b.theme &&
    a.autoConnect === b.autoConnect &&
    a.keepScreenOn === b.keepScreenOn &&
    a.keepLast === b.keepLast &&
    a.liveOneGroup === b.liveOneGroup &&
    a.liveFollow === b.liveFollow
  )
}

// ---------- Live mirror preferences (ArcController mirrorPrefs) ----------

/** Learned pad links, "offset:pad" pairs: only offsets 0..11 and pads 1..12 are kept. */
export function parseLearned(raw: string | null): Map<number, number> {
  const out = new Map<number, number>()
  for (const pair of (raw ?? '').split(',')) {
    const parts = pair.split(':')
    if (parts.length !== 2) continue
    const offset = ktToIntOrNull(parts[0]!)
    const pad = ktToIntOrNull(parts[1]!)
    if (offset === null || pad === null) continue
    if (offset >= 0 && offset <= 11 && pad >= 1 && pad <= 12) out.set(offset, pad)
  }
  return out
}

export function formatLearned(learned: ReadonlyMap<number, number>): string {
  return [...learned].map(([k, v]) => `${k}:${v}`).join(',')
}

/** PadOrder.valueOf, defaulting to FROM_TOP. */
export function padOrderOf(raw: string | null): PadOrder {
  return raw === PadOrder.FROM_TOP || raw === PadOrder.FROM_BOTTOM ? raw : PadOrder.FROM_TOP
}

/**
 * SharedPreferences "mirror": the learned pad links and the pad order, both
 * kept as the raw strings Android keeps (and copies to library.json).
 */
export class MirrorPrefs {
  constructor(private readonly storage: KeyValueStorage = browserStorage()) {}

  /** The stored "offset:pad,…" string, or null when never saved. */
  learnedRaw(): string | null {
    return this.safeGet(LEARNED_KEY)
  }

  loadLearned(): Map<number, number> {
    return parseLearned(this.learnedRaw())
  }

  saveLearned(learned: ReadonlyMap<number, number>): void {
    this.safeSet(LEARNED_KEY, formatLearned(learned))
  }

  forgetLearned(): void {
    try {
      this.storage.removeItem(LEARNED_KEY)
    } catch {
      // Nothing kept anyway.
    }
  }

  orderRaw(): string | null {
    return this.safeGet(ORDER_KEY)
  }

  savedPadOrder(): PadOrder {
    return padOrderOf(this.orderRaw())
  }

  setPadOrder(order: PadOrder): void {
    this.safeSet(ORDER_KEY, order)
  }

  /** "mirror.learned" and "mirror.order" for library.json, when stored. */
  toIndex(): Record<string, string> {
    const out: Record<string, string> = {}
    const learned = this.learnedRaw()
    if (learned !== null) out['mirror.learned'] = learned
    const order = this.orderRaw()
    if (order !== null) out['mirror.order'] = order
    return out
  }

  /** Takes back the raw strings a restored library.json held (restoreFromFolder). */
  fromIndex(map: Readonly<Record<string, string>>): void {
    const learned = get(map, 'mirror.learned')
    if (learned !== undefined) this.safeSet(LEARNED_KEY, learned)
    const order = get(map, 'mirror.order')
    if (order !== undefined) this.safeSet(ORDER_KEY, order)
  }

  private safeGet(k: string): string | null {
    try {
      return this.storage.getItem(k)
    } catch {
      return null
    }
  }

  private safeSet(k: string, v: string): void {
    try {
      this.storage.setItem(k, v)
    } catch {
      // Kept for this session only.
    }
  }
}

/** The first-run coach marks (MainActivity's coach_seen). */
export class CoachPrefs {
  constructor(private readonly storage: KeyValueStorage = browserStorage()) {}

  get seen(): boolean {
    try {
      return this.storage.getItem(COACH_KEY) === 'true'
    } catch {
      return false
    }
  }

  markSeen(): void {
    try {
      this.storage.setItem(COACH_KEY, 'true')
    } catch {
      // Shown again next time.
    }
  }
}

/**
 * The settings written into library.json (ArcController's library.settings):
 * mirror.learned, mirror.order when stored, then every app.* key.
 */
export function indexSettings(settings: SettingsStore, mirror: MirrorPrefs): () => Record<string, string> {
  return () => ({ ...mirror.toIndex(), ...settings.toIndex() })
}
