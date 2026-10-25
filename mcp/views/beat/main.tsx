// The beat-card view's entry: connects to the host with the ext-apps App
// class, follows the host's theme, and draws the card the tool was called
// with (BeatView).
//
// The card shows as soon as the tool's input arrives (parsed here with the
// same parser the server uses), then the tool result's structuredContent
// replaces it, unless the server cut a long card's result to size. Copy card
// uses the clipboard the host's sandbox allows (clipboardWrite in the
// resource's permissions), else the view shows the card in a text box to
// select. Ask Claude sends a ui/message when the host takes them.

import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps'
import { render, type JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { parseBeatCard, type BeatCardResult } from '../../../web/src/core/formats/beatCard'
import { BeatText, SERVER_VERSION } from '../../src/text'
import { BeatView } from './BeatView'
import { isBeatCardResult } from './model'
import '../shared/hostTheme.css'
import './beat.css'

interface State {
  readonly card: string | null
  readonly result: BeatCardResult | null
  readonly cancelled: boolean
  readonly canMessage: boolean
}

let state: State = { card: null, result: null, cancelled: false, canMessage: false }
const listeners = new Set<() => void>()

function update(change: Partial<State>): void {
  state = { ...state, ...change }
  for (const l of listeners) l()
}

function useAppState(): State {
  const [, setTick] = useState(0)
  useEffect(() => {
    const l = (): void => setTick((n) => n + 1)
    listeners.add(l)
    return () => void listeners.delete(l)
  }, [])
  return state
}

const app = new App({ name: BeatText.APP_NAME, version: SERVER_VERSION }, {}, { autoResize: true })

function applyHost(ctx: McpUiHostContext | undefined): void {
  if (!ctx) return
  if (ctx.theme) applyDocumentTheme(ctx.theme)
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables)
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts)
}

// Handlers go on before connect(): the host may send the input right after the handshake.
app.ontoolinput = (params) => {
  const card = params.arguments?.card
  if (typeof card !== 'string') return
  update({ card, result: parseBeatCard(card), cancelled: false })
}
app.ontoolresult = (params) => {
  const data = params.structuredContent
  if (!isBeatCardResult(data)) return
  // A long card's result leaves notes or problems out (`cut`, tools/beat.ts): the input's own parse is whole.
  if ('cut' in data && state.card !== null) return
  update({ result: data, cancelled: false })
}
app.ontoolcancelled = () => {
  if (!state.result) update({ cancelled: true })
}
app.onhostcontextchanged = (ctx) => applyHost(ctx)
app.onteardown = async () => {
  listeners.clear()
  render(null, document.getElementById('app')!)
  return {}
}

async function sendMessage(text: string): Promise<boolean> {
  try {
    const r = await app.sendMessage({ role: 'user', content: [{ type: 'text', text }] })
    return !r.isError
  } catch {
    return false
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function Root(): JSX.Element {
  const s = useAppState()
  if (!s.result) {
    return (
      <main class="beat beat-waiting" aria-busy={!s.cancelled}>
        <p>{s.cancelled ? BeatText.CANCELLED : BeatText.WAITING}</p>
        <p class="beat-foot">{BeatText.PREVIEW_NOTE}</p>
      </main>
    )
  }
  return (
    <BeatView
      card={s.card}
      result={s.result}
      canMessage={s.canMessage}
      sendMessage={sendMessage}
      copyText={copyText}
    />
  )
}

render(<Root />, document.getElementById('app')!)

app
  .connect()
  .then(() => {
    applyHost(app.getHostContext())
    update({ canMessage: app.getHostCapabilities()?.message !== undefined })
  })
  .catch((e: unknown) => console.error('arc beat preview: could not connect to the host', e))
