// Port of core/src/test/kotlin/dev/arc/ep133/features/DeviceListTest.kt
import { describe, expect, it } from 'vitest'
import { findSounds, hundreds } from '../../../src/core/features/deviceBrowser'
import type { SoundEntry } from '../../../src/core/protocol/device'
import { FeatureText } from '../../../src/core/text/featureText'

const sounds: SoundEntry[] = [
  { slot: 212, name: 'Vox Chop', size: 1 },
  { slot: 1, name: 'kick', size: 1 },
  { slot: 12, name: 'snare 12', size: 1 },
  { slot: 120, name: 'hat', size: 1 },
  { slot: 99, name: 'clap', size: 1 },
]

describe('DeviceListTest', () => {
  it('finds by name ignoring case, or by slot number', () => {
    expect(findSounds(sounds, 'vox').map((s) => s.slot)).toEqual([212])
    // "12" matches slot 12 and the name "snare 12"; not slot 120 or 212.
    expect(findSounds(sounds, '12').map((s) => s.slot)).toEqual([12])
    expect(findSounds(sounds, '012').map((s) => s.slot)).toEqual([12])
    expect(findSounds(sounds, ' 120 ').map((s) => s.slot)).toEqual([120])
    expect(findSounds(sounds, '  ')).toEqual(sounds)
    expect(findSounds(sounds, 'bass')).toEqual([])
  })

  it('groups sounds by hundreds of slots in slot order', () => {
    const groups = hundreds(sounds)
    expect(groups.map((g) => [g.from, g.to])).toEqual([
      [1, 99],
      [100, 199],
      [200, 299],
    ])
    expect(groups.map((g) => g.sounds.map((s) => s.slot))).toEqual([[1, 12, 99], [120], [212]])
    expect(FeatureText.range(groups[0]!)).toBe('001\u2013099')
    expect(FeatureText.range(groups[2]!)).toBe('200\u2013299')
  })

  it('labels for the device panel and project sounds', () => {
    expect(FeatureText.counts(212, 1)).toBe('212 sounds \u00B7 1 project')
    expect(FeatureText.counts(1, 6)).toBe('1 sound \u00B7 6 projects')
    expect(FeatureText.projectSoundNames([1, 40], new Map([[1, 'kick']]))).toBe('001\u00A0kick \u00B7 040')
    expect(FeatureText.projectSoundNames([], new Map())).toBe('Uses no sounds')
    expect(FeatureText.sectionLabel(FeatureText.SOUNDS, 212)).toBe('Sounds 212')
  })
})

// Not in the Kotlin test: JVM behaviour of the same calls that a naive port misses.
describe('DeviceListTest (web parity)', () => {
  it('slot numbers may be typed in any Unicode digits, as toIntOrNull reads them', () => {
    expect(findSounds(sounds, '١٢').map((s) => s.slot)).toEqual([12]) // Arabic-Indic 12
    expect(findSounds(sounds, '０１２').map((s) => s.slot)).toEqual([12]) // full-width 012
    expect(findSounds(sounds, '99999999999')).toEqual([])
  })

  it('ignoring case uses the simple case mappings of Char.equals', () => {
    const list: SoundEntry[] = [{ slot: 3, name: 'Istanbul', size: 1 }]
    // Character.toLowerCase('İ') is 'i', so it matches 'I' ignoring case.
    expect(findSounds(list, 'İst').map((s) => s.slot)).toEqual([3])
  })
})
