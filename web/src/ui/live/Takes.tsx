// Port of MirrorScreen.kt's TakesSection and PatternLine.kt's TakeBadge
// (app/src/main/kotlin/dev/arc/ep133/ui/screens/)
//
// TAKE (REC before RECORD was the pattern's) in Live tools: its key, then the
// takes. While a take is armed or recorded, a badge on the display shows it
// and stops it.
//
// Web deltas:
// - The armed dot's blink is a CSS animation; it stands still under
//   prefers-reduced-motion, or when [still] (screenshots).
// - A take's row is a disclosure button (aria-expanded) over its actions,
//   where Kotlin's Plate is clickable as a whole.
// - Share is left out where the browser can't share a file ([TakesUi.canShare]);
//   Save WAV is then the way out, and the note says so.
// - CaptionInfo's two notes (TAKES_HINT, TAKES_NOTE) show under the list:
//   the hint while there are no takes, the note once there are.
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

/** The TAKE key's state and what a tap does (Kotlin TakeUi). */
export interface TakeUi {
  readonly state: RecState
  readonly onTake: () => void
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

/**
 * The display's TAKE badge, only while a take is armed or recorded: a dot,
 * blinking while armed, and "TAKE 0:12". A tap stops the take (or the arm).
 */
export function TakeBadge(props: { take: TakeUi | null | undefined; still?: boolean }): JSX.Element | null {
  const take = props.take
  if (!take || take.state.kind === 'idle') return null
  const s = take.state
  const cls = ['take-badge', s.kind === 'armed' && !props.still ? 'is-armed' : ''].filter(Boolean).join(' ')
  return (
    <button type="button" class={cls} aria-label={MirrorText.takeDescription(s)} onClick={take.onTake}>
      <span class="take-badge__dot" aria-hidden="true" />
      <span class="take-badge__label" aria-hidden="true">
        {(s.kind === 'recording' ? MirrorText.takeBadge(s.seconds) : MirrorText.TAKE).toUpperCase()}
      </span>
    </button>
  )
}

/** Live tools' TAKE key and takes: each plays, and unfolds to share, save, send to the EP-133 or delete. */
export function TakesSection(props: { takes: TakesUi; take: TakeUi }): JSX.Element {
  const t = props.takes
  const s = props.take.state
  const [open, setOpen] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  return (
    <section class="takes" aria-label={MirrorText.TAKES}>
      <Caption text={MirrorText.TAKES} align="start" as="h3" />
      <Key
        class="takes__key"
        text={'● ' + (s.kind === 'recording' ? MirrorText.takeBadge(s.seconds) : MirrorText.TAKE)}
        size="small"
        block
        variant={s.kind !== 'idle' ? 'signal' : 'normal'}
        aria-label={MirrorText.takeDescription(s)}
        aria-pressed={s.kind !== 'idle'}
        onClick={props.take.onTake}
      />
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
      <p class="t-small takes__note">
        {t.list.length === 0 ? MirrorText.TAKES_HINT : t.canShare ? WebText.TAKES_NOTE : WebText.TAKES_NOTE_SAVE_ONLY}
      </p>
    </section>
  )
}
