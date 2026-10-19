// Port of TakesDeck.kt (TakesDeck, TakesGlass), LiveTools.kt's TakesPage and
// PatternLine.kt's TakeBadge (app/src/main/kotlin/dev/arc/ep133/ui/screens/)
//
// The Takes page as the device's display (an addition): the takes numbered on
// the glass, T01 the oldest, and under it one strip of keys (DeckKeys.tsx). A
// tap on a take lights it; PLAY, SHARE, TRIM, DUP, SAVE, EP and DEL act on
// the lit one, and DEL asks again on the glass. TRIM turns the glass into the
// take's wave (TakeTrim.tsx); DUP copies the take, lit as the newest. TAKE
// starts and stops a take, its time on the glass while it records. How
// recording works is folded at the foot.
// While a take is armed or recorded, a badge on the display shows it and
// stops it.
//
// Web deltas:
// - The blinking dots are CSS animations; they stand still under
//   prefers-reduced-motion, or when [still] (screenshots).
// - The glass's takes are a radio group: one tab stop, the arrow keys light
//   the next take (handleRovingKey).
// - Live tools are one page here, not pages: the section keeps its TAKES
//   caption over the glass.
// - SHARE is left out where the browser can't share a file ([TakesUi.canShare]);
//   SAVE is then the way out, and the note says so. VOICE (web) shares the
//   voice message, which Android's SHARE gives Telegram itself.
// - The lit take follows the one playing through a computed, so only a change
//   of which take that is renders the section again.
import type { JSX } from 'preact'
import { useMemo, useRef, useState } from 'preact/hooks'
import { computed, type ReadonlySignal } from '@preact/signals'
import type { RecState } from '../../core/features/takeRecorder'
import { FeatureText } from '../../core/text/featureText'
import { bytes } from '../../core/text/format'
import { MirrorText } from '../../core/text/mirrorText'
import { Strings } from '../../core/text/strings'
import { WebText } from '../../core/text/webText'
import type { TakeTrim } from '../../core/features/takeTrim'
import type { TakeInfo } from '../../platform/storage/takeStore'
import { Caption } from '../components/Caption'
import { handleRovingKey } from '../components/Segmented'
import { Disclosure } from '../components/SettingRow'
import { DeckKey, DeckStrip, Glyph } from './DeckKeys'
import { useIs } from './memo'
import { TakeTrimDeck } from './TakeTrim'
import './Takes.css'

/** The TAKE key's state and what a tap does (Kotlin TakeUi). */
export interface TakeUi {
  readonly state: RecState
  readonly onTake: () => void
}

/** A take's whole sound, decoded (Kotlin's PcmSound as TRIM reads it). */
export interface TakeSound {
  /** Signed 16-bit little-endian, interleaved. */
  readonly pcm: Uint8Array
  readonly channels: number
}

/** Live tools' takes (Kotlin TakesUi). */
export interface TakesUi {
  readonly list: readonly TakeInfo[]
  /** The player's key now (FeatureText Stop on the row it matches), read by each row's key. */
  readonly playing: ReadonlySignal<string | null>
  readonly keyOf: (t: TakeInfo) => string
  readonly fmtWhen: (ms: number) => string
  /** EP (To EP-133) works only while connected. */
  readonly connected: boolean
  /** Whether Share is offered (the browser can share a file). */
  readonly canShare: boolean
  /** Whether Voice message is offered (it shares, and an Opus encoder is here). */
  readonly canVoice?: boolean
  readonly onPlay: (t: TakeInfo) => void
  readonly onStop: () => void
  readonly onShare: (t: TakeInfo) => void
  readonly onVoice?: (t: TakeInfo) => void
  readonly onSave: (t: TakeInfo) => void
  readonly onToDevice: (t: TakeInfo) => void
  readonly onDelete: (t: TakeInfo) => void
  /** DUP: a copy of the take, its trim with it. */
  readonly onDuplicate: (t: TakeInfo) => void
  /** TRIM: the player's key for the part played while trimming. */
  readonly trimKeyOf: (t: TakeInfo) => string
  /** TRIM's PLAY: frames from the first to the second. */
  readonly onTrimPlay: (t: TakeInfo, from: number, to: number) => void
  /** TRIM's DONE: the part kept, or null for the whole take. */
  readonly onSetTrim: (t: TakeInfo, trim: TakeTrim | null) => void
  /** A take's whole sound for TRIM's wave; null when it can't be read. */
  readonly loadSound: (t: TakeInfo) => Promise<TakeSound | null>
}

/**
 * The display's TAKE badge, only while a take is armed or recorded: a dot,
 * blinking while armed, and "TAKE 0:12". A tap stops the take (or the arm).
 */
export function TakeBadge(props: { take: TakeUi | null | undefined; still?: boolean; word?: boolean }): JSX.Element | null {
  const take = props.take
  if (!take || take.state.kind === 'idle') return null
  const s = take.state
  // Where the line is short the word gives way: the time alone while it records, the dot alone while armed.
  const word = props.word !== false
  const label = s.kind === 'recording' ? (word ? MirrorText.takeBadge(s.seconds) : MirrorText.takeLength(s.seconds)) : word ? MirrorText.TAKE : null
  const cls = ['take-badge', s.kind === 'armed' && !props.still ? 'is-armed' : ''].filter(Boolean).join(' ')
  return (
    <button type="button" class={cls} aria-label={MirrorText.takeDescription(s)} onClick={take.onTake}>
      <span class="take-badge__dot" aria-hidden="true" />
      {label !== null && (
        <span class="take-badge__label" aria-hidden="true">
          {label.toUpperCase()}
        </span>
      )}
    </button>
  )
}

/**
 * Live tools' takes: the glass and the strip under it. The lit take is the one
 * tapped while it is still there, else the one playing, else the newest.
 */
export function TakesSection(props: { takes: TakesUi; take: TakeUi; still?: boolean }): JSX.Element {
  const t = props.takes
  const take = props.take
  const list = t.list
  const [litName, setLitName] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [trimName, setTrimName] = useState<string | null>(null)
  const litKey = useMemo(
    () =>
      computed(() => {
        if (litName !== null && list.some((x) => x.name === litName)) return litName
        const p = t.playing.value
        const playing = p === null ? undefined : list.find((x) => t.keyOf(x) === p)
        return (playing ?? list[0])?.name ?? null
      }),
    [t.playing, t.keyOf, list, litName],
  ).value
  const lit = list.find((x) => x.name === litKey) ?? null
  const number = (info: TakeInfo): number => list.length - list.indexOf(info)
  const trimming = trimName !== null ? list.find((x) => x.name === trimName) : undefined
  const confirming = lit !== null && confirm === lit.name
  const n = lit !== null ? number(lit) : 0
  const s = take.state
  const recording = s.kind === 'recording' ? s : null
  // Any key but DEL calls off a delete asked for.
  const act = (f: (info: TakeInfo) => void) => () => {
    if (lit === null) return
    setConfirm(null)
    f(lit)
  }
  const del = (): void => {
    if (lit === null) return
    t.onDelete(lit)
    setConfirm(null)
    setLitName(null)
  }
  const keys: JSX.Element[] = [
    <DeckKey
      key="take"
      glyph={recording !== null ? 'stop' : 'dot'}
      label={recording !== null ? MirrorText.takeLength(recording.seconds) : MirrorText.TAKE}
      description={MirrorText.takeDescription(s)}
      onClick={() => {
        setConfirm(null)
        take.onTake()
      }}
      style={s.kind !== 'idle' ? 'signal' : 'normal'}
      glyphColor={s.kind === 'idle' ? 'var(--signal)' : undefined}
    />,
    <PlayKey key="play" t={t} lit={lit} n={n} onKey={() => setConfirm(null)} />,
  ]
  if (t.canShare) {
    keys.push(
      <DeckKey key="share" glyph="share" label={MirrorText.TAKE_SHARE} description={MirrorText.litTake(FeatureText.SHARE_WAV, n)} onClick={act(t.onShare)} enabled={lit !== null} />,
    )
  }
  const onVoice = t.onVoice
  if (t.canVoice === true && onVoice !== undefined) {
    keys.push(
      <DeckKey key="voice" glyph="voice" label={WebText.TAKE_VOICE} description={MirrorText.litTake(WebText.VOICE_MESSAGE, n)} onClick={act(onVoice)} enabled={lit !== null} />,
    )
  }
  keys.push(
    <DeckKey
      key="trim"
      glyph="trim"
      label={MirrorText.TAKE_TRIM}
      description={MirrorText.litTake(MirrorText.TRIM_HEAD, n)}
      onClick={act((info) => setTrimName(info.name))}
      enabled={lit !== null}
    />,
    <DeckKey
      key="dup"
      glyph="dup"
      label={MirrorText.TAKE_DUP}
      description={MirrorText.litTake(MirrorText.DUPLICATE, n)}
      onClick={act((info) => {
        t.onDuplicate(info)
        // The copy is the newest: it lights.
        setLitName(null)
      })}
      enabled={lit !== null}
    />,
    <DeckKey key="save" glyph="save" label={MirrorText.TAKE_SAVE} description={MirrorText.litTake(FeatureText.SAVE_WAV, n)} onClick={act(t.onSave)} enabled={lit !== null} />,
    <DeckKey
      key="send"
      glyph="send"
      label={MirrorText.TAKE_SEND}
      description={MirrorText.litTake(MirrorText.TO_DEVICE, n)}
      onClick={act(t.onToDevice)}
      enabled={lit !== null && t.connected}
    />,
    <DeckKey
      key="del"
      glyph="delete"
      label={MirrorText.TAKE_DEL}
      description={confirming ? MirrorText.deleteTakeAgain(n) : MirrorText.litTake(Strings.DELETE, n)}
      onClick={() => {
        if (lit === null) return
        if (confirming) del()
        else setConfirm(lit.name)
      }}
      style={confirming ? 'navy' : 'normal'}
      enabled={lit !== null}
    />,
  )
  return (
    <section class="takes" aria-label={MirrorText.TAKES}>
      <Caption text={MirrorText.TAKES} align="start" as="h3" />
      {trimming !== undefined ? (
        <TakeTrimDeck key={trimming.name} t={t} info={trimming} n={number(trimming)} onClose={() => setTrimName(null)} />
      ) : (
        <>
          <TakesGlass
            t={t}
            take={take}
            lit={lit}
            number={number}
            confirming={confirming}
            still={props.still === true}
            onLight={(info) => {
              setLitName(info.name)
              setConfirm(null)
            }}
            onConfirm={del}
          />
          {list.length > 0 && (
            <p class="t-tiny takes__hint">{lit?.trim != null ? MirrorText.trimmedHint(n, lit.keptSeconds) : MirrorText.TAKES_LIT_HINT}</p>
          )}
          <DeckStrip keys={keys} />
        </>
      )}
      <Disclosure title={MirrorText.ABOUT_TAKES}>
        <p>{MirrorText.TAKES_HINT}</p>
        <p>{t.canShare ? WebText.TAKES_NOTE : WebText.TAKES_NOTE_SAVE_ONLY}</p>
      </Disclosure>
    </section>
  )
}

/** PLAY / STOP for the lit take (a key of its own, so that it alone follows whether that take plays). */
function PlayKey(props: { t: TakesUi; lit: TakeInfo | null; n: number; onKey: () => void }): JSX.Element {
  const { t, lit, n } = props
  const playing = useIs(t.playing, lit !== null ? t.keyOf(lit) : '') && lit !== null
  const word = playing ? FeatureText.STOP : FeatureText.PLAY
  return (
    <DeckKey
      glyph={playing ? 'stop' : 'play'}
      label={word}
      description={MirrorText.litTake(word, n)}
      onClick={() => {
        if (lit === null) return
        props.onKey()
        if (playing) t.onStop()
        else t.onPlay(lit)
      }}
      enabled={lit !== null}
    />
  )
}

/**
 * The glass: its head (how many takes and their size; while a take records,
 * REC with a blinking dot, its number and the time large; armed, that it waits
 * for the first sound), then a line per take, newest first. The lit take is
 * in signal orange, ▶ on the one playing; under the takes, a delete asked for.
 */
function TakesGlass(props: {
  t: TakesUi
  take: TakeUi
  lit: TakeInfo | null
  number: (info: TakeInfo) => number
  confirming: boolean
  still: boolean
  onLight: (info: TakeInfo) => void
  onConfirm: () => void
}): JSX.Element {
  const { t, lit, number } = props
  const s = props.take.state
  const recording = s.kind === 'recording' ? s : null
  const group = useRef<HTMLDivElement>(null)
  const litAt = lit !== null ? t.list.indexOf(lit) : -1
  let total = 0
  for (const info of t.list) total += info.bytes
  return (
    <div class="takes-glass">
      <div class="takes-glass__head">
        {s.kind === 'idle' ? (
          <>
            <span class="takes-glass__sub takes-glass__grow">{MirrorText.takesCount(t.list.length)}</span>
            {t.list.length > 0 && <span class="takes-glass__sub">{bytes(total)}</span>}
          </>
        ) : (
          <>
            <span class={`takes-glass__dot${recording !== null && !props.still ? ' is-blinking' : ''}`} aria-hidden="true" />
            <span class="takes-glass__sub takes-glass__grow is-signal">
              {recording !== null ? `${MirrorText.REC} ${MirrorText.takeNumber(t.list.length + 1)}` : MirrorText.TAKE}
            </span>
            {/* The time is for the eye: the TAKE key says it for screen readers. */}
            {recording !== null && (
              <span class="takes-glass__time" aria-hidden="true">
                {MirrorText.takeLength(recording.seconds)}
              </span>
            )}
          </>
        )}
      </div>
      {s.kind === 'armed' && <p class="t-display-hint takes-glass__armed">{MirrorText.TAKE_ARMED}</p>}
      {t.list.length === 0 ? (
        <p class="takes-glass__sub takes-glass__empty">{MirrorText.NO_TAKES}</p>
      ) : (
        <div
          ref={group}
          class="takes-glass__list"
          role="radiogroup"
          aria-label={MirrorText.TAKES}
          onKeyDown={(e) => handleRovingKey(e, litAt, t.list.length, group.current, (i) => {
            const info = t.list[i]
            if (info !== undefined) props.onLight(info)
          })}
        >
          {t.list.map((info) => (
            <TakeLine key={info.name} t={t} info={info} n={number(info)} on={info === lit} onLight={props.onLight} />
          ))}
        </div>
      )}
      {props.confirming && lit !== null && (
        <button type="button" class="takes-glass__sub takes-glass__confirm" onClick={props.onConfirm}>
          {MirrorText.deleteTakeAgain(number(lit))}
        </button>
      )}
    </div>
  )
}

/** A take on the glass: its number, length (its part's, trimmed) and date, ▶ while it plays (read per line), else scissors on a trimmed one. */
function TakeLine(props: { t: TakesUi; info: TakeInfo; n: number; on: boolean; onLight: (info: TakeInfo) => void }): JSX.Element {
  const { t, info, n, on } = props
  const playing = useIs(t.playing, t.keyOf(info))
  const made = t.fmtWhen(info.createdAt)
  return (
    <button
      type="button"
      class={`take-line${on ? ' is-lit' : ''}`}
      role="radio"
      aria-checked={on}
      aria-label={MirrorText.takeRow(n, info.keptSeconds, made, playing, info.trim !== null)}
      tabIndex={on ? 0 : -1}
      data-roving=""
      onClick={() => props.onLight(info)}
    >
      <span class="take-line__row take-line__number" aria-hidden="true">
        {MirrorText.takeNumber(n)}
      </span>
      <span class="take-line__row" aria-hidden="true">
        {MirrorText.takeLength(info.keptSeconds)}
      </span>
      <span class="takes-glass__sub take-line__when" aria-hidden="true">
        {made.replace(/,/g, '')}
      </span>
      <span class="take-line__mark" aria-hidden="true">
        {playing ? <Glyph glyph="play" size={14} /> : info.trim !== null ? <Glyph glyph="trim" size={14} /> : null}
      </span>
    </button>
  )
}
