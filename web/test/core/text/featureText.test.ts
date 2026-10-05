// Port of core/src/test/kotlin/dev/arc/ep133/text/FeatureTextTest.kt
import { describe, expect, it } from 'vitest'
import { DiffResult, ProjectDiff, ProjectState, SoundDiff, SoundState } from '../../../src/core/features/backupDiff'
import { FeatureText } from '../../../src/core/text/featureText'

describe('FeatureTextTest', () => {
  it('browser text', () => {
    expect(FeatureText.storage(63.0 * 1048576, 64.0 * 1048576)).toBe('63 MB free of 64 MB')
    expect(FeatureText.storage(0.0, 0.0)).toBe('')
    expect(FeatureText.slot(7)).toBe('007')
    expect(FeatureText.projectUses([1, 2, 5])).toBe('Uses sounds 1, 2, and 5')
    expect(FeatureText.projectUses([150])).toBe('Uses sound 150')
    expect(FeatureText.projectUses([])).toBe('Uses no sounds')
    expect(FeatureText.channels(2.0)).toBe('Stereo')
    expect(FeatureText.sampleRate(46875.0)).toBe('46875 Hz')
    expect(FeatureText.settingLabel('sound.playmode')).toBe('Play mode')
    expect(FeatureText.settingValue('key')).toBe('key')
    expect(FeatureText.settingValue(-3)).toBe('-3')
  })

  it('upload text', () => {
    expect(FeatureText.uploadButton(1)).toBe('Upload 1 sound')
    expect(FeatureText.uploadButton(0)).toBe('Nothing to upload')
    expect(FeatureText.uploaded(3)).toBe('Uploaded 3 sounds.')
  })

  it('compare text', () => {
    const same = SoundDiff(1, 'kick', 'kick', SoundState.SAME_AUDIO, [])
    const settings = SoundDiff(2, 'snare', 'snare', SoundState.SAME_AUDIO, ['sound.pitch', 'envelope.release'])
    const renamed = SoundDiff(3, 'hat', 'hat old', SoundState.DIFFERENT_AUDIO, [])
    const empty = SoundDiff(4, 'clap', null, SoundState.NOT_ON_DEVICE, [])
    const unknown = SoundDiff(5, 'rim', 'rim', SoundState.UNVERIFIED, [])
    expect(FeatureText.soundState(same)).toBe('Same')
    expect(FeatureText.soundState(settings)).toBe('Different pitch and release')
    expect(FeatureText.soundState(renamed)).toBe('Different sound on the device, named "hat old" on the device')
    expect(FeatureText.soundState(empty)).toBe('Slot is empty on the device')
    expect(FeatureText.soundState(unknown)).toBe('Probably the same (the device reports no checksum)')
    const r = DiffResult([same, settings, renamed, empty], [ProjectDiff(1, ProjectState.SAME)], [42], [7, 8])
    expect(FeatureText.diffSummary(r)).toBe('Restoring changes 3 items on your EP-133:')
    expect(FeatureText.untouched(r)).toBe(
      'Also on the device and not in this backup, left as they are: sound 42 and projects 7 and 8.',
    )
    expect(FeatureText.diffSummary(DiffResult([same], [], [], []))).toBe(FeatureText.NO_CHANGES)
  })

  it('durations and trim text', () => {
    expect(FeatureText.duration(0.85)).toBe('850 ms')
    expect(FeatureText.duration(0.0)).toBe('0 ms')
    expect(FeatureText.duration(1.5)).toBe('1.5 s')
    expect(FeatureText.duration(12.34)).toBe('12.3 s')
    // The unit follows the rounded value.
    expect(FeatureText.duration(46857.0 / 46875)).toBe('1.0 s')
    expect(FeatureText.duration(0.9994)).toBe('999 ms')
    expect(FeatureText.trimmed(1.38)).toBe('Trimmed to 1.4 s')
    expect(FeatureText.selection(0.12, 1.5)).toBe('120 ms to 1.5 s, 1.4 s long')
  })
})
