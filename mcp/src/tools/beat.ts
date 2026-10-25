// show_beat_card: reads an ARC BEAT card with web/src/core/formats/beatCard.ts
// and hands the result to the beat-card view (ui://arc/beat.html).
//
// The tool answers with the parse result as structuredContent (what the view
// draws) and summarizeBeatCard's plain text as content (what the model reads,
// and all a host without MCP Apps shows, such as Claude Code).
//
// A card with errors is still a normal result, not isError. The MCP spec keeps
// isError for a tool that failed to do its job, so that the model can retry;
// here the tool did its job (it read the card and found problems) and the view
// needs the result to list them by line, which hosts may not render for an
// error result (ext-apps types an isError result as having no
// structuredContent). The text starts with "This card can't be read" and lists
// each error by line, and the description asks the model to fix them and call
// again. Arguments that break the input schema (a card under CARD_MIN or over
// CARD_MAX characters) are refused by the SDK with isError, as usual.
//
// Size: hosts break on results past about 150k characters, and CARD_MAX does
// not bound the result (a card of short lines can list thousands of problems,
// a long notes list thousands of notes). fitBeatCard keeps the result small:
// the text lists at most MAX_PROBLEMS errors and as many warnings and
// MAX_NOTE_LINES notes a section, and structuredContent keeps as many
// problems and only the notes that fit in RESULT_BUDGET, with `cut` saying
// how many it left out. The view then keeps its own parse of the tool's
// input, which is whole (views/beat/main.tsx).

import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { parseBeatCard, summarizeBeatCard, type BeatCardResult } from '../../../web/src/core/formats/beatCard'
import { BEAT_TOOL, BEAT_URI, CARD_MAX, CARD_MIN, ServerText } from '../text'

/**
 * The view's sandbox: no network at all (no connect, resource or frame
 * domains: everything is inlined in the one HTML file) and clipboard writes
 * for "Copy card", which the view feature-detects.
 */
export const BEAT_UI_META = {
  csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
  permissions: { clipboardWrite: {} },
  prefersBorder: true,
}

/** At most this many errors, and as many warnings, in the text and in structuredContent. */
export const MAX_PROBLEMS = 50
/** At most this many notes of each section in the text. */
export const MAX_NOTE_LINES = 100
/** structuredContent stays under this many characters of JSON (the text stays well under too). */
export const RESULT_BUDGET = 100_000

/** What a long card's structuredContent leaves out, by kind. */
export interface BeatCardCut {
  readonly errors: number
  readonly warnings: number
  readonly notes: number
}

/** The tool's answer: the summary text and structuredContent, `cut` set when something was left out. */
export function fitBeatCard(result: BeatCardResult): { text: string; structured: BeatCardResult & { cut?: BeatCardCut } } {
  const text = summarizeBeatCard(result, { problems: MAX_PROBLEMS, notes: MAX_NOTE_LINES })
  const errors = result.errors.slice(0, MAX_PROBLEMS)
  const warnings = result.warnings.slice(0, MAX_PROBLEMS)
  const shown = (notes: number) => ({
    ...result,
    errors,
    warnings,
    notes: result.notes.slice(0, notes),
    cut: {
      errors: result.errors.length - errors.length,
      warnings: result.warnings.length - warnings.length,
      notes: result.notes.length - notes,
    },
  })
  const fits = (notes: number): boolean => JSON.stringify(shown(notes)).length <= RESULT_BUDGET
  // The longest run of notes that fits. Only notes are cut: the most grid rows CARD_MAX holds
  // (every pad twice, 8 bars of 1/32) come to about 105k with their text, under the hosts' limit.
  let notes = result.notes.length
  if (!fits(notes)) {
    let lo = 0
    let hi = notes
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (fits(mid)) lo = mid
      else hi = mid - 1
    }
    notes = lo
  }
  const structured = shown(notes)
  const { cut } = structured
  if (cut.errors + cut.warnings + cut.notes === 0) return { text, structured: result }
  return { text, structured }
}

export function registerBeatCard(server: McpServer, html: string): void {
  registerAppTool(
    server,
    BEAT_TOOL,
    {
      title: ServerText.BEAT_TITLE,
      description: ServerText.BEAT_DESCRIPTION,
      inputSchema: z.object({
        card: z.string().min(CARD_MIN).max(CARD_MAX).describe(ServerText.CARD_DESCRIPTION),
      }),
      annotations: {
        title: ServerText.BEAT_TITLE,
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: { ui: { resourceUri: BEAT_URI } },
    },
    async ({ card }) => {
      const { text, structured } = fitBeatCard(parseBeatCard(card))
      return {
        content: [{ type: 'text', text }],
        // The result is plain data (arrays, strings, numbers): it is its own JSON.
        structuredContent: structured as unknown as Record<string, unknown>,
      }
    },
  )

  registerAppResource(
    server,
    ServerText.VIEW_NAME,
    BEAT_URI,
    { description: ServerText.VIEW_DESCRIPTION, mimeType: RESOURCE_MIME_TYPE, _meta: { ui: BEAT_UI_META } },
    async () => ({
      contents: [{ uri: BEAT_URI, mimeType: RESOURCE_MIME_TYPE, text: html, _meta: { ui: BEAT_UI_META } }],
    }),
  )
}
