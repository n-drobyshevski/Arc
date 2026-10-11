// A knob as the web draws it (the Knob composable's stand-in): a labelled
// slider with its readout under it, back to its [def] value on a double click.
// Web delta: Kotlin's knobs turn by a drag around them; a slider is what a
// browser, a keyboard and a screen reader all take (the tempo sheet's SWING,
// the FX sheet's knobs, EDIT's pages). [tone] is the knob's cap colour on the
// device (EDIT: PITCH and LEVEL white, a page's X orange and its Y black).
import type { JSX } from 'preact'
import './KnobSlider.css'

export interface KnobSliderProps {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  /** The value as read out ("+1.5", "0.25 s"). */
  readout: string
  /** Where a double click puts it. */
  def: number
  disabled?: boolean
  tone?: 'signal' | 'white' | 'orange' | 'black'
  /** Screen readers' description (MirrorText.knobDescription by default). */
  description?: string
  onChange(v: number): void
}

export function KnobSlider(props: KnobSliderProps): JSX.Element {
  const { label, value, min = 0, max = 1, step = 0.01, readout, def, disabled = false, tone = 'signal' } = props
  return (
    <label
      class={`knob-slider knob-slider--${tone}${disabled ? ' is-disabled' : ''}`}
      onDblClick={() => {
        if (!disabled) props.onChange(def)
      }}
    >
      <span class="t-bold knob-slider__label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={readout}
        aria-description={props.description ?? `${label}: ${readout}.`}
        onInput={(e) => props.onChange(Number((e.currentTarget as HTMLInputElement).value))}
      />
      <span class="knob-slider__value">{readout}</span>
    </label>
  )
}
