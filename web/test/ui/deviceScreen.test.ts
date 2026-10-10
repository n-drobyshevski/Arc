// Tests for the pure helpers of the Device tab screen and its sheets
// (ports of app/src/main/kotlin/dev/arc/ep133/ui/screens/DeviceScreen.kt,
// PadsSheet.kt and TrimSheet.kt).
import { describe, expect, it } from 'vitest'
import {
  PROJECT_ORDER,
  chunked,
  crcHex,
  detailChips,
  detailRows,
  soundBlocks,
  soundNames,
  storageSegments,
} from '../../src/ui/screens/DeviceScreen'
import { padCell, padsProject } from '../../src/ui/sheets/PadsSheet'
import { clampTrim, trimResult } from '../../src/ui/sheets/TrimSheet'
import { slotDigits, slotNote, slotOf, trimIndexOf, uploadCheck } from '../../src/ui/sheets/UploadSheet'
import type { UploadDraftItem } from '../../src/state/types'

describe('DeviceScreen helpers', () => {
  it('formats the checksum as %08X', () => {
    expect(crcHex(0x1a2b3c4d)).toBe('1A2B3C4D')
    expect(crcHex(255)).toBe('000000FF')
    expect(crcHex(0xffffffff)).toBe('FFFFFFFF')
    expect(crcHex(-1)).toBe('FFFFFFFFFFFFFFFF')
  })

  it('lists channels and rate, settings in order, then the checksum', () => {
    const rows = detailRows({
      slot: 2, name: 'kick 2', channels: 1, sampleRate: 46875,
      settings: { 'sound.playmode': 'oneshot' }, crc: 0x1a2b3c4d,
    })
    expect(rows[0]).toEqual(['Mono', '46875 Hz'])
    expect(rows[1]).toEqual(['Play mode', 'oneshot'])
    expect(rows[2]).toEqual(['CRC32', '1A2B3C4D'])
    const none = detailRows({ slot: 1, name: 'x', channels: 2, sampleRate: 44100, settings: {}, crc: null })
    expect(none.at(-1)).toEqual(['CRC32', 'not reported'])
  })

  it('chunks tiles three to a row', () => {
    expect(chunked([1, 2, 3, 4, 5], 3)).toEqual([[1, 2, 3], [4, 5]])
    expect(chunked([], 3)).toEqual([])
  })

  it('maps slots to names', () => {
    expect(soundNames([{ slot: 3, name: 'snare', size: 1 }]).get(3)).toBe('snare')
    expect(soundNames(undefined).size).toBe(0)
  })

  it('gives the details as chips: channels and rate alone, then labelled values', () => {
    const chips = detailChips({
      slot: 2, name: 'kick 2', channels: 1, sampleRate: 46875,
      settings: { 'sound.playmode': 'oneshot' }, crc: 0x1a2b3c4d,
    })
    expect(chips).toEqual([[null, 'Mono'], [null, '46875 Hz'], ['Play mode', 'oneshot'], ['CRC32', '1A2B3C4D']])
  })

  it('lays the projects out as the K.O. II pads', () => {
    expect(PROJECT_ORDER).toEqual([7, 8, 9, 4, 5, 6, 1, 2, 3])
  })

  it('splits the storage meter into sounds, projects and free', () => {
    expect(storageSegments(0, 0)).toEqual({ lit: 0, orange: 0 })
    expect(storageSegments(0.5, 0.125)).toEqual({ lit: 12, orange: 3 })
    // Anything at all lights one segment; the projects never outgrow what is used.
    expect(storageSegments(0.001, 0.0001)).toEqual({ lit: 1, orange: 1 })
    expect(storageSegments(0.25, 0.9)).toEqual({ lit: 6, orange: 6 })
    expect(storageSegments(2, 0)).toEqual({ lit: 24, orange: 0 })
  })

  it('lists the sounds found, only the ones a project uses when asked', () => {
    const sounds = [
      { slot: 1, name: 'kick', size: 1 },
      { slot: 3, name: 'snare', size: 1 },
      { slot: 140, name: 'vox chop', size: 1 },
    ]
    expect(soundBlocks(sounds, '').map((g) => [g.from, g.sounds.length])).toEqual([[1, 2], [100, 1]])
    expect(soundBlocks(sounds, '', new Set([3])).map((g) => [g.from, g.sounds.map((s) => s.slot)])).toEqual([[1, [3]]])
    expect(soundBlocks(sounds, 'vox')).toHaveLength(1)
  })
})

describe('PadsSheet helpers', () => {
  it('describes empty, missing and named pads', () => {
    expect(padCell(9, null, null)).toMatchObject({ main: null, sub: 'Empty', empty: true, playable: false })
    expect(padCell(10, 40, undefined)).toMatchObject({ main: '040', sub: 'Sound not found', playable: false })
    expect(padCell(1, 1, 'kick')).toMatchObject({ main: 'kick', sub: '001', playable: true })
  })

  it('reads the project from the sheet id', () => {
    expect(padsProject(['detail:x', 'pads:device:3'], 'pads:device:')).toBe(3)
    expect(padsProject(['pads:backup:a:b:7'], 'pads:backup:a:b:')).toBe(7)
    expect(padsProject(['pads:device:x'], 'pads:device:')).toBeNull()
    expect(padsProject([], 'pads:device:')).toBeNull()
  })
})

describe('TrimSheet helpers', () => {
  it('clamps start and end into the audio', () => {
    expect(clampTrim(-5, 50, 100)).toEqual({ start: 0, end: 50 })
    expect(clampTrim(60, 40, 100)).toEqual({ start: 60, end: 60 })
    expect(clampTrim(10, 500, 100)).toEqual({ start: 10, end: 100 })
  })

  it('returns null when the whole file is kept', () => {
    expect(trimResult(0, 100, 100)).toBeNull()
    expect(trimResult(5, 100, 100)).toEqual({ start: 5, end: 100 })
  })
})

const item = (over: Partial<UploadDraftItem>): UploadDraftItem => ({
  fileName: 'a.wav', name: 'a', slot: 1, wav: new Uint8Array(4), error: null, trim: null, sampleRate: 46875, ...over,
})

describe('UploadSheet helpers', () => {
  it('keeps up to three digits of what is typed', () => {
    expect(slotDigits('1a2b34')).toBe('123')
    expect(slotDigits('abc')).toBe('')
    expect(slotDigits('١٢')).toBe('١٢')
  })

  it('reads a slot only inside 1..999', () => {
    expect(slotOf('')).toBeNull()
    expect(slotOf('0')).toBeNull()
    expect(slotOf('000')).toBeNull()
    expect(slotOf('007')).toBe(7)
    expect(slotOf('999')).toBe(999)
    expect(slotOf('١٢')).toBe(12)
  })

  it('notes a missing slot or the sound it replaces', () => {
    const occ = new Map([[3, 'snare']])
    expect(slotNote(null, occ)).toBe('No free slot left. Pick one to replace.')
    expect(slotNote(3, occ)).toContain('snare')
    expect(slotNote(4, occ)).toBe('')
  })

  it('checks duplicates, missing slots and busy', () => {
    expect(uploadCheck([item({ slot: 1 }), item({ slot: 2 })], false)).toEqual({ dup: null, ready: 2, ok: true })
    expect(uploadCheck([item({ slot: 1 }), item({ slot: 1 })], false)).toMatchObject({ dup: 1, ok: false })
    expect(uploadCheck([item({ slot: 1 }), item({ slot: null })], false)).toMatchObject({ ready: 1, ok: false })
    // Unusable files do not count.
    expect(uploadCheck([item({ slot: 1 }), item({ wav: null, slot: null, error: 'bad' })], false).ok).toBe(true)
    expect(uploadCheck([item({ slot: 1 })], true).ok).toBe(false)
    expect(uploadCheck([], false).ok).toBe(false)
  })

  it('reads the trim layer index', () => {
    expect(trimIndexOf(['upload', 'trim:2'])).toBe(2)
    expect(trimIndexOf(['upload'])).toBeNull()
  })
})
