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
// MAX_NOTE_LINES notes a section (four sections' worth in all, however many
// scenes), and structuredContent keeps as many problems and only the notes
// that fit in RESULT_BUDGET, the later scenes' first, with `cut` saying how
// many it left out. A card of scenes holds its first scene twice (on top and
// as scenes[0]), so when even no notes fit, the later scenes lose their
// sections, the last first (`cut.scenes`); the parser keeps at most
// MAX_SCENES scenes, however many scene lines a card that isn't valid has, so
// that list stays short too. The view then keeps its own parse
// of the tool's input, which is whole (views/beat/main.tsx).

import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import {
  parseBeatCard,
  summarizeBeatCard,
  type BeatCardResult,
  type BeatCardScene,
} from '../../../web/src/core/formats/beatCard'
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
  /** The scenes, the last ones, whose sections were left out; only when there are any. */
  readonly scenes?: number
}

/** The tool's answer: the summary text and structuredContent, `cut` set when something was left out. */
export function fitBeatCard(result: BeatCardResult): { text: string; structured: BeatCardResult & { cut?: BeatCardCut } } {
  const text = summarizeBeatCard(result, { problems: MAX_PROBLEMS, notes: MAX_NOTE_LINES })
  const errors = result.errors.slice(0, MAX_PROBLEMS)
  const warnings = result.warnings.slice(0, MAX_PROBLEMS)
  const scenes = result.scenes
  // Every note once: the top level's (the first scene's), then the later scenes'.
  const total = result.notes.length + scenes.slice(1).reduce((n, s) => n + s.notes.length, 0)
  /** The result with the first [whole] scenes' sections and the first [notes] notes in that order. */
  const shown = (whole: number, notes: number) => {
    let left = notes
    const take = <T>(list: readonly T[]): T[] => {
      const n = Math.min(left, list.length)
      left -= n
      return list.slice(0, n)
    }
    const top = take(result.notes)
    const kept = scenes.map(
      (s, i): BeatCardScene =>
        i >= whole
          ? { ...s, groups: [], notes: [], sounds: [], pads: [] }
          : { ...s, notes: i === 0 ? s.notes.slice(0, top.length) : take(s.notes) },
    )
    const keptNotes = top.length + kept.slice(1).reduce((n, s) => n + s.notes.length, 0)
    const dropped = scenes.length - Math.min(whole, scenes.length)
    return {
      ...result,
      errors,
      warnings,
      notes: top,
      scenes: kept,
      cut: {
        errors: result.errors.length - errors.length,
        warnings: result.warnings.length - warnings.length,
        notes: total - keptNotes,
        ...(dropped > 0 ? { scenes: dropped } : {}),
      },
    }
  }
  const fits = (whole: number, notes: number): boolean => JSON.stringify(shown(whole, notes)).length <= RESULT_BUDGET
  /** The largest n in 0..max with ok(n), ok being true up to some n and false after; 0 when none is. */
  const most = (max: number, ok: (n: number) => boolean): number => {
    let lo = 0
    let hi = max
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (ok(mid)) lo = mid
      else hi = mid - 1
    }
    return lo
  }
  // The longest run of notes that fits, then, if none does, the most scenes that keep their sections.
  // Only notes and later scenes are cut: the most grid rows CARD_MAX holds (every pad twice, 8 bars
  // of 1/32) come to about 105k with their text, under the hosts' limit.
  let whole = scenes.length
  let notes = total
  if (!fits(whole, notes)) {
    if (!fits(whole, 0)) whole = most(scenes.length, (w) => fits(w, 0))
    notes = most(total, (n) => fits(whole, n))
  }
  const structured = shown(whole, notes)
  const { cut } = structured
  if (cut.errors + cut.warnings + cut.notes + (cut.scenes ?? 0) === 0) return { text, structured: result }
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
