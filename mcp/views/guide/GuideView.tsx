// The guide view: the entries lookup_combo found (src/tools/guide.ts), each a
// card with its id, what it does, its keys drawn as the EP-133's caps
// (ComboView from the app's web/src/ui/components/GuideKeys.tsx, the combo
// read with guideCombo.parse), its note and a link to its section of the
// official guide, opened through the host. Show more like this and, for
// sequencer entries, Make a beat that uses this send a message to Claude when
// the host takes them.
//
// An entry whose keys can't be drawn (power-up and setup steps have no combo)
// shows the guide's words instead, as the Guide screen does.

import type { JSX } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import { parse, type Combo } from '../../../web/src/core/text/guideCombo'
import { sections } from '../../../web/src/core/text/guideText'
import { ComboView } from '../../../web/src/ui/components/GuideKeys'
import { GuideViewText, type GuideHit, type GuideLookup } from '../../src/guideText'

/** The section whose entries Make a beat that uses this is for. */
const SEQUENCER = 'Sequencer'

/** structuredContent that looks like lookup_combo's result. */
export function isGuideLookup(x: unknown): x is GuideLookup {
  if (typeof x !== 'object' || x === null) return false
  const r = x as Record<string, unknown>
  return typeof r.query === 'string' && typeof r.match === 'string' && Array.isArray(r.entries)
}

/** The entry's combo as caps, or null when it has none or it doesn't parse (the keys' words show instead). */
function comboOf(e: GuideHit): Combo | null {
  if (e.combo === null) return null
  try {
    return parse(e.combo)
  } catch {
    return null
  }
}

export interface GuideViewProps {
  readonly result: GuideLookup
  readonly canMessage: boolean
  readonly sendMessage: (text: string) => Promise<boolean>
  readonly openLink: (url: string) => Promise<boolean>
}

export function GuideView(props: GuideViewProps): JSX.Element {
  const r = props.result
  return (
    <main class="guide">
      <header class="guide-head">
        <h1 class="guide-title">{GuideViewText.heading(r.query)}</h1>
        <p class="guide-meta">
          {GuideViewText.INTRO}
          {r.section !== null && ` ${GuideViewText.inSection(r.section)}`}
        </p>
      </header>
      {r.match === 'none' ? (
        <section class="guide-none" role="status">
          <p class="guide-none-title">{GuideViewText.NOT_FOUND}</p>
          <p class="guide-meta">{GuideViewText.sectionsLine(sections.map((s) => s.title))}</p>
        </section>
      ) : (
        <>
          {r.match === 'some' && <p class="guide-note">{GuideViewText.SOME_WORDS}</p>}
          <ol class="guide-entries">
            {r.entries.map((e) => (
              <Entry key={e.id} entry={e} {...props} />
            ))}
          </ol>
          {r.more > 0 && <p class="guide-note">{GuideViewText.more(r.more)}</p>}
        </>
      )}
      <p class="guide-foot">{r.checkNote}</p>
    </main>
  )
}

function Entry(props: GuideViewProps & { entry: GuideHit }): JSX.Element {
  const e = props.entry
  const combo = useMemo(() => comboOf(e), [e.combo])
  const [link, setLink] = useState<'idle' | 'failed'>('idle')
  const [sent, setSent] = useState<'idle' | 'sending' | 'done' | 'failed'>('idle')
  const sending = sent === 'sending'

  async function open(): Promise<void> {
    setLink((await props.openLink(e.source)) ? 'idle' : 'failed')
  }

  async function send(text: string): Promise<void> {
    if (sending) return
    setSent('sending')
    setSent((await props.sendMessage(text)) ? 'done' : 'failed')
  }

  return (
    <li class="guide-entry">
      <p class="guide-entry-head">
        <span class="guide-id">{e.id}</span>
        <span class="guide-section">{e.section}</span>
      </p>
      <h2 class="guide-action">{e.action}</h2>
      {combo !== null ? (
        <>
          <ComboView combo={combo} spoken={e.keys} class="guide-combo" />
          <p class="guide-keys">
            {GuideViewText.KEYS}: {e.keys}
          </p>
        </>
      ) : (
        <p class="guide-keys guide-keys-only">{e.keys}</p>
      )}
      {e.note !== null && <p class="guide-entry-note">{e.note}</p>}
      <div class="guide-buttons">
        <button
          type="button"
          class="guide-button"
          aria-label={GuideViewText.officialAria(e.id)}
          onClick={() => void open()}
        >
          {GuideViewText.OFFICIAL}
        </button>
        {props.canMessage && (
          <button
            type="button"
            class="guide-button"
            disabled={sending}
            onClick={() => void send(GuideViewText.moreMessage(e))}
          >
            {GuideViewText.MORE}
          </button>
        )}
        {props.canMessage && e.section === SEQUENCER && (
          <button
            type="button"
            class="guide-button"
            disabled={sending}
            onClick={() => void send(GuideViewText.beatMessage(e))}
          >
            {GuideViewText.BEAT}
          </button>
        )}
      </div>
      {link === 'failed' && (
        <p class="guide-note" role="alert">
          {GuideViewText.LINK_FAILED} <span class="guide-url">{e.source}</span>
        </p>
      )}
      {sent === 'done' && (
        <p class="guide-note" role="status">
          {GuideViewText.SENT}
        </p>
      )}
      {sent === 'failed' && (
        <p class="guide-note" role="alert">
          {GuideViewText.SEND_FAILED}
        </p>
      )}
    </li>
  )
}
