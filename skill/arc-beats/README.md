# arc-beats: a Claude skill for the EP-133 K.O. II and Arc

With this skill, Claude can:

1. **Build beats** for the EP-133 K.O. II as ARC BEAT cards that you paste into Arc and play.
2. **Analyse and improve** beats you copy out of Arc, and send back a better card.
3. **Teach** the EP-133 and beat making, one step at a time, with the official key combos and Arc as a practice partner.

The card is plain text; see [references/beat-card.md](references/beat-card.md) for the format. Cards live in Arc only: pasting one never writes to the EP-133.

## Install in the Claude app

1. Download the zip: **https://arc-pi-mauve.vercel.app/arc-beats-skill.zip** (or build it yourself with `npm run gen:skill` in `web/`, which writes `web/public/arc-beats-skill.zip`).
2. In claude.ai or the Claude app open **Settings, Capabilities, Skills** and upload the zip. The folder `arc-beats/` is at the zip's root with `SKILL.md` inside.
3. Switch the skill on. Start a chat such as *"Make me a lazy boom bap for my EP-133"*.

Claude checks cards with a small Python script. That needs **code execution** (Settings, Capabilities). Without it the skill still works; Claude checks cards by hand.

## Install in Claude Code

Copy the folder `skill/arc-beats/` to `~/.claude/skills/arc-beats/` (for every project) or to `.claude/skills/arc-beats/` inside a project:

```sh
mkdir -p ~/.claude/skills
cp -r skill/arc-beats ~/.claude/skills/
```

Claude Code picks it up the next time it starts, and uses it whenever you talk about the EP-133, Arc or beat cards.

## Using it with Arc

1. In Arc's **Live** screen open **Live tools**, find **CLAUDE**, and use **SHARE SCENE** or **SHARE** (the group shown) to send a beat to the Claude app, so Claude sees your pad names. Tick **With my sound list** first and Claude also gets the sounds on your EP-133, and can choose them for the pads with `sound` lines. Or ask Claude to make something new.
2. Claude replies with a card in a code block. Copy it and tap **PASTE BEAT** (or share the reply to Arc), then **IMPORT** on the sheet, and play. One undo removes it. If the card picks sounds, the sheet lists each as old to new with a tick box; the ticked ones can be put on your pads (this is the one thing a card can change on the EP-133).

[references/arc-app.md](references/arc-app.md) has the details Claude uses. **Learn with Claude**, also under CLAUDE, starts lesson 1 in the Claude app.

## What is in the folder

| Path | What it is |
|---|---|
| `SKILL.md` | The skill: what Claude does for each of the three jobs |
| `references/beat-card.md` | The card format, the spec both Arc and the script follow |
| `references/genres.md` | The assumed kit and 16 genre recipes, each a valid card |
| `references/lessons.md` | Twelve lessons from a first beat to sampling |
| `references/analysis.md` | How to read the script's report, the checklist and the vocabulary |
| `references/arc-app.md` | What each Arc screen does, for Claude to explain |
| `references/ep133-guide.md` | The 100 official OS 2.5 key combinations. **Generated, do not edit** |
| `scripts/beatcard.py` | `check` (also `--sounds` to check sound lines against your sound list), `analyse`, `grid` and `midi`; Python 3.9+, standard library only |
| `scripts/test_beatcard.py` | Tests; also checks every card in the references |

## Working on the skill

- Run the tests: `python3 skill/arc-beats/scripts/test_beatcard.py`
- Regenerate the guide and the zip: `cd web && npm run gen:skill`. The guide comes from `core/.../text/GuideText.kt`; change the Kotlin and regenerate, never edit `ep133-guide.md`. The web tests fail when the guide or the zip is stale, so run it after any change in this folder and commit the results.
- `references/beat-card.md` is the spec. If Arc's reader and writer change, change it first, then `scripts/beatcard.py` to match.
