// Port of core/src/test/kotlin/dev/arc/ep133/text/FeatureTextTest.kt
import { describe, expect, it } from 'vitest'
import { DiffResult, ProjectDiff, ProjectState, SoundDiff, SoundState } from '../../../src/core/features/backupDiff'
import { NoteNames, SCALES } from '../../../src/core/features/keys'
import { KeyMark } from '../../../src/core/features/piano'
import { physicalPad } from '../../../src/core/features/padNotes'
import { PLAY_MODES } from '../../../src/core/features/padSettings'
import { ProjectSource } from '../../../src/core/features/projectStep'
import { SampleSource } from '../../../src/core/features/sampleSource'
import { CoachText } from '../../../src/core/text/coachText'
import { FeatureText } from '../../../src/core/text/featureText'
import { MirrorText } from '../../../src/core/text/mirrorText'
import { SettingsText } from '../../../src/core/text/settingsText'

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
  it('piano and key text', () => {
    const solfege = NoteNames.SOLFEGE
    expect(MirrorText.keyWord(0, solfege).toUpperCase()).toBe('KEY DO')
    expect(MirrorText.keyWord(10, NoteNames.LETTERS)).toBe('Key A#')
    expect(MirrorText.keyChoice(0, solfege)).toBe('Key: DO. Tap to change.')
    expect(MirrorText.keyChoice(6, NoteNames.LETTERS)).toBe('Key: F#. Tap to change.')
    expect(MirrorText.pianoKey(69, solfege, KeyMark.ROOT)).toBe('LA4, root')
    expect(MirrorText.pianoKey(69, solfege, KeyMark.IN)).toBe('LA4, in the scale')
    expect(MirrorText.pianoKey(65, solfege, KeyMark.OUT)).toBe('FA4, outside the scale')
    expect(MirrorText.pianoKey(66, NoteNames.LETTERS, KeyMark.OUT)).toBe('F#4, outside the scale')
    expect(MirrorText.pianoRange(48, 72, solfege)).toBe('Keyboard, DO3 to DO5')
    expect(MirrorText.pianoRange(96, 127, NoteNames.LETTERS)).toBe('Keyboard, C7 to G9')
    expect(MirrorText.outOfRange(36, solfege, true)).toBe('DO2, below the keys')
    expect(MirrorText.outOfRange(88, NoteNames.LETTERS, false)).toBe('E6, above the keys')
    // Short scale words, still told apart once upper-cased, and never wider than five.
    const codes = SCALES.map((s) => MirrorText.scaleCode(s).toUpperCase())
    expect(codes).toEqual(['CHR', 'MAJ', 'MIN', 'DOR', 'PHR', 'LYD', 'MIX', 'MAJ.P', 'MIN.P', 'BLU'])
    expect(new Set(codes).size).toBe(codes.length)
    expect(codes.every((c) => c.length <= 5)).toBe(true)
  })

  it('device, settings and pad edit text', () => {
    expect(FeatureText.freeOf(64.0 * 1048576)).toBe('free of 64 MB')
    expect([1, 100, 200, 300, 400, 500, 600].map(FeatureText.factoryCategory)).toEqual(['Kicks', 'Snares', 'Hats', 'Perc', 'Bass', 'Melodic', null])
    expect(FeatureText.factoryCategory(99)).toBe('Kicks')
    expect(FeatureText.factoryCategory(900)).toBeNull()
    expect(FeatureText.inProject(3, 7)).toBe('In P3 \u00B7 7')
    expect(FeatureText.projectBadge(3)).toBe('P3')
    expect(FeatureText.projectSummary(352 * 1024, 7)).toBe('352 KB \u00B7 7 sounds')
    expect(FeatureText.soundsTotal(12, 2.0 * 1048576)).toBe('12 \u00B7 2.0 MB')
    expect(SettingsText.PIANO_CHOICES.map(SettingsText.pianoKeys)).toEqual(['Auto', '1 octave', '1\u00BD', '2', '3 octaves'])
    expect(SettingsText.pianoKeysDescription(12)).toBe('1\u00BD octaves')
    expect(SettingsText.padSoundsShort('69 KB')).toBe('Pad sounds \u00B7 69 KB')
    const a8 = physicalPad(0, 10)
    expect(MirrorText.padTitle(a8)).toBe('Pad A 8')
    expect(MirrorText.padSheetLine(1, 101, 'snare 2')).toBe('Project 1 \u00B7 now 101 snare 2')
    expect(MirrorText.padNow(null, null)).toBe('now empty')
    expect(MirrorText.padNow(7, null)).toBe('now 007')
    expect(MirrorText.assigned(a8, 'vox chop')).toBe('Pad A 8: vox chop')
    expect(MirrorText.restored(a8, 'snare 2')).toBe('Pad A 8: back to snare 2')
    expect(MirrorText.dropPreview('snare 2', 'vox chop')).toBe('snare 2 \u2192 vox chop')
    expect(MirrorText.dropPreview(null, 'vox chop')).toBe('empty \u2192 vox chop')
    expect(MirrorText.lastNote(77, NoteNames.SOLFEGE).toUpperCase()).toBe('KEYS \u00B7 FA5')
    expect(MirrorText.keysView(true)).toBe('Keys on a piano')
    expect(MirrorText.assignedOffline(a8, 'kick')).toBe('Pad A 8: kick, in arc until you connect')
    expect(MirrorText.offlinePadsNote(1)).toBe('1 pad changed in arc only. When you connect, arc asks before putting it on the EP-133.')
    expect(MirrorText.offlinePadsNote(3)).toBe('3 pads changed in arc only. When you connect, arc asks before putting them on the EP-133.')
    expect(MirrorText.putOffline(1)).toBe('Put 1 offline pad change on the EP-133?')
    expect(MirrorText.putOffline(2)).toBe('Put 2 offline pad changes on the EP-133?')
    expect(MirrorText.offlineWritten(2, 0)).toBe('2 pads put on the EP-133.')
    expect(MirrorText.offlineWritten(1, 1)).toBe('1 pad put on the EP-133. 1 skipped: the EP-133 has another sound or project there now.')
  })

  it('pad settings text', () => {
    expect([0, 1, 2, 3, 4].map((i) => MirrorText.pageName(i))).toEqual(['Sound', 'Trim', 'Env', 'Midi', 'Mute'])
    expect(MirrorText.MUTE_GROUP.toUpperCase()).toBe('MUTE GROUP')
    expect([1.5, -12.0, 0.0, 0.25, -0.0701, -0.004, 12.0].map((p) => MirrorText.pitchLabel(p))).toEqual(['+1.5', '-12', '0', '+0.25', '-0.07', '0', '+12'])
    expect(MirrorText.levelLabel(100)).toBe('100')
    expect([-16, -8, 0, 1, 16].map((p) => MirrorText.panLabel(p))).toEqual(['L16', 'L8', 'C', 'R1', 'R16'])
    expect(PLAY_MODES.map((m) => MirrorText.modeLabel(m))).toEqual(['Oneshot', 'Key', 'Legato'])
    expect(MirrorText.secondsLabel(11719, 46875.0)).toBe('0.25 s')
    expect(MirrorText.secondsLabel(46875, 46875.0)).toBe('1.00 s')
    expect(MirrorText.secondsLabel(100, 0.0)).toBe('0.00 s')
    expect(MirrorText.envLabel(255)).toBe('255')
    expect([0, 15].map((c) => MirrorText.channelLabel(c))).toEqual(['1', '16'])
    expect([true, false].map((o) => MirrorText.onOff(o))).toEqual(['On', 'Off'])
    expect(MirrorText.knobDescription(MirrorText.PITCH, MirrorText.pitchLabel(1.5))).toBe('Pitch: +1.5.')
    expect(MirrorText.trimDescription(1200, 46875)).toBe('Plays 46875 frames from frame 1200.')
    expect(MirrorText.padSettingsFailed('timeout')).toBe("The pad's settings couldn't be changed: timeout")
  })

  it('function keys and offline notes', () => {
    expect(MirrorText.FN_PROJECT_SUB).toBe('1\u20139')
    expect(MirrorText.projectKeyState(3, ProjectSource.DEVICE)).toBe('Project 3')
    expect(MirrorText.projectKeyState(3, ProjectSource.LAST_READ)).toBe('Project 3')
    expect(MirrorText.projectKeyState(3, ProjectSource.FACTORY)).toBe('Factory project 3')
    expect(MirrorText.projectKeyState(null, ProjectSource.DEVICE)).toBe('No project')
    expect(MirrorText.projectShort(3)).toBe('P3')
    expect(MirrorText.projectFailed('timeout')).toBe("The project couldn't be switched: timeout")
    expect(MirrorText.clickState(true, 120, false)).toBe('On, 120 BPM')
    expect(MirrorText.clickState(false, 98, true)).toBe('Off, 98 BPM, from the EP-133')
    expect(MirrorText.tempoValue(120)).toBe('120 BPM')
    expect(MirrorText.tempoShort(120)).toBe('120')
    expect(MirrorText.offlineNote(MirrorText.FACTORY, 3)).toBe(
      "Not connected: these are the EP-133's factory sounds, project 3 as it ships. Connect your EP-133 to see it live.",
    )
    // Project 1 unless PROJECT stepped on; a last read keeps its own note.
    expect(MirrorText.offlineNote(MirrorText.FACTORY)).toBe(MirrorText.factoryNote(1))
    expect(MirrorText.offlineNote(MirrorText.lastSeen('5 Oct, 14:02'), 3)).toBe(MirrorText.OFFLINE_NOTE)
    // Web delta: no PROJECT key on the web.
    expect(MirrorText.LISTEN_ONLY.endsWith('another sound in EDIT.')).toBe(true)
    expect(CoachText.PROJECT).toBe('Next project: tap; hold + pad 1–9 to pick')
    expect(MirrorText.projectChoice(3, true)).toBe('Project 3, shown')
    expect(MirrorText.projectChoice(4, false)).toBe('Project 4')
    expect(MirrorText.FN_SOUND).toBe('Sound')
    expect(MirrorText.SOUND_SHEET).toBe("Pad's sound")
    expect(CoachText.TEMPO).toBe('Click: tap; hold for tempo')
  })

  it('sample text', () => {
    const a7 = physicalPad(0, 9)
    expect(MirrorText.OPEN_SAMPLE).toBe('Open sample')
    expect(MirrorText.CLOSE_SAMPLE).toBe('Back to keys')
    expect(MirrorText.SAMPLE_TAG).toBe('Sample')
    expect(MirrorText.LATCH_NOTE).toBe('Latch on: tap a pad to record hands-free. Tap it again or STOP to stop.')
    // LATCH reads STOP while a hands-free take goes on: the shared word.
    expect(FeatureText.STOP.toUpperCase()).toBe('STOP')
    expect(
      ([[SampleSource.MIC, false], [SampleSource.RSP, true], [SampleSource.USB, false]] as const).map(([s, st]) =>
        MirrorText.sourceShort(s, st).toUpperCase(),
      ),
    ).toEqual(['MIC', 'RSP ST', 'USB'])
    expect(MirrorText.sourceName(SampleSource.MIC, false)).toBe('Phone mic, mono')
    expect(MirrorText.sourceName(SampleSource.RSP, true)).toBe("Resample the phone's sound, stereo")
    expect(MirrorText.sourceName(SampleSource.USB, false)).toBe('EP-133 over USB, mono')
    // LEVEL is the pad sheet's knob word; SAMPLE's KNOB X reuses it.
    expect(MirrorText.LEVEL).toBe('Level')
    expect([12, -6, 0].map((db) => MirrorText.gainReadout(db))).toEqual(['+12 dB', '\u22126 dB', '0 dB'])
    expect([null, -24, 0].map((db) => MirrorText.thresholdReadout(db))).toEqual(['Off', '\u221224 dB', '0 dB'])
    expect([null, 1, 2].map((n) => MirrorText.barsChoice(n))).toEqual(['Free', '1 bar', '2 bars'])
    expect(MirrorText.countIn(3)).toBe('Count-in 3')
    expect(MirrorText.sampleTime(4, 20)).toBe('0:04 / 0:20')
    expect(MirrorText.sampleTime(39, 40)).toBe('0:39 / 0:40')
    expect(MirrorText.sampleUploading(a7, 40)).toBe('Pad A 7: uploading, 40%')
    expect(MirrorText.diskLow(12)).toBe('Disk low: room for 12 s')
    expect(MirrorText.sampleUploading(a7)).toBe('Pad A 7: uploading')
    expect(MirrorText.padTitle(a7) + MirrorText.padSampleState(true)).toBe('Pad A 7, has a sound')
    expect(MirrorText.padSampleState(false)).toBe(', empty')
    expect(MirrorText.inputFailed('busy')).toBe("The input couldn't be opened: busy")
    // The seconds are cut, not rounded, as the take's time is.
    expect(MirrorText.reviewLine(a7, 4.7, SampleSource.RSP, true)).toBe('Pad A 7 \u00B7 0:04 \u00B7 RSP ST')
    expect(MirrorText.reviewLine(a7, 65.0, SampleSource.MIC, false)).toBe('Pad A 7 \u00B7 1:05 \u00B7 MIC')
    expect(MirrorText.slotLine(214, true)).toBe('Slot 214, the next free one')
    expect(MirrorText.slotLine(300, false)).toBe('Slot 300')
    expect(MirrorText.sampleQueued(a7)).toBe('Pad A 7: kept in arc. It goes on the EP-133 when you connect.')
    expect(MirrorText.sampleSaved(a7)).toBe('Pad A 7: new sample on the EP-133.')
    expect(MirrorText.DEVICE_UPLOADING).toBe("The EP-133 is taking a new sample. This sound plays once it's done.")
    expect(MirrorText.samplesToTakes(1)).toBe('1 sample kept in Takes.')
    expect(MirrorText.samplesToTakes(3)).toBe('3 samples kept in Takes.')
    // The offline prompt counts recordings apart from pad changes.
    expect(MirrorText.putOffline(2, 0)).toBe('Put 2 offline pad changes on the EP-133?')
    expect(MirrorText.putOffline(0, 1)).toBe('Put 1 new sample on the EP-133?')
    expect(MirrorText.putOffline(1, 2)).toBe('Put 1 offline pad change and 2 new samples on the EP-133?')
    expect(SettingsText.REVIEW_SAMPLES).toBe('Review samples')
    expect(SettingsText.REVIEW_SAMPLES_NOTE.endsWith('as on the EP-133.')).toBe(true)
    expect(CoachText.SAMPLE).toBe('Sample: swipe the pads left')
  })
})
