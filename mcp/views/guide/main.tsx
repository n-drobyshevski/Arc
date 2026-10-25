// The guide view's entry: connects to the host with the ext-apps App class,
// follows the host's theme, and draws the entries of lookup_combo's result
// (GuideView). As in views/beat/main.tsx, handlers go on before connect().
//
// Official guide opens the entry's source through the host (app.openLink,
// ui/open-link), as the view's sandbox opens nothing itself; when the host
// says no, the view shows the address. Show more like this and Make a beat
// send a ui/message when the host takes them.

import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps'
import { render, type JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { GuideViewText, type GuideLookup } from '../../src/guideText'
import { SERVER_VERSION } from '../../src/text'
import { GuideView, isGuideLookup } from './GuideView'
import '../shared/hostTheme.css'
import '../shared/guideTokens.css'
import './guide.css'

interface State {
  readonly result: GuideLookup | null
  readonly cancelled: boolean
  readonly canMessage: boolean
}

let state: State = { result: null, cancelled: false, canMessage: false }
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

const app = new App({ name: GuideViewText.APP_NAME, version: SERVER_VERSION }, {}, { autoResize: true })

function applyHost(ctx: McpUiHostContext | undefined): void {
  if (!ctx) return
  if (ctx.theme) applyDocumentTheme(ctx.theme)
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables)
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts)
}

app.ontoolresult = (params) => {
  const data = params.structuredContent
  if (!isGuideLookup(data)) return
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

async function openLink(url: string): Promise<boolean> {
  try {
    const r = await app.openLink({ url })
    return !r.isError
  } catch {
    return false
  }
}

function Root(): JSX.Element {
  const s = useAppState()
  if (!s.result) {
    return (
      <main class="guide guide-waiting" aria-busy={!s.cancelled}>
        <p>{s.cancelled ? GuideViewText.CANCELLED : GuideViewText.WAITING}</p>
      </main>
    )
  }
  return <GuideView result={s.result} canMessage={s.canMessage} sendMessage={sendMessage} openLink={openLink} />
}

render(<Root />, document.getElementById('app')!)

app
  .connect()
  .then(() => {
    applyHost(app.getHostContext())
    update({ canMessage: app.getHostCapabilities()?.message !== undefined })
  })
  .catch((e: unknown) => console.error('arc combo guide: could not connect to the host', e))
