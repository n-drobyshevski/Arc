# arc MCP server

A small [MCP](https://modelcontextprotocol.io) server that lets Claude show an **ARC BEAT card** as an interactive preview right in the chat, look up the EP-133's key combos, and browse a gallery of genre grooves. ARC BEAT cards are the plain-text EP-133 K.O. II beats that the `arc-beats` skill writes.

It has three tools, `show_beat_card`, `lookup_combo` and `browse_grooves`.

## show_beat_card

`show_beat_card` Claude calls it after it writes a card, or when you paste one. You get an [MCP App](https://github.com/modelcontextprotocol/ext-apps) view with:

- the beat's name, tempo and swing;
- for a card with scenes, a strip of its scenes and a **Chain / Scene** switch: Chain plays the card's `chain` (or every scene once) with its passes, Scene loops the one you pick; groups a scene leaves out play the previous scene's pattern, marked "from scene N";
- tabs for the groups A–D the card uses;
- a step grid with one row per pad, shaded by velocity, with held notes drawn long and lines between bars;
- mute and solo on each row;
- tempo and swing sliders, and Play/Stop with stand-in drum and bass sounds;
- the card's pad shaping (`pad` lines: pitch, level, pan, attack, release, mode) and FX (`fx` with `send`, `comp`, `sidechain`), played with Web Audio as an approximation of arc's FX, with an FX switch to hear the beat dry;
- the card's errors and warnings, each with its line number;
- **Regenerate** (a new take, same tempo and feel) and **Improve** (Claude reworks the groove and says what it changed), or **Fix errors** on a card that can't be read;
- **Ask Claude to change this**, with one-tap quick changes (busier hats, add a fill, simpler, more swing, half-time, add a bassline) or your own words;
- **Copy card**.

Every request goes into the chat as your next message, with any tempo, swing, mute or solo you changed while listening, and Claude answers with a new card in a new preview.

The view says so itself: it is a preview only. arc can't import cards yet, and the sounds are stand-ins, not your EP-133's.

Hosts without MCP Apps, such as Claude Code, get the tool's plain-text summary instead: each section's grid, then the problems by line.

The card is read by the same parser arc's web app will use, `web/src/core/formats/beatCard.ts`. A card is valid here exactly when the skill's `beatcard.py check` finds it valid.

## lookup_combo

`lookup_combo` answers "how do I … on the EP-133" from arc's shortcut guide: the 100 key combinations of teenage engineering's official guide for OS 2.5, in arc's words, each with its source. Claude calls it before it writes any key combo. It finds the entries that contain every word of the question (or, failing that, the ones matching the most words), optionally in one section, and shows them as cards with the keys drawn as on the device (arc's own `GuideKeys`), the guide's notes, **Official guide**, **Show more like this** and, for sequencer entries, **Make a beat that uses this**. Entries carry the same ids as the skill's guide (`SND-1`, `SMP-3`, …). When nothing matches it says so, so Claude doesn't invent a combo. Hosts without MCP Apps get the entries as text.

## browse_grooves

`browse_grooves` shows a gallery of the `arc-beats` skill's 36 genre recipes (its `references/genres.md`): house and club, the techno family of twelve, hip-hop and trap, drum and bass and breaks, dembow and afrobeats, a pop and rock backbeat, and seven reggae and dub grooves for the EP-40 Riddim kit. Claude calls it when you want ideas, a genre to start from, or to browse and hear styles. It can search a groove's name, family and feel (the grooves with the whole query as words, so "drum and bass" or "reggae" find just those, else the ones with every word anywhere; "dnb", "ukg", "lofi" and "hiphop" work too), keep to a family, and show at most a number of grooves; with nothing given it shows them all. You get:

- family chips (All and each family) and a search box that narrow the tiles in place;
- a tile per groove with its name, family, tempo and swing ranges, what it should feel like, an **EP-40** badge for the EP-40 kit's grooves, a small thumbnail of its card's first pattern, shaded by velocity, and, for the 16 recipes that have one, the note under the card (what its FX lines or hand-written swing do) under **About the card**;
- a count of the tiles, which also says how many more grooves match when Claude asked for fewer;
- **Play / Stop** on each tile, with the beat preview's own player, so FX, pad shaping and scenes sound the same; one tile plays at a time;
- **Make one like this** (Claude writes a new card in that style from the groove's card and shows it with `show_beat_card`), **Show in preview** (the card as it is, in the beat preview) and **Copy card**.

The two message buttons hide when the host doesn't take messages from the view. Hosts without MCP Apps get one line per groove (name, family, tempo, swing, feel and the note) without the cards. The whole gallery comes to about 48k characters.

The grooves are in `src/grooves.ts`, generated from the skill's `genres.md` (the skill is a synced claude.ai skill, not in this repo):

```sh
npm run gen:grooves -- /path/to/arc-beats              # the skill folder, or its references/genres.md
ARC_BEATS_SKILL=/path/to/arc-beats npm run gen:grooves
```

The script gives each recipe its family from a map in `scripts/gen-grooves.mjs` and stops on a recipe the map doesn't name. With `ARC_BEATS_SKILL` set, `npm test` also checks `src/grooves.ts` is what the script writes.

## Privacy

- The server only sees the card text Claude passes to `show_beat_card` and the words it passes to `lookup_combo` and `browse_grooves`. It answers within that one request.
- Nothing is stored or logged by the server. There are no accounts and no login.
- The views run in the chat app's sandbox and make no network requests. Its declared CSP has no connect, resource or frame domains, and everything, sounds included, is made in the page.
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

- `npm run build:views` builds each view into a single file, `ui-dist/beat.html`, `guide.html` and `grooves.html`, with Vite and `vite-plugin-singlefile`.
- `npm run build:server` then bundles `src/handler.ts`, with the parser and that HTML, into `dist/server.js`.
- `api/mcp.js` is a plain Vercel Function on the Node.js runtime. It uses the Web `fetch` signature and loads that bundle. `vercel.json` rewrites `/mcp` to it.
- The handler comes from [`mcp-handler`](https://www.npmjs.com/package/mcp-handler). It is stateless, so GET and DELETE answer 405. It speaks both the 2026-07-28 protocol and 2025-era Streamable HTTP.
- `api/mcp.js` is JavaScript on purpose. Vercel's own TypeScript step would keep the parser's extensionless ESM imports, which Node can't load.

Deployments are skipped when nothing under `mcp/` or `web/src/core/` changed (`ignoreCommand`).

## Local development

```sh
cd mcp
npm ci
npm run build       # views → ui-dist/*.html, server → dist/server.js, then tsc
npm run dev         # http://localhost:3000/mcp (PORT to change it)
npx @modelcontextprotocol/inspector   # connect to http://localhost:3000/mcp
```

To see the view without Claude, run `npm run e2e`. Or start its test host yourself:

```sh
npx vite --config test/e2e/host/vite.config.ts --port 4174
```

Then open http://localhost:4174 and call `(await window.arcHost).show(cardText)` in the console. Add `?theme=light` for the light theme. Open `?tool=browse_grooves` and call `(await window.arcHost).call({})` for the gallery (or `?tool=lookup_combo` with `call({ query: 'resample' })`).

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
  - `resources/list` and `resources/read` of `ui://arc/beat.html`, `guide.html` and `grooves.html`;
  - `browse_grooves` with a query, a family and a limit, its text without cards, and the size of the whole gallery.

  It also runs the SDK client over the 2026-07-28 protocol.
- **`test/model.test.ts`** checks what the view plays: voices, swing, holds and doubled hits.
- **`test/grooves.test.ts`** checks the gallery: 36 grooves with unique ids, every card valid and the same as the parser's fixture from `genres.md`, every family used, the search (phrases, short names, the limit), the text the model reads and the messages the view sends.
- **`test/e2e/beat.spec.ts`** loads `test/e2e/host`, a minimal host built from the ext-apps `AppBridge` and the MCP client:
  - The host reads the view from the server and puts it in a 360px iframe. The iframe is sandboxed `allow-scripts`, with the resource's CSP.
  - The host sends the view the tool's input and result.
  - The test then checks the tabs, rows and cells, holds, bar lines, mute and solo, Play and the playhead, Ask Claude, Copy card and the error list, with no page errors.
- **`test/e2e/grooves.spec.ts`** opens the host with `?tool=browse_grooves`: the 36 tiles, their thumbnails and notes, the family chips and search, a limited gallery's count, Play and Stop with one tile at a time, Make one like this and Show in preview, with no page errors. `test/e2e/guide.spec.ts` does the same for `lookup_combo`.

With a Chromium already on the machine, run `CHROMIUM_PATH=/path/to/chromium npm run e2e`. In CI, `.github/workflows/mcp.yml` runs `npm ci`, `npm run check`, `npx playwright install --with-deps chromium` and `npm run e2e`.

## Files

| Path | What |
| --- | --- |
| `api/mcp.js` | Vercel Function for `/mcp` |
| `src/server.ts`, `src/handler.ts` | the MCP handler (`createArcHandler`) and the bundle's entry |
| `src/tools/beat.ts` | `show_beat_card` and the `ui://arc/beat.html` resource |
| `src/tools/guide.ts`, `src/guideText.ts` | `lookup_combo`, the `ui://arc/guide.html` resource and their strings |
| `src/tools/grooves.ts`, `src/groovesText.ts` | `browse_grooves`, the `ui://arc/grooves.html` resource, their strings and the search |
| `src/grooves.ts` | the gallery's grooves, generated by `scripts/gen-grooves.mjs` (`npm run gen:grooves`) |
| `src/text.ts` | the server's instructions and the beat card's strings: tool description for the model, view text for the user |
| `views/beat/` | the view: `main.tsx` (host connection), `BeatView.tsx`, `model.ts`, `player.ts`, `synth.ts` |
| `views/guide/` | the key-combo view: `main.tsx`, `GuideView.tsx` |
| `views/grooves/` | the gallery: `main.tsx`, `GroovesView.tsx` (plays with `views/beat`'s model, player and synth) |
| `views/shared/hostTheme.css` | host theme variables with light/dark fallbacks |
| `vite.config.ts`, `vite.guide.config.ts`, `vite.grooves.config.ts`, `vite.server.config.ts` | view and server builds |
| `test/` | vitest and Playwright tests, and the test host |
