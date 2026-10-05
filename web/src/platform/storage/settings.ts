// Port of app/src/main/kotlin/dev/arc/ep133/data/AppSettings.kt
// (+ the mirror and coach preferences of controller/ArcController.kt and MainActivity.kt)
//
// The settings page's choices, kept in localStorage and copied into
// library.json (as "app.*", next to "mirror.*") so they travel with the
// library, byte-compatible with Android's map.
//
// Only values that were chosen are stored (and copied out): a default is
// never written, so a fresh install's library.json can't override the
// choices an earlier install left in the folder.
//
// Web deltas:
// - SharedPreferences "settings" becomes the JSON object under "arc.settings"
//   (same field names; keepLast stored as 0 for "keep all", as Android stores
//   it). Like the preferences, it holds only the fields ever changed.
//   SharedPreferences "mirror" (learned, order, keysPad) becomes
//   "arc.mirror.learned", "arc.mirror.order" and "arc.mirror.keysPad"; the
//   activity's old coach_seen becomes "arc.coachSeen" (read once, as Android
//   reads it, to carry over into guideSeen). Live's last read (Android's
//   files/live-last.json) is "arc.live". asked_notifications has no web
//   equivalent and is dropped.
// - Reads are synchronous (before the first render, so the theme never
//   flashes). The Storage is injectable; tests (and ?demo) use [memoryStorage].
// - StateFlow becomes [SettingsStore.subscribe].

import { MAX_OCTAVE, MIN_OCTAVE, NoteNames, Scale, noteNamesOf, scaleOf } from '../../core/features/keys'
import { LearnedLinks } from '../../core/features/learnedLinks'
import { physicalPad, type PhysicalPad } from '../../core/features/padNotes'
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
  /** The guide overlay has been shown once (it opens by itself on the first start only). */
  readonly guideSeen: boolean
  /** Live plays the keys (one sound as notes) instead of the pads. */
  readonly liveKeys: boolean
  /** KEYS: the key (0 = DO), the scale and the octave (4 starts at C4). */
  readonly keysRoot: number
  readonly keysScale: Scale
  readonly keysOctave: number
  /** KEYS names notes in solfège (DO RE MI) or letters (C D E). */
  readonly keysNames: NoteNames
  /** KEYS writes each key's note name in its ring (off: rings and octave numbers only). */
  readonly keysShowNames: boolean
}

export const DEFAULT_SETTINGS: AppSettings = Object.freeze({
  theme: ThemeChoice.SYSTEM,
  autoConnect: true,
  keepScreenOn: true,
  keepLast: null,
  // The web opens Live on one group (a large grid with A-D); Android starts on all four.
  liveOneGroup: true,
  liveFollow: true,
  guideSeen: false,
  liveKeys: false,
  keysRoot: 0,
  keysScale: Scale.CHROMATIC,
  keysOctave: 4,
  keysNames: NoteNames.SOLFEGE,
  keysShowNames: true,
})

/** Every setting's key, in Android's order (SettingsStore.values()). */
export const SETTING_KEYS = Object.freeze([
  'theme',
  'autoConnect',
  'keepScreenOn',
  'keepLast',
  'liveOneGroup',
  'liveFollow',
  'guideSeen',
  'liveKeys',
  'keysRoot',
  'keysScale',
  'keysOctave',
  'keysNames',
  'keysShowNames',
] as const)
export type SettingKey = (typeof SETTING_KEYS)[number]

export const SETTINGS_KEY = 'arc.settings'
export const LEARNED_KEY = 'arc.mirror.learned'
export const ORDER_KEY = 'arc.mirror.order'
export const KEYS_PAD_KEY = 'arc.mirror.keysPad'
export const COACH_KEY = 'arc.coachSeen'
export const LIVE_KEY = 'arc.live'

/** The DOM Storage calls used here. */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** A Storage in memory (tests, ?demo, or a browser that refuses localStorage). */
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

const coerceIn = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= -(2 ** 31) && v <= 2 ** 31 - 1

/** The "arc.settings" object as stored (only the fields ever chosen), or {} when missing or unreadable. */
export function storedSettings(raw: string | null): Record<string, unknown> {
  if (raw === null) return {}
  try {
    const v: unknown = JSON.parse(raw)
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) return v as Record<string, unknown>
  } catch {
    // Unreadable: nothing stored.
  }
  return {}
}

/** A stored "arc.settings" value as settings; anything missing or odd takes its default (SettingsStore.read). */
export function readSettings(raw: string | null): AppSettings {
  const o = storedSettings(raw)
  const bool = (k: SettingKey, d: boolean): boolean => (typeof o[k] === 'boolean' ? (o[k] as boolean) : d)
  const int = (k: SettingKey, d: number): number => (isInt(o[k]) ? (o[k] as number) : d)
  const keep = o.keepLast
  return {
    theme: themeOf(o.theme) ?? ThemeChoice.SYSTEM,
    autoConnect: bool('autoConnect', true),
    keepScreenOn: bool('keepScreenOn', true),
    // getInt("keepLast", 0).takeIf { it > 0 }
    keepLast: isInt(keep) && keep > 0 ? keep : null,
    liveOneGroup: bool('liveOneGroup', DEFAULT_SETTINGS.liveOneGroup),
    liveFollow: bool('liveFollow', true),
    guideSeen: bool('guideSeen', false),
    liveKeys: bool('liveKeys', false),
    keysRoot: coerceIn(int('keysRoot', 0), 0, 11),
    keysScale: scaleOf(typeof o.keysScale === 'string' ? o.keysScale : null) ?? Scale.CHROMATIC,
    keysOctave: coerceIn(int('keysOctave', 4), MIN_OCTAVE, MAX_OCTAVE),
    keysNames: noteNamesOf(typeof o.keysNames === 'string' ? o.keysNames : null) ?? NoteNames.SOLFEGE,
    keysShowNames: bool('keysShowNames', true),
  }
}

/** One setting as it is stored under "arc.settings" (booleans and numbers as JSON, keepLast 0 for keep all). */
function storedValue(s: AppSettings, k: SettingKey): string | number | boolean {
  return k === 'keepLast' ? (s.keepLast ?? 0) : s[k]
}

/**
 * Settings as stored under "arc.settings", every field (keepLast 0 keeps all,
 * as on Android). [SettingsStore] writes only the fields that were chosen.
 */
export function writeSettings(s: AppSettings, keys: Iterable<SettingKey> = SETTING_KEYS): string {
  const want = new Set(keys)
  const o: Record<string, unknown> = {}
  for (const k of SETTING_KEYS) if (want.has(k)) o[k] = storedValue(s, k)
  return JSON.stringify(o)
}

/** Each setting as its key and stored text (SettingsStore.values()). */
export function settingValues(s: AppSettings): Record<SettingKey, string> {
  return {
    theme: s.theme,
    autoConnect: String(s.autoConnect),
    keepScreenOn: String(s.keepScreenOn),
    keepLast: String(s.keepLast ?? 0),
    liveOneGroup: String(s.liveOneGroup),
    liveFollow: String(s.liveFollow),
    guideSeen: String(s.guideSeen),
    liveKeys: String(s.liveKeys),
    keysRoot: String(s.keysRoot),
    keysScale: s.keysScale,
    keysOctave: String(s.keysOctave),
    keysNames: s.keysNames,
    keysShowNames: String(s.keysShowNames),
  }
}

/**
 * As stored in library.json: "app.*", booleans as "true"/"false", keepLast 0
 * for keep all; only [chosen] keys (every key when not given).
 */
export function settingsToIndex(s: AppSettings, chosen: Iterable<string> = SETTING_KEYS): Record<string, string> {
  const want = new Set(chosen)
  const values = settingValues(s)
  const out: Record<string, string> = {}
  for (const k of SETTING_KEYS) if (want.has(k)) out['app.' + k] = values[k]
  return out
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
  const n = (k: string): number | null => {
    const v = get(map, k)
    return v === undefined ? null : ktToIntOrNull(v)
  }
  const keepRaw = get(map, 'app.keepLast')
  const keepN = keepRaw === undefined ? null : ktToIntOrNull(keepRaw)
  const keep = keepN !== null && keepN > 0 ? keepN : null
  const root = n('app.keysRoot')
  const octave = n('app.keysOctave')
  return {
    theme: themeOf(get(map, 'app.theme')) ?? cur.theme,
    autoConnect: b('app.autoConnect') ?? cur.autoConnect,
    keepScreenOn: b('app.keepScreenOn') ?? cur.keepScreenOn,
    keepLast: keep ?? (has(map, 'app.keepLast') ? null : cur.keepLast),
    liveOneGroup: b('app.liveOneGroup') ?? cur.liveOneGroup,
    liveFollow: b('app.liveFollow') ?? cur.liveFollow,
    guideSeen: b('app.guideSeen') ?? cur.guideSeen,
    liveKeys: b('app.liveKeys') ?? cur.liveKeys,
    keysRoot: root !== null && root >= 0 && root <= 11 ? root : cur.keysRoot,
    keysScale: scaleOf(get(map, 'app.keysScale')) ?? cur.keysScale,
    keysOctave: octave !== null && octave >= MIN_OCTAVE && octave <= MAX_OCTAVE ? octave : cur.keysOctave,
    keysNames: noteNamesOf(get(map, 'app.keysNames')) ?? cur.keysNames,
    keysShowNames: b('app.keysShowNames') ?? cur.keysShowNames,
  }
}

/** The settings, kept in storage and copied into library.json. */
export class SettingsStore {
  private current: AppSettings
  /** The fields stored (chosen at some point): prefs.contains on Android. */
  private chosen: Set<string>
  private listeners = new Set<(s: AppSettings) => void>()

  constructor(private readonly storage: KeyValueStorage = browserStorage()) {
    const raw = this.safeGet(SETTINGS_KEY)
    this.current = readSettings(raw)
    this.chosen = chosenKeys(raw)
  }

  get settings(): AppSettings {
    return this.current
  }

  /** Whether [key] was ever chosen (so it is stored, and copied to library.json). */
  isChosen(key: SettingKey): boolean {
    return this.chosen.has(key)
  }

  /** Applies [change]; only the settings whose value changed are written. */
  update(change: (cur: AppSettings) => AppSettings): AppSettings {
    const cur = this.current
    const next = change(cur)
    const before = settingValues(cur)
    const after = settingValues(next)
    const changed = SETTING_KEYS.filter((k) => before[k] !== after[k])
    if (changed.length === 0) return cur
    // Read again: another tab may have stored fields meanwhile.
    const stored = storedSettings(this.safeGet(SETTINGS_KEY))
    for (const k of changed) {
      stored[k] = storedValue(next, k)
      this.chosen.add(k)
    }
    try {
      this.storage.setItem(SETTINGS_KEY, JSON.stringify(stored))
    } catch {
      // Kept for this session only.
    }
    this.set(next)
    return next
  }

  /** As stored in library.json: only the settings that were chosen. */
  toIndex(): Record<string, string> {
    return settingsToIndex(this.current, this.chosen)
  }

  /** Takes back what library.json held (see [settingsFromIndex]). */
  fromIndex(map: Readonly<Record<string, string>>): AppSettings {
    return this.update((cur) => settingsFromIndex(map, cur))
  }

  /** Reads storage again (another tab changed it: the window "storage" event). */
  reload(): void {
    const raw = this.safeGet(SETTINGS_KEY)
    this.chosen = chosenKeys(raw)
    this.set(readSettings(raw))
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

function chosenKeys(raw: string | null): Set<string> {
  const o = storedSettings(raw)
  return new Set(SETTING_KEYS.filter((k) => Object.hasOwn(o, k)))
}

export function sameSettings(a: AppSettings, b: AppSettings): boolean {
  return SETTING_KEYS.every((k) => a[k] === b[k])
}

// ---------- Live mirror preferences (ArcController mirrorPrefs) ----------

/** Learned pad links, "offset:pad" pairs: only offsets 0..11 and pads 1..12 are kept (LearnedLinks.parse). */
export function parseLearned(raw: string | null): Map<number, number> {
  return LearnedLinks.parse(raw)
}

export function formatLearned(learned: ReadonlyMap<number, number>): string {
  return LearnedLinks.format(learned)
}

/** PadOrder.valueOf, defaulting to FROM_TOP. */
export function padOrderOf(raw: string | null): PadOrder {
  return raw === PadOrder.FROM_TOP || raw === PadOrder.FROM_BOTTOM ? raw : PadOrder.FROM_TOP
}

/**
 * A stored "group:offset" KEYS pad (savedKeysPad): group 0..3, offset 0..11,
 * else null. As Kotlin's `split(':').mapNotNull { it.toIntOrNull() }`, parts
 * that aren't numbers are skipped, and the two numbers left are used.
 */
export function parseKeysPad(raw: string | null): PhysicalPad | null {
  if (raw === null) return null
  const parts = raw.split(':').map((p) => ktToIntOrNull(p)).filter((p): p is number => p !== null)
  if (parts.length !== 2) return null
  const [g, o] = parts as [number, number]
  return g >= 0 && g <= 3 && o >= 0 && o <= 11 ? physicalPad(g, o) : null
}

/**
 * SharedPreferences "mirror": the learned pad links and the pad order, both
 * kept as the raw strings Android keeps (and copies to library.json), and
 * the pad KEYS plays.
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

  /** The sound Live's KEYS plays (the pad last tapped), as last chosen. */
  savedKeysPad(): PhysicalPad | null {
    return parseKeysPad(this.safeGet(KEYS_PAD_KEY))
  }

  setKeysPad(pad: { readonly group: number; readonly offset: number }): void {
    this.safeSet(KEYS_PAD_KEY, `${pad.group}:${pad.offset}`)
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

  /**
   * Takes back what a restored library.json held (restoreFromFolder): pads
   * learned since the reinstall stay and the folder's fill in the rest; a
   * pad order chosen since the reinstall stays too.
   */
  fromIndex(map: Readonly<Record<string, string>>): void {
    const learned = get(map, 'mirror.learned')
    if (learned !== undefined) this.safeSet(LEARNED_KEY, formatLearned(LearnedLinks.merge(parseLearned(learned), this.loadLearned())))
    const order = get(map, 'mirror.order')
    if (order !== undefined && this.orderRaw() === null) this.safeSet(ORDER_KEY, order)
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

/**
 * Where the first-run guide's "already shown" flag was before it joined the
 * settings (MainActivity's coach_seen). Read to carry it over into
 * AppSettings.guideSeen; the controller's `coach` writes guideSeen.
 */
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
 * Live's last read of the device (the LiveSnapshot JSON), shown while it is
 * not connected (Android's files/live-last.json).
 */
export class LastReadPrefs {
  constructor(private readonly storage: KeyValueStorage = browserStorage()) {}

  load(): string | null {
    try {
      return this.storage.getItem(LIVE_KEY)
    } catch {
      return null
    }
  }

  save(json: string): void {
    try {
      this.storage.setItem(LIVE_KEY, json)
    } catch {
      // Kept in memory for this session (the controller holds it).
    }
  }
}

/**
 * The settings written into library.json (ArcController's library.settings):
 * mirror.learned, mirror.order when stored, then the app.* keys that were chosen.
 */
export function indexSettings(settings: SettingsStore, mirror: MirrorPrefs): () => Record<string, string> {
  return () => ({ ...mirror.toIndex(), ...settings.toIndex() })
}
