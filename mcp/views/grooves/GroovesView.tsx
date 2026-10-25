// The groove gallery: the grooves browse_grooves found (src/tools/grooves.ts),
// a tile each, under a header, family chips (All and each family the result
// has, in the gallery's order) and a search box that narrow the tiles in
// place with the tool's own search (findGrooves). A tile shows the groove's
// name, family, tempo and swing, its feel, an EP-40 badge for the EP-40
// Riddim kit's grooves, a thumbnail of its card's first pattern (one row of
// tiny cells per pad, shaded by velocity, from the beat view's model,
// viewGroups, drawn as one small SVG) and, when the recipe has one, its note
// (what the card's FX lines or hand-written swing do) folded under About the
// card. When the model asked for fewer grooves than matched, the count says
// how many more there are.
//
// Play plays the groove with the beat view's own model, player and synth
// (views/beat), so FX, pad shaping and scenes sound exactly as in the beat
// preview: its chain when the card has one, else its first scene looped, at
// the card's tempo and swing with its FX on. One tile plays at a time: Play on
// another stops the first. The AudioContext is made on the first tap, as
// browsers only start sound from a user gesture; one player serves them all.
// Make one like this and Show in preview send a message to Claude with the
// groove's card when the host takes them; Copy card copies it.

import type { JSX } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { cardScenes, parseBeatCard, type BeatCardResult } from '../../../web/src/core/formats/beatCard'
import { FAMILIES } from '../../src/grooves'
import {
  GroovesViewText,
  findGrooves,
  type Groove,
  type GrooveGallery,
} from '../../src/groovesText'
import { cardFx, chainSteps, sceneSteps, viewGroups, type ViewGroup } from '../beat/model'
import { Player } from '../beat/player'
import { Synth } from '../beat/synth'

/** A card without a tempo line plays at this one (as in the beat view). */
const DEFAULT_TEMPO = 120
/** A thumbnail draws at most this many rows. */
const THUMB_ROWS = 8

/** structuredContent that looks like browse_grooves' result. */
export function isGrooveGallery(x: unknown): x is GrooveGallery {
  if (typeof x !== 'object' || x === null) return false
  const r = x as Record<string, unknown>
  return Array.isArray(r.grooves) && typeof r.total === 'number'
}

/** Text with `code spans` drawn as code. */
function withCode(text: string): (string | JSX.Element)[] {
  return text.split('`').map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part))
}

export interface GroovesViewProps {
  readonly result: GrooveGallery
  readonly canMessage: boolean
  readonly sendMessage: (text: string) => Promise<boolean>
  readonly copyText: (text: string) => Promise<boolean>
}

export function GroovesView(props: GroovesViewProps): JSX.Element {
  const { result } = props
  // Each card read once: what the thumbnail draws and the player plays.
  const parsed = useMemo(() => new Map(result.grooves.map((g) => [g.id, parseBeatCard(g.card)])), [result])
  const families = useMemo(
    () => FAMILIES.filter((f) => result.grooves.some((g) => g.family === f)),
    [result],
  )
  const [family, setFamily] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [playing, setPlaying] = useState<string | null>(null)
  const [audioError, setAudioError] = useState<string | null>(null)
  const player = useRef<Player | null>(null)

  const shown = useMemo(
    () => findGrooves(result.grooves.filter((g) => family === null || g.family === family), search),
    [result, family, search],
  )
  // The grooves that matched the model's search but were left out by its limit.
  const hidden = Math.max(0, result.total - result.grooves.length)

  function stop(): void {
    player.current?.stop()
    setPlaying(null)
  }

  // A new result starts over; leaving stops the sound.
  useEffect(() => {
    setFamily(null)
    setSearch('')
    stop()
  }, [result])
  useEffect(() => () => player.current?.stop(), [])
  // A playing groove filtered out of sight stops, as its Stop is gone.
  useEffect(() => {
    if (playing !== null && !shown.some((g) => g.id === playing)) stop()
  }, [shown, playing])

  async function toggle(g: Groove): Promise<void> {
    if (playing === g.id) {
      stop()
      return
    }
    const card = parsed.get(g.id)
    if (!card) return
    try {
      if (!player.current) {
        // Created on the tap: browsers only let a page start sound from a user gesture.
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Ctx) throw new Error('no Web Audio')
        player.current = new Player(new Synth(new Ctx({ latencyHint: 'interactive' })))
      }
      const p = player.current
      p.stop()
      await p.resume()
      // As the beat view plays a card first: the chain when it has one, else its first scene looped.
      const chain = card.chain != null && cardScenes(card).length > 1
      p.setSteps(chain ? chainSteps(card, card.swing) : sceneSteps(card, 0, card.swing))
      p.setTempo(card.tempo ?? DEFAULT_TEMPO)
      p.setFx(cardFx(card))
      p.setFxOn(true)
      p.audible = () => true
      p.start()
      setAudioError(null)
      setPlaying(g.id)
    } catch {
      setPlaying(null)
      setAudioError(g.id)
    }
  }

  return (
    <main class="grooves" aria-label={GroovesViewText.APP_NAME}>
      <header class="grooves-head">
        <h1 class="grooves-title">
          {result.query !== null ? GroovesViewText.heading(result.query) : GroovesViewText.TITLE}
        </h1>
        <p class="grooves-meta">{GroovesViewText.INTRO}</p>
      </header>

      <div class="grooves-filters">
        <div class="grooves-chips" role="group" aria-label={GroovesViewText.FAMILIES}>
          <button
            type="button"
            class="grooves-chip"
            aria-pressed={family === null}
            onClick={() => setFamily(null)}
          >
            {GroovesViewText.ALL}
          </button>
          {families.map((f) => (
            <button
              key={f}
              type="button"
              class="grooves-chip"
              aria-pressed={family === f}
              onClick={() => setFamily(family === f ? null : f)}
            >
              {f}
            </button>
          ))}
        </div>
        <input
          type="search"
          class="grooves-search"
          aria-label={GroovesViewText.SEARCH}
          placeholder={GroovesViewText.SEARCH_PLACEHOLDER}
          value={search}
          onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
        />
        <p class="grooves-count" role="status">
          {GroovesViewText.count(shown.length, result.grooves.length)}
          {hidden > 0 && <span class="grooves-more">{` · ${GroovesViewText.more(hidden)}`}</span>}
        </p>
      </div>

      {shown.length === 0 ? (
        <p class="grooves-note">{GroovesViewText.NONE}</p>
      ) : (
        <ul class="grooves-list">
          {shown.map((g) => (
            <Tile
              key={g.id}
              groove={g}
              card={parsed.get(g.id)!}
              playing={playing === g.id}
              audioError={audioError === g.id}
              onToggle={() => void toggle(g)}
              canMessage={props.canMessage}
              sendMessage={props.sendMessage}
              copyText={props.copyText}
            />
          ))}
        </ul>
      )}
      <p class="grooves-foot">{GroovesViewText.PREVIEW_NOTE}</p>
    </main>
  )
}

function Tile(props: {
  groove: Groove
  card: BeatCardResult
  playing: boolean
  audioError: boolean
  onToggle: () => void
  canMessage: boolean
  sendMessage: (text: string) => Promise<boolean>
  copyText: (text: string) => Promise<boolean>
}): JSX.Element {
  const g = props.groove
  const first = useMemo(() => viewGroups(props.card)[0] ?? null, [props.card])
  const [copy, setCopy] = useState<'idle' | 'done' | 'failed'>('idle')
  const [sent, setSent] = useState<'idle' | 'sending' | 'done' | 'failed'>('idle')
  const area = useRef<HTMLTextAreaElement>(null)
  const sending = sent === 'sending'
  const nameId = `groove-${g.id}`

  useEffect(() => {
    if (copy === 'failed') area.current?.select()
  }, [copy])

  async function send(text: string): Promise<void> {
    if (sending) return
    setSent('sending')
    setSent((await props.sendMessage(text)) ? 'done' : 'failed')
  }

  return (
    <li class={`groove${props.playing ? ' is-playing' : ''}`} aria-labelledby={nameId}>
      <div class="groove-head">
        <h2 class="groove-name" id={nameId}>
          {g.name}
        </h2>
        {g.ep40 && (
          <span class="groove-badge" title={GroovesViewText.EP40_TITLE}>
            {GroovesViewText.EP40}
          </span>
        )}
      </div>
      <p class="groove-meta">
        <span class="groove-family">{g.family}</span>
        {' · '}
        {GroovesViewText.bpm(g.bpm)}
        {' · '}
        {GroovesViewText.swing(g.swing)}
      </p>
      {first !== null && <Thumb view={first} />}
      <p class="groove-feel">{withCode(g.feel)}</p>
      {g.note !== null && (
        <details class="groove-about">
          <summary>{GroovesViewText.ABOUT}</summary>
          <p>{withCode(g.note)}</p>
        </details>
      )}
      <div class="groove-buttons">
        <button
          type="button"
          class={`groove-play${props.playing ? ' is-on' : ''}`}
          aria-pressed={props.playing}
          aria-label={props.playing ? GroovesViewText.stopAria(g.name) : GroovesViewText.playAria(g.name)}
          onClick={props.onToggle}
        >
          <span aria-hidden="true">{props.playing ? '■' : '▶'}</span>{' '}
          {props.playing ? GroovesViewText.STOP : GroovesViewText.PLAY}
        </button>
        {props.canMessage && (
          <button
            type="button"
            class="groove-button"
            disabled={sending}
            onClick={() => void send(GroovesViewText.likeMessage(g))}
          >
            {GroovesViewText.LIKE}
          </button>
        )}
        {props.canMessage && (
          <button
            type="button"
            class="groove-button"
            disabled={sending}
            onClick={() => void send(GroovesViewText.previewMessage(g))}
          >
            {GroovesViewText.PREVIEW}
          </button>
        )}
        <button
          type="button"
          class="groove-button"
          onClick={() => void props.copyText(g.card).then((ok) => setCopy(ok ? 'done' : 'failed'))}
        >
          {copy === 'done' ? GroovesViewText.COPIED : GroovesViewText.COPY}
        </button>
      </div>
      {props.audioError && (
        <p class="groove-note" role="alert">
          {GroovesViewText.NO_AUDIO}
        </p>
      )}
      {sent === 'done' && (
        <p class="groove-note" role="status">
          {GroovesViewText.SENT}
        </p>
      )}
      {sent === 'failed' && (
        <p class="groove-note" role="alert">
          {GroovesViewText.SEND_FAILED}
        </p>
      )}
      {copy === 'failed' && (
        <div class="groove-copy-fallback">
          <p class="groove-note">{GroovesViewText.COPY_FAILED}</p>
          <textarea ref={area} readOnly rows={8} aria-label={GroovesViewText.cardText(g.name)} value={g.card} />
        </div>
      )}
    </li>
  )
}

/**
 * The first pattern as tiny cells: a faint lane per row, and a cell per hit
 * (as long as it is held) shaded by its velocity; a notes-list note shows
 * lighter on its step. One SVG, stretched to the tile's width.
 */
function Thumb(props: { view: ViewGroup }): JSX.Element {
  const g = props.view.group
  const rows = props.view.rows.slice(0, THUMB_ROWS)
  const cells: JSX.Element[] = []
  rows.forEach((r, y) => {
    for (let k = 0; k < g.steps; k++) {
      const vel = r.vel[k] ?? 0
      const note = r.noteVel[k] ?? 0
      if (vel <= 0 && note <= 0) continue
      const len = vel > 0 ? Math.max(1, r.len[k] ?? 1) : 1
      const opacity = vel > 0 ? 0.3 + (0.7 * vel) / 127 : 0.2 + (0.4 * note) / 127
      cells.push(
        <rect key={`${y}:${k}`} x={k + 0.1} y={y + 0.12} width={len - 0.2} height={0.76} fill-opacity={opacity.toFixed(2)} />,
      )
    }
  })
  return (
    <svg
      class="groove-thumb"
      viewBox={`0 0 ${g.steps} ${Math.max(1, rows.length)}`}
      preserveAspectRatio="none"
      style={{ height: `${Math.max(1, rows.length) * 8}px` }}
      role="img"
      aria-label={GroovesViewText.thumb(g.group, g.bars)}
    >
      {rows.map((_, y) => (
        <rect key={y} class="groove-thumb-lane" x={0} y={y + 0.12} width={g.steps} height={0.76} />
      ))}
      <g class="groove-thumb-hits">{cells}</g>
    </svg>
  )
}
