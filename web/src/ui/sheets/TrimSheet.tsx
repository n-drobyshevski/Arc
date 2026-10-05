// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/TrimSheet.kt
//
// Trim a picked file before it is uploaded (an addition to the web version):
// a waveform, a range for start and end, and a way to hear the selection.
// Nothing is cut until the upload; [onDone] gets the frames to keep, or null
// for the whole file.
//
// Web deltas: ranges are half-open {start, end} (Kotlin's `start until end`);
// the file is decoded after the first paint (Kotlin's produceState on
// Dispatchers.Default), so "Opening…" shows for a long file.
import type { JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { cut, frames, seconds, type TrimRange } from '../../core/features/sampleTrim'
import { decodeWav, type DecodedWav } from '../../core/formats/wav'
import { FeatureText } from '../../core/text/featureText'
import { Strings } from '../../core/text/strings'
import { canPlay } from '../../platform/audio/player'
import type { UploadDraftItem } from '../../state/types'
import { Key } from '../components/Key'
import { RangeSlider } from '../components/RangeSlider'
import { Waveform } from '../components/Waveform'
import './TrimSheet.css'

/** The playback key of the selection preview (Kotlin TRIM_PLAY_KEY). */
export const TRIM_PLAY_KEY = 'trim'

export interface TrimSheetContentProps {
  item: UploadDraftItem
  playing: string | null
  onPlay: (pcm: Uint8Array, channels: number, sampleRate: number) => void
  onStop: () => void
  onDone: (range: TrimRange | null) => void
  onCancel: () => void
  /** Id of the title, for the sheet's aria-labelledby. */
  titleId?: string
}

/** Start and end (exclusive) as the sheet clamps them: start in [0, n], end in [start, n]. */
export function clampTrim(start: number, end: number, n: number): TrimRange {
  const s = Math.min(Math.max(start, 0), n)
  return { start: s, end: Math.min(Math.max(end, s), n) }
}

/** What Done hands back: null when the whole file is kept. */
export function trimResult(start: number, end: number, n: number): TrimRange | null {
  return start === 0 && end === n ? null : { start, end }
}

export function TrimSheetContent(props: TrimSheetContentProps): JSX.Element {
  const { item } = props
  const [wav, setWav] = useState<DecodedWav | null>(null)
  useEffect(() => {
    setWav(null)
    const bytes = item.wav
    if (!bytes) return
    let live = true
    const t = setTimeout(() => {
      let w: DecodedWav | null = null
      try {
        w = decodeWav(bytes)
      } catch {
        w = null
      }
      if (live) setWav(w)
    }, 0)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [item.wav])

  return (
    <>
      <h2 id={props.titleId} tabIndex={-1} class="t-heading trim-sheet__title">{FeatureText.TRIM}</h2>
      <p class="t-bold trim-sheet__name">{item.name}</p>
      {wav === null ? (
        <>
          <p class="t-small trim-sheet__dim" role="status">{FeatureText.OPENING}</p>
          <Key text={Strings.CANCEL} onClick={props.onCancel} variant="quiet" block />
        </>
      ) : (
        <TrimBody {...props} w={wav} />
      )}
    </>
  )
}

function TrimBody(props: TrimSheetContentProps & { w: DecodedWav }): JSX.Element {
  const { item, w, playing } = props
  const n = frames(w.pcm, w.channels)
  // Start and end (exclusive) in frames; the parent keys this view by file, as rememberSaveable(item.fileName).
  const [startState, setStart] = useState(item.trim?.start ?? 0)
  const [endState, setEnd] = useState(item.trim?.end ?? n)
  const { start, end } = clampTrim(startState, endState, n)
  const rate = w.sampleRate
  const startS = seconds(start, rate)
  const endS = seconds(end, rate)
  const empty = end - start < 1
  // The browser plays mono or stereo at 4 to 192 kHz; other files can still be trimmed and uploaded.
  const playable = canPlay(w.channels, rate)
  const isPlaying = playing === TRIM_PLAY_KEY
  const selection = FeatureText.selection(startS, endS)
  return (
    <>
      <Waveform pcm={w.pcm} channels={w.channels} start={start} end={end} label={selection} />
      <RangeSlider
        start={start}
        end={end}
        min={0}
        max={Math.max(n, 1)}
        onChange={(s, e) => {
          const r = clampTrim(Math.round(s), Math.round(e), n)
          setStart(r.start)
          setEnd(r.end)
        }}
        valueText={(v) => FeatureText.duration(seconds(v, rate))}
      />
      <p class="t-small trim-sheet__dim" aria-live="polite">{selection}</p>
      <div class="trim-sheet__row">
        <Key
          text={isPlaying ? FeatureText.STOP : FeatureText.PLAY_SELECTION}
          onClick={() => (isPlaying ? props.onStop() : props.onPlay(cut(w.pcm, w.channels, start, end), w.channels, Math.trunc(rate)))}
          disabled={!(isPlaying || (!empty && playable))}
        />
        <Key
          text={FeatureText.RESET}
          onClick={() => {
            setStart(0)
            setEnd(n)
          }}
        />
      </div>
      <Key text={Strings.DONE} onClick={() => props.onDone(trimResult(start, end, n))} variant="signal" block disabled={empty} />
      <Key text={Strings.CANCEL} onClick={props.onCancel} variant="quiet" block />
    </>
  )
}
