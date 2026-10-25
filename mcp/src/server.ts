// arc's MCP server: two tools, each with an MCP App view, served over
// Streamable HTTP by mcp-handler: show_beat_card (tools/beat.ts) and
// lookup_combo (tools/guide.ts). Stateless (no sessions, nothing stored) and
// without login: the only data it sees is the card text the model passes to
// show_beat_card and the words it passes to lookup_combo, which are read and
// answered within the request.

import { createMcpHandler } from 'mcp-handler'
import { SERVER_NAME, SERVER_VERSION, ServerText } from './text'
import { registerBeatCard } from './tools/beat'
import { registerGuide } from './tools/guide'

/** The views' HTML files, as the server serves them. */
export interface ArcViews {
  readonly beat: string
  readonly guide: string
}

/** A Web Request → Response handler for the /mcp endpoint, serving [views] as the tools' views. */
export function createArcHandler(views: ArcViews): (request: Request) => Promise<Response> {
  return createMcpHandler(
    (server) => {
      registerBeatCard(server, views.beat)
      registerGuide(server, views.guide)
    },
    {
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      instructions: ServerText.INSTRUCTIONS,
    },
  )
}
