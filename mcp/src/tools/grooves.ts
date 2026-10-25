// browse_grooves: the arc-beats skill's genre recipes (src/grooves.ts,
// generated from its references/genres.md by scripts/gen-grooves.mjs) as a
// gallery the user can play, handed to the gallery view
// (ui://arc/grooves.html).
//
// The search (findGrooves, which the view's search box uses too) keeps the
// grooves with the whole query as whole words in their name, family or feel,
// else those with every word of it anywhere, with short names spelled out
// ("dnb"), in the recipes' order, kept to a family when one is given, at most
// [limit] of them; no query shows them all. Finding nothing is a normal result, not
// isError: the text names the families so the model can try again.
//
// The answer is structuredContent (every groove's card, which the view plays)
// and a plain text of one line per groove without its card (what the model
// reads, and all a host without MCP Apps shows, such as Claude Code). Size:
// the whole gallery comes to about 48k characters, well under the
// hosts' limit of about 150k (test/grooves.test.ts measures it).

import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { FAMILIES, GROOVES } from '../grooves'
import {
  GROOVES_TOOL,
  GROOVES_URI,
  GroovesToolText,
  LIMIT_MAX,
  QUERY_MAX,
  findGrooves,
  type GrooveFamily,
  type GrooveGallery,
} from '../groovesText'

/**
 * The view's sandbox: no network at all (everything is inlined, sounds made
 * in the page) and clipboard writes for "Copy card", as the beat view has.
 */
export const GROOVES_UI_META = {
  csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
  permissions: { clipboardWrite: {} },
  prefersBorder: true,
}

/** The grooves for [query] (findGrooves) in [family], at most [limit] of them, and how many matched. */
export function browseGrooves(
  query: string | null = null,
  family: GrooveFamily | null = null,
  limit: number = LIMIT_MAX,
): GrooveGallery {
  const trimmed = query?.trim() || null
  const found = findGrooves(GROOVES.filter((g) => family === null || g.family === family), trimmed ?? '')
  const n = Math.max(1, Math.min(LIMIT_MAX, Math.floor(limit)))
  return { query: trimmed, family, grooves: found.slice(0, n), total: found.length }
}

export function registerGrooves(server: McpServer, html: string): void {
  registerAppTool(
    server,
    GROOVES_TOOL,
    {
      title: GroovesToolText.TITLE,
      description: GroovesToolText.DESCRIPTION,
      inputSchema: z.object({
        query: z.string().max(QUERY_MAX).optional().describe(GroovesToolText.QUERY_DESCRIPTION),
        family: z.enum(FAMILIES).optional().describe(GroovesToolText.FAMILY_DESCRIPTION),
        limit: z.number().int().min(1).max(LIMIT_MAX).optional().describe(GroovesToolText.LIMIT_DESCRIPTION),
      }),
      annotations: {
        title: GroovesToolText.TITLE,
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: { ui: { resourceUri: GROOVES_URI } },
    },
    async ({ query, family, limit }) => {
      const result = browseGrooves(query ?? null, family ?? null, limit ?? LIMIT_MAX)
      return {
        content: [{ type: 'text', text: GroovesToolText.result(result, FAMILIES) }],
        // Plain data (arrays, strings, booleans, null): it is its own JSON.
        structuredContent: result as unknown as Record<string, unknown>,
      }
    },
  )

  registerAppResource(
    server,
    GroovesToolText.VIEW_NAME,
    GROOVES_URI,
    { description: GroovesToolText.VIEW_DESCRIPTION, mimeType: RESOURCE_MIME_TYPE, _meta: { ui: GROOVES_UI_META } },
    async () => ({
      contents: [{ uri: GROOVES_URI, mimeType: RESOURCE_MIME_TYPE, text: html, _meta: { ui: GROOVES_UI_META } }],
    }),
  )
}
