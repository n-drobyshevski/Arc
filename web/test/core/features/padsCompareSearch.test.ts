// Port of the compare and FeatureText cases of
// core/src/test/kotlin/dev/arc/ep133/features/PadsCompareSearchTest.kt.
// The ProjectPads and LibrarySearch cases are in padsCompareSearch.pure.test.ts.
import { describe, expect, it } from 'vitest'
import { openPak, type Pak, type PakSound } from '../../../src/core/backup/pak'
import { ChangeKind, compare, PadChange, ProjectChange, SoundChange } from '../../../src/core/features/pakCompare'
import { encodeWav } from '../../../src/core/formats/wav'
import type { JsonObject, JsonValue } from '../../../src/core/protocol/fs'
import { FeatureText } from '../../../src/core/text/featureText'
import { bytes } from '../../../src/core/util/bytes'
import { noise, pad, s16, tarFile } from '../../helpers/bytes'
import { samplePak } from '../../helpers/fixtures'

const wav = (...samples: number[]): Uint8Array => encodeWav(s16(...samples), 1, 46875)

const settings = (json: string): JsonObject => JSON.parse(json) as JsonObject

function pak(sounds: PakSound[], projects: [number, Uint8Array][] = []): Pak {
  return { meta: {}, sidecar: {}, sounds: new Map(sounds.map((s) => [s.slot, s])), projects: new Map(projects) }
}

const snd = (slot: number, name: string, w: Uint8Array, s: JsonValue | null = null): PakSound => ({
  slot,
  name,
  wav: w,
  settings: s,
})

/** Write the RIFF size (bytes 4..7) little-endian. */
function fixRiffSize(out: Uint8Array): Uint8Array {
  const riffSize = out.length - 8
  for (let i = 0; i < 4; i++) out[4 + i] = (riffSize >> (8 * i)) & 0xff
  return out
}

/** A WAV with its settings in a JSON chunk before the audio, as the Sample Tool writes them. */
function wavWithSettings(json: string, ...samples: number[]): Uint8Array {
  const plain = wav(...samples)
  const body = new TextEncoder().encode(json)
  const size = [0, 1, 2, 3].map((i) => (body.length >> (8 * i)) & 0xff)
  const chunk = bytes('TNGE', size, body, new Uint8Array(body.length & 1))
  return fixRiffSize(bytes(plain.subarray(0, 36), chunk, plain.subarray(36)))
}

describe('PadsCompareSearchTest (compare)', () => {
  it('sounds added, removed and changed', () => {
    const old = pak([
      snd(1, 'kick', wav(1, 2, 3), settings('{"sound.pitch":0}')),
      snd(2, 'snare', wav(4, 5)),
      snd(3, 'hat', wav(6)),
      snd(4, 'tom', wav(7), settings('{"sound.pitch":0,"sound.amplitude":100}')),
    ])
    const next = pak([
      snd(1, 'kick', wav(1, 2, 3), settings('{"sound.pitch":0}')),
      snd(2, 'snare 2', wav(4, 9)),
      snd(4, 'tom', wav(7), settings('{"sound.pitch":2,"sound.amplitude":100.0}')),
      snd(5, 'clap', wav(8)),
    ])
    const r = compare(old, next)
    expect(r.sameSounds).toBe(1)
    expect(r.sounds).toEqual([
      SoundChange(2, ChangeKind.CHANGED, 'snare', 'snare 2', { audioChanged: true, renamed: true }),
      SoundChange(3, ChangeKind.REMOVED, 'hat', null),
      // 100 and 100.0 are the same number; only the pitch differs.
      SoundChange(4, ChangeKind.CHANGED, 'tom', 'tom', { settingsChanged: ['sound.pitch'] }),
      SoundChange(5, ChangeKind.ADDED, null, 'clap'),
    ])
    expect(FeatureText.soundChange(r.sounds[0]!)).toBe('Renamed from snare; audio changed')
    expect(FeatureText.soundChange(r.sounds[2]!)).toBe('Settings changed: Pitch')
  })

  it('the same audio in another header is the same, and missing settings are not a change', () => {
    const plain = wav(1, -1, 2)
    // The same PCM with an extra LIST chunk before the data, as other tools write it.
    const list = bytes('LIST', 4, 0, 0, 0, 'INFO')
    const withList = fixRiffSize(bytes(plain.subarray(0, 36), list, plain.subarray(36)))
    expect(withList).not.toEqual(plain)
    const old = pak([snd(1, 'a', plain, settings('{"sound.pitch":3}'))])
    const next = pak([snd(1, 'a', withList, null)])
    const r = compare(old, next)
    expect(r.nothingChanged, JSON.stringify(r)).toBe(true)
    expect(r.sameSounds).toBe(1)
    // An unreadable WAV falls back to its bytes.
    const broken = pak([snd(1, 'a', noise(40))])
    const vsBroken = compare(old, broken).sounds
    expect(vsBroken.length).toBe(1)
    expect(vsBroken[0]!.kind).toBe(ChangeKind.CHANGED)
    expect(compare(broken, broken).nothingChanged).toBe(true)
  })

  it('settings embedded in the WAV are compared, with arc json laid over them', () => {
    const a = wavWithSettings('{"sound.pitch":0,"sound.playmode":"oneshot"}', 1, 2)
    const b = wavWithSettings('{"sound.pitch":5,"sound.playmode":"oneshot"}', 1, 2)
    // Two Sample Tool backups (no arc.json): only the embedded pitch differs.
    const r = compare(pak([snd(1, 'x', a)]), pak([snd(1, 'x', b)]))
    expect(r.sounds).toEqual([SoundChange(1, ChangeKind.CHANGED, 'x', 'x', { settingsChanged: ['sound.pitch'] })])
    // arc.json overrides the embedded value, as a restore does: pitch 5 on both sides.
    const r2 = compare(pak([snd(1, 'x', a, settings('{"sound.pitch":5}'))]), pak([snd(1, 'x', b)]))
    expect(r2.nothingChanged, JSON.stringify(r2)).toBe(true)
  })

  it('pad changes keep the group order when a group is new', () => {
    const old = pak([], [[1, tarFile([['pads/a/p01', pad(1)], ['pads/c/p01', pad(3)]])]])
    const next = pak([], [[1, tarFile([['pads/a/p01', pad(1)], ['pads/b/p02', pad(2)], ['pads/c/p01', pad(4)]])]])
    const projects = compare(old, next).projects
    expect(projects.length).toBe(1)
    expect(projects[0]!.padChanges).toEqual([PadChange('b', 2, null, 2), PadChange('c', 1, 3, 4)])
    // Pads that can't be read are not claimed to be unchanged.
    const unreadable = pak([], [[1, noise(700)]])
    const p = compare(old, unreadable).projects
    expect(p.length).toBe(1)
    expect(p[0]!.padsRead).toBe(false)
  })

  it('projects with pad changes', () => {
    const p1 = tarFile([['pads/a/p01', pad(1)], ['pads/a/p02', pad(2)], ['settings', noise(10)]])
    const p1b = tarFile([['pads/a/p01', pad(5)], ['pads/b/p03', pad(2)], ['settings', noise(10)]])
    const p2 = tarFile([['pads/a/p01', pad(1)], ['settings', noise(10)]])
    const p2b = tarFile([['pads/a/p01', pad(1)], ['settings', noise(12)]])
    const old = pak(
      [snd(1, 'kick', wav(1)), snd(2, 'snare', wav(2))],
      [
        [1, p1],
        [2, p2],
        [3, p2],
        [4, p2],
      ],
    )
    const next = pak(
      [snd(1, 'kick', wav(1)), snd(2, 'snare', wav(2)), snd(5, 'clap', wav(3))],
      [
        [1, p1b],
        [2, p2b],
        [3, p2],
        [9, p2],
      ],
    )
    const r = compare(old, next)
    expect(r.sameProjects).toBe(1)
    expect(r.projects).toEqual([
      ProjectChange(1, ChangeKind.CHANGED, [PadChange('a', 1, 1, 5), PadChange('a', 2, 2, null), PadChange('b', 3, null, 2)]),
      ProjectChange(2, ChangeKind.CHANGED),
      ProjectChange(4, ChangeKind.REMOVED),
      ProjectChange(9, ChangeKind.ADDED),
    ])
    const pc = r.projects[0]!.padChanges
    expect(FeatureText.padChange(pc[0]!, 'kick', 'clap')).toBe('Pad A1: 001 kick, now 005 clap')
    expect(FeatureText.padChange(pc[1]!, 'snare', null)).toBe('Pad A2: 002 snare, now empty')
    expect(FeatureText.padChange(pc[2]!, null, null)).toBe('Pad B3: empty, now 002')
  })

  it('comparing the fixture with itself changes nothing', async () => {
    const p = await openPak(samplePak())
    const r = compare(p, await openPak(samplePak()))
    expect(r.nothingChanged).toBe(true)
    expect(r.sameSounds).toBe(p.sounds.size)
    expect(r.sameProjects).toBe(p.projects.size)
  })
})

// Not in the Kotlin test: the merged settings keep LinkedHashMap order
// (embedded keys first), where a JS object would put integer-like keys first.
describe('PadsCompareSearchTest (web parity)', () => {
  it('changed setting keys come in insertion order', () => {
    const a = wavWithSettings('{"sound.pitch":0,"sound.playmode":"oneshot"}', 1, 2)
    const b = wavWithSettings('{"sound.pitch":5,"sound.playmode":"oneshot"}', 1, 2)
    const r = compare(pak([snd(1, 'x', a, settings('{"9":1}'))]), pak([snd(1, 'x', b, settings('{"9":2}'))]))
    expect(r.sounds).toEqual([SoundChange(1, ChangeKind.CHANGED, 'x', 'x', { settingsChanged: ['sound.pitch', '9'] })])
  })
})

describe('PadsCompareSearchTest (text)', () => {
  it('pad, search and compare text', () => {
    expect(FeatureText.group('a')).toBe('Group A')
    expect(FeatureText.group('zz')).toBe('Group zz')
    expect(FeatureText.padsTitle(3)).toBe('Project 3 pads')
    expect(FeatureText.matches(1)).toBe('1 match')
    expect(FeatureText.matches(3)).toBe('3 matches')
    expect(FeatureText.unchanged(1, 2)).toBe('Unchanged: 1 sound and 2 projects.')
    expect(FeatureText.unchanged(4, 0)).toBe('Unchanged: 4 sounds.')
    expect(FeatureText.unchanged(0, 0)).toBe('')
    expect(FeatureText.compareHeader('A', '1 Oct', 'B', '3 Oct')).toBe('From A (1 Oct) to B (3 Oct)')
    expect(
      FeatureText.soundChange(
        SoundChange(1, ChangeKind.CHANGED, 'a', 'a', { audioChanged: true, settingsChanged: ['sound.pitch', 'sound.amplitude'] }),
      ),
    ).toBe('Audio changed; settings changed: Pitch, Volume')
  })
})
