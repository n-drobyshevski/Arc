// lookup_combo: searches the shortcut guide of the app
// (web/src/core/text/guideText.ts: 100 key combos from teenage engineering's
// official EP-133 guide for OS 2.5, each checked against it) and hands the
// entries to the guide view (ui://arc/guide.html), which draws their keys.
//
// The search is the Guide screen's own (filter: every word of the query in an
// entry's action, keys or note). When no entry has every word, each word is
// tried on its own, and the entries are ranked by how many words they match,
// then in guide order; filler words ("how", "do", "the" …) are left out of
// that retry, as they would match almost everything. Entries carry the ids
// the arc-beats skill cites (GUIDE_IDS: SND-1 … SYS-18).
//
// The answer is structuredContent (what the view draws) and a plain text that
// lists each entry with its keys and source (what the model reads, and all a
// host without MCP Apps shows, such as Claude Code). Finding nothing is a
// normal result, not isError: the text says it isn't in the official guide,
// so the model says so instead of making a combo up.

import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import {
  CHECK_NOTE,
  OFFICIAL_URL,
  filter,
  guideId,
  sections,
  type GuideEntry,
} from '../../../web/src/core/text/guideText'
import { JAVA_WS, ktTrim } from '../../../web/src/core/util/kotlinText'
import {
  GUIDE_TOOL,
  GUIDE_URI,
  GuideToolText,
  LIMIT_DEFAULT,
  LIMIT_MAX,
  QUERY_MAX,
  QUERY_MIN,
  type GuideHit,
  type GuideLookup,
} from '../guideText'

/** The view's sandbox: no network at all (everything is inlined) and nothing else; links open through the host. */
export const GUIDE_UI_META = {
  csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
  prefersBorder: true,
}

/** The guide's section titles, in its order: the tool's `section` choices. */
export const GUIDE_SECTIONS = sections.map((s) => s.title) as [string, ...string[]]

/** Words that say nothing about the task, left out when the words are tried one by one. */
const FILLER: ReadonlySet<string> = new Set([
  'a', 'an', 'and', 'are', 'can', 'do', 'does', 'for', 'from', 'how', 'i', 'in', 'into', 'is', 'it',
  'k.o.', 'ko', 'ko2', 'ii', 'ep-133', 'ep133', 'me', 'my', 'of', 'on', 'or', 'the', 'to', 'what', 'with', 'you',
])

/** Every entry of the guide with its id and section, in guide order (guideId throws for a section without a prefix). */
const ALL: readonly { readonly entry: GuideEntry; readonly hit: GuideHit }[] = sections.flatMap((s, i) =>
  s.entries.map((e, j) => ({
    entry: e,
    hit: { id: guideId(i, j), section: s.title, action: e.action, keys: e.keys, note: e.note, source: e.source, combo: e.combo },
  })),
)

/** The entries filter([query]) finds (the same objects as sections'), kept to [section] when one is given. */
function matching(query: string, section: string | null): Set<GuideEntry> {
  const found = filter(query).filter((s) => section === null || s.title === section)
  return new Set(found.flatMap((s) => s.entries))
}

/**
 * The guide entries for [query]: those with every word, in guide order, else
 * those with the most of its words, at most [limit] of them.
 */
export function lookupCombo(query: string, section: string | null = null, limit: number = LIMIT_DEFAULT): GuideLookup {
  const words = [...new Set(ktTrim(query).toLowerCase().split(JAVA_WS).filter((w) => w.length > 0))]
  let match: GuideLookup['match'] = 'none'
  let hits: GuideHit[] = []
  if (words.length > 0) {
    const all = matching(query, section)
    if (all.size > 0) {
      match = 'all'
      hits = ALL.filter((x) => all.has(x.entry)).map((x) => x.hit)
    } else {
      const counts = new Map<GuideEntry, number>()
      for (const w of words) {
        if (FILLER.has(w)) continue
        for (const e of matching(w, section)) counts.set(e, (counts.get(e) ?? 0) + 1)
      }
      if (counts.size > 0) {
        match = 'some'
        // Array.prototype.sort is stable: equal counts keep guide order.
        hits = ALL.filter((x) => counts.has(x.entry))
          .sort((a, b) => counts.get(b.entry)! - counts.get(a.entry)!)
          .map((x) => x.hit)
      }
    }
  }
  const n = Math.max(1, Math.min(LIMIT_MAX, Math.floor(limit)))
  return {
    query: ktTrim(query),
    section,
    match,
    entries: hits.slice(0, n),
    more: Math.max(0, hits.length - n),
    checkNote: CHECK_NOTE,
    officialUrl: OFFICIAL_URL,
  }
}

export function registerGuide(server: McpServer, html: string): void {
  registerAppTool(
    server,
    GUIDE_TOOL,
    {
      title: GuideToolText.TITLE,
      description: GuideToolText.DESCRIPTION,
      inputSchema: z.object({
        query: z.string().min(QUERY_MIN).max(QUERY_MAX).describe(GuideToolText.QUERY_DESCRIPTION),
        section: z.enum(GUIDE_SECTIONS).optional().describe(GuideToolText.SECTION_DESCRIPTION),
        limit: z.number().int().min(1).max(LIMIT_MAX).optional().describe(GuideToolText.LIMIT_DESCRIPTION),
      }),
      annotations: {
        title: GuideToolText.TITLE,
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: { ui: { resourceUri: GUIDE_URI } },
    },
    async ({ query, section, limit }) => {
      const result = lookupCombo(query, section ?? null, limit ?? LIMIT_DEFAULT)
      return {
        content: [{ type: 'text', text: GuideToolText.result(result, GUIDE_SECTIONS) }],
        // Plain data (arrays, strings, null): it is its own JSON.
        structuredContent: result as unknown as Record<string, unknown>,
      }
    },
  )

  registerAppResource(
    server,
    GuideToolText.VIEW_NAME,
    GUIDE_URI,
    { description: GuideToolText.VIEW_DESCRIPTION, mimeType: RESOURCE_MIME_TYPE, _meta: { ui: GUIDE_UI_META } },
    async () => ({
      contents: [{ uri: GUIDE_URI, mimeType: RESOURCE_MIME_TYPE, text: html, _meta: { ui: GUIDE_UI_META } }],
    }),
  )
}
