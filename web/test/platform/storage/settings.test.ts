// Port of the AppSettings.kt SettingsStore behaviour and ArcController's mirror preferences
import { describe, expect, it } from 'vitest'
import {
  COACH_KEY,
  CoachPrefs,
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
  it('starts with the Android defaults', () => {
    const s = new SettingsStore(memoryStorage())
    expect(s.settings).toEqual({
      theme: 'SYSTEM',
      autoConnect: true,
      keepScreenOn: true,
      keepLast: null,
      liveOneGroup: false,
      liveFollow: true,
    })
    expect(DEFAULT_SETTINGS).toEqual(s.settings)
  })

  it('persists every field synchronously, keepLast null as 0', () => {
    const storage = memoryStorage()
    const s = new SettingsStore(storage)
    s.update((c) => ({ ...c, theme: 'DARK', autoConnect: false, liveOneGroup: true }))
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!)).toEqual({
      theme: 'DARK',
      autoConnect: false,
      keepScreenOn: true,
      keepLast: 0,
      liveOneGroup: true,
      liveFollow: true,
    })
    s.update((c) => ({ ...c, keepLast: 10 }))
    expect(new SettingsStore(storage).settings).toEqual({ ...DEFAULT_SETTINGS, theme: 'DARK', autoConnect: false, liveOneGroup: true, keepLast: 10 })
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

  it('writes the library.json map exactly as Android', () => {
    const s = new SettingsStore(memoryStorage())
    expect(Object.entries(s.toIndex())).toEqual([
      ['app.theme', 'SYSTEM'],
      ['app.autoConnect', 'true'],
      ['app.keepScreenOn', 'true'],
      ['app.keepLast', '0'],
      ['app.liveOneGroup', 'false'],
      ['app.liveFollow', 'true'],
    ])
    s.update((c) => ({ ...c, keepLast: 20, theme: 'LIGHT' }))
    expect(s.toIndex()['app.keepLast']).toBe('20')
    expect(s.toIndex()['app.theme']).toBe('LIGHT')
  })
})

describe('fromIndex', () => {
  const cur: AppSettings = { theme: 'DARK', autoConnect: false, keepScreenOn: false, keepLast: 5, liveOneGroup: true, liveFollow: false }

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
    ).toEqual({ theme: 'LIGHT', autoConnect: true, keepScreenOn: true, keepLast: 10, liveOneGroup: false, liveFollow: true })
    expect(settingsFromIndex({ 'app.keepLast': '+7' }, cur).keepLast).toBe(7)
  })

  it('keepLast quirk: present but invalid or not positive keeps all', () => {
    for (const v of ['abc', '', '0', '-3', '2147483648', '1.5', ' 5']) {
      expect(settingsFromIndex({ 'app.keepLast': v }, cur).keepLast).toBeNull()
    }
    expect(settingsFromIndex({ 'app.theme': 'LIGHT' }, cur).keepLast).toBe(5)
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

    // Restored raw strings are kept as they are; a bad order reads as FROM_TOP.
    m.fromIndex({ 'mirror.learned': '0:1,junk', 'mirror.order': 'SIDEWAYS', 'app.theme': 'DARK' })
    expect(storage.getItem(LEARNED_KEY)).toBe('0:1,junk')
    expect([...m.loadLearned()]).toEqual([[0, 1]])
    expect(m.savedPadOrder()).toBe('FROM_TOP')
  })

  it('builds the library.json settings: mirror keys first, then app.*', () => {
    const storage = memoryStorage()
    const s = new SettingsStore(storage)
    const m = new MirrorPrefs(storage)
    m.setPadOrder('FROM_TOP')
    m.saveLearned(new Map([[0, 1]]))
    expect(Object.keys(indexSettings(s, m)())).toEqual([
      'mirror.learned',
      'mirror.order',
      'app.theme',
      'app.autoConnect',
      'app.keepScreenOn',
      'app.keepLast',
      'app.liveOneGroup',
      'app.liveFollow',
    ])
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
