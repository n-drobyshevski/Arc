// Port of core/src/test/kotlin/dev/arc/ep133/features/SynthVoiceTest.kt
// The synth renderer: the same line always makes the same bytes, as the golden file
// (skill/arc-beats/scripts/test_synth_golden.txt) pins them for Arc and the skill's script too.
// Web delta: the file is only read (Kotlin's SynthVoiceTest writes it); render, pcmBytes and wav are SynthRender's.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BeatCards, SYNTH_TYPES, type CardSynth } from '../../../src/core/features/beatCard'
import { SynthRender } from '../../../src/core/features/synthRender'
import { SynthVoice } from '../../../src/core/features/synthVoice'
import { crc32 } from '../../../src/core/formats/crc32'
import { decodeWav } from '../../../src/core/formats/wav'
import { MAX_SOUND_NAME, cleanSoundName } from '../../../src/core/protocol/device'

/** The golden cases, in the file's order: the types alone, the skill's recipes, then the extremes. */
const bodies: readonly string[] = [
  ...SYNTH_TYPES,
  'kick note F1 decay 70 bend 40 click 10 drive 20 name 808_kick',
  'kick note A1 decay 25 bend 60 click 50 drive 30 name punch_kick',
  'kick note G1 decay 45 tone 25 bend 45 click 25 name house_kick',
  'snare note G3 decay 30 tone 70 click 20 noise 70 name snare',
  'snare note A3 decay 20 tone 85 bend 30 noise 85 snap 30 name trap_snare',
  'clap decay 35 tone 55 reso 20 name clap',
  'hat decay 10 tone 75 name closed_hat',
  'openhat decay 45 tone 70 name open_hat',
  'hat wave none decay 12 tone 60 noise 100 name shaker',
  'rim name rim',
  'tom note D2 decay 45 bend 35 name low_tom',
  'cowbell name cowbell',
  'sub note C2 decay 35 drive 25 name sub',
  'bass note C2 decay 90 length 2 tone 30 detune 55 name reese',
  'bass note C2 wave square decay 25 tone 25 reso 75 sweep 70 drive 40 name acid',
  'pluck note C4 decay 30 tone 40 sweep 60 name pluck',
  'stab note C4 chord min7 decay 20 tone 50 sweep 50 name house_stab',
  'stab note C4 chord min decay 35 tone 35 detune 30 name dub_chord',
  'pad note C3 chord min7 attack 60 decay 60 length 3 tone 40 name dark_pad',
  'lead note C4 tone 70 detune 20 name lead',
  'bell note C5 decay 30 tone 40 name bell',
  'zap note C3 decay 25 bend 100 name dub_zap',
  'riser length 2 tone 80 reso 40 name riser',
  'pad note C7 chord maj7 bend 100 detune 100 length 4',
  'hat chord min7 detune 100 length 4',
  'bell note C0 wave saw tone 100',
  'kick seed 1',
  'clap snap 50',
  'lead wave none',
  'snare attack 100 decay 100 snap 100',
  'zap note C7 tone 100 reso 100 sweep 100 bend 100 drive 100',
]

/** A body read as the golden file says: on A1 of a card that must read clean. */
function synth(body: string): CardSynth {
  const r = BeatCards.read(`ARC BEAT 1\n[A]\nsynth A1 ${body}\n`)
  expect(r.problems, body).toEqual([])
  return r.card!.sections[0]!.synths!.get(3)!
}

let rendered: Map<string, Int16Array> | null = null
const renders = (): Map<string, Int16Array> => (rendered ??= new Map(bodies.map((b) => [b, SynthRender.render(synth(b))])))

const crcOf = (pcm: Int16Array): string => crc32(SynthRender.pcmBytes(pcm)).toString(16).padStart(8, '0')

const peakOf = (pcm: Int16Array): number => pcm.reduce((m, v) => Math.max(m, Math.abs(v)), 0)

const same = (a: Int16Array, b: Int16Array): boolean => a.length === b.length && a.every((v, i) => v === b[i])

describe('SynthVoice', () => {
  it('notes are in tune from the semitone table', () => {
    expect(SynthVoice.noteHz(69)).toBe(440.0)
    expect(SynthVoice.noteHz(60)).toBe(261.6255653005986)
    const semi = [
      1.0, 1.0594630943592953, 1.122462048309373, 1.189207115002721, 1.2599210498948732, 1.3348398541700344,
      1.4142135623730951, 1.4983070768766815, 1.5874010519681994, 1.681792830507429, 1.7817974362806785, 1.8877486253633868,
    ]
    expect(Array.from({ length: 12 }, (_, i) => SynthVoice.noteHz(69 + i))).toEqual(semi.map((s) => 440.0 * s))
    expect(Array.from({ length: 12 }, (_, i) => SynthVoice.noteHz(57 + i))).toEqual(semi.map((s) => 440.0 * s * 0.5))
  })

  it('the same line makes the same sound, another seed another', () => {
    const kick = synth('kick')
    expect(same(SynthRender.render(kick), SynthRender.render(kick))).toBe(true)
    expect(same(SynthRender.render(kick), SynthRender.render(synth('kick seed 1')))).toBe(false)
  })

  it('frames follow the decay within 0.05 to 4 s, or the length given', () => {
    for (const body of ['kick', 'rim decay 0', 'bass attack 100 decay 100', 'riser length 0.05']) {
      expect(SynthVoice.frames(synth(body)), body).toBe(SynthRender.render(synth(body)).length)
    }
    expect(SynthVoice.frames(synth('rim decay 0'))).toBe(SynthVoice.MIN_AUTO_FRAMES)
    expect(SynthVoice.frames(synth('bass attack 100 decay 100'))).toBe(SynthVoice.MAX_FRAMES)
    expect(SynthVoice.frames(synth('kick length 0.05'))).toBe(2343)
    expect(SynthVoice.frames(synth('kick length 4'))).toBe(187_500)
  })

  it('every golden case starts and ends at 0 and peaks at -1 dBFS times its level', () => {
    for (const [body, pcm] of renders()) {
      const s = synth(body)
      expect(pcm[0], body).toBe(0)
      expect(pcm[pcm.length - 1], body).toBe(0)
      const peak = peakOf(pcm)
      if (SynthVoice.silent(s)) {
        expect(peak, body).toBe(0)
        continue
      }
      const level = SynthVoice.resolve(s).level
      expect(peak, body).toBe(Math.floor(0.8912509381337456 * (level / 100.0) * 32767.0 + 0.5))
      if (level === 100) expect(peak, body).toBe(29204)
    }
    expect(peakOf(renders().get('hat')!)).toBe(17522)
    expect(peakOf(renders().get('clap')!)).toBe(23363)
    expect(SynthVoice.silent(synth('lead wave none'))).toBe(true)
  })

  it('the canonical text holds every setting but the name', () => {
    expect(SynthVoice.canonical(synth('kick'))).toBe(
      'arc synth 1 kick note 31 wave sine chord one attack 0 decay 40 length auto tone 30 reso 0 sweep 0 bend 50 click 30 noise 0 snap off drive 10 detune 0 level 100 seed 0',
    )
    expect(SynthVoice.canonical(synth('snare'))).toBe(
      'arc synth 1 snare note 54 wave sine chord one attack 0 decay 30 length auto tone 70 reso 0 sweep 0 bend 20 click 20 noise 70 snap 40 drive 0 detune 0 level 100 seed 0',
    )
    expect(SynthVoice.canonical(synth('pad'))).toContain(' length 300 ')
    expect(SynthVoice.tag(synth('kick decay 40'))).toBe(SynthVoice.tag(synth('kick')))
    expect(SynthVoice.tag(synth('kick decay 41'))).not.toBe(SynthVoice.tag(synth('kick')))
    const named = synth('kick name big_kick')
    expect(SynthVoice.tag(named)).toBe(SynthVoice.tag(synth('kick')))
    expect(SynthVoice.deviceName(synth('kick'))).toBe('kick 08bcfa')
    expect(SynthVoice.deviceName(named)).toBe('big kick 08bcfa')
    expect(SynthVoice.deviceName(synth('kick note F1 decay 70 bend 40 click 10 drive 20 name 808_kick'))).toBe('808 kick 29f789')
  })

  it('device names fit the EP-133 as they are', () => {
    for (const body of [...bodies, 'kick name abcdefghijklm']) {
      const name = SynthVoice.deviceName(synth(body))
      expect(name.length, name).toBeLessThanOrEqual(MAX_SOUND_NAME)
      expect(cleanSoundName(name), body).toBe(name)
    }
  })

  it('the offline file is named by the sound and the pad', () => {
    const kick = synth('kick')
    const name = SynthVoice.fileName(kick, 3, 0, 9)
    expect(name).toBe(`syn-${SynthVoice.crc(kick).toString(16).padStart(8, '0')}-3-0-9.wav`)
    expect(name).toMatch(/^syn-[0-9a-f]{8}-3-0-9\.wav$/)
    expect(name.startsWith('syn-08bcfa')).toBe(true)
  })

  it('the wav decodes to the same samples at 46875 Hz, mono', () => {
    const s = synth('hat')
    const wav = SynthRender.wav(s)
    const pcm = SynthRender.render(s)
    expect(wav.length).toBe(44 + 2 * pcm.length)
    const d = decodeWav(wav)
    expect(d.sampleRate).toBe(46875)
    expect(d.channels).toBe(1)
    expect(Array.from(d.pcm)).toEqual(Array.from(SynthRender.pcmBytes(pcm)))
  })

  it("the golden file pins every case's frames, samples and device name", () => {
    const lines = bodies.map((body) => {
      const pcm = renders().get(body)!
      return `${body} | ${pcm.length} | ${crcOf(pcm)} | ${SynthVoice.deviceName(synth(body))}`
    })
    const file = readFileSync(new URL('../../../../skill/arc-beats/scripts/test_synth_golden.txt', import.meta.url), 'utf8')
    expect(lines).toEqual(file.split(/\r?\n/).filter((l) => l.trim() !== '' && !l.startsWith('#')))
  })
})
