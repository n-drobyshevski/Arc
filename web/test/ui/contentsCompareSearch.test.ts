// Tests for the pure helpers of the Contents, Compare and Search screens
// (ports of app/src/main/kotlin/dev/arc/ep133/ui/screens/ContentsScreen.kt,
// CompareScreen.kt and SearchScreen.kt).
import { describe, expect, it } from 'vitest'
import { openPak, type Pak, type PakSound } from '../../src/core/backup/pak'
import { projectSlots } from '../../src/core/backup/pakExport'
import { ChangeKind, PadChange, PakCompareResult, ProjectChange, SoundChange } from '../../src/core/features/pakCompare'
import { FeatureText } from '../../src/core/text/featureText'
import { Format } from '../../src/core/text/format'
import { Strings } from '../../src/core/text/strings'
import { compareSections } from '../../src/ui/screens/CompareScreen'
import { backupSoundKey, contentsLists, soundMeta } from '../../src/ui/screens/ContentsScreen'
import { searchNote } from '../../src/ui/screens/SearchScreen'
import { samplePak } from '../helpers/fixtures'

const snd = (slot: number, name: string, size = 10): PakSound => ({ slot, name, wav: new Uint8Array(size), settings: null })

function pak(sounds: PakSound[], projects: [number, Uint8Array][] = []): Pak {
  return { meta: {}, sidecar: {}, sounds: new Map(sounds.map((s) => [s.slot, s])), projects: new Map(projects) }
}

describe('ContentsScreen helpers', () => {
  it('sorts sounds by slot and projects by number', () => {
    const p = pak([snd(9, 'c'), snd(1, 'a'), snd(5, 'b')], [[3, new Uint8Array(0)], [1, new Uint8Array(0)]])
    const l = contentsLists(p)
    expect(l.sounds.map((s) => s.slot)).toEqual([1, 5, 9])
    expect(l.projects.map((x) => x.n)).toEqual([1, 3])
  })

  it('a project whose pads cannot be read uses no sounds', () => {
    const l = contentsLists(pak([snd(1, 'a')], [[2, Uint8Array.of(1, 2, 3)]]))
    expect(l.projects).toEqual([{ n: 2, slots: [] }])
  })

  it('lists the sounds a real project uses', async () => {
    const p = await openPak(samplePak())
    const l = contentsLists(p)
    expect(l.projects.length).toBe(p.projects.size)
    for (const x of l.projects) expect(x.slots).toEqual(projectSlots(p, x.n))
    expect(l.sounds.length).toBe(p.sounds.size)
  })

  it('shows the length, else the WAV size', () => {
    expect(soundMeta(1.5, snd(1, 'a'))).toBe(FeatureText.duration(1.5))
    expect(soundMeta(0.25, snd(1, 'a'))).toBe('250 ms')
    expect(soundMeta(undefined, snd(1, 'a', 2048))).toBe(Format.bytes(2048))
  })

  it('uses the controller playing key', () => {
    expect(backupSoundKey('abc', 7)).toBe('backup:abc:7')
  })
})

describe('CompareScreen sections', () => {
  const r = PakCompareResult(
    [
      SoundChange(5, ChangeKind.ADDED, null, 'clap'),
      SoundChange(3, ChangeKind.REMOVED, 'hat', null),
      SoundChange(2, ChangeKind.CHANGED, 'snare', 'snare 2', { audioChanged: true, renamed: true }),
    ],
    [
      ProjectChange(4, ChangeKind.ADDED),
      ProjectChange(1, ChangeKind.CHANGED, [PadChange('a', 3, 1, 5)]),
      ProjectChange(2, ChangeKind.CHANGED, [], true),
      ProjectChange(3, ChangeKind.CHANGED, [], false),
    ],
    1,
    0,
  )
  const oldNames = new Map([[1, 'kick']])
  const newNames = new Map([[5, 'clap']])

  it('keeps the Kotlin order and leaves out empty sections', () => {
    const s = compareSections(r, oldNames, newNames)
    expect(s.map((x) => x.title)).toEqual([
      FeatureText.SOUNDS_ADDED,
      FeatureText.SOUNDS_REMOVED,
      FeatureText.SOUNDS_CHANGED,
      FeatureText.PROJECTS_ADDED,
      FeatureText.PROJECTS_CHANGED,
    ])
  })

  it('builds the rows', () => {
    const s = compareSections(r, oldNames, newNames)
    expect(s[0]!.rows).toEqual([{ key: 'sa5', slot: '005', name: 'clap', details: null }])
    expect(s[1]!.rows).toEqual([{ key: 'sr3', slot: '003', name: 'hat', details: null }])
    expect(s[2]!.rows[0]!.details).toEqual([FeatureText.soundChange(r.sounds[2]!)])
    expect(s[2]!.rows[0]!.name).toBe('snare 2')
    expect(s[3]!.rows).toEqual([{ key: 'pa4', slot: null, name: Strings.projectLine(4), details: null }])
    const changed = s[4]!.rows
    expect(changed.map((x) => x.key)).toEqual(['pc1', 'pc2', 'pc3'])
    expect(changed[0]!.details).toEqual([FeatureText.padChange(PadChange('a', 3, 1, 5), 'kick', 'clap')])
    expect(changed[0]!.details![0]).toBe('Pad A3: 001 kick, now 005 clap')
    expect(changed[1]!.details).toEqual([FeatureText.PATTERNS_CHANGED])
    expect(changed[2]!.details).toEqual([FeatureText.PROJECT_CHANGED])
  })

  it('a pad whose sound has no known name shows the slot only', () => {
    const s = compareSections(r, new Map(), new Map())
    expect(s[4]!.rows[0]!.details![0]).toBe('Pad A3: 001, now 005')
  })

  it('nothing changed: no sections', () => {
    expect(compareSections(PakCompareResult([], [], 3, 1), new Map(), new Map())).toEqual([])
  })
})

describe('SearchScreen note', () => {
  it('hints while blank, says so when nothing matches, else nothing', () => {
    expect(searchNote({ query: '', results: [] })).toBe(FeatureText.SEARCH_HINT)
    expect(searchNote({ query: '   ', results: [] })).toBe(FeatureText.SEARCH_HINT)
    expect(searchNote({ query: 'kick', results: [] })).toBe(FeatureText.NO_SOUND_MATCHES)
    expect(searchNote({ query: 'kick', results: [{ backup: { id: 'a' } as never, hits: [{ slot: 1, name: 'kick' }] }] })).toBeNull()
  })
})
