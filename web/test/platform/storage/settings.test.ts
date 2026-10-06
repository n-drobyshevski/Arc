// Port of the AppSettings.kt SettingsStore behaviour and ArcController's mirror preferences
import { describe, expect, it } from 'vitest'
import {
  COACH_KEY,
  CoachPrefs,
  KEYS_PAD_KEY,
  LIVE_KEY,
  LastReadPrefs,
  parseKeysPad,
  writeSettings,
  DEFAULT_SETTINGS,
  LEARNED_KEY,
  MirrorPrefs,
  ORDER_KEY,
  SETTINGS_KEY,
  SettingsStore,
  formatLearned,
  indexSettings,
  ktToIntOrNull,
  memoryStorage,
  parseLearned,
  readSettings,
  settingsFromIndex,
  type AppSettings,
} from '../../../src/platform/storage/settings'

describe('SettingsStore', () => {
  it('starts with the Android defaults, except one group in Live', () => {
    const s = new SettingsStore(memoryStorage())
    expect(s.settings).toEqual({
      theme: 'SYSTEM',
      autoConnect: true,
      keepScreenOn: true,
      keepLast: null,
      liveOneGroup: true,
      liveFollow: true,
      guideSeen: false,
      liveKeys: false,
      keysRoot: 0,
      keysScale: 'CHROMATIC',
      keysOctave: 4,
      keysNames: 'SOLFEGE',
      keysShowNames: true,
      keysViewWide: 'AUTO',
      keysViewTall: 'AUTO',
      pianoWhites: null,
      haptics: true,
    })
    expect(DEFAULT_SETTINGS).toEqual(s.settings)
  })

  it('persists only the fields that changed, synchronously, keepLast null as 0', () => {
    const storage = memoryStorage()
    const s = new SettingsStore(storage)
    s.update((c) => ({ ...c, theme: 'DARK', autoConnect: false, liveOneGroup: false }))
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!)).toEqual({
      theme: 'DARK',
      autoConnect: false,
      liveOneGroup: false,
    })
    s.update((c) => ({ ...c, keepLast: 10 }))
    s.update((c) => ({ ...c, keepLast: null }))
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!)).toEqual({ theme: 'DARK', autoConnect: false, liveOneGroup: false, keepLast: 0 })
    s.update((c) => ({ ...c, keepLast: 10 }))
    expect(new SettingsStore(storage).settings).toEqual({ ...DEFAULT_SETTINGS, theme: 'DARK', autoConnect: false, liveOneGroup: false, keepLast: 10 })
  })

  it('reads odd stored values as defaults', () => {
    expect(readSettings('not json')).toEqual(DEFAULT_SETTINGS)
    expect(readSettings('[1]')).toEqual(DEFAULT_SETTINGS)
    expect(readSettings(JSON.stringify({ theme: 'dark', autoConnect: 'false', keepLast: -3, liveFollow: false }))).toEqual({
      ...DEFAULT_SETTINGS,
      liveFollow: false,
    })
    expect(readSettings(JSON.stringify({ keepLast: 2.5 })).keepLast).toBeNull()
  })

  it('notifies only on a real change, and reloads from storage', () => {
    const storage = memoryStorage()
    const s = new SettingsStore(storage)
    const seen: AppSettings[] = []
    s.subscribe((x) => seen.push(x))
    s.update((c) => ({ ...c }))
    s.update((c) => ({ ...c, keepScreenOn: false }))
    expect(seen).toHaveLength(1)
    storage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'LIGHT' }))
    s.reload()
    expect(s.settings.theme).toBe('LIGHT')
    expect(seen).toHaveLength(2)
  })

  it('writes the library.json map exactly as Android, only the settings that were chosen', () => {
    const s = new SettingsStore(memoryStorage())
    // A fresh install has chosen nothing: its library.json can't override an earlier install's.
    expect(s.toIndex()).toEqual({})
    s.update((c) => ({ ...c, keepLast: 20, theme: 'LIGHT', keysScale: 'BLUES', keysNames: 'LETTERS', keysShowNames: false }))
    expect(Object.entries(s.toIndex())).toEqual([
      ['app.theme', 'LIGHT'],
      ['app.keepLast', '20'],
      ['app.keysScale', 'BLUES'],
      ['app.keysNames', 'LETTERS'],
      ['app.keysShowNames', 'false'],
    ])
    // Set back to the default it stays chosen (Android's prefs.contains).
    s.update((c) => ({ ...c, theme: 'SYSTEM' }))
    expect(s.toIndex()['app.theme']).toBe('SYSTEM')
    // Every key, as the old version stored them all.
    const all = new SettingsStore(memoryStorage({ [SETTINGS_KEY]: writeSettings(DEFAULT_SETTINGS) }))
    expect(Object.keys(all.toIndex())).toEqual([
      'app.theme',
      'app.autoConnect',
      'app.keepScreenOn',
      'app.keepLast',
      'app.liveOneGroup',
      'app.liveFollow',
      'app.guideSeen',
      'app.liveKeys',
      'app.keysRoot',
      'app.keysScale',
      'app.keysOctave',
      'app.keysNames',
      'app.keysShowNames',
      'app.keysViewWide',
      'app.keysViewTall',
      'app.pianoWhites',
      'app.haptics',
    ])
  })

  it('keeps haptics on by default, stores it only once turned off, and reads it back', () => {
    const storage = memoryStorage()
    const s = new SettingsStore(storage)
    expect(s.settings.haptics).toBe(true)
    s.update((c) => ({ ...c, haptics: false }))
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!)).toEqual({ haptics: false })
    expect(s.toIndex()).toEqual({ 'app.haptics': 'false' })
    expect(new SettingsStore(storage).settings.haptics).toBe(false)
    // Odd stored values read as on.
    expect(readSettings(JSON.stringify({ haptics: 'no' })).haptics).toBe(true)
    expect(settingsFromIndex({ 'app.haptics': 'true' }, s.settings).haptics).toBe(true)
    expect(settingsFromIndex({ 'app.haptics': 'off' }, s.settings).haptics).toBe(false)
  })

  it('keeps the Keys view per window shape and the piano size, Auto stored as 0', () => {
    const storage = memoryStorage()
    const s = new SettingsStore(storage)
    s.update((c) => ({ ...c, keysViewTall: 'PADS', pianoWhites: 15 }))
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!)).toEqual({ keysViewTall: 'PADS', pianoWhites: 15 })
    expect(Object.entries(s.toIndex())).toEqual([
      ['app.keysViewTall', 'PADS'],
      ['app.pianoWhites', '15'],
    ])
    s.update((c) => ({ ...c, pianoWhites: null, keysViewWide: 'PIANO' }))
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!)).toEqual({ keysViewTall: 'PADS', pianoWhites: 0, keysViewWide: 'PIANO' })
    expect(s.toIndex()['app.pianoWhites']).toBe('0')
    expect(new SettingsStore(storage).settings).toEqual({ ...DEFAULT_SETTINGS, keysViewWide: 'PIANO', keysViewTall: 'PADS' })
    // Odd stored values read as the defaults: a size arc doesn't offer is Auto.
    expect(readSettings(JSON.stringify({ keysViewWide: 'piano', keysViewTall: 3, pianoWhites: 10 }))).toEqual(DEFAULT_SETTINGS)
    expect(readSettings(JSON.stringify({ pianoWhites: 22 })).pianoWhites).toBe(22)
  })

  it('writes nothing when nothing changed', () => {
    const storage = memoryStorage()
    const s = new SettingsStore(storage)
    const before = s.settings
    expect(s.update((c) => ({ ...c, liveFollow: true }))).toBe(before)
    expect(storage.getItem(SETTINGS_KEY)).toBeNull()
  })

  it('reads the KEYS settings, clamping a stored root and octave', () => {
    expect(readSettings(JSON.stringify({ keysRoot: 14, keysOctave: -2, keysScale: 'DORIAN', keysNames: 'LETTERS', liveKeys: true, guideSeen: true }))).toEqual({
      ...DEFAULT_SETTINGS,
      keysRoot: 11,
      keysOctave: 0,
      keysScale: 'DORIAN',
      keysNames: 'LETTERS',
      liveKeys: true,
      guideSeen: true,
    })
    expect(readSettings(JSON.stringify({ keysRoot: 2.5, keysOctave: 'x', keysScale: 'dorian', keysNames: 1 }))).toEqual(DEFAULT_SETTINGS)
    expect(readSettings(JSON.stringify({ keysOctave: 9 })).keysOctave).toBe(8)
  })

  it("keeps another tab's stored fields when writing its own", () => {
    const storage = memoryStorage()
    const s = new SettingsStore(storage)
    storage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'DARK' }))
    s.update((c) => ({ ...c, liveKeys: true }))
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!)).toEqual({ theme: 'DARK', liveKeys: true })
  })
})

describe('fromIndex', () => {
  const cur: AppSettings = {
    ...DEFAULT_SETTINGS,
    theme: 'DARK',
    autoConnect: false,
    keepScreenOn: false,
    keepLast: 5,
    liveOneGroup: true,
    liveFollow: false,
  }

  it('keeps the current value for missing or unreadable keys', () => {
    expect(settingsFromIndex({}, cur)).toEqual(cur)
    expect(
      settingsFromIndex(
        { 'app.theme': 'light', 'app.autoConnect': 'TRUE', 'app.keepScreenOn': ' true', 'app.liveOneGroup': '1', 'app.liveFollow': 'yes' },
        cur,
      ),
    ).toEqual({ ...cur, keepLast: 5 })
  })

  it('takes valid values', () => {
    expect(
      settingsFromIndex(
        {
          'app.theme': 'LIGHT',
          'app.autoConnect': 'true',
          'app.keepScreenOn': 'true',
          'app.keepLast': '10',
          'app.liveOneGroup': 'false',
          'app.liveFollow': 'true',
        },
        cur,
      ),
    ).toEqual({ ...cur, theme: 'LIGHT', autoConnect: true, keepScreenOn: true, keepLast: 10, liveOneGroup: false, liveFollow: true })
    expect(settingsFromIndex({ 'app.keepLast': '+7' }, cur).keepLast).toBe(7)
  })

  it('keepLast quirk: present but invalid or not positive keeps all', () => {
    for (const v of ['abc', '', '0', '-3', '2147483648', '1.5', ' 5']) {
      expect(settingsFromIndex({ 'app.keepLast': v }, cur).keepLast).toBeNull()
    }
    expect(settingsFromIndex({ 'app.theme': 'LIGHT' }, cur).keepLast).toBe(5)
  })

  it('takes the new settings: guide flag, KEYS mode, key, scale, octave, note names, names on the keys', () => {
    const map = {
      'app.guideSeen': 'true',
      'app.liveKeys': 'true',
      'app.keysRoot': '7',
      'app.keysScale': 'MINOR_PENTATONIC',
      'app.keysOctave': '2',
      'app.keysNames': 'LETTERS',
      'app.keysShowNames': 'false',
    }
    expect(settingsFromIndex(map, cur)).toEqual({
      ...cur,
      guideSeen: true,
      liveKeys: true,
      keysRoot: 7,
      keysScale: 'MINOR_PENTATONIC',
      keysOctave: 2,
      keysNames: 'LETTERS',
      keysShowNames: false,
    })
    // Out of range or unknown: the current value stays (Android takeIf, not coerceIn).
    const odd = { 'app.keysRoot': '12', 'app.keysOctave': '9', 'app.keysScale': 'minor', 'app.keysNames': 'NUMBERS', 'app.liveKeys': 'TRUE', 'app.keysShowNames': 'no' }
    expect(settingsFromIndex(odd, cur)).toEqual(cur)
  })

  it('takes the Keys views and the piano size; 0 is Auto, an unknown size keeps the choice', () => {
    const map = { 'app.keysViewWide': 'PADS', 'app.keysViewTall': 'PIANO', 'app.pianoWhites': '12' }
    expect(settingsFromIndex(map, cur)).toEqual({ ...cur, keysViewWide: 'PADS', keysViewTall: 'PIANO', pianoWhites: 12 })
    const chosen = { ...cur, pianoWhites: 22 }
    expect(settingsFromIndex({ 'app.pianoWhites': '0' }, chosen).pianoWhites).toBeNull()
    expect(settingsFromIndex({ 'app.pianoWhites': '10' }, chosen).pianoWhites).toBe(22)
    expect(settingsFromIndex({ 'app.pianoWhites': 'auto' }, chosen).pianoWhites).toBe(22)
    expect(settingsFromIndex({ 'app.keysViewWide': 'piano', 'app.keysViewTall': '' }, cur)).toEqual(cur)
  })

  it('restoring writes only what differs, so later defaults never override the folder', () => {
    const storage = memoryStorage()
    const s = new SettingsStore(storage)
    s.fromIndex({ 'app.theme': 'SYSTEM', 'app.liveKeys': 'true', 'app.autoConnect': 'true' })
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!)).toEqual({ liveKeys: true })
    expect(s.toIndex()).toEqual({ 'app.liveKeys': 'true' })
  })

  it('round-trips through toIndex and stores the result', () => {
    const storage = memoryStorage()
    const s = new SettingsStore(storage)
    s.fromIndex({ 'app.theme': 'DARK', 'app.keepLast': '20' })
    expect(new SettingsStore(storage).settings).toEqual({ ...DEFAULT_SETTINGS, theme: 'DARK', keepLast: 20 })
    const other = new SettingsStore(memoryStorage())
    other.fromIndex(s.toIndex())
    expect(other.settings).toEqual(s.settings)
  })

  it('parses ints the way Kotlin toIntOrNull does', () => {
    expect(ktToIntOrNull('2147483647')).toBe(2147483647)
    expect(ktToIntOrNull('-2147483648')).toBe(-2147483648)
    expect(ktToIntOrNull('-2147483649')).toBeNull()
    expect(ktToIntOrNull('+')).toBeNull()
    expect(ktToIntOrNull('-')).toBeNull()
    expect(ktToIntOrNull('-0')).toBe(0)
    expect(ktToIntOrNull('١٢')).toBe(12)
    expect(ktToIntOrNull('1e3')).toBeNull()
  })
})

describe('mirror and coach preferences', () => {
  it('keeps only offsets 0..11 and pads 1..12 from the learned string', () => {
    const m = parseLearned('0:1,11:12,12:1,3:0,a:b,5:6:7, 4:4,2:3,2:9,-1:5')
    expect([...m]).toEqual([
      [0, 1],
      [11, 12],
      [2, 9],
    ])
    expect(parseLearned(null).size).toBe(0)
    expect(parseLearned('').size).toBe(0)
    expect(formatLearned(new Map([[3, 4], [0, 12]]))).toBe('3:4,0:12')
  })

  it('stores learned links and pad order under arc.mirror.*', () => {
    const storage = memoryStorage()
    const m = new MirrorPrefs(storage)
    expect(m.savedPadOrder()).toBe('FROM_TOP')
    expect(m.toIndex()).toEqual({})
    m.saveLearned(new Map([[1, 2]]))
    m.setPadOrder('FROM_BOTTOM')
    expect(storage.getItem(LEARNED_KEY)).toBe('1:2')
    expect(storage.getItem(ORDER_KEY)).toBe('FROM_BOTTOM')
    expect(m.toIndex()).toEqual({ 'mirror.learned': '1:2', 'mirror.order': 'FROM_BOTTOM' })
    m.forgetLearned()
    expect(m.loadLearned().size).toBe(0)
    expect(m.toIndex()).toEqual({ 'mirror.order': 'FROM_BOTTOM' })

    // Restored links are combined with those learned here; a pad order chosen here stays.
    m.fromIndex({ 'mirror.learned': '0:1,junk', 'mirror.order': 'SIDEWAYS', 'app.theme': 'DARK' })
    expect(storage.getItem(LEARNED_KEY)).toBe('0:1')
    expect([...m.loadLearned()]).toEqual([[0, 1]])
    expect(m.savedPadOrder()).toBe('FROM_BOTTOM')
  })

  it('restores learned links on top of the ones learned since, and an order only when none was chosen', () => {
    const storage = memoryStorage()
    const m = new MirrorPrefs(storage)
    m.saveLearned(new Map([[0, 5], [3, 4]]))
    // 0 learned here wins; 1's pad 5 is taken by 0 here, so it is dropped; 2 comes back.
    m.fromIndex({ 'mirror.learned': '0:1,1:5,2:9', 'mirror.order': 'FROM_BOTTOM' })
    expect([...m.loadLearned()].sort((a, b) => a[0] - b[0])).toEqual([[0, 5], [2, 9], [3, 4]])
    expect(m.savedPadOrder()).toBe('FROM_BOTTOM')
    // A bad order reads as FROM_TOP; nothing restored leaves what is stored.
    const other = new MirrorPrefs(memoryStorage())
    other.fromIndex({ 'mirror.order': 'SIDEWAYS' })
    expect(other.savedPadOrder()).toBe('FROM_TOP')
    other.fromIndex({})
    expect(other.learnedRaw()).toBeNull()
  })

  it('keeps the pad KEYS plays, ignoring anything out of range', () => {
    const storage = memoryStorage()
    const m = new MirrorPrefs(storage)
    expect(m.savedKeysPad()).toBeNull()
    m.setKeysPad({ group: 2, offset: 7 })
    expect(storage.getItem(KEYS_PAD_KEY)).toBe('2:7')
    expect(m.savedKeysPad()).toMatchObject({ group: 2, offset: 7, groupLetter: 'C' })
    for (const bad of ['4:0', '0:12', '-1:3', '1', '1:2:3', 'a:b', '']) expect(parseKeysPad(bad)).toBeNull()
    // Kotlin's mapNotNull: a part that isn't a number is skipped, and the two numbers left count.
    expect(parseKeysPad('x:1:3')).toMatchObject({ group: 1, offset: 3 })
    expect(parseKeysPad('2::5')).toMatchObject({ group: 2, offset: 5 })
    // Not part of library.json.
    expect(m.toIndex()).toEqual({})
  })

  it("keeps Live's last read", () => {
    const storage = memoryStorage()
    const r = new LastReadPrefs(storage)
    expect(r.load()).toBeNull()
    r.save('{"v":1}')
    expect(storage.getItem(LIVE_KEY)).toBe('{"v":1}')
    expect(new LastReadPrefs(storage).load()).toBe('{"v":1}')
  })

  it('builds the library.json settings: mirror keys first, then app.*', () => {
    const storage = memoryStorage()
    const s = new SettingsStore(storage)
    const m = new MirrorPrefs(storage)
    m.setPadOrder('FROM_TOP')
    m.saveLearned(new Map([[0, 1]]))
    expect(Object.keys(indexSettings(s, m)())).toEqual(['mirror.learned', 'mirror.order'])
    s.update((c) => ({ ...c, guideSeen: true, theme: 'DARK' }))
    expect(Object.keys(indexSettings(s, m)())).toEqual(['mirror.learned', 'mirror.order', 'app.theme', 'app.guideSeen'])
  })

  it('remembers that the coach was seen', () => {
    const storage = memoryStorage()
    const c = new CoachPrefs(storage)
    expect(c.seen).toBe(false)
    c.markSeen()
    expect(storage.getItem(COACH_KEY)).toBe('true')
    expect(new CoachPrefs(storage).seen).toBe(true)
  })
})
