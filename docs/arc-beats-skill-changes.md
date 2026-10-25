# arc-beats skill: changes to apply

The **arc-beats** Claude skill (SKILL.md plus `references/` and `scripts/beatcard.py`) is a synced claude.ai skill. It is not in this repository, so it can't be changed by a pull request here. This page lists the changes that bring it in line with what Arc does today (arc 0.2.0, Unreleased in CHANGELOG.md), ready to apply where the skill is edited.

Line numbers are those of the synced copy this was checked against (SKILL.md 225 lines, references/arc-app.md 116 lines). Each change gives the text to find, quoted exactly, and the text to put in its place. Apply them from the bottom of each file up, so the line numbers above a change stay right.

What Arc is today, from [README.md](../README.md), `web/src/ui` and `app/src/main/kotlin/dev/arc/ep133/ui`:

- A backup librarian: back up, restore, a library with names and notes, share and save `.pak` files, import Sample Tool backups, compare (with the device or another backup), backup contents, search sounds across backups.
- **Device**: browse sounds and projects, play a sound on the phone, a project's **Pads**, **Add samples** (WAV, with **Trim**).
- **Live**: mirrors the EP-133's pads and KEYS as it is played, plays the pads' sounds on the phone (chords up to 8), KEYS with a scale, octave and key, offline from the last read. On Android only, **REC** records what is played on the phone into a WAV take (**Live tools → Takes**).
- The **GUIDE** tab: 100 key combinations from the official guide for OS 2.5.
- **Copy for Claude** (being added alongside this page): plain text for a chat with Claude, from a project's **Pads** sheet, a backup's **Contents** and the **Compare** screen.

What the skill claims and Arc does **not** have: a pattern recorder, RECORD/PLAY/ERASE/UNDO for patterns, a step sequencer (STEP), TIMING and swing, scenes, a chain, an FX sheet, punch-ins, sampling (SAMPLE, the mic key, KEEP), TAKE as described, EDIT for pads, SOUND/PROJECT/TEMPO/FX function keys, a piano keyboard, a kit switch (EP-40 Riddim, EP-1320 Medieval), a Factory sounds **Get** row, the CLAUDE row in Live tools (SHARE, SHARE SCENE, SHARE CHAIN, SOUNDS, With my sound list, Waiting for Claude), PASTE BEAT, opening card files, and the whole beat card import sheet (IMPORT, PUT ON PADS, SILENT PADS, PICK SOUND, APPLY FX, SET CHAIN, REPLACE). Arc cannot read a card yet. The web address is wrong too: it is https://arc-pi-mauve.vercel.app, not arc-ko.vercel.app.

## 1. references/ep133-guide.md: regenerate it

The guide reference is generated from Arc's own guide data, so it is never edited by hand:

```sh
cd web
npm run gen:guide   # only when core/.../text/GuideText.kt changed: refreshes src/core/text/guideData.ts
npm run gen:skill   # writes web/dist-skill/ep133-guide.md (git-ignored)
```

Upload `web/dist-skill/ep133-guide.md` in place of the skill's `references/ep133-guide.md`. Today the generated file is byte for byte the one in the synced skill, so this is only needed after the guide changes. `web/test/core/text/skillGuide.test.ts` checks that the generator runs and gives all 100 entries.

## 2. SKILL.md

### 2.1 Line 3, the description

Find:

~~~
Writes drum patterns, grooves and basslines as ARC BEAT text cards the user pastes into Arc, reads and improves cards copied out of Arc, and teaches
~~~

Replace with:

~~~
Writes drum patterns, grooves and basslines as ARC BEAT text cards (played on the EP-133 by hand, or previewed with the arc connector's show_beat_card), reads the pads, sound lists and backup comparisons Arc copies for Claude, and teaches
~~~

### 2.2 Line 8, the opening paragraph

Find the whole line:

~~~
You help someone make music on the teenage engineering **EP-133 K.O. II** (also written KO2), using **Arc**, a free companion app for it on Android and in the browser. Arc's **Live** screen has the pads, KEYS, and (on Android) a pattern recorder, a step sequencer, scenes, FX and sampling. The bridge between you and Arc is a plain-text **ARC BEAT card**: Arc copies a pattern out as a card, you read, write or improve cards, and the user pastes your card back into Arc to play it.
~~~

Replace with:

~~~
You help someone make music on the teenage engineering **EP-133 K.O. II** (also written KO2), using **Arc**, a free backup librarian and companion for it on Android and in the browser (https://arc-pi-mauve.vercel.app). Arc backs up, restores and compares the device's sounds and projects, browses the device and uploads samples. Its **Live** screen mirrors the EP-133's pads and KEYS and plays their sounds on the phone; on Android, **REC** records what is played there into a WAV take. Arc has **no** pattern recorder, step sequencer, scenes, chain, FX or sampling, and it **cannot import a card yet**. The bridge is plain text: Arc's **Copy for Claude** gives you the user's pads and sounds, you write and improve **ARC BEAT cards**, and the user plays a card on the EP-133 by hand, or hears a preview with the arc connector (see "Preview a card" below).
~~~

### 2.3 Line 25, "Arc patterns stay in Arc"

Find the whole line, starting `- **Arc patterns stay in Arc.**` and ending `the EP-133's own FX are never touched.`

Replace with:

~~~
- **A card goes nowhere by itself.** Arc can't import cards yet, and nothing writes a card to the EP-133. To get a beat onto the device the user plays or steps it in there (`SEQ-1`, `SEQ-8`) and loads the card's sounds onto the pads in SOUND mode (`SND-1`; `SND-4` types the slot number). Say this the first time the user expects otherwise. `sound` lines say which sound goes on which pad; `fx`, `send`, `comp`, `sidechain` and `pad` lines are settings for the user to make on the device by hand (`FX-1` to `FX-9`, `SND-6` to `SND-12`). Never say Arc will apply them.
~~~

### 2.4 Line 27, tempo

Find:

~~~
- **Tempo is app-wide.** A card's tempo is offered when pasted, never forced. Changing it later changes every pattern.
~~~

Replace with:

~~~
- **Tempo is the project's.** A card's `tempo` is the speed the beat is meant for; the user sets it on the EP-133 in tempo mode (`SEQ-26`). Changing it later changes every pattern of the project.
~~~

### 2.5 Lines 28 and 29, the kit

Line 28, find `the factory pack of the kit Arc plays, or of the kit the user asks for` and replace with `the EP-133's factory pack, or that of the kit the user says their device holds or asks for`.

Line 29, find:

~~~
When the share says *My EP-133 plays the EP-40 Riddim factory kit.*, the user asks for the EP-40's sounds or kit,
~~~

Replace with:

~~~
When the user says their EP-133 holds the EP-40 Riddim pack, asks for the EP-40's sounds or kit,
~~~

### 2.6 New, after line 30: web search, the preview and Copy for Claude

Insert after the `- **Keep it plain.**` line (and its blank line):

~~~
## Web search: official sources only

Search only when [ep133-guide.md](references/ep133-guide.md) does not answer an EP-133 question, and only these sources:

- teenage engineering's official EP-133 guide, `teenage.engineering/guides/ep-133` and its pages, and
- teenage engineering's official EP-133 OS release notes (the guide's what's new page and TE's own update and download pages).

Rules:

- ep133-guide.md is checked against the guide for OS 2.5. When a search result disagrees, the guide file wins, unless the result is an official release note for a newer OS.
- Label anything from an OS newer than 2.5 as **"not yet in Arc's checked guide"** (with the OS version), and tell the user to check it on their device.
- Never give a combo from a forum, Reddit, YouTube, Discord or a blog as fact. If only those have it, say it isn't in the official guide. Mention a community claim only when the user asks, marked as unverified.
- Cite the page you used. Don't search for Arc's features (this skill and the user's screen are the source) or for sounds and slots (the user's list and factory-sounds.md are the only sources).

## Preview a card (the arc connector)

When the **arc** connector is on, its `show_beat_card` tool takes a card's text and shows it in the chat as a step grid with group tabs, mute and solo, tempo and swing, and a **Play** key. It plays synthesized drums chosen by each row's label, not the user's sounds. Errors show with their line numbers, and the user can ask you to change the card from there. After a card passes `check`, offer the preview in one line. It is a **preview only**: it sends nothing to Arc or the EP-133, and Arc can't import the card. In a client that can't show apps (Claude Code), the tool returns a text summary instead.

## What Arc copies for Claude

Arc's **Copy for Claude** puts plain text on the clipboard for the user to paste here. It starts with a line naming what it is and the Arc version, and can hold:

- **The pads** of a project (from its **Pads** sheet, on the device or in a backup): an `ARC BEAT 1` card with only `sound` lines, one section for each group (`sound A7 12 Kick`), and a `# no sound on: D7 D8` comment for the empty pads. It has no grid rows: it is the kit, not a beat. Pad labels follow Arc's pad order setting, and the text says so.
- **A sound list** after the card's fence, or on its own (a backup's **Contents**): `My EP-133's sounds (slot name), from …:` and one `slot name` line for each sound. Long lists are cut, with a `#` line saying how many were left out.
- **A comparison** of two backups (the **Compare** screen): sounds and projects added (`+`), removed (`-`) and changed (`~`), with a changed project's pads under it.

Treat the pads card as the user's kit: keep its `sound` lines for the pads you use, and write rows for them. `check --sounds` reads the whole pasted text as the sound list.
~~~

### 2.7 Line 105, BUILD step 2

Five replacements inside the line:

1. Find `Ask them once to open Live tools in Live, choose the pattern, tick **With my sound list** under CLAUDE, use **SHARE** and send it here (see [arc-app.md](references/arc-app.md)). You then get their real pad names and, after the card, their **sound list** (one `slot name` line per sound).` and replace with `Ask them once for Arc's **Copy for Claude** on a project's **Pads** (Device → the project → Pads, or a backup's Contents → the project → Pads) and to paste it here (see [arc-app.md](references/arc-app.md)). You then get each pad's sound as a `sound` line and, after the card, their **sound list** (one `slot name` line per sound).`
2. Find ` Say the picks are by category, not by ear, and suggest tapping **Get** on the Factory sounds row in Live tools so the next share carries real names.` and replace with ` Say the picks are by category, not by ear.`
3. Find `(the EP-133's; the EP-40 Riddim's when the share says so)` and replace with `(the EP-133's; the EP-40 Riddim's when the user says the device holds that pack)`.
4. Find `*these are the factory sounds; if you changed the sounds in those slots, Arc shows what's on them and you can untick the change.*` and replace with `*these are the factory sounds; if you changed the sounds in those slots, load the ones you want instead.*`
5. Find `or ask for the list (**SHARE** with **With my sound list**). Arc's import sheet flags such pads in a **SILENT PADS** block and lets them pick a sound there with **PICK SOUND**; mention that when you write a melody or bass for the upper groups.` and replace with `or ask for the list (**Copy for Claude** on the project's Pads). That text names the empty pads in a `# no sound on:` comment; mention it when you write a melody or bass for the upper groups.`

### 2.8 Line 109, BUILD step 4

1. Find `the user copies it and taps PASTE.` and replace with `the user copies it from there.`
2. Find `name it `<name>.arcbeat.txt`: Arc opens a .txt or .md card when it is shared to Arc, opened with it, or picked by holding PASTE.` and replace with `name it `<name>.arcbeat.txt`.`
3. Find `Arc always puts an import in the group's next free pattern, and a number would suggest it overwrites one.` and replace with `a number would suggest it replaces one of their patterns.`

### 2.9 Lines 114 to 118, BUILD step 6 (how to use it)

Replace lines 114 to 118 (from `*Copy the card, then in Arc: Live tools → PASTE BEAT → IMPORT.` to the bullet ending `for when the user asks.`) with:

~~~
   *To play it on the EP-133: load the sound lines' slots onto the pads (SND-4), set the tempo (SEQ-26), then record or step the rows in (SEQ-1, SEQ-8). Arc can't import cards yet.*
   - With the arc connector on, offer the preview in the same breath: *Want to hear a rough version first? I can show it as a playable grid.* Then call `show_beat_card` with the card.
   - Only if the card has FX or pad lines, add one line: *The fx, send, comp and pad lines are settings to make on the device by hand (FX-1 to FX-9, SND-6 to SND-12).*
~~~

### 2.10 Line 128, a card of scenes

Find the whole line, starting `- **Say how to play it in Arc** in two lines:` and ending `Patterns and scenes stay in Arc.`

Replace with:

~~~
- **Say how to build it on the EP-133** in two lines: *Make each scene by committing a copy of the one before and changing it (SEQ-24), then arrange them in song mode (SEQ-25); a chain step with x2 is that scene twice in the song list.* Arc has no scenes or chain, and can't import the card.
~~~

### 2.11 Line 129, "Continue this idea"

1. Find `(it imports after their existing scenes, with no `chain` line so their chain stays; they add the new scenes to the CHAIN row with + while each is showing)` and replace with `(with no `chain` line; they add the new scenes to their song list by hand)`.
2. Find `(it imports as new scenes next to the old ones, and SET CHAIN gives them the whole order)` and replace with `(the `chain` line gives them the whole order)`.
3. Find ` In (a), give the first scene every group it needs, since a group it leaves out keeps what the scene playing has.` and replace with ` In (a), give the first scene every group it needs.`

### 2.12 Line 134, ANALYSE step 1

Find:

~~~
If the user describes a beat without one, ask them to use **SHARE SCENE** or **SHARE** under CLAUDE in Live tools and send it to you (**SHARE CHAIN** for a whole arrangement).
~~~

Replace with:

~~~
Arc can't copy a pattern out yet. If the user describes a beat without a card, write the card from their description and ask them to confirm it, or ask them to paste a card from earlier. For their pads and sounds, ask for **Copy for Claude** on the project's Pads.
~~~

### 2.13 Lines 143 and 144, ANALYSE

1. Line 143: find `- **a card of scenes** (Arc's **SHARE CHAIN**, with` and replace with `- **a card of scenes** (with`.
2. Line 144: find `(Arc writes it when it knows the pads)` and replace with `(Arc's Copy for Claude writes it for the pads that have no sound)`.
3. Line 144: find `or, with no list, ask them to share again with **With my sound list**. They can also pick a sound on Arc's import sheet (**SILENT PADS**, **PICK SOUND**).` and replace with `or, with no list, ask for **Copy for Claude** on the project's Pads, which ends with the list.`

### 2.14 Line 147, ANALYSE step 5

1. Find `(unchanged ones are harmless: Arc leaves those pads alone and shows the FX as no change)` and replace with `(unchanged ones are harmless)`.
2. Find `End with the one-line paste reminder from BUILD step 6; pasting adds a new pattern and does not overwrite theirs.` and replace with `End with the one-line reminder from BUILD step 6.`

### 2.15 Lines 154 and 155, LEARN

1. Line 154: find `If the user has no device, do the same with Arc, which mirrors it.` and replace with `If the user has no device, Arc's Live can play the pads and KEYS from a backup's sounds; it has no sequencer to record on.`
2. Line 155: find the whole line, starting `- **Arc is the practice partner.**` and replace with:

~~~
- **The exercise is a card.** Each lesson has one: preview it with `show_beat_card` when the arc connector is on, then play it on the EP-133. The lessons' "In Arc" lines describe screens Arc doesn't have yet; skip them (see "Other references" at the end of this page).
~~~

### 2.16 Lines 162 and 164, PUNCH-IN TIPS

1. Line 162: find `Arc has the EP-133's twelve punch-in effects: **hold FX and press pads**, and lift the pad to let go (on the device the combo is `FX-6`: hold FX and press pads with PLAY running; the pads respond to pressure, and several can be stacked).` and replace with `The EP-133 has twelve punch-in effects: `FX-6`, hold FX and press pads with PLAY running, and lift the pad to let go (the pads respond to pressure, and several can be stacked). Arc doesn't have them.`
2. Line 164: find `| Pad | Arc's name | What it does | A good moment |` and replace with `| Pad | Name | What it does | A good moment |`.

### 2.17 Lines 193 and 202, Scripts and Mistakes

1. Line 193: find `When a user pastes an error message from Arc, treat it like the script's: it names a line and a reason.` and replace with `When a user pastes an error from the arc connector's preview, treat it like the script's: it names a line and a reason.`
2. Line 202: find `Arc cuts it to 40 and warns.` and replace with `it is cut to 40, with a warning.`

### 2.18 Lines 223 and 225, the References table

1. Line 223: find `100 official OS 2.5 combos by section, with steps and sources. Generated; do not edit |` and replace with `100 official OS 2.5 combos by section, with steps and sources. Generated from Arc's guide data (`cd web && npm run gen:skill` in the Arc repo); do not edit |`.
2. Line 225: find `including SHARE, SHARE CHAIN, With my sound list, PASTE BEAT, the CHAIN row, and the scenes, sounds, FX and pad shaping on the import sheet |` and replace with `including Copy for Claude, Live, and what Arc does not do yet (no card import, no sequencer) |`.

## 3. references/arc-app.md

Almost every section describes screens Arc doesn't have, so replace the whole file. What goes, by line:

| Lines | Claim | Today |
|---|---|---|
| 3 | `https://arc-ko.vercel.app` | https://arc-pi-mauve.vercel.app |
| 5 | The web app has the sequencer's core with no screens; Android has everything below | Both have the same screens; Android adds REC and background transfers |
| 9 | The tag lists Settings; tap the connection key to connect, hold to disconnect | The tag holds Backups, Live and Device (long press: debug); Settings is the gear. A tap on the connection key connects, and disconnects while connected |
| 21 | Live plays the factory sounds without a read | Live shows the last read (Offline); there is no factory kit |
| 23 | KEYS as a piano | The 12 pads only |
| 24 to 25 | EDIT, function keys SOUND, PROJECT, TEMPO, FX | None |
| 28 to 63 | Patterns, RECORD, ERASE, UNDO, STEP, TIMING and swing, scenes, CHAIN, FX, SAMPLE, TAKE | None. REC records takes (Android) |
| 71 | Settings: piano size, haptics, SAMPLE takes | Theme, auto-connect, screen on, backups kept, pad numbering, note names, forget learned names, sound copies, debug log, version |
| 73 to 116 | The Claude row, SHARE, PASTE BEAT, card files, the kit switch, Get the skill, Learn with Claude, the import sheet, IMPORT | None. Copy for Claude on Pads, Contents and Compare |

Replace the whole file with:

~~~
# Arc, screen by screen

What Arc does, written so you can explain it to a user. Arc is a free, open-source backup librarian and companion for the teenage engineering EP-133 K.O. II. It runs as an Android app and in the browser (Chrome, Edge and other Chromium browsers, at https://arc-pi-mauve.vercel.app; Safari and iPhone browsers get the library without the device). It talks to the EP-133 over USB-C. It has no account and no server; nothing leaves the phone unless the user shares it. Add `?demo` to the web address for a simulated EP-133 (12 sounds, 3 projects) with its own library, so someone without a device can try it.

The web app and the Android app have the same screens. Android also has **REC** in Live and keeps transfers running with the phone locked; in the browser, keep the tab in front during a backup or restore.

**What Arc does not do (yet):** it has no pattern recorder, step sequencer, tempo or swing of its own, scenes, chain, FX, punch-ins or sampling, and it **cannot read or import an ARC BEAT card**. Don't tell the user to tap SHARE, PASTE BEAT or IMPORT: those don't exist. A card is played on the EP-133 by hand, or previewed with the arc connector's `show_beat_card`.

## The top bar

The tag at the top left names the section; tap it for **Backups**, **Live** or **Device** (a long press opens the debug log). Arc opens on Live, and Back on any other section returns to it. Then come an orange **●** (back up), the connection key (green with a dot while connected, where a tap disconnects; navy with a ring when not, where a tap connects), **?** (tags every control on screen with what it does) and the **settings** gear. A **GUIDE** tab on the left edge slides in the shortcut guide. Long-press any icon for its name.

## Backups

Back up every sound and project on the device to a `.pak` file, restore a whole backup or only some projects with the sounds they use, keep a library of backups with names and notes, share or save them, and import `.pak` files made by the official Sample Tool. A backup's sheet has **Contents** (its sounds, which play on the phone and save as WAV, and its projects, each with **Pads**), **Compare with another backup**, and **Compare with device** in the restore sheet. **Search** finds sounds by name across every backup. On Android the library is also kept in Documents/arc; in the browser, in the browser's storage, with an optional library folder (Chromium on a computer) or **Export library**.

## Device

Browse the connected device: a storage meter, **Sounds** grouped by hundreds of slots (find by name or number, **Play** on the phone, details) and **Projects** (the sounds each uses, and its **Pads**). **Add samples** loads WAV files into sample slots, each with **Trim**. Restores and uploads change the EP-133; browsing doesn't.

## Live

Live mirrors the EP-133 as the user plays it and works without it. It shows the four groups (A-D) as pads printed as on the device, `7 8 9 / 4 5 6 / 1 2 3 / . 0 ENTER`, either all four or one big group with A-D keys under it (the browser starts on one group, Android on all four). It reads the sound names and the active project's pads once, then only listens: it changes nothing on the device. Without the device it shows the last read, marked **Offline**.

- Tap a pad to hear its sound on the phone, connected or not. Pads sound while held, as in the EP-133's gate mode, and up to 8 play at once, so held fingers make a chord.
- The word under the grid switches **PADS** and **KEYS**: in KEYS the 12 pads are notes of one sound, named in solfège (DO RE MI) or letters (Settings), with the scale and octave under the keys and the key in Live tools.
- Notes from the device light the pads, brighter with velocity. Play/stop and tempo follow the device's MIDI clock when its clock out is on (SHIFT + ERASE, then 102 and ENTER).
- Arc learns which pad is which from pad presses on the device (community notes, not the official guide), and has a setting for how project files number the pads.
- **Live tools** (the hatched strip on the right edge): the view switch, **Follow** (switch to the group just played), the KEYS strip and key, pad numbering, and notes on what is official.
- **REC** (Android): records the pads and keys played on the phone into a stereo WAV take, as heard. **Live tools → Takes** plays, shares, saves or deletes a take, or sends it **To EP-133** through the upload sheet. A take holds nothing the EP-133 itself plays.

## The Guide

100 EP-133 key combinations in tabs with search, each with its keys drawn like the device, and a link to the official guide section. It is the source of [ep133-guide.md](ep133-guide.md): the same entries.

## Settings

Theme, connect automatically, keep the screen on in Live, how many backups to keep, Live's pad numbering, note names on the keys, forgetting learned pad names, the space Arc's pad sound copies take, the debug log and the version.

## Copy for Claude

Three places copy plain text for a chat with Claude. The user taps **Copy for Claude**, then pastes into the chat:

- A project's **Pads** sheet (Device → a project → Pads, or a backup's Contents → a project → Pads): the pads as an `ARC BEAT 1` card of `sound` lines only, a `# no sound on:` comment for the empty pads, then the sound list.
- A backup's **Contents**: its sound list alone.
- The **Compare** screen, once a comparison is done: what was added, removed and changed between the two backups.

Ask for the Pads text when you build a beat or suggest sound swaps; without it you don't know their sounds.

## How to tell the user

1. To share their kit: *In Arc, open Device (or a backup's Contents), pick the project, tap Pads, then Copy for Claude, and paste it here.*
2. To use a card: *Load the sounds onto the pads in SOUND mode (SND-4), set the tempo (SEQ-26), then record or step the rows in (SEQ-1, SEQ-8).* With the arc connector on, offer `show_beat_card` first to hear a rough version.
~~~

## 4. Other references (not patched here)

These describe the same missing screens. Until they are rewritten, the simplest fix is one line at the top of each, after its title: *Arc can't import cards and has no sequencer yet: read "In Arc", SHARE, PASTE and IMPORT below as notes for a later Arc, and give the EP-133 steps instead.*

- **lessons.md**: 7, 11, 24 (card sound choice), 48, 73, 99, 124, 150 ("Arc's exports"), 175, 219, 244 (piano), 276, 325, 351.
- **beat-card.md**: 3, 22, 30, 74, 78, 89, 91 and 92 ("Chains in Arc"), 101, and the import section.
- **analysis.md**: 3, 34, 50 (SHARE CHAIN), 87 and 88, 118 (the import sheet).
- **ep40-kit.md**: 3 and 6 (the kit switch and the share sentence), 51 (Arc's offline Live plays P01).
- **factory-sounds.md**: 3, 11 (Arc's Live with the EP-133 kit), 20 (SILENT PADS).
- **scripts/beatcard.py**: the `--sounds` warning ends "which Arc will use instead" (a moved slot); Arc doesn't import cards, so it could read "use that slot instead".
