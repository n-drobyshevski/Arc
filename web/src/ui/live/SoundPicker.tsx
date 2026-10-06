// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/PadSheet.kt (EDIT's sound list, RangeKey)
//
// The device's sounds for Live's EDIT, after the EP Sample Tool's library:
// a find field, a key per hundred-slot range (with the factory layout's kind
// of sound) that jumps to it, and the ranges as blocks under an orange bar,
// one dense row per sound: an LED lit while it plays, the slot, the name in
// capitals, the size (or ON PAD for the sound on the pad now) and a round
// play key. The pad sheet picks a row with a tap; on the desk's Sounds tab
// the rows are dragged onto the pads instead.
//
// Web deltas: the rows drag with HTML5 drag and drop (the slot travels as
// SLOT_MIME and as text), and [onDrag] tells Live which sound is in the air,
// so the pad under it can show "old → new". RangeKey (Kotlin's, in PadSheet.kt)
// is exported for the Device tab's range keys.
import type { JSX } from 'preact'
import { useId, useMemo, useRef, useState } from 'preact/hooks'
import { findSounds, hundreds } from '../../core/features/deviceBrowser'
import type { SoundEntry } from '../../core/protocol/device'
import { FeatureText } from '../../core/text/featureText'
import { Format } from '../../core/text/format'
import { MirrorText } from '../../core/text/mirrorText'
import { Search } from '../components/Icons'
import { PlayKey } from '../components/PlayKey'
import './SoundPicker.css'

/** The drag data type of a device sound's slot (dragged from the Sounds tab onto a pad). */
export const SLOT_MIME = 'application/x-arc-slot'

/** The player key of a device sound (controller.playDeviceSound). */
export const deviceKey = (slot: number): string => `device:${slot}`

export interface SoundPickerProps {
  sounds: readonly SoundEntry[]
  /** The slot on the pad now: its row tinted and marked ON PAD. */
  current?: number | null
  /** The key of the sound playing (controller.playing). */
  playing: string | null
  onPlay: (slot: number) => void
  onStop: () => void
  /** A tap on a row (the pad sheet). */
  onPick?: (snd: SoundEntry) => void
  /** The device is busy with something else: rows can't be picked (Kotlin enabled = false). */
  disabled?: boolean
  /** The rows drag (the desk's Sounds tab): the sound picked up, null when it's let go. */
  onDrag?: (snd: SoundEntry | null) => void
  /** The find field's words (its placeholder and name). */
  findLabel: string
  /** The list scrolls by itself (the desk's column); else the page around it scrolls. */
  scroll?: boolean
  class?: string
}

export function SoundPicker(props: SoundPickerProps): JSX.Element {
  const { sounds, current = null, playing, onPick, onDrag, scroll = false } = props
  const id = useId()
  const [query, setQuery] = useState('')
  const blocks = useMemo(() => hundreds(findSounds([...sounds], query)), [sounds, query])
  const [at, setAt] = useState<number | null>(null)
  const list = useRef<HTMLDivElement | null>(null)
  const jump = (from: number): void => {
    setAt(from)
    const el = list.current?.querySelector<HTMLElement>(`[data-block="${from}"]`)
    const smooth = typeof window !== 'undefined' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' })
  }
  const shownAt = at !== null && blocks.some((b) => b.from === at) ? at : (blocks[0]?.from ?? null)
  return (
    <div class={`snd${scroll ? ' snd--scroll' : ''}${props.class ? ` ${props.class}` : ''}`}>
      <label class="snd__find">
        <Search size={20} />
        <input
          type="search"
          class="snd__input"
          value={query}
          placeholder={props.findLabel}
          aria-label={props.findLabel}
          enterKeyHint="search"
          autoComplete="off"
          onInput={(e) => {
            setQuery(e.currentTarget.value)
            setAt(null)
          }}
        />
      </label>
      {blocks.length > 1 && (
        <div class="snd__ranges" role="group" aria-label={FeatureText.SOUNDS}>
          {blocks.map((b) => (
            <RangeKey key={b.from} range={b} on={b.from === shownAt} controls={`${id}-b${b.from}`} onClick={() => jump(b.from)} />
          ))}
        </div>
      )}
      <div ref={list} class="snd__list">
        {blocks.length === 0 && (
          <p class="t-small snd__none">{sounds.length === 0 ? FeatureText.NO_SOUNDS : FeatureText.NO_FIND_MATCHES}</p>
        )}
        {blocks.map((b) => {
          const kind = FeatureText.factoryCategory(b.from)
          return (
            <section key={b.from} class="snd__block" data-block={b.from} id={`${id}-b${b.from}`} aria-labelledby={`${id}-h${b.from}`}>
              <h3 class="snd__bar" id={`${id}-h${b.from}`}>
                <span>{FeatureText.range(b)}</span>
                {kind !== null && <span class="snd__bar-kind">{kind}</span>}
                <span class="snd__bar-count">{b.sounds.length}</span>
              </h3>
              <ul class="snd__rows">
                {b.sounds.map((snd) => {
                  const on = playing === deviceKey(snd.slot)
                  const here = snd.slot === current
                  return (
                    <li
                      key={snd.slot}
                      class={`snd__row${here ? ' is-current' : ''}${on ? ' is-playing' : ''}${onDrag ? ' snd__row--drag' : ''}`}
                      draggable={onDrag ? true : undefined}
                      onDragStart={
                        onDrag
                          ? (e) => {
                              e.dataTransfer?.setData(SLOT_MIME, String(snd.slot))
                              e.dataTransfer?.setData('text/plain', `${FeatureText.slot(snd.slot)} ${snd.name}`)
                              if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'
                              onDrag(snd)
                            }
                          : undefined
                      }
                      onDragEnd={onDrag ? () => onDrag(null) : undefined}
                    >
                      {onPick ? (
                        <button
                          type="button"
                          class="snd__pick"
                          aria-current={here || undefined}
                          disabled={props.disabled}
                          onClick={() => onPick(snd)}
                        >
                          <RowWords snd={snd} here={here} />
                        </button>
                      ) : (
                        <span class="snd__pick">
                          <RowWords snd={snd} here={here} />
                        </span>
                      )}
                      <PlayKey
                        class="snd__play"
                        playing={on}
                        description={on ? FeatureText.stop(snd.name) : FeatureText.play(snd.name)}
                        onClick={() => (on ? props.onStop() : props.onPlay(snd.slot))}
                      />
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}

/**
 * A hundred of slots as a key: "100–199" over its kind of sound in the factory
 * layout ("SNARES"); the one in view held down, dark. The Device tab jumps
 * with it too (Kotlin RangeKey, PadSheet.kt).
 */
export function RangeKey(props: {
  range: { readonly from: number; readonly to: number }
  on: boolean
  /** The id of the block it jumps to. */
  controls?: string
  onClick: () => void
}): JSX.Element {
  const kind = FeatureText.factoryCategory(props.range.from)
  return (
    <button
      type="button"
      class={`snd__range cap-3d${props.on ? ' is-on is-down' : ''}`}
      aria-controls={props.controls}
      aria-current={props.on || undefined}
      onClick={props.onClick}
    >
      <span class="snd__range-label">{FeatureText.range(props.range)}</span>
      {kind !== null && <span class="snd__range-kind">{kind}</span>}
    </button>
  )
}

/** A row's words: the LED, the slot, the name, and the size or ON PAD. */
function RowWords(props: { snd: SoundEntry; here: boolean }): JSX.Element {
  const { snd, here } = props
  return (
    <>
      <span class="snd__led" aria-hidden="true" />
      <span class="snd__slot">{FeatureText.slot(snd.slot)}</span>
      <span class="snd__name">{snd.name}</span>
      <span class="snd__size">{here ? MirrorText.ON_PAD : Format.bytes(snd.size)}</span>
    </>
  )
}
