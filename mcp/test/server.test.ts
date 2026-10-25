// The MCP server in-process: JSON-RPC over Web Requests to the same handler
// the Vercel Function serves (2025-era Streamable HTTP, as Claude speaks it
// today), plus the SDK's own client over the 2026-07-28 protocol.
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'
import { describe, expect, it } from 'vitest'
import { parseBeatCard, summarizeBeatCard } from '../../web/src/core/formats/beatCard'
import { CARDS } from '../../web/test/core/formats/beatCardFixtures'
import { handler } from '../src/handler'
import { MAX_PROBLEMS, RESULT_BUDGET } from '../src/tools/beat'
import { BEAT_TOOL, BEAT_URI, CARD_MAX, CARD_MIN } from '../src/text'

const VERSION = '2025-11-25'
const URL_ = 'http://localhost/mcp'
let id = 0

/** One JSON-RPC request; the answer comes as JSON or as one SSE message. */
async function rpc(method: string, params: Record<string, unknown> = {}): Promise<Record<string, any>> {
  const res = await handler(
    new Request(URL_, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': VERSION,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    }),
  )
  expect(res.status).toBe(200)
  const text = await res.text()
  const data = res.headers.get('content-type')?.includes('text/event-stream')
    ? text
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5))
        .join('')
    : text
  const msg = JSON.parse(data)
  expect(msg.error).toBeUndefined()
  return msg.result
}

const call = (card: string): Promise<Record<string, any>> =>
  rpc('tools/call', { name: BEAT_TOOL, arguments: { card } })

const house = CARDS.find((c) => c.heading === 'House')!.card

describe('arc MCP server over HTTP', () => {
  it('initializes as arc with tools and resources', async () => {
    const r = await rpc('initialize', {
      protocolVersion: VERSION,
      capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [RESOURCE_MIME_TYPE] } } },
      clientInfo: { name: 'test', version: '1' },
    })
    expect(r.serverInfo.name).toBe('arc')
    expect(r.capabilities.tools).toBeDefined()
    expect(r.capabilities.resources).toBeDefined()
    expect(r.instructions).toContain('show_beat_card')
  })

  it('lists show_beat_card with its view, read-only, taking the card', async () => {
    const { tools } = await rpc('tools/list')
    expect(tools.map((t: { name: string }) => t.name)).toEqual([BEAT_TOOL])
    const tool = tools[0]
    expect(tool._meta.ui.resourceUri).toBe(BEAT_URI)
    expect(tool.annotations.readOnlyHint).toBe(true)
    expect(tool.description).toMatch(/ARC BEAT/)
    expect(tool.inputSchema.required).toEqual(['card'])
    expect(tool.inputSchema.properties.card).toMatchObject({ type: 'string', minLength: CARD_MIN, maxLength: CARD_MAX })
  })

  it('answers a genre card with the parse result and its summary', async () => {
    const r = await call(house)
    expect(r.isError).toBeFalsy()
    const expected = parseBeatCard(house)
    expect(r.structuredContent).toEqual(JSON.parse(JSON.stringify(expected)))
    expect(r.structuredContent.valid).toBe(true)
    expect(r.structuredContent.groups.map((g: { group: string }) => g.group)).toEqual(['A', 'B'])
    expect(r.content).toEqual([{ type: 'text', text: summarizeBeatCard(expected) }])
    expect(r.content[0].text).toContain('"House groove", 124 BPM, swing 52')
  })

  it('reads every card of the skill as valid', async () => {
    for (const c of CARDS) {
      const r = await call(c.card)
      expect(r.structuredContent.valid, c.heading).toBe(true)
    }
  })

  it('answers a broken card with its errors by line, not as a tool error', async () => {
    const card = ['ARC BEAT 1', 'tempo 300', '', '[A] bars 1 step 1/16', 'A7 kick | X... X... X... |'].join('\n')
    const r = await call(card)
    expect(r.isError).toBeFalsy()
    expect(r.structuredContent.valid).toBe(false)
    const lines = r.structuredContent.errors.map((e: { line: number }) => e.line)
    expect(lines).toEqual([2, 5])
    expect(r.content[0].text).toMatch(/^This card can't be read: 2 errors\./)
    expect(r.content[0].text).toContain('line 2: ')
    expect(r.content[0].text).toContain('line 5: ')
  })

  it('keeps the result of a card of many problems small, with the counts', async () => {
    // Short lines that each make a warning: about 6,600 of them in CARD_MAX characters.
    const card = ('ARC BEAT 1' + '\nzz'.repeat(CARD_MAX)).slice(0, CARD_MAX)
    const r = await call(card)
    const all = parseBeatCard(card).warnings.length
    expect(all).toBeGreaterThan(1000)
    expect(r.structuredContent.warnings).toHaveLength(MAX_PROBLEMS)
    expect(r.structuredContent.cut).toEqual({ errors: 0, warnings: all - MAX_PROBLEMS, notes: 0 })
    expect(r.content[0].text).toContain(`${all} warnings:`)
    expect(r.content[0].text).toContain(`… and ${all - MAX_PROBLEMS} more warnings`)
    expect(JSON.stringify(r).length).toBeLessThan(150_000)
  })

  it('keeps the result of a long notes list under budget, cutting notes the view reads from the input', async () => {
    const lines = ['ARC BEAT 1']
    for (const g of 'AB') {
      lines.push(`[${g}] bars 8`, 'notes')
      for (const p of '789456123.0E') for (let t = 0; t < 91; t++) lines.push(`${g}${p} t ${t}`)
    }
    const card = lines.join('\n')
    expect(card.length).toBeLessThanOrEqual(CARD_MAX)
    const parsed = parseBeatCard(card)
    expect(parsed.valid).toBe(true)
    expect(parsed.notes.length).toBe(2184)
    const r = await call(card)
    const kept = r.structuredContent.notes.length
    expect(kept).toBeGreaterThan(0)
    expect(r.structuredContent.cut).toEqual({ errors: 0, warnings: 0, notes: 2184 - kept })
    expect(r.structuredContent.notes).toEqual(JSON.parse(JSON.stringify(parsed.notes.slice(0, kept))))
    expect(JSON.stringify(r.structuredContent).length).toBeLessThanOrEqual(RESULT_BUDGET)
    expect(r.content[0].text).toContain('… and 992 more notes')
    expect(JSON.stringify(r).length).toBeLessThan(150_000)
  })

  it('refuses arguments outside the schema as a tool error', async () => {
    const r = await call('ARC')
    expect(r.isError).toBe(true)
    expect(r.structuredContent).toBeUndefined()
  })

  it('lists and serves the view as one HTML file with no network', async () => {
    const { resources } = await rpc('resources/list')
    const listed = resources.find((x: { uri: string }) => x.uri === BEAT_URI)
    expect(listed.mimeType).toBe(RESOURCE_MIME_TYPE)
    expect(listed._meta.ui.csp.connectDomains).toEqual([])

    const { contents } = await rpc('resources/read', { uri: BEAT_URI })
    expect(contents).toHaveLength(1)
    const html = contents[0]
    expect(html.uri).toBe(BEAT_URI)
    expect(html.mimeType).toBe(RESOURCE_MIME_TYPE)
    expect(html._meta.ui.csp).toEqual({ connectDomains: [], resourceDomains: [], frameDomains: [] })
    expect(html._meta.ui.permissions).toEqual({ clipboardWrite: {} })
    expect(html.text).toMatch(/^<!doctype html>/i)
    expect(html.text).toContain('<div id="app">')
    expect(html.text).toContain('<script type="module"')
    // Everything inlined: no script, style or image from anywhere.
    expect(html.text).not.toMatch(/<script[^>]+src=/)
    expect(html.text).not.toMatch(/<link[^>]+href=/)
    expect(html.text).toContain("Preview only — arc can't import cards yet.")
  })

  it('answers GET with 405: stateless, no streams', async () => {
    const res = await handler(new Request(URL_, { method: 'GET', headers: { accept: 'text/event-stream' } }))
    expect(res.status).toBe(405)
  })
})

describe('arc MCP server with the SDK client (2026-07-28)', () => {
  it('lists the tool and calls it', async () => {
    const client = new Client({ name: 'test', version: '1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } })
    const transport = new StreamableHTTPClientTransport(new URL(URL_), {
      fetch: (input, init) => handler(new Request(input, init)),
    })
    await client.connect(transport)
    const { tools } = await client.listTools()
    expect(tools.find((t) => t.name === BEAT_TOOL)?._meta?.ui).toEqual({ resourceUri: BEAT_URI })
    const r = await client.callTool({ name: BEAT_TOOL, arguments: { card: house } })
    expect((r.structuredContent as { name: string }).name).toBe('House groove')
    const read = await client.readResource({ uri: BEAT_URI })
    expect(read.contents[0]?.mimeType).toBe(RESOURCE_MIME_TYPE)
    await client.close()
  })
})
