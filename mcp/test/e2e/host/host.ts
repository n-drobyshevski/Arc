// A minimal MCP Apps host for the Playwright test (beat.spec.ts), built from
// the SDK's host side: an MCP client to this package's server (/mcp, served by
// the Vite dev server of vite.config.ts), and an AppBridge to the view in a
// sandboxed iframe, as Claude runs it: an opaque origin (allow-scripts only),
// the resource's CSP enforced and no unsafe-eval.
//
// The test drives it through window.arcHost: show(card) sends the tool input,
// calls show_beat_card on the server and sends its result to the view.

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import {
  AppBridge,
  buildAllowAttribute,
  getToolUiResourceUri,
  PostMessageTransport,
  type McpUiMessageRequest,
  type McpUiResourceCsp,
  type McpUiResourceMeta,
} from '@modelcontextprotocol/ext-apps/app-bridge'

const TOOL = 'show_beat_card'

/** The CSP a host builds from the resource's csp (here: nothing outside the document). */
function cspFor(csp: McpUiResourceCsp | undefined): string {
  const connect = csp?.connectDomains?.length ? csp.connectDomains.join(' ') : "'none'"
  const res = csp?.resourceDomains?.join(' ') ?? ''
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' ${res}`,
    `style-src 'unsafe-inline' ${res}`,
    `img-src data: blob: ${res}`,
    `font-src data: ${res}`,
    `media-src data: blob: ${res}`,
    `connect-src ${connect}`,
    "frame-src 'none'",
  ].join('; ')
}

async function start() {
  const status = document.getElementById('status')!
  const client = new Client({ name: 'arc-test-host', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', location.href)))
  const { tools } = await client.listTools()
  const tool = tools.find((t) => t.name === TOOL)
  if (!tool) throw new Error(`no ${TOOL}`)
  const uri = getToolUiResourceUri(tool)
  if (!uri) throw new Error('the tool has no view')
  const read = await client.readResource({ uri })
  const content = read.contents[0] as { text: string; _meta?: { ui?: McpUiResourceMeta } }
  const ui = content._meta?.ui

  const html = content.text.replace(
    /<head>/i,
    `<head><meta http-equiv="Content-Security-Policy" content="${cspFor(ui?.csp)}">`,
  )
  const iframe = document.createElement('iframe')
  iframe.id = 'view'
  iframe.title = 'Beat card'
  iframe.setAttribute('sandbox', 'allow-scripts')
  iframe.setAttribute('allow', buildAllowAttribute(ui?.permissions))

  const messages: McpUiMessageRequest['params'][] = []
  const bridge = new AppBridge(
    client,
    { name: 'arc-test-host', version: '1.0.0' },
    { openLinks: {}, serverTools: {}, logging: {}, message: { text: {} }, sandbox: { csp: ui?.csp, permissions: ui?.permissions } },
    {
      hostContext: {
        theme: new URLSearchParams(location.search).get('theme') === 'light' ? 'light' : 'dark',
        platform: 'web',
        displayMode: 'inline',
        availableDisplayModes: ['inline'],
        containerDimensions: { width: 360, maxHeight: 4000 },
        locale: 'en-US',
      },
    },
  )
  bridge.onmessage = async (params) => {
    messages.push(params)
    return {}
  }
  bridge.onsizechange = ({ height }) => {
    if (height) iframe.style.height = `${Math.ceil(height)}px`
  }
  const initialized = new Promise<void>((resolve) => {
    bridge.oninitialized = () => resolve()
  })

  document.body.appendChild(iframe)
  await bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!))
  iframe.srcdoc = html
  await initialized
  status.textContent = 'ready'

  return {
    messages,
    /** What a host does for one call of the tool: input, the call, its result. */
    async show(card: string) {
      const args = { card }
      await bridge.sendToolInput({ arguments: args })
      const result = await client.callTool({ name: TOOL, arguments: args })
      await bridge.sendToolResult(result as Parameters<AppBridge['sendToolResult']>[0])
      return result
    },
  }
}

declare global {
  interface Window {
    arcHost: Promise<Awaited<ReturnType<typeof start>>>
  }
}

window.arcHost = start()
window.arcHost.catch((e: unknown) => {
  document.getElementById('status')!.textContent = `failed: ${String(e)}`
  console.error(e)
})
