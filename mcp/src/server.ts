// arc's MCP server: one tool with an MCP App view, served over Streamable
// HTTP by mcp-handler. Stateless (no sessions, nothing stored) and without
// login: the only data it sees is the card text the model passes to
// show_beat_card, which is read and answered within the request.

import { createMcpHandler } from 'mcp-handler'
import { SERVER_NAME, SERVER_VERSION, ServerText } from './text'
import { registerBeatCard } from './tools/beat'

/** A Web Request → Response handler for the /mcp endpoint, serving [html] as the beat-card view. */
export function createArcHandler(html: string): (request: Request) => Promise<Response> {
  return createMcpHandler((server) => registerBeatCard(server, html), {
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    instructions: ServerText.INSTRUCTIONS,
  })
}
