// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/PadEditPages.kt
//
// A pad's sound settings as the EP-133's SOUND EDIT shows them (an
// addition): PITCH and LEVEL always there (white, as the device's AMP and PTC
// are always at hand), then X (orange) and Y (black) for the page picked
// under them: SOUND (play mode, pan), TRIM (start, length, over the sound's
// waveform, the part kept lit), ENV (attack, release; release is greyed in
// ONESHOT, which plays to the end), MIDI (channel) and MUTE (the mute group).
// Each turn goes to [onChange] at once.
//
// Web deltas: the knobs are sliders (KnobSlider), back to their default on a
// double click, a fine step throughout (Kotlin's fine drag); they sit two by
// two, PITCH and LEVEL over the page's X and Y; TrimWave is an SVG.
import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import { PadSettings, PLAY_MODES, type PlayMode } from '../../core/features/padSettings'
import type { Peak } from '../../core/features/sampleTrim'
import { MirrorText } from '../../core/text/mirrorText'
import { WebText } from '../../core/text/webText'
import { KnobSlider } from '../components/KnobSlider'
import './PadEditPages.css'

/** The EP-133's SOUND EDIT pages arc edits (TIME and the root note are the sample's, for every pad on it). */
export const EDIT_PAGES = ['SOUND', 'TRIM', 'ENV', 'MIDI', 'MUTE'] as const
export type EditPage = (typeof EDIT_PAGES)[number]

export interface PadEditPagesProps {
  settings: PadSettings
  onChange(s: PadSettings): void
  /** The sound's length (TRIM rests without it), at [sampleRate]; [peaks] draw its waveform. */
  frames: number | null
  sampleRate: number
  peaks: readonly Peak[] | null
  /** False while the pad is read (or couldn't be): every knob rests. */
  enabled: boolean
  initialPage?: EditPage
}

export function PadEditPages(props: PadEditPagesProps): JSX.Element {
  const { settings: s, onChange, enabled } = props
  const [page, setPage] = useState<EditPage>(props.initialPage ?? 'SOUND')
  const oneshot = s.mode === 'oneshot'
  const knob = (
    label: string,
    value: number,
    min: number,
    max: number,
    readout: string,
    def: number,
    tone: 'white' | 'orange' | 'black',
    change: (v: number) => void,
    opts: { step?: number; disabled?: boolean } = {},
  ): JSX.Element => (
    <KnobSlider
      label={label}
      value={value}
      min={min}
      max={max}
      step={opts.step ?? 1}
      readout={readout}
      def={def}
      tone={tone}
      disabled={!enabled || (opts.disabled ?? false)}
      description={MirrorText.knobDescription(label, readout)}
      onChange={change}
    />
  )
  let x: JSX.Element | null = null
  let y: JSX.Element | null = null
  switch (page) {
    case 'SOUND':
      x = knob(MirrorText.MODE, PLAY_MODES.indexOf(s.mode), 0, PLAY_MODES.length - 1, MirrorText.modeLabel(s.mode), 0, 'orange', (v) =>
        onChange(PadSettings.withMode(s, PLAY_MODES[Math.min(Math.max(Math.round(v), 0), PLAY_MODES.length - 1)] as PlayMode)),
      )
      y = knob(MirrorText.PAN, s.pan, -PadSettings.PAN_MAX, PadSettings.PAN_MAX, MirrorText.panLabel(s.pan), 0, 'black', (v) => onChange({ ...s, pan: Math.round(v) }))
      break
    case 'TRIM': {
      const n = props.frames !== null && props.frames > 1 ? props.frames : null
      const start = Math.min(Math.max(s.start, 0), (n ?? 1) - 1)
      const length = n !== null ? PadSettings.length(s, n) : 0
      const fine = n !== null ? Math.max(1, Math.floor(n / 4000)) : 1
      x = knob(
        MirrorText.START,
        start,
        0,
        (n ?? 2) - 1,
        n !== null ? MirrorText.secondsLabel(start, props.sampleRate) : MirrorText.NO_VALUE,
        0,
        'orange',
        (v) => {
          const newStart = Math.round(v)
          // The length stays, as far as the sound allows.
          const end = s.end === null ? null : Math.min(newStart + (s.end - s.start), n ?? s.end)
          onChange(PadSettings.clamped({ ...s, start: newStart, end }, n))
        },
        { step: fine, disabled: n === null },
      )
      y = knob(
        MirrorText.LENGTH,
        Math.max(1, length),
        1,
        Math.max(1, (n ?? 2) - start),
        n !== null ? MirrorText.secondsLabel(length, props.sampleRate) : MirrorText.NO_VALUE,
        Math.max(1, (n ?? 2) - start),
        'black',
        (v) => {
          const end = start + Math.round(v)
          onChange(PadSettings.clamped({ ...s, end: n !== null && end >= n ? null : end }, n))
        },
        { step: fine, disabled: n === null },
      )
      break
    }
    case 'ENV':
      x = knob(MirrorText.ATTACK, s.attack, 0, PadSettings.ENV_MAX, MirrorText.envLabel(s.attack), 0, 'orange', (v) => onChange({ ...s, attack: Math.round(v) }))
      y = knob(MirrorText.RELEASE, s.release, 0, PadSettings.ENV_MAX, MirrorText.envLabel(s.release), PadSettings.KEY_RELEASE, 'black', (v) => onChange({ ...s, release: Math.round(v) }), {
        disabled: oneshot,
      })
      break
    case 'MIDI':
      x = knob(MirrorText.CHANNEL, s.midiChannel, 0, PadSettings.CHANNELS - 1, MirrorText.channelLabel(s.midiChannel), 0, 'orange', (v) =>
        onChange({ ...s, midiChannel: Math.round(v) }),
      )
      break
    case 'MUTE':
      x = knob(MirrorText.MUTE_GROUP, s.muteGroup ? 1 : 0, 0, 1, MirrorText.onOff(s.muteGroup), 0, 'orange', (v) => onChange({ ...s, muteGroup: v >= 0.5 }))
      break
  }
  const note = page === 'ENV' && oneshot ? MirrorText.ONESHOT_RELEASE : page === 'MUTE' ? MirrorText.MUTE_NOTE : null
  const n = props.frames
  return (
    <div class="pad-pages">
      <div class="pad-pages__knobs">
        {knob(MirrorText.PITCH, s.pitch, -PadSettings.PITCH_MAX, PadSettings.PITCH_MAX, MirrorText.pitchLabel(s.pitch), 0, 'white', (v) => onChange({ ...s, pitch: v }), {
          step: 0.1,
        })}
        {knob(MirrorText.LEVEL, s.level, 0, PadSettings.LEVEL_MAX, MirrorText.levelLabel(s.level), PadSettings.DEFAULT.level, 'white', (v) => onChange({ ...s, level: Math.round(v) }))}
        {x ?? <span class="pad-pages__empty" />}
        {y ?? <span class="pad-pages__empty" />}
      </div>
      {page === 'TRIM' && props.peaks !== null && n !== null && n > 1 && <TrimWave peaks={props.peaks} frames={n} start={s.start} end={s.end ?? n} />}
      <div class="pad-pages__keys" role="radiogroup" aria-label={WebText.EDIT_PAGES}>
        {EDIT_PAGES.map((p, i) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={p === page}
            class={`pad-pages__key cap-3d${p === page ? ' is-on is-down' : ''}`}
            onClick={() => setPage(p)}
          >
            {MirrorText.pageName(i).toUpperCase()}
          </button>
        ))}
      </div>
      {note !== null && <p class="t-small pad-pages__note">{note}</p>}
    </div>
  )
}

/**
 * A sound's waveform with the part kept lit: [peaks] across a sound [frames]
 * long, the columns from [start] to [end] (exclusive) in signal orange and
 * the rest dimmed, on the display's dark glass.
 */
export function TrimWave(props: { peaks: readonly Peak[]; frames: number; start: number; end: number }): JSX.Element {
  const { peaks, frames, start, end } = props
  const w = peaks.length
  return (
    <svg
      class="trim-wave"
      viewBox={`0 0 ${Math.max(1, w)} 44`}
      preserveAspectRatio="none"
      role="img"
      aria-label={MirrorText.trimDescription(start, Math.max(0, end - start))}
    >
      {peaks.map((p, i) => {
        const frame = Math.floor(((i + 0.5) * frames) / w)
        const inside = frame >= start && frame < end
        const top = 22 - p.max * 18
        const bottom = 22 - p.min * 18
        return <rect key={i} class={inside ? 'is-in' : undefined} x={i + 0.15} y={top} width={0.7} height={Math.max(1, bottom - top)} />
      })}
    </svg>
  )
}
