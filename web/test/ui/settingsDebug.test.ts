// Tests for the pure helpers of the settings and debug screens
// (ports of app/src/main/kotlin/dev/arc/ep133/ui/screens/SettingsScreen.kt,
// DebugScreen.kt and the font licence sheet in MainActivity.kt).
import { describe, expect, it } from 'vitest'
import type { TrafficEntry } from '../../src/core/protocol/trafficLog'
import { WebText } from '../../src/core/text/webText'
import { clockTime, logLine, SHOWN_BYTES } from '../../src/ui/screens/DebugScreen'
import { keepIndex, pruneDialogId, pruneKeepOf, settingsFolder } from '../../src/ui/screens/SettingsScreen'
import { licenceUrl } from '../../src/ui/sheets/FontLicenceSheet'

describe('SettingsScreen helpers', () => {
  const base = { folderPicked: false, folderStatus: 'none' as const, canPickFolder: true, folderName: null }

  it('asks to reconnect a folder whose permission lapsed', () => {
    expect(settingsFolder({ ...base, folderPicked: true, folderStatus: 'prompt', folderName: 'arc' }))
      .toEqual({ note: WebText.RECONNECT_HINT, keys: ['reconnect'] })
  })

  it('names the folder in use and offers to restore from another', () => {
    expect(settingsFolder({ ...base, folderPicked: true, folderStatus: 'granted', folderName: 'arc' }))
      .toEqual({ note: WebText.folderNote('arc'), keys: ['restore'] })
    expect(settingsFolder({ ...base, folderPicked: true, folderStatus: 'granted' }).note).toBe('')
  })

  it('offers a folder, or the export where none can be picked', () => {
    expect(settingsFolder(base)).toEqual({ note: WebText.FOLDER_NOTE_OFF, keys: ['pick'] })
    expect(settingsFolder({ ...base, canPickFolder: false }))
      .toEqual({ note: WebText.EXPORT_LIBRARY_NOTE, keys: ['export', 'restore'] })
  })

  it('selects the Keep choice, All for anything unknown', () => {
    expect(keepIndex(null)).toBe(0)
    expect(keepIndex(5)).toBe(1)
    expect(keepIndex(10)).toBe(2)
    expect(keepIndex(20)).toBe(3)
    expect(keepIndex(7)).toBe(0)
    expect(keepIndex(undefined)).toBe(0)
  })

  it('round-trips the prune dialog id', () => {
    expect(pruneDialogId(5)).toBe('prune:5')
    expect(pruneKeepOf(['delete', pruneDialogId(10)])).toBe(10)
    expect(pruneKeepOf(['forget'])).toBeNull()
    expect(pruneKeepOf(['prune:x', 'prune:0', 'prune:'])).toBeNull()
  })
})

describe('DebugScreen helpers', () => {
  const at = new Date(2026, 0, 2, 3, 4, 5, 6).getTime()
  const entry = (dir: TrafficEntry['dir'], bytes: number[], note: string | null = null): TrafficEntry =>
    ({ time: at, dir, bytes: new Uint8Array(bytes), note })

  it('formats HH:mm:ss.SSS in local time', () => {
    expect(clockTime(at)).toBe('03:04:05.006')
  })

  it('writes notes after "--"', () => {
    expect(logLine(entry('NOTE', [], 'hello'))).toBe('03:04:05.006 --  hello')
    expect(logLine(entry('NOTE', [], null))).toBe('03:04:05.006 --  ')
  })

  it('writes messages as summary then hex, IN padded to three', () => {
    expect(logLine(entry('OUT', [0xf0, 0x7e, 0xf7]))).toBe('03:04:05.006 OUT [3] universal\nF0 7E F7')
    expect(logLine(entry('IN', [0x01]), () => 't')).toBe('t IN  [1] ?\n01')
  })

  it('cuts the hex after 64 bytes', () => {
    const bytes = Array.from({ length: SHOWN_BYTES + 6 }, () => 0xab)
    const line = logLine(entry('OUT', bytes), () => 't')
    const hex = line.split('\n')[1] ?? ''
    expect(hex.endsWith(' … (+6)')).toBe(true)
    expect(hex.replace(' … (+6)', '').split(' ')).toHaveLength(SHOWN_BYTES)
  })
})

describe('FontLicenceSheet', () => {
  it('serves the licence under the base path', () => {
    expect(licenceUrl('/')).toBe('/licenses/OFL-Manrope.txt')
    expect(licenceUrl('/arc/')).toBe('/arc/licenses/OFL-Manrope.txt')
    expect(licenceUrl('./')).toBe('./licenses/OFL-Manrope.txt')
    expect(licenceUrl('/arc')).toBe('/arc/licenses/OFL-Manrope.txt')
  })
})
