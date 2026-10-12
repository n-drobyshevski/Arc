// Port of app/src/main/kotlin/dev/arc/ep133/controller/ArcController.kt (voiceShape)
//
// How a pad with its sound settings plays on the phone (an addition): the
// EP-133's pitch, level, pan, trim, envelope and play mode, made a voice shape.
//
// Web delta: [sameShape] is Kotlin's data-class equality, for the pattern
// plan's change check.

import { ENV_MS_PER_TICK, LEVEL_MAX, type PadSettings } from '../core/features/padSettings'
import { VoiceMixer, VoiceMode, VoiceShape } from '../core/formats/voiceMixer'

const INT_MAX = 2147483647

/**
 * How a pad with [s] plays on the phone: the EP-133's pitch, level, pan, trim,
 * envelope (ticks, ENV_MS_PER_TICK each, a guess) and play mode, its mute
 * group being its pad group's ([group] 0..3). For KEYS ([keys]), where each
 * note is a voice of its own, LEGATO is a held note and the mute group is left
 * out (the notes would cut each other). It goes through its group's FX bus
 * (its send, the sidechain's duck), and [duckSource] when the pad is the
 * sidechain's source.
 */
export function voiceShape(s: PadSettings, group: number, keys = false, duckSource = false): VoiceShape {
  return VoiceShape.of({
    semitones: s.pitch,
    gain: s.level / LEVEL_MAX,
    pan: s.pan,
    start: Math.min(Math.max(s.start, 0), INT_MAX),
    end: s.end === null ? INT_MAX : Math.min(Math.max(s.end, 0), INT_MAX),
    attackMs: s.attack * ENV_MS_PER_TICK,
    releaseMs: Math.max(VoiceMixer.FADE_MS, s.release * ENV_MS_PER_TICK),
    mode: s.mode === 'oneshot' ? VoiceMode.ONESHOT : s.mode === 'key' ? VoiceMode.KEY : keys ? VoiceMode.GATE : VoiceMode.LEGATO,
    // KEYS' notes are one pad's: its mute group would cut its own chord.
    muteGroup: s.muteGroup && !keys ? group + 1 : 0,
    bus: group,
    duckSource,
  })
}

/** Kotlin's VoiceShape equality, over the fields either gives (a missing one is the default's). */
export function sameShape(a: Partial<VoiceShape> | undefined, b: Partial<VoiceShape> | undefined): boolean {
  if (a === b) return true
  const x = VoiceShape.of(a ?? {})
  const y = VoiceShape.of(b ?? {})
  return (Object.keys(x) as (keyof VoiceShape)[]).every((k) => x[k] === y[k])
}
