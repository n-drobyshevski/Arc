// Port of MirrorScreen.kt's RecChip and TakesSection (app/src/main/kotlin/dev/arc/ep133/ui/screens/MirrorScreen.kt)
//
// REC on the display line, and Live tools' takes.
//
// Web deltas:
// - The armed dot's blink is a CSS animation (Kotlin's infinite transition,
//   450 ms each way); it stands still under prefers-reduced-motion, or when
//   [still] (screenshots).
// - A take's row is a disclosure button (aria-expanded) over its actions,
//   where Kotlin's Plate is clickable as a whole.
// - Share is left out where the browser can't share a file ([TakesUi.canShare]):
//   Save WAV is then the way out, and the note says so.
import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import type { RecState } from '../../core/features/takeRecorder'
import { FeatureText } from '../../core/text/featureText'
import { MirrorText } from '../../core/text/mirrorText'
import { Strings } from '../../core/text/strings'
import { WebText } from '../../core/text/webText'
import type { TakeInfo } from '../../platform/storage/takeStore'
import { Caption } from '../components/Caption'
import { Key } from '../components/Key'
import './Takes.css'

/** The REC key's state and what a tap does (Kotlin RecUi); no [onRec]: no REC (no chip, no takes). */
export interface RecUi {
  readonly state: RecState
  readonly onRec?: (() => void) | null
}

/** Live tools' takes (Kotlin TakesUi). */
export interface TakesUi {
  readonly list: readonly TakeInfo[]
  /** The player's key now (FeatureText Stop on the row it matches). */
  readonly playing: string | null
  readonly keyOf: (t: TakeInfo) => string
  readonly fmtWhen: (ms: number) => string
  /** To EP-133 is offered only while connected. */
  readonly connected: boolean
  /** Whether Share is offered (the browser can share a file). */
  readonly canShare: boolean
  readonly onPlay: (t: TakeInfo) => void
  readonly onStop: () => void
  readonly onShare: (t: TakeInfo) => void
  readonly onSave: (t: TakeInfo) => void
  readonly onToDevice: (t: TakeInfo) => void
  readonly onDelete: (t: TakeInfo) => void
}

export const NO_REC: RecUi = { state: { kind: 'idle' } }

/**
 * REC on the display line: a dot and the word, dim while off. Armed, the dot
 * blinks until the first sound; recording, it is lit and the time runs.
 */
export function RecChip(props: { rec: RecUi; still?: boolean }): JSX.Element | null {
  const { rec } = props
  const onRec = rec.onRec
  if (!onRec) return null
  const s = rec.state
  const cls = ['rec-chip', s.kind !== 'idle' ? 'is-on' : '', s.kind === 'armed' && !props.still ? 'is-armed' : ''].filter(Boolean).join(' ')
  return (
    <button type="button" class={cls} aria-label={MirrorText.takeDescription(s)} onClick={onRec}>
      <span class="rec-chip__dot" aria-hidden="true" />
      <span class="rec-chip__label" aria-hidden="true">
        {s.kind === 'recording' ? MirrorText.takeLength(s.seconds) : MirrorText.REC.toUpperCase()}
      </span>
    </button>
  )
}

/** Live tools' takes: each plays, and unfolds to share, save, send to the EP-133 or delete. */
export function TakesSection(props: { takes: TakesUi }): JSX.Element {
  const t = props.takes
  const [open, setOpen] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  return (
    <section class="takes" aria-label={MirrorText.TAKES}>
      <Caption text={MirrorText.TAKES} align="start" as="h3" />
      {t.list.length === 0 && <p class="t-small takes__note">{MirrorText.TAKES_HINT}</p>}
      {t.list.length > 0 && (
        <ul class="takes__list">
          {t.list.map((take) => {
            const playing = t.playing === t.keyOf(take)
            const unfolded = open === take.name
            const moreId = `take-more-${take.name}`
            return (
              <li key={take.name} class={`take${unfolded ? ' is-open' : ''}`}>
                <div class="take__row">
                  <button
                    type="button"
                    class="take__fold"
                    aria-expanded={unfolded}
                    aria-controls={moreId}
                    onClick={() => {
                      setOpen(unfolded ? null : take.name)
                      setConfirm(null)
                    }}
                  >
                    <span class="take__when">{t.fmtWhen(take.createdAt)}</span>
                    <span class="t-small take__length">{MirrorText.takeLength(take.seconds)}</span>
                  </button>
                  <Key
                    text={playing ? FeatureText.STOP : FeatureText.PLAY}
                    size="small"
                    aria-label={`${playing ? FeatureText.STOP : FeatureText.PLAY} ${t.fmtWhen(take.createdAt)}`}
                    onClick={() => (playing ? t.onStop() : t.onPlay(take))}
                  />
                </div>
                {unfolded && (
                  <div id={moreId} class="take__more">
                    {confirm === take.name ? (
                      <>
                        <p class="t-small take__ask">{MirrorText.DELETE_TAKE}</p>
                        <div class="take__keys">
                          <Key
                            text={Strings.DELETE}
                            size="small"
                            variant="signal"
                            onClick={() => {
                              setConfirm(null)
                              setOpen(null)
                              t.onDelete(take)
                            }}
                          />
                          <Key text={Strings.CANCEL} size="small" onClick={() => setConfirm(null)} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div class="take__keys">
                          {t.canShare && <Key text={FeatureText.SHARE_WAV} size="small" onClick={() => t.onShare(take)} />}
                          <Key text={FeatureText.SAVE_WAV} size="small" onClick={() => t.onSave(take)} />
                        </div>
                        <div class="take__keys">
                          {t.connected && <Key text={MirrorText.TO_DEVICE} size="small" onClick={() => t.onToDevice(take)} />}
                          <Key text={Strings.DELETE} size="small" onClick={() => setConfirm(take.name)} />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {t.list.length > 0 && <p class="t-small takes__note">{t.canShare ? WebText.TAKES_NOTE : WebText.TAKES_NOTE_SAVE_ONLY}</p>}
    </section>
  )
}
