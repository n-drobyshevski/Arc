# arc MCP server

A small [MCP](https://modelcontextprotocol.io) server that lets Claude show an **ARC BEAT card** as an interactive preview right in the chat. ARC BEAT cards are the plain-text EP-133 K.O. II beats that the `arc-beats` skill writes.

It has one tool, `show_beat_card`. Claude calls it after it writes a card, or when you paste one. You get an [MCP App](https://github.com/modelcontextprotocol/ext-apps) view with:

- the beat's name, tempo and swing;
- tabs for the groups A–D the card uses;
- a step grid with one row per pad, shaded by velocity, with held notes drawn long and lines between bars;
- mute and solo on each row;
- tempo and swing sliders, and Play/Stop with stand-in drum and bass sounds;
- the card's errors and warnings, each with its line number;
- **Copy card**, and **Ask Claude to change this**.

The view says so itself: it is a preview only. arc can't import cards yet, and the sounds are stand-ins, not your EP-133's.

Hosts without MCP Apps, such as Claude Code, get the tool's plain-text summary instead: each section's grid, then the problems by line.

The card is read by the same parser arc's web app will use, `web/src/core/formats/beatCard.ts`. A card is valid here exactly when the skill's `beatcard.py check` finds it valid.

## Privacy

- The server only sees the card text Claude passes to `show_beat_card`. It reads the card and answers within that one request.
- Nothing is stored or logged by the server. There are no accounts and no login.
- The view runs in the chat app's sandbox and makes no network requests. Its declared CSP has no connect, resource or frame domains, and everything, sounds included, is made in the page.
- It never talks to your EP-133. An MCP App can't use MIDI.

## Add it to Claude

You need the server's URL: `https://<host>/mcp`, where `<host>` is your Vercel deployment (see below).

- **Claude (web, desktop, mobile):** go to **Settings → Connectors → Add custom connector**. Name it `arc` and enter `https://<host>/mcp`. Leave the OAuth fields empty, as the server has no login. Then turn the connector on in a chat, and ask for a beat with the `arc-beats` skill.
- **Claude Code:**

  ```sh
  claude mcp add --transport http arc https://<host>/mcp
  ```

## Deploy on Vercel

The server is a separate Vercel project from arc's web app. Both are in this repository.

1. In Vercel, choose **Add New → Project** and import this repository again.
2. Set **Root Directory** to `mcp`. Set **Framework Preset** to **Other**. `mcp/vercel.json` sets the install and build commands.
3. In the project's **Settings → Build and Deployment → Root Directory**, make sure **Include files outside the root directory in the Build Step** is on. It is on by default for new projects. The build needs it, because it bundles the card parser from `../web/src/core`.
4. Deploy. The endpoint is `https://<project>.vercel.app/mcp`. The page at `/` just says what the server is.

How it is served:

- `npm run build:views` builds the view into a single file, `ui-dist/beat.html`, with Vite and `vite-plugin-singlefile`.
- `npm run build:server` then bundles `src/handler.ts`, with the parser and that HTML, into `dist/server.js`.
- `api/mcp.js` is a plain Vercel Function on the Node.js runtime. It uses the Web `fetch` signature and loads that bundle. `vercel.json` rewrites `/mcp` to it.
- The handler comes from [`mcp-handler`](https://www.npmjs.com/package/mcp-handler). It is stateless, so GET and DELETE answer 405. It speaks both the 2026-07-28 protocol and 2025-era Streamable HTTP.
- `api/mcp.js` is JavaScript on purpose. Vercel's own TypeScript step would keep the parser's extensionless ESM imports, which Node can't load.

Deployments are skipped when nothing under `mcp/` or `web/src/core/` changed (`ignoreCommand`).

## Local development

```sh
cd mcp
npm ci
npm run build       # view → ui-dist/beat.html, server → dist/server.js, then tsc
npm run dev         # http://localhost:3000/mcp (PORT to change it)
npx @modelcontextprotocol/inspector   # connect to http://localhost:3000/mcp
```

To see the view without Claude, run `npm run e2e`. Or start its test host yourself:

```sh
npx vite --config test/e2e/host/vite.config.ts --port 4174
```

Then open http://localhost:4174 and call `(await window.arcHost).show(cardText)` in the console. Add `?theme=light` for the light theme.

## Tests

```sh
npm test            # vitest: builds the view, then the server in-process and the view's model
npm run e2e         # Playwright: the view in Chromium under a test host
npm run check       # build + test, as CI runs it before e2e
```

- **`test/server.test.ts`** sends JSON-RPC over Web `Request`s to the handler, the same one the Vercel Function serves. It covers:
  - `initialize`;
  - `tools/list`, with `_meta.ui.resourceUri` and `readOnlyHint`;
  - `tools/call` with every card from the skill, and with a broken card, whose errors come back by line;
  - `resources/list` and `resources/read` of `ui://arc/beat.html`.

  It also runs the SDK client over the 2026-07-28 protocol.
- **`test/model.test.ts`** checks what the view plays: voices, swing, holds and doubled hits.
- **`test/e2e/beat.spec.ts`** loads `test/e2e/host`, a minimal host built from the ext-apps `AppBridge` and the MCP client:
  - The host reads the view from the server and puts it in a 360px iframe. The iframe is sandboxed `allow-scripts`, with the resource's CSP.
  - The host sends the view the tool's input and result.
  - The test then checks the tabs, rows and cells, holds, bar lines, mute and solo, Play and the playhead, Ask Claude, Copy card and the error list, with no page errors.

With a Chromium already on the machine, run `CHROMIUM_PATH=/path/to/chromium npm run e2e`. In CI, `.github/workflows/mcp.yml` runs `npm ci`, `npm run check`, `npx playwright install --with-deps chromium` and `npm run e2e`.

## Files

| Path | What |
| --- | --- |
| `api/mcp.js` | Vercel Function for `/mcp` |
| `src/server.ts`, `src/handler.ts` | the MCP handler (`createArcHandler`) and the bundle's entry |
| `src/tools/beat.ts` | `show_beat_card` and the `ui://arc/beat.html` resource |
| `src/text.ts` | every string: tool description for the model, view text for the user |
| `views/beat/` | the view: `main.tsx` (host connection), `BeatView.tsx`, `model.ts`, `player.ts`, `synth.ts` |
| `views/shared/hostTheme.css` | host theme variables with light/dark fallbacks |
| `vite.config.ts`, `vite.server.config.ts` | view and server builds |
| `test/` | vitest and Playwright tests, and the test host |
