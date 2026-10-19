// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Components.kt (PlayKey)
//
// A round 40px play key for a list row. Quiet until it plays: a 1.5px navy-60%
// outline around a navy triangle; filled orange with a white square while
// playing. Faded to .4 when disabled (a playing key stays live so it can stop).
import type { JSX, Ref } from 'preact'
import './PlayKey.css'

export interface PlayKeyProps {
  playing: boolean
  /** Kotlin `enabled = false` (the device is busy with something else). */
  disabled?: boolean
  /** aria-label (Kotlin contentDescription), e.g. FeatureText.play(name). */
  description: string
  onClick: () => void
  class?: string
  id?: string
  ref?: Ref<HTMLButtonElement>
}

export function PlayKey(props: PlayKeyProps): JSX.Element {
  const { playing, disabled = false, description, onClick } = props
  const live = !disabled || playing
  return (
    <button
      ref={props.ref}
      id={props.id}
      type="button"
      class={`play-key cap-3d cap-3d--round${playing ? ' is-playing' : ''}${props.class ? ` ${props.class}` : ''}`}
      disabled={!live}
      aria-label={description}
      onClick={onClick}
    >
      <svg class="play-key__glyph" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
        {playing
          ? <rect width="14" height="14" fill="currentColor" />
          // A triangle nudged right so it looks centred: (.12w,0) (w,h/2) (.12w,h).
          : <path d="M1.68 0L14 7L1.68 14Z" fill="currentColor" />}
      </svg>
    </button>
  )
}
