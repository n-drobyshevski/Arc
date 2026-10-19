// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Rows.kt (MiniPiano: the KEYS tools' key picker)
//
// The key picker of the KEYS tools: one octave of piano keys (DO to TI, or C
// to B), in place of the two rows of six note names. The key chosen is navy
// and stays down. Keys are caps (theme/cap.css) in the piano colours.
//
// Web: a radio group in chromatic order (one tab stop; the arrow keys step a
// semitone), each key named by its note; the blacks lie over the whites.
import type { JSX } from 'preact'
import { useRef } from 'preact/hooks'
import { Keys, type NoteNames } from '../../core/features/keys'
import { BLACK_WIDTH, isBlack } from '../../core/features/piano'
import { handleRovingKey } from './Segmented'
import './MiniPiano.css'

/** One key of the octave: its pitch class and where it lies, as fractions of the width. */
export interface OctaveKey {
  pc: number
  black: boolean
  left: number
  width: number
}

/** The 12 keys of one octave, in chromatic order: 7 whites across, the blacks centred on their gaps. */
export function octaveKeys(): OctaveKey[] {
  const keys: OctaveKey[] = []
  let whites = 0
  for (let pc = 0; pc < 12; pc++) {
    if (isBlack(pc)) {
      keys.push({ pc, black: true, left: (whites - BLACK_WIDTH / 2) / 7, width: BLACK_WIDTH / 7 })
    } else {
      keys.push({ pc, black: false, left: whites / 7, width: 1 / 7 })
      whites++
    }
  }
  return keys
}

const OCTAVE = octaveKeys()

export interface MiniPianoProps {
  /** The pitch class chosen, 0 (DO / C) to 11. */
  selected: number
  onSelect: (pc: number) => void
  names: NoteNames
  /** id of the visible label ("Key"). */
  labelledBy?: string
  label?: string
  /** id of the hint beside the label. */
  describedBy?: string
}

export function MiniPiano(props: MiniPianoProps): JSX.Element {
  const { selected, onSelect, names } = props
  const row = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={row}
      class="mini-piano"
      role="radiogroup"
      aria-label={props.label}
      aria-labelledby={props.labelledBy}
      aria-describedby={props.describedBy}
      onKeyDown={(e) => handleRovingKey(e, selected, 12, row.current, onSelect)}
    >
      {OCTAVE.map((k) => {
        const on = k.pc === selected
        const name = Keys.name(k.pc, names)
        return (
          <button
            key={k.pc}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={name}
            tabIndex={on ? 0 : -1}
            data-roving=""
            class={`mini-piano__key mini-piano__key--${k.black ? 'black' : 'white'} cap-3d${on ? ' is-on is-down' : ''}`}
            // The whites 4 narrower than their slot (2 apart each side), as the piano draws them.
            style={
              k.black
                ? { left: `${k.left * 100}%`, width: `${k.width * 100}%` }
                : { left: `calc(${k.left * 100}% + 2px)`, width: `calc(${k.width * 100}% - 4px)` }
            }
            onClick={() => onSelect(k.pc)}
          >
            <span class="mini-piano__name" aria-hidden="true">{name}</span>
          </button>
        )
      })}
    </div>
  )
}
