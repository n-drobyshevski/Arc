# ARC BEAT card, version 1

A plain-text beat that Arc can copy out and read back in, and that Claude can read and write. One card holds one group's pattern, or one pattern each for up to four groups (a scene).

```
ARC BEAT 1
name Lazy boom bap
tempo 92
swing 58

[A] bars 1 step 1/16
A7 kick      | X... ..x. X... .... |
A9 snare     | .... X... .... X..o |
A4 hat       | x.x. x.x. x.x. x.xo |
notes
A9 at 1.4.4+6 vel 50
A1 at 1.1.1 note C4 gate 1/8
```

## Reading rules (Arc and the skill's script follow them the same way)
1. Everything before the first line that starts with `ARC BEAT` is ignored. So are any chat text and Markdown fences around it. Reading stops at a line that is just ``` or `END`, or at the end of the text.
2. `ARC BEAT 1` is the version. A higher version is refused with "made by a newer Arc".
3. Blank lines are ignored, and so is a comment: a `#` at the start of a line or after a space or tab, and everything after it. A `#` inside a word stays, as in `note C#4`.
4. Keywords aren't case-sensitive. Pad labels, `X`/`x` and note names are.

## Header (all optional, any order, before the first section)
| Line | Meaning | Range |
|---|---|---|
| `name <text>` | a title, up to 40 characters. A longer one is cut to 40, with a warning; an empty one is ignored, with a warning | |
| `tempo <bpm>` | the BPM the beat is meant for. Arc offers to set its tempo to this | 40–240, whole or one decimal |
| `swing <n>` | how late the grid's odd steps play, as on the device's TIMING | 50–75, 50 straight, default 50 |

Swing applies only to grid rows whose step is 1/8 or 1/16, as on the device. A row's step k plays at `k * stepTicks + offset`, where odd k get `offset = round((swing - 50) * stepTicks / 50)`. Ties round up, the same as `Steps.tickOf`. Notes in the `notes` list are never swung.

## Sections
`[G]` or `[Gnn]` starts a group's pattern: G is A–D, and nn is a pattern number 1–99, written as a hint. Each group appears at most once.
Options on the same line, in any order:
- `bars <n>`: 1–99, default 1.
- `step <s>`: one of `1/8 1/16 1/32 1/8T 1/16T`, default `1/16`. In ticks that is 48, 24, 12, 32 and 16, with 96 ticks a beat and 384 a bar.

### Grid rows
`<pad> [sound name] | <steps> |`
- **Pad:** the group letter followed by `.`, `0`, `E` (ENTER) or `1`–`9`, as printed on the pads. The group must match the section's.
  - The keypad from top to bottom: 7 8 9 / 4 5 6 / 1 2 3 / . 0 E.
  - `AENTER` is also accepted.
  - Offsets: `.`=0, `0`=1, `E`=2, `1`=3 … `9`=11.
- **Sound name:** optional free text between the pad and the first `|`. It's only for reading; a pattern plays whatever sound is on the pad.
- **Steps:** the characters after the first `|`. Spaces and further `|` are ignored. There must be exactly `bars * 384 / stepTicks` steps (16 a bar at 1/16). The error names the row and bar.

| Character | Meaning |
|---|---|
| `X` | hit, velocity 127 (accent) |
| `x` | hit, velocity 100 |
| `o` | hit, velocity 64 (ghost) |
| `1`–`9` | hit, velocity `14 * n` (14 … 126) |
| `-` | holds the hit before it one more step (the gate grows by a step); a `-` with no hit before it on the row is an error |
| `.` | rest |

- A hit's gate is one step, plus one step for each `-` after it.
- A pad may have more than one row, for example a second row of ghosts.

### Notes list
After a line that is just `notes` (inside a section), each line is one note:
`<pad> (at <bar>.<beat>.<sixteenth>[+n|-n] | t <tick>) [vel <1-127>] [gate <ticks|1/4|1/8|1/16|1/32|1/8T|1/16T>] [note <C-1..G9> | semi <-127..127>]`
- `at 1.1.1` is the pattern's first tick; the bar counts from 1, and the beat and the sixteenth are 1–4. `+n`/`-n` moves the note by n ticks, so `at 1.2.3+8` is tick 96 + 48 + 8 = 152. `t` is the absolute tick.
- **Defaults:** vel 127 and gate 1/16. With no `note` or `semi`, the note is a pad hit.
- **KEYS notes:** `note C4` is MIDI 60, KEYS mode's root, so `semi = midi - 60`. Use them for melodies and bass played in KEYS mode on that pad's sound.
- The tick must fall inside the pattern (0 to `bars*384 - 1`).

### Sounds
A line `sound <pad> <slot> [name]` inside a section says which sound that pad should play. Use it to choose the kit, not just the rhythm.
- **Pad:** written as in grid rows, and it must belong to the section's group. A pad can get a sound line even if it has no notes, for example to set up a kit.
- **Slot:** the EP-133's sound slot, 1–999.
- **Name:** optional. It is the sound's name as the user's list gives it, everything after the slot up to a comment. With a name, Arc checks that the slot holds that sound, which guards against a slot that changed.
- **Where:** anywhere in the section, before or after the grid rows. A sound line after `notes` still counts as a sound line, not a note.
- A second sound line for the same pad replaces the first, with a warning.
- **Errors:** a pad from another group, or a slot outside 1–999.
- **Picking slots:** use only slots from the user's sound list, which Arc adds after the card when it shares. Without a list, write no sound lines and say which kind of sound fits each pad. The factory ranges are kicks 1–99, snares 100–199, hats 200–299, percussion 300–399, bass 400–499 and melodic 500–599, but the user may have changed them.

## Limits and checks
- At most 2048 notes in a pattern; more is an error.
- Two hits on the same pad at the same tick count as one: the louder is kept, with a warning.
- Unknown header words, section options and note options give a warning, never an error, so newer cards stay readable.
- Every problem carries its line number and a short reason, which the user can paste back to Claude.

## Writing rules (Arc's export, so a card read back gives the same card)
- The header gets `name` (the pattern's place, e.g. `P01 S02`), `tempo` (Arc's tempo) and `swing`. Swing is the TIMING swing when every grid note sits on that swung grid, otherwise 50.
- Groups with notes come in order, as `[Gnn]`. A scene export holds the 4 playing patterns, skipping blank ones; a pattern export holds just that one.
- `step` is the first of 1/16, 1/16T, 1/32 that puts every pad hit on the grid. When none does, 1/16 is used and the hits that don't fit go to `notes`.
- **Sounds:** right after the section line, a `sound` line for each pad the section's notes use whose slot Arc knows, in keypad order, with the sound's name when Arc knows it. Pads that only appear in `notes` get one too.
- **Rows:** one for each pad that has grid hits, in keypad order (7 8 9 4 5 6 1 2 3 . 0 E), followed by Arc's sound name for that pad when it knows one.
  - A note goes on a row when it is a pad hit (no semi), on the swung grid, its velocity is 127, 100, 64 or 14·n, its gate is a whole number of steps, and its holds don't run into the next hit on the row. Otherwise it goes to `notes`, written exactly.
  - Steps are grouped by 4 with spaces, with `|` between bars.
- **Notes list:** written with `at` (+/- for leftover ticks), plus `vel`, `gate` (in ticks unless it is exactly a listed value) and `note` (by name), each only when it isn't the default.
- **Tidy option (on by default when sharing):** before writing, velocities are rounded to the nearest of 127/100/64 and gates under a step become a step, so a phone-played pattern reads as rows. The card says so in a comment: `# tidied: velocities and short gates rounded`.

## Import (Arc)
- Each section's pattern goes into its group's next free pattern slot (`SceneOps.nextFree`). Nothing is overwritten.
- A card with more than one section also adds a new scene pointing at the new patterns; groups the card doesn't have keep pattern 1's number from the scene playing.
- The tempo is offered, not forced.
- **Sound lines:** each one is matched to the user's sounds: the EP-133's list when connected, or the last read or factory pack offline.
  - A slot that holds the named sound (same name, ignoring case, spaces and ".wav") is used.
  - When the name doesn't match the slot, or the slot is empty, Arc looks the name up and uses the slot that holds it. Failing that, the line is skipped with a warning.
  - A pad that already plays the sound is left alone.
- **Applying sounds:** connected, the chosen sounds are written to the EP-133's pads in the active project, and those pads' own settings reset to the sound's. Offline, they become Arc's offline pad changes, which go to the device on reconnect. The import sheet lists each change with a tick box, all ticked by default.
- One undo removes all of it, the pads' sounds included.

## Sound list (Arc's share, outside the card)
When sharing, Arc can add the user's sounds after the card's closing fence, so Claude can choose from them. The list starts with a line `My EP-133's sounds (slot name), from <the EP-133 | the last read | the factory pack>:`, followed by one sound per line as `<slot> <name>` in slot order. It isn't part of the card, and readers ignore it, because they stop at the card's closing fence.

