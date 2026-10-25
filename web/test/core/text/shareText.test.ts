// Port of core/src/test/kotlin/dev/arc/ep133/text/ShareTextTest.kt
import { describe, expect, it } from 'vitest'
import { ChangeKind, PadChange, PakCompareResult, ProjectChange, SoundChange } from '../../../src/core/features/pakCompare'
import type { PadGroup } from '../../../src/core/features/projectPads'
import { ShareText } from '../../../src/core/text/shareText'

const group = (name: string, pads: [number, number | null][]): PadGroup => ({ name, pads: new Map(pads) })

describe('ShareTextTest', () => {
  it('names pads by the pad order', () => {
    expect(ShareText.padLabel('a', 1, 'FROM_TOP')).toBe('A7')
    expect(ShareText.padLabel('b', 10, 'FROM_TOP')).toBe('B.')
    expect(ShareText.padLabel('c', 12, 'FROM_TOP')).toBe('CE')
    expect(ShareText.padLabel('d', 1, 'FROM_BOTTOM')).toBe('D.')
    expect(ShareText.padLabel('a', 3, 'FROM_BOTTOM')).toBe('AE')
    expect(ShareText.padLabel('a', 12, 'FROM_BOTTOM')).toBe('A9')
    expect(ShareText.padLabel('a', 13, 'FROM_TOP')).toBeNull()
    expect(ShareText.padLabel('a', 0, 'FROM_BOTTOM')).toBeNull()
    expect(ShareText.padLabel('e', 1, 'FROM_TOP')).toBeNull()
  })

  it('shares a kit as sound lines with the sound list', () => {
    const groups = [
      group('a', [[1, 12], [2, 105], [10, null], [11, null], [12, 200]]),
      group('b', [[4, 300], [5, 77]]),
      group('c', [[1, null]]),
      group('x', [[1, 12]]),
    ]
    const names = new Map([[300, 'rim'], [12, 'Kick 808'], [105, 'snare\tclap'], [200, '200.pcm']])
    expect(ShareText.kit('1.2.3', 3, groups, names, 'FROM_TOP', ShareText.FROM_DEVICE)).toBe(
      [
        'My EP-133 kit, shared from arc 1.2.3',
        "The pads of project 3, from the EP-133. Pads are named by arc's pad order setting, from the top (pad file 1 is 7); community notes disagree on it.",
        '',
        '```',
        'ARC BEAT 1',
        'name Project 3 kit',
        '# no sound on: A. A0 C7',
        '[A]',
        'sound A7 12 Kick 808',
        'sound A8 105 snare clap',
        'sound AE 200 200.pcm',
        '[B]',
        'sound B4 300 rim',
        'sound B5 77 # not in the sound list',
        '```',
        '',
        "My EP-133's sounds (slot name), from the EP-133:",
        ShareText.FACTORY_NAMES,
        '12 Kick 808',
        '105 snare clap',
        '200 200.pcm',
        '300 rim',
        '',
      ].join('\n'),
    )
  })

  it('orders pads as the keypad, counted from the bottom', () => {
    const groups = [group('d', [[1, 5], [12, 6], [3, null]])]
    expect(ShareText.kit('1.2.3', 9, groups, new Map(), 'FROM_BOTTOM', ShareText.fromBackup('Friday'))).toBe(
      [
        'My EP-133 kit, shared from arc 1.2.3',
        'The pads of project 9, from the backup "Friday". Pads are named by arc\'s pad order setting, from the bottom (pad file 1 is .); community notes disagree on it.',
        '',
        '```',
        'ARC BEAT 1',
        'name Project 9 kit',
        '# no sound on: DE',
        '[D]',
        'sound D9 6',
        'sound D. 5',
        '```',
        '',
      ].join('\n'),
    )
  })

  it('says when no pad has a sound', () => {
    const text = ShareText.kit('1.2.3', 2, [group('a', [[1, null]])], new Map([[1, 'kick']]), 'FROM_TOP', ShareText.FROM_DEVICE)
    expect(text.split('\n').slice(3)).toEqual([
      'No sound on any pad of project 2.',
      '',
      "My EP-133's sounds (slot name), from the EP-133:",
      '1 kick',
      '',
    ])
  })

  it('cleans names as a card does, so a sound line and the list agree', () => {
    // A ' #' would start a comment on the sound line; the skill's clean_text drops # and |.
    const text = ShareText.kit('0.2.0', 1, [group('a', [[1, 12]])], new Map([[12, 'Kick #2 | hard']]), 'FROM_TOP', ShareText.FROM_DEVICE)
    const lines = text.split('\n')
    expect(lines).toContain('sound A7 12 Kick 2 hard')
    expect(lines).toContain('12 Kick 2 hard')
  })

  it('shares a sound list, cut when long', () => {
    expect(ShareText.sounds('1.2.3', new Map([[9, 'hat'], [1, ' kick ']]), ShareText.fromBackup('Fri'))).toBe(
      'My EP-133 sounds, shared from arc 1.2.3\n\nMy EP-133\'s sounds (slot name), from the backup "Fri":\n1 kick\n9 hat\n',
    )
    expect(ShareText.sounds('1.2.3', new Map(), ShareText.FROM_DEVICE)).toBe(
      'My EP-133 sounds, shared from arc 1.2.3\n\nNo sounds in the EP-133.\n',
    )
    const many = new Map(Array.from({ length: 999 }, (_, i) => [i + 1, `sound number ${i + 1}`] as [number, string]))
    const text = ShareText.sounds('1.2.3', many, ShareText.FROM_DEVICE)
    const lines = text.split('\n')
    expect(lines[3]).toBe('1 sound number 1')
    expect(lines[ShareText.MAX_SOUNDS + 2]).toBe('400 sound number 400')
    expect(lines[ShareText.MAX_SOUNDS + 3]).toBe('# 599 more sounds left out')
    expect(text.length).toBeLessThan(20_000)
    expect(ShareText.leftOut(1, 'line')).toBe('# 1 more line left out')
  })

  it('shares what changed between two backups', () => {
    const r = PakCompareResult(
      [
        SoundChange(5, ChangeKind.ADDED, null, 'clap'),
        SoundChange(3, ChangeKind.REMOVED, 'hat', null),
        SoundChange(2, ChangeKind.CHANGED, 'snare', 'snare 2', { audioChanged: true, renamed: true }),
        SoundChange(7, ChangeKind.CHANGED, 'tom', 'tom', { settingsChanged: ['sound.pitch'] }),
      ],
      [
        ProjectChange(4, ChangeKind.ADDED),
        ProjectChange(6, ChangeKind.REMOVED),
        ProjectChange(1, ChangeKind.CHANGED, [PadChange('a', 3, 1, 5), PadChange('b', 10, null, 9)]),
        ProjectChange(2, ChangeKind.CHANGED, [], true),
        ProjectChange(3, ChangeKind.CHANGED, [], false),
      ],
      1,
      0,
    )
    const oldNames = new Map([[1, 'kick'], [3, 'hat']])
    const newNames = new Map([[5, 'clap']])
    expect(ShareText.compare('1.2.3', 'From Fri (Oct 4, 2026) to Sat (Oct 5, 2026)', r, oldNames, newNames, 'FROM_TOP')).toBe(
      [
        'Two of my EP-133 backups compared, shared from arc 1.2.3',
        'From Fri (Oct 4, 2026) to Sat (Oct 5, 2026)',
        '',
        'Sounds added:',
        '+ 5 clap',
        'Sounds removed:',
        '- 3 hat',
        'Sounds changed:',
        '~ 2 snare 2: Renamed from snare; audio changed',
        '~ 7 tom: Settings changed: Pitch',
        'Projects added:',
        '+ Project 4',
        'Projects removed:',
        '- Project 6',
        'Projects changed:',
        '~ Project 1:',
        '  A9 1 kick → 5 clap',
        '  B. empty → 9',
        '~ Project 2: Patterns or settings changed; each pad still has the same sound.',
        '~ Project 3: Changed.',
        'Unchanged: 1 sound.',
        '',
      ].join('\n'),
    )
  })

  it('says when nothing changed, and cuts a long compare', () => {
    expect(ShareText.compare('1.2.3', 'From a to b', PakCompareResult([], [], 3, 2), new Map(), new Map(), 'FROM_TOP')).toBe(
      'Two of my EP-133 backups compared, shared from arc 1.2.3\nFrom a to b\n\nNothing changed: the same sounds and projects.\n',
    )
    const added = Array.from({ length: 200 }, (_, i) => SoundChange(i + 1, ChangeKind.ADDED, null, `s${i + 1}`))
    const lines = ShareText.compare('1.2.3', 'From a to b', PakCompareResult(added, [], 0, 0), new Map(), new Map(), 'FROM_TOP').split('\n')
    expect(lines[3]).toBe('Sounds added:')
    expect(lines[3 + ShareText.MAX_CHANGES - 1]).toBe('+ 149 s149')
    expect(lines[3 + ShareText.MAX_CHANGES]).toBe('# 51 more lines left out')
    expect(lines[lines.length - 1]).toBe('')
  })
})
