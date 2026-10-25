// The MCP server in-process: JSON-RPC over Web Requests to the same handler
// the Vercel Function serves (2025-era Streamable HTTP, as Claude speaks it
// today), plus the SDK's own client over the 2026-07-28 protocol: the three
// tools (show_beat_card, lookup_combo, browse_grooves) and their views.
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'
import { describe, expect, it } from 'vitest'
import { parseBeatCard, summarizeBeatCard } from '../../web/src/core/formats/beatCard'
import { CARDS } from '../../web/test/core/formats/beatCardFixtures'
import { handler } from '../src/handler'
import { fitBeatCard, MAX_PROBLEMS, RESULT_BUDGET } from '../src/tools/beat'
import { BEAT_TOOL, BEAT_URI, CARD_MAX, CARD_MIN } from '../src/text'
import { GUIDE_TOOL, GUIDE_URI, LIMIT_MAX, QUERY_MAX } from '../src/guideText'
import { GUIDE_SECTIONS, lookupCombo } from '../src/tools/guide'
import { FAMILIES } from '../src/grooves'
import { GROOVES_TOOL, GROOVES_URI, LIMIT_MAX as GROOVES_MAX, QUERY_MAX as GROOVES_QUERY_MAX } from '../src/groovesText'
import { browseGrooves } from '../src/tools/grooves'

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
    expect(tools.map((t: { name: string }) => t.name)).toEqual([BEAT_TOOL, GUIDE_TOOL, GROOVES_TOOL])
    const tool = tools[0]
    expect(tool._meta.ui.resourceUri).toBe(BEAT_URI)
    expect(tool.annotations.readOnlyHint).toBe(true)
    expect(tool.description).toMatch(/ARC BEAT/)
    expect(tool.inputSchema.required).toEqual(['card'])
    expect(tool.inputSchema.properties.card).toMatchObject({ type: 'string', minLength: CARD_MIN, maxLength: CARD_MAX })
  })

  it('lists lookup_combo with its view, read-only, taking a query, a section and a limit', async () => {
    const { tools } = await rpc('tools/list')
    const tool = tools.find((t: { name: string }) => t.name === GUIDE_TOOL)
    expect(tool._meta.ui.resourceUri).toBe(GUIDE_URI)
    expect(tool.annotations.readOnlyHint).toBe(true)
    expect(tool.description).toMatch(/official user guide/)
    expect(tool.inputSchema.required).toEqual(['query'])
    expect(tool.inputSchema.properties.query).toMatchObject({ type: 'string', minLength: 1, maxLength: QUERY_MAX })
    expect(tool.inputSchema.properties.section.enum).toEqual(GUIDE_SECTIONS)
    expect(tool.inputSchema.properties.limit).toMatchObject({ type: 'integer', minimum: 1, maximum: LIMIT_MAX })
  })

  it('answers lookup_combo "resample" with the entries, their ids and combos', async () => {
    const r = await rpc('tools/call', { name: GUIDE_TOOL, arguments: { query: 'resample' } })
    expect(r.isError).toBeFalsy()
    expect(r.structuredContent).toEqual(JSON.parse(JSON.stringify(lookupCombo('resample'))))
    expect(r.structuredContent.match).toBe('all')
    const entries = r.structuredContent.entries as { id: string; combo: string | null }[]
    expect(entries.map((e) => e.id)).toEqual(['SMP-3', 'SMP-6', 'SMP-8', 'SMP-12'])
    expect(entries.filter((e) => e.combo !== null).length).toBeGreaterThan(0)
    const text = r.content[0].text
    expect(text).toContain('SMP-8 — Resample the current pattern.')
    expect(text).toContain('Source: https://teenage.engineering/guides/ep-133/')
  })

  it('answers lookup_combo with the closest entries, a section and a limit', async () => {
    const some = await rpc('tools/call', { name: GUIDE_TOOL, arguments: { query: 'how do I resample a chord', limit: 2 } })
    expect(some.structuredContent.match).toBe('some')
    expect(some.structuredContent.entries.map((e: { id: string }) => e.id)).toEqual(['SMP-6', 'SMP-12'])
    expect(some.structuredContent.more).toBe(2)
    const kept = await rpc('tools/call', { name: GUIDE_TOOL, arguments: { query: 'pattern', section: 'Sampling' } })
    expect(kept.structuredContent.entries.map((e: { section: string }) => e.section)).toEqual(['Sampling'])
  })

  it('answers lookup_combo with no match as not in the official guide, not as a tool error', async () => {
    const r = await rpc('tools/call', { name: GUIDE_TOOL, arguments: { query: 'xyzzy' } })
    expect(r.isError).toBeFalsy()
    expect(r.structuredContent.match).toBe('none')
    expect(r.structuredContent.entries).toEqual([])
    expect(r.content[0].text).toMatch(/^That isn't in the official guide/)
    expect(r.content[0].text).toContain(GUIDE_SECTIONS.join(', '))
  })

  it('refuses lookup_combo arguments outside the schema as a tool error', async () => {
    for (const args of [{ query: '' }, { query: 'resample', section: 'Drums' }, { query: 'resample', limit: LIMIT_MAX + 1 }]) {
      const r = await rpc('tools/call', { name: GUIDE_TOOL, arguments: args })
      expect(r.isError, JSON.stringify(args)).toBe(true)
    }
  })

  it('lists browse_grooves with its view, read-only, taking an optional query, family and limit', async () => {
    const { tools } = await rpc('tools/list')
    const tool = tools.find((t: { name: string }) => t.name === GROOVES_TOOL)
    expect(tool._meta.ui.resourceUri).toBe(GROOVES_URI)
    expect(tool.annotations.readOnlyHint).toBe(true)
    expect(tool.description).toContain('show_beat_card')
    expect(tool.inputSchema.required ?? []).toEqual([])
    expect(tool.inputSchema.properties.query).toMatchObject({ type: 'string', maxLength: GROOVES_QUERY_MAX })
    expect(tool.inputSchema.properties.family.enum).toEqual([...FAMILIES])
    expect(tool.inputSchema.properties.limit).toMatchObject({ type: 'integer', minimum: 1, maximum: GROOVES_MAX })
  })

  it('answers browse_grooves with every groove and its card, and a text of one line each without cards', async () => {
    const r = await rpc('tools/call', { name: GROOVES_TOOL, arguments: {} })
    expect(r.isError).toBeFalsy()
    expect(r.structuredContent).toEqual(JSON.parse(JSON.stringify(browseGrooves())))
    expect(r.structuredContent.total).toBe(36)
    expect(r.structuredContent.grooves).toHaveLength(36)
    expect(r.structuredContent.grooves[0].card).toMatch(/^ARC BEAT 1\n/)
    const text = r.content[0].text as string
    expect(text.split('\n')[0]).toBe('36 grooves:')
    expect(text).not.toContain('ARC BEAT 1')
    expect(JSON.stringify(r).length).toBeLessThan(150_000)
  })

  it('answers browse_grooves with a query, a family and a limit', async () => {
    const q = await rpc('tools/call', { name: GROOVES_TOOL, arguments: { query: 'acid techno' } })
    expect(q.structuredContent.grooves.map((g: { id: string }) => g.id)).toEqual(['acid-techno'])
    expect(q.structuredContent.query).toBe('acid techno')
    const f = await rpc('tools/call', { name: GROOVES_TOOL, arguments: { family: 'Latin and African' } })
    expect(f.structuredContent.grooves.map((g: { id: string }) => g.id)).toEqual(['reggaeton-and-dembow', 'afrobeats'])
    expect(f.structuredContent.family).toBe('Latin and African')
    const l = await rpc('tools/call', { name: GROOVES_TOOL, arguments: { query: 'techno', limit: 2 } })
    expect(l.structuredContent.grooves).toHaveLength(2)
    expect(l.structuredContent.total).toBeGreaterThan(2)
    const none = await rpc('tools/call', { name: GROOVES_TOOL, arguments: { query: 'xyzzy' } })
    expect(none.isError).toBeFalsy()
    expect(none.structuredContent).toMatchObject({ grooves: [], total: 0 })
  })

  it('refuses browse_grooves arguments outside the schema as a tool error', async () => {
    for (const args of [
      { query: 'x'.repeat(GROOVES_QUERY_MAX + 1) },
      { family: 'Polka' },
      { limit: 0 },
      { limit: GROOVES_MAX + 1 },
    ]) {
      const r = await rpc('tools/call', { name: GROOVES_TOOL, arguments: args })
      expect(r.isError, JSON.stringify(args)).toBe(true)
    }
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

  it('answers a card of scenes with every scene and its chain, and no warnings', async () => {
    const card = CARDS.find((c) => c.heading === 'Breakcore arrangement')!.card
    const r = await call(card)
    expect(r.structuredContent).toEqual(JSON.parse(JSON.stringify(parseBeatCard(card))))
    expect(r.structuredContent.warnings).toEqual([])
    expect(r.structuredContent.sceneCount).toBe(5)
    expect(r.structuredContent.scenes.map((s: { name: string }) => s.name)).toEqual([
      'Intro',
      'Drop',
      'Breakdown',
      'Build',
      'Drop 2',
    ])
    expect(r.structuredContent.chain).toEqual([
      { scene: 0, passes: 2 },
      { scene: 1, passes: 2 },
      { scene: 2, passes: 1 },
      { scene: 3, passes: 1 },
      { scene: 4, passes: 2 },
    ])
    const text = r.content[0].text
    expect(text).toContain('"Breakcore track", 180 BPM, swing 50, 5 scenes')
    expect(text).toContain('Scene 4 "Build", B from scene 3')
    expect(text).toContain('Chain: 1x2 2x2 3 4 5x2')
    expect(text).not.toContain('warning')
  })

  it('keeps a long card of scenes under budget, the later scenes cut first', async () => {
    // Scenes of rows hit on every step (8 bars of 1/32, under 2048 notes): more than the budget holds.
    const rows = [...'7894561'].map((p) => `A${p} | ${'X'.repeat(256)} |`)
    const scene = ['', 'scene', '[A] bars 8 step 1/32', ...rows, 'notes', 'A7 t 1'].join('\n')
    const card = 'ARC BEAT 1' + scene.repeat(Math.min(16, Math.floor((CARD_MAX - 10) / scene.length)))
    expect(card.length).toBeLessThanOrEqual(CARD_MAX)
    const parsed = parseBeatCard(card)
    expect(parsed.valid, JSON.stringify(parsed.errors.slice(0, 2))).toBe(true)
    expect(JSON.stringify(parsed).length).toBeGreaterThan(RESULT_BUDGET)
    const r = await call(card)
    const { cut, scenes } = r.structuredContent
    expect(JSON.stringify(r.structuredContent).length).toBeLessThanOrEqual(RESULT_BUDGET)
    expect(cut.scenes).toBeGreaterThan(0)
    expect(scenes).toHaveLength(parsed.sceneCount)
    // The first scenes keep their sections, the last ones lose them (and their notes), names and lines kept.
    const kept = parsed.sceneCount - cut.scenes
    expect(scenes.slice(0, kept).every((s: { groups: unknown[] }) => s.groups.length === 1)).toBe(true)
    expect(scenes.slice(kept).every((s: { groups: unknown[]; notes: unknown[] }) => s.groups.length + s.notes.length === 0)).toBe(true)
    expect(scenes.map((s: { line: number }) => s.line)).toEqual(parsed.scenes.map((s) => s.line))
    expect(r.structuredContent.groups).toEqual(JSON.parse(JSON.stringify(parsed.groups)))
    expect(JSON.stringify(r).length).toBeLessThan(150_000)
  })

  it('keeps a card of thousands of scene lines under budget', () => {
    // Not valid (too-many-scenes), but read whole: the scenes past MAX_SCENES are not kept.
    for (const scene of ['\nscene', '\nscene\n[A]']) {
      const card = 'ARC BEAT 1' + scene.repeat(Math.floor((CARD_MAX - 10) / scene.length))
      expect(card.length).toBeLessThanOrEqual(CARD_MAX)
      const parsed = parseBeatCard(card)
      expect(parsed.errors.map((e) => e.code)).toContain('too-many-scenes')
      expect(parsed.sceneCount).toBeGreaterThan(1000)
      expect(parsed.scenes).toHaveLength(16)
      const { text, structured } = fitBeatCard(parsed)
      expect(JSON.stringify(structured).length).toBeLessThanOrEqual(RESULT_BUDGET)
      expect(text.length).toBeLessThan(RESULT_BUDGET)
    }
  })

  it('cuts the later scenes’ notes first', () => {
    const notes = (n: number): string[] => Array.from({ length: n }, (_, t) => `B7 t ${t}`)
    const card = ['ARC BEAT 1', 'scene', '[B] bars 8', 'notes', ...notes(200), 'scene', '[B] bars 8', 'notes', ...notes(2000)]
    const parsed = parseBeatCard(card.join('\n'))
    const { structured } = fitBeatCard(parsed)
    expect(JSON.stringify(structured).length).toBeLessThanOrEqual(RESULT_BUDGET)
    // The first scene's notes whole, on top and in scenes[0]; the second's cut to what fits.
    expect(structured.notes).toHaveLength(200)
    expect(structured.scenes[0]!.notes).toHaveLength(200)
    const second = structured.scenes[1]!.notes.length
    expect(second).toBeGreaterThan(0)
    expect(second).toBeLessThan(2000)
    expect(structured.scenes[1]!.notes).toEqual(parsed.scenes[1]!.notes.slice(0, second))
    expect(structured.cut).toEqual({ errors: 0, warnings: 0, notes: 2000 - second })
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

  it('lists and serves the guide view as one HTML file with no network', async () => {
    const { resources } = await rpc('resources/list')
    expect(resources.map((x: { uri: string }) => x.uri)).toEqual([BEAT_URI, GUIDE_URI, GROOVES_URI])
    const { contents } = await rpc('resources/read', { uri: GUIDE_URI })
    expect(contents).toHaveLength(1)
    const html = contents[0]
    expect(html.uri).toBe(GUIDE_URI)
    expect(html.mimeType).toBe(RESOURCE_MIME_TYPE)
    expect(html._meta.ui.csp).toEqual({ connectDomains: [], resourceDomains: [], frameDomains: [] })
    expect(html._meta.ui.permissions).toBeUndefined()
    expect(html.text).toMatch(/^<!doctype html>/i)
    expect(html.text).toContain('<title>arc combo guide</title>')
    expect(html.text).toContain('<script type="module"')
    expect(html.text).not.toMatch(/<script[^>]+src=/)
    expect(html.text).not.toMatch(/<link[^>]+href=/)
    // The key caps' styles and colours are inlined with it.
    expect(html.text).toContain('.cap__key--dark')
    expect(html.text).toContain('--guide-dark-face')
  })

  it('lists and serves the groove gallery as one HTML file with no network', async () => {
    const { resources } = await rpc('resources/list')
    expect(resources.find((x: { uri: string }) => x.uri === GROOVES_URI).mimeType).toBe(RESOURCE_MIME_TYPE)
    const { contents } = await rpc('resources/read', { uri: GROOVES_URI })
    expect(contents).toHaveLength(1)
    const html = contents[0]
    expect(html.uri).toBe(GROOVES_URI)
    expect(html.mimeType).toBe(RESOURCE_MIME_TYPE)
    expect(html._meta.ui.csp).toEqual({ connectDomains: [], resourceDomains: [], frameDomains: [] })
    expect(html._meta.ui.permissions).toEqual({ clipboardWrite: {} })
    expect(html.text).toMatch(/^<!doctype html>/i)
    expect(html.text).toContain('<title>arc groove gallery</title>')
    expect(html.text).toContain('<script type="module"')
    expect(html.text).not.toMatch(/<script[^>]+src=/)
    expect(html.text).not.toMatch(/<link[^>]+href=/)
    // The cards come with the result, not with the view.
    expect(html.text).not.toContain('Driving techno')
  })

  it('answers GET with 405: stateless, no streams', async () => {
    const res = await handler(new Request(URL_, { method: 'GET', headers: { accept: 'text/event-stream' } }))
    expect(res.status).toBe(405)
  })
})

describe('arc MCP server with the SDK client (2026-07-28)', () => {
  it('lists the tools and calls them', async () => {
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
    expect(tools.find((t) => t.name === GUIDE_TOOL)?._meta?.ui).toEqual({ resourceUri: GUIDE_URI })
    const guide = await client.callTool({ name: GUIDE_TOOL, arguments: { query: 'resample' } })
    expect((guide.structuredContent as { entries: unknown[] }).entries).toHaveLength(4)
    expect(tools.find((t) => t.name === GROOVES_TOOL)?._meta?.ui).toEqual({ resourceUri: GROOVES_URI })
    const grooves = await client.callTool({ name: GROOVES_TOOL, arguments: { family: 'Techno' } })
    expect((grooves.structuredContent as { total: number }).total).toBe(12)
    await client.close()
  })
})
