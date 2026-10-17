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
// two, PITCH and LEVEL over the page's X and Y; TrimWave is an SVG. A page's
// X and Y are [pageKnobs] (PITCH and LEVEL [levelPitchKnobs]), and the page
// shown is [padPageShown], so the drawn EP-133's knobs X and Y follow them
// while the sheet is open. The page picked is [padPage], one for the sheet
// and the drawn device's EDIT page (its − / + step it, [setPadPage]), so the
// sheet opens on the page the device shows, and the device on the sheet's.
import type { JSX } from 'preact'
import { useEffect } from 'preact/hooks'
import { signal, type ReadonlySignal } from '@preact/signals'
import { PadSettings, PLAY_MODES, type PlayMode } from '../../core/features/padSettings'
import type { Peak } from '../../core/features/sampleTrim'
import { MirrorText } from '../../core/text/mirrorText'
import { WebText } from '../../core/text/webText'
import { KnobSlider } from '../components/KnobSlider'
import './PadEditPages.css'

/** The EP-133's SOUND EDIT pages arc edits (TIME and the root note are the sample's, for every pad on it). */
export const EDIT_PAGES = ['SOUND', 'TRIM', 'ENV', 'MIDI', 'MUTE'] as const
export type EditPage = (typeof EDIT_PAGES)[number]

/** A page's knob X or Y: its name, value, range and readout, and the settings a turn to [v] gives. */
export interface PageKnob {
  readonly label: string
  readonly value: number
  readonly min: number
  readonly max: number
  readonly step: number
  readonly readout: string
  readonly def: number
  readonly disabled: boolean
  apply(v: number): PadSettings
}

/** The page shown on the open pad sheet; null with none open. */
const pageShown = signal<EditPage | null>(null)
export const padPageShown: ReadonlySignal<EditPage | null> = pageShown

/** EDIT's page picked: the sheet's and the drawn device's EDIT page (SOUND until another is picked). */
const pagePicked = signal<EditPage>('SOUND')
export const padPage: ReadonlySignal<EditPage> = pagePicked

export function setPadPage(page: EditPage): void {
  pagePicked.value = page
}

/** PITCH and LEVEL, always at hand (the device's PTC and AMP; the drawn device's SOUND page turns them with Y and X). */
export function levelPitchKnobs(s: PadSettings): { level: PageKnob; pitch: PageKnob } {
  return {
    level: {
      label: MirrorText.LEVEL,
      value: s.level,
      min: 0,
      max: PadSettings.LEVEL_MAX,
      step: 1,
      readout: MirrorText.levelLabel(s.level),
      def: PadSettings.DEFAULT.level,
      disabled: false,
      apply: (v) => ({ ...s, level: Math.round(v) }),
    },
    pitch: {
      label: MirrorText.PITCH,
      value: s.pitch,
      min: -PadSettings.PITCH_MAX,
      max: PadSettings.PITCH_MAX,
      step: 0.1,
      readout: MirrorText.pitchLabel(s.pitch),
      def: 0,
      disabled: false,
      apply: (v) => ({ ...s, pitch: v }),
    },
  }
}

/**
 * Page [page]'s knobs X (orange) and Y (black) for [s], a sound of [frames]
 * at [sampleRate] (TRIM rests without it); null where the page has none.
 */
export function pageKnobs(page: EditPage, s: PadSettings, frames: number | null, sampleRate: number): { x: PageKnob | null; y: PageKnob | null } {
  const knob = (
    label: string,
    value: number,
    min: number,
    max: number,
    readout: string,
    def: number,
    apply: (v: number) => PadSettings,
    opts: { step?: number; disabled?: boolean } = {},
  ): PageKnob => ({ label, value, min, max, step: opts.step ?? 1, readout, def, disabled: opts.disabled ?? false, apply })
  switch (page) {
    case 'SOUND':
      return {
        x: knob(MirrorText.MODE, PLAY_MODES.indexOf(s.mode), 0, PLAY_MODES.length - 1, MirrorText.modeLabel(s.mode), 0, (v) =>
          PadSettings.withMode(s, PLAY_MODES[Math.min(Math.max(Math.round(v), 0), PLAY_MODES.length - 1)] as PlayMode),
        ),
        y: knob(MirrorText.PAN, s.pan, -PadSettings.PAN_MAX, PadSettings.PAN_MAX, MirrorText.panLabel(s.pan), 0, (v) => ({ ...s, pan: Math.round(v) })),
      }
    case 'TRIM': {
      const n = frames !== null && frames > 1 ? frames : null
      const start = Math.min(Math.max(s.start, 0), (n ?? 1) - 1)
      const length = n !== null ? PadSettings.length(s, n) : 0
      const fine = n !== null ? Math.max(1, Math.floor(n / 4000)) : 1
      return {
        x: knob(
          MirrorText.START,
          start,
          0,
          (n ?? 2) - 1,
          n !== null ? MirrorText.secondsLabel(start, sampleRate) : MirrorText.NO_VALUE,
          0,
          (v) => {
            const newStart = Math.round(v)
            // The length stays, as far as the sound allows.
            const end = s.end === null ? null : Math.min(newStart + (s.end - s.start), n ?? s.end)
            return PadSettings.clamped({ ...s, start: newStart, end }, n)
          },
          { step: fine, disabled: n === null },
        ),
        y: knob(
          MirrorText.LENGTH,
          Math.max(1, length),
          1,
          Math.max(1, (n ?? 2) - start),
          n !== null ? MirrorText.secondsLabel(length, sampleRate) : MirrorText.NO_VALUE,
          Math.max(1, (n ?? 2) - start),
          (v) => {
            const end = start + Math.round(v)
            return PadSettings.clamped({ ...s, end: n !== null && end >= n ? null : end }, n)
          },
          { step: fine, disabled: n === null },
        ),
      }
    }
    case 'ENV':
      return {
        x: knob(MirrorText.ATTACK, s.attack, 0, PadSettings.ENV_MAX, MirrorText.envLabel(s.attack), 0, (v) => ({ ...s, attack: Math.round(v) })),
        y: knob(MirrorText.RELEASE, s.release, 0, PadSettings.ENV_MAX, MirrorText.envLabel(s.release), PadSettings.KEY_RELEASE, (v) => ({ ...s, release: Math.round(v) }), {
          disabled: s.mode === 'oneshot',
        }),
      }
    case 'MIDI':
      return {
        x: knob(MirrorText.CHANNEL, s.midiChannel, 0, PadSettings.CHANNELS - 1, MirrorText.channelLabel(s.midiChannel), 0, (v) => ({ ...s, midiChannel: Math.round(v) })),
        y: null,
      }
    case 'MUTE':
      return { x: knob(MirrorText.MUTE_GROUP, s.muteGroup ? 1 : 0, 0, 1, MirrorText.onOff(s.muteGroup), 0, (v) => ({ ...s, muteGroup: v >= 0.5 })), y: null }
  }
}

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
  const page = padPage.value
  useEffect(() => {
    if (props.initialPage !== undefined) setPadPage(props.initialPage)
  }, [])
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
  // The page shown, for the drawn EP-133's knobs X and Y.
  useEffect(() => {
    pageShown.value = page
  }, [page])
  useEffect(
    () => () => {
      pageShown.value = null
    },
    [],
  )
  const tone = (k: PageKnob, t: 'white' | 'orange' | 'black'): JSX.Element =>
    knob(k.label, k.value, k.min, k.max, k.readout, k.def, t, (v) => onChange(k.apply(v)), { step: k.step, disabled: k.disabled })
  const lp = levelPitchKnobs(s)
  const pk = pageKnobs(page, s, props.frames, props.sampleRate)
  const x = pk.x !== null ? tone(pk.x, 'orange') : null
  const y = pk.y !== null ? tone(pk.y, 'black') : null
  const note = page === 'ENV' && oneshot ? MirrorText.ONESHOT_RELEASE : page === 'MUTE' ? MirrorText.MUTE_NOTE : null
  const n = props.frames
  return (
    <div class="pad-pages">
      <div class="pad-pages__knobs">
        {tone(lp.pitch, 'white')}
        {tone(lp.level, 'white')}
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
            onClick={() => setPadPage(p)}
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
