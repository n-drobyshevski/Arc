// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/SampleReviewSheet.kt (SampleReviewSheetContent,
// TakeWave, TrimKnobs, SlotPicker, SlotKey, ReviewKeys)
//
// SAMPLE's review sheet after a take (an addition: the EP-133 puts a take
// straight on its pad, as Settings' Review samples off does here). The pad,
// the length kept and the source under the title; the take's waveform with
// the part kept lit; START (orange) and LENGTH (black) pick that part, and
// the play key plays it as KEEP would put it on the pad. Normalize raises it
// to 0 dB and Trim silence starts it where the sound does. Connected, − and +
// step the slot it goes into over the free ones; offline the slot is picked
// when the EP-133 connects. KEEP puts it on the pad, RETAKE records the pad
// again, DISCARD lets it go (with UNDO on the toast); the sheet dismissed is
// a DISCARD.
//
// Web deltas: the knobs are sliders (KnobSlider); no two-column layout for a
// phone on its side (the sheet scrolls); no haptics.

import type { JSX } from 'preact'
import { FeatureText } from '../../core/text/featureText'
import { MirrorText } from '../../core/text/mirrorText'
import type { SampleReview } from '../../state/samplePlan'
import { GridPlate, PlateLine } from '../components/GridPlate'
import { Key } from '../components/Key'
import { KnobSlider } from '../components/KnobSlider'
import { PlayKey } from '../components/PlayKey'
import { Sheet } from '../components/Sheet'
import { SwitchRow } from '../components/SwitchRow'
import { Waveform } from '../components/Waveform'
import './SampleReviewSheet.css'

export interface SampleReviewSheetProps {
  open: boolean
  review: SampleReview | null
  /** The part kept is playing. */
  playing: boolean
  onTrim(start: number, length: number): void
  onNormalize(on: boolean): void
  onTrimSilence(on: boolean): void
  onSlot(step: number): void
  onPlay(): void
  onStop(): void
  onRetake(): void
  onKeep(): void
  onDiscard(): void
}

export function SampleReviewSheet(props: SampleReviewSheetProps): JSX.Element {
  const r = props.review
  return (
    <Sheet open={props.open && r !== null} onDismiss={props.onDiscard} labelledBy="sample-review-title" class="sample-review">
      {r !== null && <ReviewContent {...props} r={r} />}
    </Sheet>
  )
}

function ReviewContent(props: SampleReviewSheetProps & { r: SampleReview }): JSX.Element {
  const { r } = props
  const rate = Math.max(1, r.rate)
  return (
    <>
      <div class="sample-review__head">
        <h2 id="sample-review-title" class="t-heading">{MirrorText.REVIEW_TITLE}</h2>
        <p class="t-small sample-review__line">{MirrorText.reviewLine(r.pad, r.length / rate, r.input.source, r.input.stereo)}</p>
      </div>
      <Waveform
        pcm={new Uint8Array(r.pcm.buffer, r.pcm.byteOffset, r.pcm.byteLength)}
        channels={r.channels}
        start={r.start}
        end={r.start + r.length}
        label={FeatureText.selection(r.start / rate, (r.start + r.length) / rate)}
        height={64}
      />
      <TrimKnobs {...props} />
      <GridPlate>
        <SwitchRow title={MirrorText.NORMALIZE} note={MirrorText.NORMALIZE_NOTE} on={r.normalize} onChange={props.onNormalize} />
        <PlateLine />
        <SwitchRow title={MirrorText.TRIM_SILENCE} note={MirrorText.TRIM_SILENCE_NOTE} on={r.trimSilence} onChange={props.onTrimSilence} />
      </GridPlate>
      <SlotPicker r={r} onSlot={props.onSlot} />
      <div class="sample-review__keys">
        <Key text={MirrorText.KEEP} variant="signal" onClick={props.onKeep} block />
        <div class="sample-review__pair">
          <Key text={MirrorText.RETAKE} variant="quiet" onClick={props.onRetake} block />
          <Key text={MirrorText.DISCARD} variant="quiet" onClick={props.onDiscard} block />
        </div>
      </div>
    </>
  )
}

/** START and LENGTH over the take, as EDIT's TRIM page has them, and the play key for the part kept. */
function TrimKnobs(props: SampleReviewSheetProps & { r: SampleReview }): JSX.Element {
  const { r } = props
  const n = r.frames
  // Coarse steps, as TRIM's: 400 across the take.
  const step = Math.max(1, Math.trunc(n / 400))
  const room = Math.max(1, n - r.start)
  const startShown = MirrorText.secondsLabel(r.start, r.rate)
  const lengthShown = MirrorText.secondsLabel(r.length, r.rate)
  return (
    <div class="sample-review__trim">
      <KnobSlider
        label={MirrorText.START}
        value={r.start}
        min={0}
        max={Math.max(0, n - 1)}
        step={step}
        readout={startShown}
        def={0}
        tone="orange"
        disabled={n <= 1}
        description={MirrorText.knobDescription(MirrorText.START, startShown)}
        onChange={(v) => props.onTrim(Math.trunc(v), r.length)}
      />
      <KnobSlider
        label={MirrorText.LENGTH}
        value={r.length}
        min={1}
        max={room}
        step={step}
        readout={lengthShown}
        def={room}
        tone="black"
        disabled={n <= 1}
        description={MirrorText.knobDescription(MirrorText.LENGTH, lengthShown)}
        onChange={(v) => props.onTrim(r.start, Math.trunc(v))}
      />
      <PlayKey
        playing={props.playing}
        disabled={r.length <= 0}
        description={props.playing ? FeatureText.STOP : FeatureText.PLAY_SELECTION}
        onClick={() => (props.playing ? props.onStop() : props.onPlay())}
      />
    </div>
  )
}

/** The slot KEEP puts the take into: − and + over the free slots; offline, a line saying it is picked on connecting. */
function SlotPicker(props: { r: SampleReview; onSlot(step: number): void }): JSX.Element {
  const { r } = props
  if (r.offline) return <p class="t-small sample-review__dim">{MirrorText.SLOT_WHEN_CONNECTED}</p>
  const slot = r.slot
  return (
    <div class="sample-review__slot">
      <button type="button" class="sample-review__slot-key cap-3d" aria-label={MirrorText.PREV_SLOT} disabled={slot === null} onClick={() => props.onSlot(-1)}>
        {'−'}
      </button>
      <span class={`t-bold sample-review__slot-line${slot === null ? ' is-dim' : ''}`} aria-live="polite">
        {slot !== null ? MirrorText.slotLine(slot, slot === r.nextFree) : MirrorText.NO_FREE_SLOT}
      </span>
      <button type="button" class="sample-review__slot-key cap-3d" aria-label={MirrorText.NEXT_SLOT} disabled={slot === null} onClick={() => props.onSlot(1)}>
        +
      </button>
    </div>
  )
}
