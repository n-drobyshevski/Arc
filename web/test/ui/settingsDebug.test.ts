// Tests for the pure helpers of the settings and debug screens
// (ports of app/src/main/kotlin/dev/arc/ep133/ui/screens/SettingsScreen.kt,
// DebugScreen.kt and the font licence sheet in MainActivity.kt).
import { describe, expect, it } from 'vitest'
import type { TrafficEntry } from '../../src/core/protocol/trafficLog'
import { WebText } from '../../src/core/text/webText'
import { clockTime, logLine, SHOWN_BYTES } from '../../src/ui/screens/DebugScreen'
import {
  SECTIONS, keepIndex, pianoChoicesOff, pianoRoomEstimate, pruneDialogId, pruneKeepOf, sectionInView, sectionTitle,
  settingsFolder,
} from '../../src/ui/screens/SettingsScreen'
import { pianoWidth } from '../../src/ui/live/keyboard'
import { SettingsText } from '../../src/core/text/settingsText'
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

describe('SettingsScreen desk nav', () => {
  it('titles every section, the saved group in the web wording', () => {
    expect(SECTIONS.map(sectionTitle)).toEqual([
      SettingsText.APPEARANCE, SettingsText.DEVICE, SettingsText.LIBRARY, SettingsText.LIVE, WebText.SAVED_HERE,
      SettingsText.ABOUT,
    ])
  })

  it('lights the last section whose caption reached the top, the last one at the end', () => {
    const tops = [0, 120, 400, 700]
    expect(sectionInView(tops, 0, false)).toBe(0)
    expect(sectionInView(tops, 100, false)).toBe(1)
    expect(sectionInView(tops, 390, false, 24)).toBe(2)
    expect(sectionInView(tops, 300, false, 24)).toBe(1)
    expect(sectionInView(tops, 300, false, 120)).toBe(2)
    expect(sectionInView(tops, 300, true)).toBe(3)
    expect(sectionInView([], 0, false)).toBe(0)
  })
})

describe('SettingsScreen piano keys', () => {
  it('estimates the piano as Live\'s box less its chrome, as Live measures it', () => {
    // The desk from 1280: rail 104, gutters 2 x 56; Live's box caps at 1200 (the top bar's row),
    // less its padding 2 x 8, the tools strip 24 + 4, the body's padding 2 x 20 and the caps' edge 2.
    expect(pianoRoomEstimate(1440, 900)).toBe(1200 - 16 - 28 - 42)
    expect(pianoRoomEstimate(1440, 900)).toBe(pianoWidth(1200, true))
    // 1024 to 1279: no ruled gutters.
    expect(pianoRoomEstimate(1024, 768)).toBe(1024 - 104 - 16 - 28 - 42)
    // Under 1024: the GUIDE tab's gutter 30, the side strip 24 + 4, the plate 2 x 10 and the edge 2.
    expect(pianoRoomEstimate(852, 393)).toBe(852 - 30 - 28 - 22)
    // A portrait phone plays on the grid: its piano is the window turned sideways.
    expect(pianoRoomEstimate(393, 852)).toBe(pianoRoomEstimate(852, 393))
    // A tall window 600 or wider shows the switch, so its own width counts.
    expect(pianoRoomEstimate(800, 1200)).toBe(800 - 30 - 28 - 22)
    expect(pianoRoomEstimate(10, 5)).toBe(0)
  })

  it('greys out the sizes that do not fit, never Auto', () => {
    expect(SettingsText.PIANO_CHOICES).toEqual([null, 8, 12, 15, 22])
    // 44 px a white key: 22 need 968, 15 need 660, 12 need 528, 8 need 352.
    expect(pianoChoicesOff(1168)).toEqual([false, false, false, false, false])
    expect(pianoChoicesOff(756)).toEqual([false, false, false, false, true])
    expect(pianoChoicesOff(600)).toEqual([false, false, false, true, true])
    expect(pianoChoicesOff(300)).toEqual([false, true, true, true, true])
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
