// Port of core/src/test/kotlin/dev/arc/ep133/text/FeatureTextTest.kt
import { describe, expect, it } from 'vitest'
import { ARP_ORDERS, arpNote } from '../../../src/core/features/arp'
import { cardFx, type CardProblem } from '../../../src/core/features/beatCard'
import { DiffResult, ProjectDiff, ProjectState, SoundDiff, SoundState } from '../../../src/core/features/backupDiff'
import { NoteNames, SCALES } from '../../../src/core/features/keys'
import { FX_TYPES, FxSettings, FxType, comp, sidechain } from '../../../src/core/features/fxSettings'
import { KeyMark } from '../../../src/core/features/piano'
import { physicalPad } from '../../../src/core/features/padNotes'
import { ProjectSeq, TIMINGS, Timing } from '../../../src/core/features/pattern'
import { PLAY_MODES, PadSettings } from '../../../src/core/features/padSettings'
import { ProjectSource } from '../../../src/core/features/projectStep'
import { SampleSource } from '../../../src/core/features/sampleSource'
import { SWITCH_TIMES, SceneOps, SwitchTime } from '../../../src/core/features/scenes'
import { transportState } from '../../../src/core/features/transport'
import { CoachText } from '../../../src/core/text/coachText'
import { ClaudeText } from '../../../src/core/text/claudeText'
import { FeatureText } from '../../../src/core/text/featureText'
import { MirrorText } from '../../../src/core/text/mirrorText'
import { NavText } from '../../../src/core/text/navText'
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
    expect(MirrorText.seen('5 Oct')).toBe('Seen 5 Oct')
    // Web delta: no PROJECT key on the web.
    expect(MirrorText.LISTEN_ONLY.endsWith('another sound in EDIT.')).toBe(true)
    expect(CoachText.PROJECT).toBe('Next project: tap; hold + pad 1–9 to pick')
    expect(MirrorText.projectChoice(3, true)).toBe('Project 3, shown')
    expect(MirrorText.projectChoice(4, false)).toBe('Project 4')
    expect(MirrorText.FN_SOUND).toBe('Sound')
    expect(MirrorText.SOUND_SHEET).toBe("Pad's sound")
    expect(CoachText.TEMPO).toBe('Click: tap; hold for tempo')
  })

  it('fx text', () => {
    expect([MirrorText.FN_FX, MirrorText.FN_FX_SUB].map((w) => w.toUpperCase())).toEqual(['FX', 'PAGE'])
    expect(FX_TYPES.map((t) => MirrorText.fxCode(t))).toEqual(['OFF', 'DLY', 'REV', 'DST', 'CHO', 'FLT', 'CMP'])
    // The key's word stays six letters at most, for four keys across a narrow phone.
    expect(FX_TYPES.map((t) => MirrorText.fxKeyLabel(t))).toEqual(['FX off', 'Delay', 'Reverb', 'Dist', 'Chorus', 'Filter', 'Comp'])
    expect(FX_TYPES.every((t) => MirrorText.fxKeyLabel(t).length <= 6)).toBe(true)
    expect(MirrorText.fxKeyDescription(FxType.DISTORTION)).toBe('Effects, Distortion')
    expect(MirrorText.fxKeyDescription(FxType.NONE)).toBe('Effects, Off')
    expect(MirrorText.fxChoice(FxType.REVERB, true)).toBe('Reverb, on. Tap again to turn it off.')
    expect(MirrorText.fxChoice(FxType.REVERB, false)).toBe('Reverb')
    expect(MirrorText.fxHearNoSend('B')).toBe('Group B sends nothing to the effect: raise its fader to hear it.')
    expect(MirrorText.xyState(FxType.DELAY, 0.625, 0.4, 120)).toBe('Length 1/8D, feedback 38%')
    expect(MirrorText.xyState(FxType.FILTER, 0.5, 0.5, 120)).toBe('Cutoff OPEN, reso Q 4.3')
    expect(MirrorText.xyReadout(FxType.DELAY, 0.625, 0.4, 120)).toBe('1/8D \u00B7 38%')
    expect([MirrorText.xyStep('LENGTH', true), MirrorText.xyStep('FEEDBACK', false)]).toEqual(['Length up', 'Feedback down'])
    expect(MirrorText.sendName(2)).toBe('Send C')
    expect([0, 0.62, 1].map((v) => MirrorText.sendValue(v))).toEqual(['0', '62', '100'])
    const a7 = physicalPad(0, 9)
    expect(MirrorText.sidechainSource(a7, 'kick')).toBe('A 7 kick')
    expect(MirrorText.sidechainSource(a7, null)).toBe('A 7')
    expect(MirrorText.sidechainSourceDescription(a7, 'kick')).toBe('Sidechain source, A 7 kick')
    expect(MirrorText.setSource(physicalPad(1, 3))).toBe('Set to B 1')
    expect(MirrorText.duckChoice(3)).toBe('Duck group D')
    expect([0, 0.3, 1].map((x) => MirrorText.sidechainLength(x))).toEqual(['30 ms', '201 ms', '600 ms'])
    expect([0.2, 0.5, 0.7].map((y) => MirrorText.sidechainShape(y))).toEqual(['SNAP 60', 'EVEN', 'PUMP 40'])
  })

  it('punch text', () => {
    // Slot order, '.' to '9', as the pads print them while FX is held.
    expect(Array.from({ length: 12 }, (_, s) => MirrorText.punchName(s).toUpperCase())).toEqual(
      ['PITCH RND', 'SLICE', 'STUTTER', 'REPEAT', 'TAPE STOP', 'FILTER LFO', 'LPF', 'HPF', 'SEND FX', 'TREMOLO', 'OCT \u2193', 'DECIMATE'],
    )
    expect([3, 10].map((s) => MirrorText.punchDescription(s))).toEqual(['Beat repeat', 'Octave down'])
    expect(MirrorText.punchLine(new Set([3, 6]))).toBe('PUNCH \u00B7 REPEAT + LPF')
    expect(MirrorText.punchSpoken(new Set([3, 6]))).toBe('Punch-ins, Beat repeat, Low-pass filter')
  })

  it('sample text', () => {
    const a7 = physicalPad(0, 9)
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
    expect(MirrorText.sampleMax(40)).toBe('Takes up to 40 s')
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
    expect(CoachText.SAMPLE).toBe('Sample')
  })

  it('bluetooth delay text', () => {
    expect(SettingsText.MAKE_UP_DELAY).toBe('Make up for Bluetooth delay')
    expect(SettingsText.MAKE_UP_DELAY_NOTE.endsWith('are not changed.')).toBe(true)
    expect(SettingsText.delayNow(40, 140)).toBe('Now: the output counts about 40 ms; arc makes up the other 140 ms.')
    expect(SettingsText.delayNow(220, 0)).toBe("Now: the output counts about 220 ms, all of Bluetooth's delay, so nothing more is made up.")
    expect(SettingsText.delayNow(null, 180)).toBe('Now: not measured, counted as about 180 ms.')
    expect(SettingsText.DELAY_NONE).toBe("Now: the sound isn't going to Bluetooth, so nothing is made up for.")
    // The key's sentence leads with the delay, as a toast may cut it short.
    expect(MirrorText.WIRELESS_DELAY.startsWith('Bluetooth plays late')).toBe(true)
    expect(MirrorText.wirelessMadeUp(180)).toBe('Bluetooth plays late (about 180 ms): arc makes up for it')
    expect(CoachText.BLUETOOTH).toBe('Bluetooth delay')
  })

  it('connection key text', () => {
    expect(NavText.HOLD_TO_DISCONNECT).toBe('Hold to disconnect')
    expect(CoachText.CONNECTED).toBe('EP-133 connected: hold to disconnect')
    expect(CoachText.CONNECTED_NAME).toBe('EP-133 connected')
    expect(CoachText.CONNECTION_HOLD).toBe('Connection: hold to disconnect')
    expect(CoachText.DISCONNECT).toBe('Disconnect')
  })

  it('pattern text', () => {
    const a7 = physicalPad(0, 9)
    expect(MirrorText.PATTERN).toBe('Pattern')
    expect(
      [
        MirrorText.RECORD,
        MirrorText.PLAY,
        FeatureText.STOP,
        MirrorText.ERASE,
        MirrorText.UNDO,
        MirrorText.TIMING,
        MirrorText.LENGTH,
        MirrorText.AUTO,
        MirrorText.COUNT_IN,
        MirrorText.CLEAR,
        MirrorText.CLEAR_ALL,
      ].map((w) => w.toUpperCase()),
    ).toEqual(['RECORD', 'PLAY', 'STOP', 'ERASE', 'UNDO', 'TIMING', 'LENGTH', 'AUTO', 'COUNT-IN', 'CLEAR', 'CLEAR ALL'])
    expect(MirrorText.DOUBLE).toBe('×2')
    expect(MirrorText.patternPosition(2, 3, 4)).toBe('2.3 / 4')
    expect(MirrorText.patternRecording(2, 3, 4, Timing.SIXTEENTH)).toBe('2.3 / 4 · 1/16')
    expect(MirrorText.patternRecording(1, 1, 1, Timing.OFF)).toBe('1.1 / 1 · Off')
    expect(MirrorText.countIn(3)).toBe('Count-in 3')
    expect(MirrorText.countInOf(4)).toBe('/ 4')
    expect(MirrorText.patternArmed(Timing.SIXTEENTH)).toBe('Play a pad or PLAY · 1/16')
    expect(MirrorText.patternArmed(Timing.OFF)).toBe('Play a pad or PLAY · Off')
    expect(TIMINGS.map((t) => MirrorText.timingLabel(t))).toEqual(['Off', '1/1', '1/2', '1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32'])
    expect(MirrorText.timingName(Timing.SIXTEENTH)).toBe('Timing 1/16: notes snap to the nearest 1/16')
    expect(MirrorText.timingName(Timing.EIGHTH_T)).toBe('Timing 1/8T: notes snap to the nearest 1/8 triplet')
    expect(MirrorText.timingName(Timing.OFF)).toBe('Timing off: notes stay where you play them')
    const held = [arpNote(a7, 5), arpNote(a7, 9), arpNote(a7, 0)]
    expect(MirrorText.arpLine(false, false, Timing.SIXTEENTH, held, NoteNames.SOLFEGE)).toBe('ARP · 1/16 · FA LA DO')
    expect(MirrorText.arpLine(false, true, Timing.EIGHTH_T, held, NoteNames.LETTERS)).toBe('ARP ∞ · 1/8T · F A C')
    expect(MirrorText.arpLine(true, false, Timing.THIRTY_SECOND, [arpNote(a7, null), arpNote(physicalPad(1, 2), null)], NoteNames.SOLFEGE)).toBe(
      'REPEAT · 1/32 · A 7, B ENTER',
    )
    // The ARP / RPT switch and the tempo sheet's TIMING page.
    expect([MirrorText.ARP, MirrorText.RPT].map((w) => w.toUpperCase())).toEqual(['ARP', 'RPT'])
    expect(MirrorText.arpFirst(true)).toBe('Turn on RPT first')
    expect(CoachText.ARP).toBe('Arp or repeat: hold pads')
    expect(MirrorText.intervalName(Timing.SIXTEENTH_T)).toBe('Interval 1/16 triplet')
    expect(MirrorText.percent(56)).toBe('56%')
    expect(MirrorText.GATE_NOTE).toBe('How long each note sounds, as a share of the step.')
    expect(ARP_ORDERS.map((o) => MirrorText.arpOrderName(o))).toEqual(['Played', 'Up', 'Down', 'Up-dn', 'Random'])
    expect((['played', 'updown'] as const).map((o) => MirrorText.arpOrderSpoken(o))).toEqual(['As played', 'Up and down'])
    expect(MirrorText.groupLength(0, 1)).toBe('A · 1 bar')
    expect(MirrorText.groupLengthName(3, 16)).toBe('Group D, 16 bars')
    expect(MirrorText.clearAsk(1)).toBe("Clear group B's notes?")
    expect(MirrorText.clearAsk(null)).toBe("Clear every group's notes?")
    expect(MirrorText.cleared(2)).toBe('Group C cleared.')
    expect(MirrorText.cleared(null)).toBe('Patterns cleared.')
    expect(MirrorText.erased(a7)).toBe('Pad A 7: notes erased.')
    expect(MirrorText.padTitle(a7) + MirrorText.PAD_HAS_NOTES).toBe('Pad A 7, has notes')
    expect(MirrorText.missingPads(1)).toBe('1 pad not loaded')
    expect(MirrorText.missingPads(3)).toBe('3 pads not loaded')
    expect(MirrorText.PATTERN_NOTE).toBe('Patterns stay in arc and play on the phone.')
    // The keys for screen readers, and what is said when the transport changes.
    const stopped = transportState()
    const armed = transportState('ARMED')
    const counting = transportState('COUNT_IN', true)
    const recording = transportState('PLAYING', true)
    const playing = transportState('PLAYING')
    const states = [stopped, armed, counting, recording, playing]
    expect(states.map((s) => MirrorText.recordDescription(s))).toEqual([
      'Record, off',
      'Record, armed',
      'Record, armed',
      'Record, recording',
      'Record, off',
    ])
    expect(MirrorText.recordDescription(transportState('COUNT_IN'))).toBe('Record, off')
    expect(states.map((s) => MirrorText.playDescription(s, 2, 4))).toEqual([
      'Play',
      'Play',
      'Play, counting in',
      'Play, bar 2 of 4',
      'Play, bar 2 of 4',
    ])
    expect(states.map((s) => MirrorText.transportAnnouncement(s))).toEqual(['Stopped', 'Record armed', 'Counting in', 'Recording', 'Playing'])
    // SAMPLE's BARS choice for the pattern's length.
    expect(MirrorText.PTN.toUpperCase()).toBe('PTN')
    // Web delta: no REC, so no TAKE words.
    expect(CoachText.RECORD).toBe('Record a pattern: tap, then PLAY; hold for its settings')
  })

  it('scene text', () => {
    expect([1, 5, 99].map((n) => MirrorText.patternLabel(n))).toEqual(['P01', 'P05', 'P99'])
    // The scene's index, shown from 1.
    expect([0, 9, 98].map((i) => MirrorText.sceneLabel(i))).toEqual(['S01', 'S10', 'S99'])
    const seq = SceneOps.selectPattern(SceneOps.selectPattern(ProjectSeq.DEFAULT, 1, 3), 3, 2)
    expect(MirrorText.sceneLine(seq)).toBe('S01 \u00B7 A01 B03 C01 D02')
    expect(MirrorText.sceneLine(SceneOps.newScene(ProjectSeq.DEFAULT))).toBe('S02 \u00B7 A02 B02 C02 D02')
    expect(SWITCH_TIMES.map((t) => MirrorText.switchName(t))).toEqual(['Immediate', 'Bar end', 'Pattern end'])
    expect(MirrorText.queuedLabel(1, 5)).toBe('P01 \u2192 P05')
    expect(MirrorText.copiedPattern(3)).toBe('P03 copied.')
    expect(MirrorText.copiedBar(2)).toBe('Bar 2 copied.')
    expect(MirrorText.copiedPad('KICK')).toBe('KICK copied.')
    expect(MirrorText.pastedPattern(5)).toBe('Pasted into P05.')
    expect(MirrorText.pastedBar(2)).toBe('Pasted into bar 2.')
    expect(MirrorText.pastedPad('SNARE')).toBe('Pasted onto SNARE.')
    expect(MirrorText.CLEARED_SCENE).toBe('Scene cleared.')
    expect(MirrorText.DELETED_SCENE).toBe('Scene deleted.')
  })

  it('scene panel text', () => {
    expect(MirrorText.groupPattern(1, 3)).toBe('B03')
    expect(SWITCH_TIMES.map((t) => MirrorText.switchAt(t))).toEqual(['now', 'at bar end', 'at pattern end'])
    expect(MirrorText.groupMove(1, 5)).toBe('B \u2192 05')
    expect(MirrorText.sceneMove(2)).toBe('\u2192 S03')
    expect(MirrorText.queuedLine(MirrorText.groupMove(1, 5), SwitchTime.BAR)).toBe('B \u2192 05 at bar end')
    expect(MirrorText.queuedLine(MirrorText.sceneMove(2), SwitchTime.PATTERN)).toBe('\u2192 S03 at pattern end')
    expect(MirrorText.sceneCommitted(2)).toBe('S03 committed')
    expect(MirrorText.sceneCleared(4)).toBe('S05 cleared')
    expect(MirrorText.sceneDeleted(4)).toBe('S05 deleted')
    expect(MirrorText.gridStatus(1)).toBe('B \u00B7 pick 01\u201399')
    expect(MirrorText.clipCopied('A bar 2')).toBe('A bar 2 copied')
    expect(MirrorText.clipPasted('SNARE')).toBe('SNARE pasted')
    expect(MirrorText.PAD_TAP_SOURCE).toBe('Tap a pad')
    expect(MirrorText.padTapTarget('KICK')).toBe('KICK \u2192 tap target')
    expect([MirrorText.NO_PATTERN_COPIED, MirrorText.NO_BAR_COPIED, MirrorText.NO_PAD_COPIED]).toEqual(['No pattern copied', 'No bar copied', 'No pad copied'])
    // For screen readers.
    expect(MirrorText.sceneSpoken(1, 3, [1, 3, 1, 2])).toBe('Scene 2 of 3, patterns A 1, B 3, C 1, D 2')
    expect(MirrorText.patternSpoken(1, 5, 4)).toBe('Group B, pattern 5, 4 bars')
    expect(MirrorText.patternSpoken(0, 1, 1)).toBe('Group A, pattern 1, 1 bar')
    expect(MirrorText.patternQueuedSpoken(1, 5, SwitchTime.BAR)).toBe('Group B, pattern 5, at bar end')
    expect(MirrorText.sceneQueuedSpoken(2, SwitchTime.PATTERN)).toBe('Scene 3, at pattern end')
    expect(MirrorText.sceneCommittedSpoken(2)).toBe('Scene 3 committed')
  })

  it('scene panel labels', () => {
    expect(MirrorText.sceneChipName(1, 3)).toBe('Scenes, scene 2 of 3')
    expect(MirrorText.sceneStatus(1, 3)).toBe('Scene 2 of 3')
    expect([MirrorText.patternNumber(3), MirrorText.numberMove(3, 5)]).toEqual(['03', '03\u219205'])
    expect([true, false].map((n) => MirrorText.groupColumn(1, 3, n))).toEqual(['Group B, pattern 3, has notes', 'Group B, pattern 3'])
    expect([MirrorText.groupPrevious(1), MirrorText.groupNext(1), MirrorText.groupNextFree(1)]).toEqual([
      'Group B, previous pattern',
      'Group B, next pattern',
      'Group B, next free pattern',
    ])
    expect([null, 5].map((q) => MirrorText.groupKeyPattern(3, q))).toEqual([', pattern 3', ', pattern 3, changing to 5'])
    // CLR and DEL, the hold key.
    expect([false, true].map((d) => MirrorText.eraseSceneName(d))).toEqual(['Clear scene', 'Delete scene'])
    expect([MirrorText.eraseHolding(false, 'S02'), MirrorText.eraseHolding(true, 'S05')].map((w) => w.toUpperCase())).toEqual(['HOLD \u00B7 CLR S02', 'HOLD \u00B7 DEL S05'])
    expect(SWITCH_TIMES.map((t) => MirrorText.changeName(t))).toEqual(['Scene change: Immediate', 'Scene change: Bar end', 'Scene change: Pattern end'])
    // CLIP.
    expect([MirrorText.PTN, MirrorText.BAR, MirrorText.CLIP_PAD, MirrorText.COPY, MirrorText.PASTE].map((w) => w.toUpperCase())).toEqual(['PTN', 'BAR', 'PAD', 'COPY', 'PASTE'])
    expect([MirrorText.barPagesGroup(0), MirrorText.clipHeld('A bar 2')]).toEqual(['Group A \u00B7 bar', 'Clip \u00B7 A bar 2'])
    // The 1-99 grid.
    expect([MirrorText.gridTitle(1), MirrorText.gridDetail(3, 4), MirrorText.gridDetail(3, 1)]).toEqual(['Group B', 'P03 \u00B7 4 bars', 'P03 \u00B7 1 bar'])
    expect([MirrorText.patternCell(5, true), MirrorText.patternCell(6, false)]).toEqual(['Pattern 5, has notes', 'Pattern 6'])
    expect(CoachText.SCENE).toBe('Pick patterns and scenes, copy and paste')
  })

  it('step text', () => {
    // bar.beat.step, from 1: the 5th 1/16 is 1.2.1.
    expect([0, 4, 5, 15, 16].map((s) => MirrorText.stepLabel(s, Timing.SIXTEENTH))).toEqual(['1.1.1', '1.2.1', '1.2.2', '1.4.4', '2.1.1'])
    expect(MirrorText.stepLabel(3, Timing.EIGHTH)).toBe('1.2.2')
    expect(MirrorText.stepLabel(7, Timing.THIRTY_SECOND)).toBe('1.1.8')
    // A beat or longer: the step is 1.
    expect(MirrorText.stepLabel(3, Timing.QUARTER)).toBe('1.4.1')
    expect(MirrorText.stepLabel(2, Timing.HALF)).toBe('2.1.1')
    expect(MirrorText.stepLabel(2, Timing.WHOLE)).toBe('3.1.1')
    // Triplets: 1..3 in a beat at 1/8T, 1..6 at 1/16T.
    expect(MirrorText.stepLabel(5, Timing.EIGHTH_T)).toBe('1.2.3')
    expect(MirrorText.stepLabel(11, Timing.SIXTEENTH_T)).toBe('1.2.6')
    expect([24, 384, 192, 96, 48, 32, 16, 12, 72, 120, 360, 50, 1].map((t) => MirrorText.gateLabel(t))).toEqual([
      '1/16',
      '1 bar',
      '1/2',
      '1/4',
      '1/8',
      '1/8T',
      '1/16T',
      '1/32',
      '3/16',
      '5/16',
      '15/16',
      '50 tk',
      '1 tk',
    ])
    expect(MirrorText.correctedLine(1)).toBe('1 corrected')
    expect(MirrorText.correctedLine(3)).toBe('3 corrected')
    // The STEP panel's status, and what screen readers say.
    expect(MirrorText.stepPlaced('SNARE')).toBe('+ SNARE')
    expect(MirrorText.stepPlacedSpoken('SNARE', '1.2.1')).toBe('SNARE on step 1.2.1')
    expect(MirrorText.stepNudged('KICK', '1.2.2')).toBe('KICK \u2192 1.2.2')
    expect(MirrorText.stepNudgedSpoken('KICK', '1.2.2')).toBe('KICK moved to step 1.2.2')
    expect([1, -2, 0].map((t) => MirrorText.stepShifted('KICK', t))).toEqual(['KICK +1 tk', 'KICK \u22122 tk', 'KICK 0 tk'])
    expect([1, -2, 0].map((t) => MirrorText.stepShiftedSpoken('KICK', t))).toEqual(['KICK 1 tick later', 'KICK 2 ticks earlier', 'KICK back in place'])
    expect([0, 1, 2].map((n) => MirrorText.stepSpoken('1.2.1', n))).toEqual(['Step 1.2.1', 'Step 1.2.1, 1 note', 'Step 1.2.1, 2 notes'])
    // The STEP chip and panel.
    expect(MirrorText.stepStatus('1.2.1')).toBe('STEP 1.2.1')
    expect([MirrorText.stepCell('1.2.1', true), MirrorText.stepCell('2.4.4', false)]).toEqual(['Step 1.2.1, has notes', 'Step 2.4.4'])
    expect(MirrorText.barPage(2)).toBe('Bar 2')
    expect([MirrorText.nudgeChip(null), MirrorText.nudgeChip('KICK')].map((w) => w.toUpperCase())).toEqual(['NUDGE', 'NUDGE \u00B7 KICK'])
    expect([MirrorText.STEP, MirrorText.VEL, MirrorText.LEN, MirrorText.BAR, MirrorText.CORRECT].map((w) => w.toUpperCase())).toEqual(['STEP', 'VEL', 'LEN', 'BAR', 'CORRECT'])
    expect(MirrorText.NUDGE_NOTE).toBe('Tap a lit pad to pick it, then \u2212 and + move its note.')
    expect(CoachText.STEP).toBe('Step through the pattern')
    expect(MirrorText.STEP_GROUP).toBe('Editing in step')
  })

  it('claude text', () => {
    // Live tools: the section, its card and the links.
    expect([ClaudeText.CLAUDE, ClaudeText.BEAT_CARDS].map((w) => w.toUpperCase())).toEqual(['CLAUDE', 'BEAT CARDS'])
    expect([ClaudeText.shareScene('S02'), ClaudeText.sharePattern(0, 1), ClaudeText.PASTE_BEAT].map((w) => w.toUpperCase())).toEqual(['SHARE SCENE S02', 'SHARE A \u00B7 01', 'PASTE BEAT'])
    expect([ClaudeText.shareSceneName('S02', false), ClaudeText.shareSceneName('S02', true), ClaudeText.sharePatternName(1, 12, false), ClaudeText.sharePatternName(1, 12, true)]).toEqual([
      'Share scene S02 with Claude',
      'Share scene S02 with Claude, no notes yet',
      'Share B \u00B7 12 with Claude',
      'Share B \u00B7 12 with Claude, no notes yet',
    ])
    expect(ClaudeText.SKILL_URL).toBe('https://arc-pi-mauve.vercel.app/arc-beats-skill.zip')
    expect(ClaudeText.LEARN_PROMPT.startsWith('Use the arc-beats skill.')).toBe(true)
    expect(CoachText.CLAUDE).toBe('Share a beat with Claude, paste one back')
    // What is shared: the card in a fenced block after the prompt, named by where it sits.
    expect([ClaudeText.patternCardName(1, 1), ClaudeText.patternCardName(99, 9), ClaudeText.sceneCardName(1)]).toEqual(['P01 S02', 'P99 S10', 'S02'])
    expect(ClaudeText.shareSubject('P01 S02')).toBe('Arc beat P01 S02')
    expect(ClaudeText.shareText('Analyse this beat:', 'ARC BEAT 1\nswing 50\n')).toBe('Analyse this beat:\n\n```\nARC BEAT 1\nswing 50\n```\n')
    expect(ClaudeText.NO_CARD).toBe('No beat card in that text.')
    // The prompt asks for the sound lines kept, or sounds chosen from the list that follows the card.
    expect(ClaudeText.SHARE_PROMPT.includes('sound list') && ClaudeText.SHARE_PROMPT.includes('FX and pad lines') && ClaudeText.SHARE_PROMPT.endsWith(':')).toBe(true)
    expect([212, 1].map((n) => ClaudeText.withSoundList(n))).toEqual(['With my sound list \u00B7 212 sounds', 'With my sound list \u00B7 1 sound'])
    // The sound list after a shared card.
    expect([ClaudeText.SOUNDS_FROM_DEVICE, ClaudeText.SOUNDS_FROM_LAST_READ, ClaudeText.SOUNDS_FROM_FACTORY].map((s) => ClaudeText.soundListHeader(s))).toEqual([
      "My EP-133's sounds (slot name), from the EP-133:",
      "My EP-133's sounds (slot name), from the last read:",
      "My EP-133's sounds (slot name), from the factory pack:",
    ])
    // The sheet.
    expect([ClaudeText.summary(4, 5, 23), ClaudeText.summary(1, 1, 1)]).toEqual(['Beat card \u00B7 4 bars \u00B7 5 pads \u00B7 23 hits', 'Beat card \u00B7 1 bar \u00B7 1 pad \u00B7 1 hit'])
    expect([ClaudeText.place(0, 4), ClaudeText.place(3, 99)]).toEqual(['A \u00B7 04', 'D \u00B7 99'])
    expect([ClaudeText.sectionTitle(0, 2, '1/16'), ClaudeText.sectionTitle(2, 1, '1/16T')]).toEqual(['Group A \u00B7 2 bars \u00B7 1/16', 'Group C \u00B7 1 bar \u00B7 1/16T'])
    expect([1, 6].map((n) => ClaudeText.moreBars(n))).toEqual(['+1 bar', '+6 bars'])
    expect([physicalPad(0, 9), physicalPad(0, 2), physicalPad(1, 0)].map((p) => ClaudeText.padLabel(p))).toEqual(['A7', 'AE', 'B.'])
    expect([ClaudeText.rowName(physicalPad(0, 9), 'kick', 4), ClaudeText.rowName(physicalPad(0, 9), null, 1), ClaudeText.rowName(physicalPad(0, 2), null, 2)]).toEqual([
      'A7 kick: 4 hits',
      'A7: 1 hit',
      'A enter: 2 hits',
    ])
    expect(ClaudeText.gridName(0, 2, '1/16', 3)).toBe('Group A, 2 bars, 1/16, 3 pads')
    expect(ClaudeText.goesTo(0, 4)).toBe('A \u00B7 04 (next free)')
    expect([ClaudeText.GOES_TO, MirrorText.NEW_SCENE, ClaudeText.TEMPO]).toEqual(['Goes to', 'New scene', 'Tempo'])
    expect(ClaudeText.tempoChip(122).toUpperCase()).toBe('SET \u00B7 NOW 122')
    expect([true, false].map((on) => ClaudeText.tempoChipName('92', 122, on))).toEqual(['Set the tempo to 92, now 122', 'Keep the tempo at 122, the card says 92'])
    expect(ClaudeText.swingLine(58)).toBe('Swing 58 \u00B7 placed in the notes')
    // Problems: listed, announced and copied for Claude.
    const warning: CardProblem = { line: 7, message: "Unknown word 'foo', ignored.", error: false }
    const error: CardProblem = { line: 12, message: 'A7 needs a | before its steps.', error: true }
    expect(ClaudeText.problemLine(warning)).toBe("Line 7: Unknown word 'foo', ignored.")
    expect([warning, error].map((p) => ClaudeText.problemName(p))).toEqual(["Warning, line 7: Unknown word 'foo', ignored.", 'Error, line 12: A7 needs a | before its steps.'])
    expect(ClaudeText.problemsReport([warning, error])).toBe(
      "Arc found problems in the beat card:\n- Line 7 (warning): Unknown word 'foo', ignored.\n- Line 12 (error): A7 needs a | before its steps.\nPlease fix them and send the whole card again.",
    )
    // IMPORT, and why it can't.
    expect([ClaudeText.COPY_PROBLEMS, ClaudeText.IMPORT].map((w) => w.toUpperCase())).toEqual(['COPY PROBLEMS', 'IMPORT'])
    expect(ClaudeText.groupFull(1)).toBe('Group B has no free pattern.')
    // The sounds a card puts on pads: the block, its rows and its notes.
    expect([ClaudeText.SOUNDS, ClaudeText.PUT_ON_PADS].map((w) => w.toUpperCase())).toEqual(['SOUNDS', 'PUT ON PADS'])
    expect([ClaudeText.putOnPadsName(true, 2), ClaudeText.putOnPadsName(false, 2)]).toEqual(['Put 2 sounds on the pads', "Leave the pads' sounds as they are"])
    expect([ClaudeText.soundName(12, 'Micro kick'), ClaudeText.soundName(12, null)]).toEqual(['012 Micro kick', '012'])
    expect([ClaudeText.soundMissing(301, 'Rim dusty'), ClaudeText.soundMissing(301, null)]).toEqual(['Not on your EP-133: 301 Rim dusty', 'Not on your EP-133: 301'])
    expect(ClaudeText.ALREADY_THERE).toBe('Already there')
    expect(ClaudeText.cardSays('HH CLOSED')).toBe('Card says HH CLOSED \u00B7 name not checked')
    expect(ClaudeText.NONE_ON_DEVICE).toBe('None of these sounds are on your EP-133. Share a beat with your sound list so Claude picks from yours.')
    expect([
      ClaudeText.soundRowName(physicalPad(0, 9), 'Kick dusty', '012 Micro kick'),
      ClaudeText.soundRowName(physicalPad(0, 9), null, '012 Micro kick'),
      ClaudeText.soundRowSame(physicalPad(0, 9), '012 Micro kick'),
      ClaudeText.soundRowMissing(physicalPad(0, 2), 301, 'Rim dusty'),
    ]).toEqual(['A7: Kick dusty becomes 012 Micro kick', 'A7: 012 Micro kick', 'A7: 012 Micro kick, already there', 'AE: Not on your EP-133: 301 Rim dusty'])
    expect(ClaudeText.soundsNote(2, 3)).toBe("Writes 2 pads in project 3 on the EP-133. Their pitch, level and other settings reset to the sound's. UNDO puts the old sounds back.")
    expect(ClaudeText.soundsNote(1, null)).toBe(
      "Writes 1 pad in the active project on the EP-133. Their pitch, level and other settings reset to the sound's. UNDO puts the old sounds back.",
    )
    expect(ClaudeText.SOUNDS_OFFLINE_NOTE).toBe('Saved as offline pad changes; they go to the EP-133 when you reconnect.')
    expect([ClaudeText.imported([[0, 4]], null, 2), ClaudeText.imported([[0, 4]], null, 1, 1), ClaudeText.imported([[0, 4]], null, 0, 3)]).toEqual([
      'Imported to A \u00B7 04 and 2 sounds. UNDO takes it back.',
      'Imported to A \u00B7 04 and 1 sound, 1 skipped. UNDO takes it back.',
      'Imported to A \u00B7 04, 3 sounds skipped. UNDO takes it back.',
    ])
    expect([ClaudeText.soundsFailed('busy', 0), ClaudeText.soundsFailed('busy', 2)]).toEqual([
      "The pad's sound couldn't be changed: busy. The patterns stay imported. UNDO takes it back.",
      "The pad's sound couldn't be changed: busy. The patterns stay imported and 2 pads changed. UNDO takes it back.",
    ])
    expect([ClaudeText.soundsRestored(2, 0), ClaudeText.soundsRestored(1, 1)]).toEqual(['Old sounds back on 2 pads.', 'Old sounds back on 1 pad, 1 had none before.'])
    expect([
      ClaudeText.imported([[0, 4]], null),
      ClaudeText.imported(
        [
          [0, 4],
          [1, 2],
        ],
        'S03',
      ),
      ClaudeText.imported(
        [
          [0, 4],
          [1, 2],
        ],
        null,
      ),
    ]).toEqual(['Imported to A \u00B7 04. UNDO takes it back.', 'Imported to scene S03. UNDO takes it back.', 'Imported to A \u00B7 04, B \u00B7 02. UNDO takes it back.'])
  })

  it('claude fx and pad shaping text', () => {
    expect([ClaudeText.FX, ClaudeText.APPLY_FX, ClaudeText.PAD_SHAPING]).toEqual(['FX', 'Apply FX', 'Pad shaping'])
    expect([ClaudeText.applyFxName(true), ClaudeText.applyFxName(false)]).toEqual(["Apply the card's FX to this project", "Leave this project's FX as they are"])
    const off = FxSettings.DEFAULT
    const on = FxSettings.of({
      type: FxType.DELAY,
      x: 0.7,
      y: 0.45,
      sends: [0.2, 0, 0.355, 0],
      comp: comp({ on: true, x: 0.4, y: 0.6 }),
      sidechain: sidechain({ on: true, group: 0, pad: 9, dests: 0b0110, x: 0.25, y: 0.7 }),
    })
    expect([ClaudeText.fxEffectText(off), ClaudeText.fxSendsText(off), ClaudeText.fxCompText(off), ClaudeText.fxSidechainText(off)]).toEqual([
      'OFF',
      'A 0 \u00B7 B 0 \u00B7 C 0 \u00B7 D 0',
      'OFF',
      'OFF',
    ])
    expect([ClaudeText.fxEffectText(on), ClaudeText.fxSendsText(on), ClaudeText.fxCompText(on), ClaudeText.fxSidechainText(on)]).toEqual([
      'DELAY \u00B7 LENGTH 1/4 \u00B7 43%',
      'A 20% \u00B7 B 0 \u00B7 C 36% \u00B7 D 0',
      'ON \u00B7 DRIVE 2.1x \u00B7 10/200',
      `A7 ducks B C \u00B7 ${MirrorText.sidechainLength(0.25)} \u00B7 ${MirrorText.sidechainShape(0.7)}`,
    ])
    expect(ClaudeText.fxEffectText(FxSettings.of({ type: FxType.DISTORTION, x: 0.55, y: 0.4 }))).toBe('DISTORTION \u00B7 DRIVE 13x \u00B7 LP 20')
    // Rows are the kinds the card has a line for, in the order effect, sends, comp, duck; an unchanged one says so.
    const all = cardFx({ type: FxType.DELAY, sends: new Map([[0, 0.2]]), comp: comp({ on: true }), sidechain: sidechain({ on: true }) })
    const rows = ClaudeText.fxRows(off, on, all)
    expect(rows.map((r) => r.label)).toEqual(['Effect', 'Sends', 'Comp', 'Duck'])
    expect(rows.map((r) => ClaudeText.isSame(r))).toEqual([false, false, false, false])
    expect(rows[0]).toEqual({ label: 'Effect', old: 'OFF', new: 'DELAY \u00B7 LENGTH 1/4 \u00B7 43%' })
    expect(ClaudeText.fxRows(off, on, cardFx({ type: FxType.DELAY, comp: comp({ on: false }) })).map((r) => r.label)).toEqual(['Effect', 'Comp'])
    expect(ClaudeText.fxRows(on, on, all).map((r) => ClaudeText.isSame(r))).toEqual([true, true, true, true])
    expect(ClaudeText.fxRows(off, on, cardFx())).toEqual([])
    expect(ClaudeText.fxSidechainText({ ...on, sidechain: sidechain({ on: true, dests: 0 }) })).toBe('OFF')
    expect(ClaudeText.ALREADY_SET).toBe('Already set')
    expect(ClaudeText.changeName({ label: 'Effect', old: 'OFF', new: 'REVERB' })).toBe('Effect: OFF becomes REVERB')
    expect(ClaudeText.changeName({ label: 'Comp', old: 'OFF', new: 'OFF' })).toBe('Comp: OFF, already set')

    const pad = physicalPad(0, 9)
    const d = PadSettings.DEFAULT
    expect(ClaudeText.padChange(pad, d, { ...d, start: 5, muteGroup: true, midiChannel: 2 })).toBeNull()
    expect(ClaudeText.padChange(pad, d, { ...d, pitch: -7, level: 90 })).toEqual({ label: 'A7', old: 'Pitch 0 \u00B7 Level 100', new: 'Pitch -7 \u00B7 Level 90' })
    expect(ClaudeText.padChange(physicalPad(0, 2), d, { ...d, pan: -4, attack: 3, release: 20, mode: 'key' })).toEqual({
      label: 'AE',
      old: 'Pan C \u00B7 Attack 0 \u00B7 Release 255 \u00B7 Mode Oneshot',
      new: 'Pan L4 \u00B7 Attack 3 \u00B7 Release 20 \u00B7 Mode Key',
    })
    expect(ClaudeText.padParts(d, { ...d, pitch: 2, release: 40, start: 9 })).toEqual([
      { name: 'Pitch', old: '0', new: MirrorText.pitchLabel(2) },
      { name: 'Release', old: '255', new: '40' },
    ])
    expect([ClaudeText.importUndone(2, 1, 0, false), ClaudeText.importUndone(0, 0, 3, false), ClaudeText.importUndone(1, 0, 2, true), ClaudeText.importUndone(0, 0, 0, true), ClaudeText.importUndone(0, 0, 0, false)]).toEqual([
      'Old sounds back on 2 pads, 1 had none before.',
      'Old settings back on 3 pads.',
      'Old sounds back on 1 pad, old settings back on 2 pads, old FX back.',
      'Old FX back.',
      'Import taken back.',
    ])
    expect(ClaudeText.importUndone(2, 1, 0, false)).toBe(ClaudeText.soundsRestored(2, 1))
    expect(ClaudeText.shapingFailed('busy', 2, true)).toBe(
      "The pad's settings couldn't be changed: busy. The patterns stay imported, the FX applied and 2 pads shaped. UNDO takes it back.",
    )
    expect([
      ClaudeText.imported([[0, 4]], null, 0, 0, true),
      ClaudeText.imported([[0, 4]], null, 0, 0, false, 1),
      ClaudeText.imported([[0, 4]], null, 2, 0, true, 3),
    ]).toEqual([
      'Imported to A \u00B7 04. FX applied. UNDO takes it back.',
      'Imported to A \u00B7 04. 1 pad setting applied. UNDO takes it back.',
      'Imported to A \u00B7 04 and 2 sounds. FX and 3 pad settings applied. UNDO takes it back.',
    ])
    expect([
      ClaudeText.imported([[0, 4]], null, 0, 0, true, 3, 1),
      ClaudeText.imported([[0, 4]], null, 0, 0, false, 0, 2),
    ]).toEqual([
      'Imported to A \u00B7 04. FX and 3 pad settings applied, 1 pad setting skipped. UNDO takes it back.',
      'Imported to A \u00B7 04. 2 pad settings skipped. UNDO takes it back.',
    ])
    expect([
      ClaudeText.padRowName(null, physicalPad(0, 11), true),
      ClaudeText.padRowName(null, physicalPad(0, 11), false),
      ClaudeText.padRowName({ label: 'A9', old: 'Pitch 0', new: 'Pitch 2' }, physicalPad(0, 11), false),
    ]).toEqual(['A9: no sound on this pad', 'A9: already set', 'A9: Pitch 0 becomes Pitch 2'])
  })
})
