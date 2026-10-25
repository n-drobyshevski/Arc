// The groove gallery's entry: connects to the host with the ext-apps App
// class, follows the host's theme, and draws the grooves of browse_grooves'
// result (GroovesView). As in views/beat/main.tsx, handlers go on before
// connect().
//
// Copy card uses the clipboard the host's sandbox allows (clipboardWrite in
// the resource's permissions), else the tile shows the card in a text box to
// select. Make one like this and Show in preview send a ui/message when the
// host takes them.

import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps'
import { render, type JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { GroovesViewText, type GrooveGallery } from '../../src/groovesText'
import { SERVER_VERSION } from '../../src/text'
import { GroovesView, isGrooveGallery } from './GroovesView'
import '../shared/hostTheme.css'
import './grooves.css'

interface State {
  readonly result: GrooveGallery | null
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

const app = new App({ name: GroovesViewText.APP_NAME, version: SERVER_VERSION }, {}, { autoResize: true })

function applyHost(ctx: McpUiHostContext | undefined): void {
  if (!ctx) return
  if (ctx.theme) applyDocumentTheme(ctx.theme)
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables)
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts)
}

app.ontoolresult = (params) => {
  const data = params.structuredContent
  if (!isGrooveGallery(data)) return
  update({ result: data, cancelled: false })
}
app.ontoolcancelled = () => {
  if (!state.result) update({ cancelled: true })
}
app.onhostcontextchanged = (ctx) => applyHost(ctx)
app.onteardown = async () => {
  listeners.clear()
  // Unmounting stops a groove that is playing (GroovesView's cleanup).
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
      <main class="grooves grooves-waiting" aria-busy={!s.cancelled}>
        <p>{s.cancelled ? GroovesViewText.CANCELLED : GroovesViewText.WAITING}</p>
      </main>
    )
  }
  return <GroovesView result={s.result} canMessage={s.canMessage} sendMessage={sendMessage} copyText={copyText} />
}

render(<Root />, document.getElementById('app')!)

app
  .connect()
  .then(() => {
    applyHost(app.getHostContext())
    update({ canMessage: app.getHostCapabilities()?.message !== undefined })
  })
  .catch((e: unknown) => console.error('arc groove gallery: could not connect to the host', e))
