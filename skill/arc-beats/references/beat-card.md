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

## Effects (header lines, all optional)
These lines set the project's FX in Arc: the same master effect, sends, compressor and sidechain as Arc's FX sheet. Like the header, they come before the first section. Knob values are percentages, 0–100, as the knob's travel.
| Line | Meaning |
|---|---|
| `fx <type> [x] [y]` | The master effect: `none`, `delay`, `reverb`, `distortion`, `chorus`, `filter` or `compressor`. X and Y default to 50. Their meaning depends on the type: delay length and feedback; reverb size and colour; distortion drive and colour; chorus rate and feedback; filter cutoff (below 50 low-pass, above 50 high-pass, 50 open) and resonance; compressor drive and speed |
| `send <G> <0-100> [<G> <0-100> ...]` | How much of each group, A–D, goes to the effect. Groups the line leaves out are set to 0 |
| `comp off` or `comp <drive> <speed>` | The master compressor after everything: off, or on with drive and speed |
| `sidechain off` or `sidechain <pad> <groups> [length] [shape]` | A pad that ducks whole groups each time it plays, such as `sidechain A7 BC 25 70` (A7 ducks B and C). Length and shape default to 30 and 50. The pad's own group may be in the list |

- Each kind of line is independent: a card with only `fx` and `send` leaves the compressor and sidechain as they are.
- **Errors:** an unknown effect type, a value outside 0–100 (whole, or with one decimal), a group outside A–D, a bad pad, a sidechain with no groups, or an effect line after the first section.
- **Warnings:** words left over at the end of a line are ignored.
- **Repeats:** a second line of the same kind replaces the first, with a warning. `send` lines are the exception: they add up, and a group given twice keeps its later value.
- **Where they play:** the FX are Arc's, per project, and play on the phone. The EP-133's own FX settings are neither read nor written.

### Pad shaping (inside a section)
`pad <pad> [pitch <n>] [level <n>] [pan <n>] [attack <n>] [release <n>] [mode oneshot|key|legato]` shapes how a pad plays its sound, as the pad sheet's knobs do (Arc's PadSettings). The pad is written as in grid rows and must be in the section's group. At least one setting must be given, each with its value, in any order. The ranges are the pad sheet's own:

| Setting | Write | Range | Meaning |
|---|---|---|---|
| `pitch` | semitones, whole or up to two decimals, `+` allowed | -12 to 12, default 0 | 0 is the sound's own pitch, plus is higher: `pitch -7` is a fifth down, `pitch 3.5` a little over a minor third up. The sheet's fine step is 0.1 |
| `level` | whole number | 0–100, default 100 | The pad's volume, 100 full |
| `pan` | whole number | -16 to 16, default 0 | Negative is left, positive right, 0 the centre: `pan -4` is L4 on the sheet |
| `attack` | whole number of envelope ticks | 0–255, default 0 | How slowly the sound fades in. Every tick is about 10 ms (not verified on the device) |
| `release` | whole number of envelope ticks | 0–255 | How long the sound takes to fade out after the pad is let go. It is heard in `key` and `legato` only: a `oneshot` pad plays to the end (release 255), so to shorten a hat or an 808 write `mode key release 20` |
| `mode` | `oneshot`, `key` or `legato` | | How the sound plays (SND-9 in ep133-guide.md). `oneshot` is monophonic and plays the whole sample. `key` is polyphonic, so copies of the sound overlap, and fades out by the release. `legato` is monophonic and continues from the current position when the note changes while held. Leaving `oneshot` sets the release to 15 (the device's key default) unless the line gives `release` |

- A second `pad` line for the same pad merges into the first, later values winning, with a warning. A setting written twice on one line keeps the later value.
- **Errors:** a pad that isn't one or is in another group, a line with no setting, a setting with no value, or a value that isn't a number in its range (or a mode that isn't one of the three).
- **Warnings:** an unknown setting is ignored.
- Connected, the shaping is written to the EP-133's pad; offline, it becomes Arc's offline pad setting.

## Limits and checks
- At most 2048 notes in a pattern; more is an error.
- Two hits on the same pad at the same tick count as one: the louder is kept, with a warning.
- Unknown header words, section options and note options give a warning, never an error, so newer cards stay readable.
- Every problem carries its line number and a short reason, which the user can paste back to Claude.

## Writing rules (Arc's export, so a card read back gives the same card)
- The header gets `name` (the pattern's place, e.g. `P01 S02`), `tempo` (Arc's tempo) and `swing`. Swing is the TIMING swing when every grid note sits on that swung grid, otherwise 50. The project's effect lines follow (see "FX in Arc's share").
- Groups with notes come in order, as `[Gnn]`. A scene export holds the 4 playing patterns, skipping blank ones; a pattern export holds just that one.
- `step` is the first of 1/16, 1/16T, 1/32 that puts every pad hit on the grid. When none does, 1/16 is used and the hits that don't fit go to `notes`.
- **No sound:** when Arc knows the pads, a comment `# no sound on: <pads>` right after the header lists the used pads with no sound (see "FX in Arc's share").
- **Sounds:** right after the section line, a `sound` line for each pad the section's notes use whose slot Arc knows, in keypad order, with the sound's name when Arc knows it. Pads that only appear in `notes` get one too. The `pad` lines (see "FX in Arc's share") come after them.
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
  - A slot that holds the named sound (same name, ignoring case, spaces and ".wav") is used. A name like `200.pcm` on its own slot 200 counts as no name: the slot is used if it is in the list, whatever it is called there (the factory pack may have named it).
  - When the name doesn't match the slot, or the slot is empty, Arc looks the name up and uses the slot that holds it.
  - Failing that, a slot that is in the list under an unnamed name (`200.pcm`, see "Sound list") is accepted by its slot, whatever name the card gave: it is a factory sound whose name can't be checked. The sheet shows the device's name and "Card says <name> · name not checked".
  - Failing that, the line is skipped with a warning.
  - A pad that already plays the sound is left alone.
- **Applying sounds:** connected, the chosen sounds are written to the EP-133's pads in the active project, and those pads' own settings reset to the sound's. Offline, they become Arc's offline pad changes, which go to the device on reconnect. The import sheet lists each change with a tick box, all ticked by default.
- **FX and pad shaping:** the import sheet has an FX block, which lists the effect, sends, compressor and sidechain as old → new, with an APPLY FX switch that is on by default. It also lists each pad's shaping as old → new, ticked, next to the SOUNDS block. Importing applies what is switched on and ticked. A pad's new sound goes on first, so its shaping lands on the new sound (a sound change resets the pad's own settings). APPLY FX replaces only the kinds of FX the card has a line for.
- One undo removes all of it: the pads' sounds, the FX and the pad shaping.

## FX in Arc's share
When the project's FX aren't the default, Arc's share writes them as the effect lines above, right after the `swing` line: `fx`, then `send` for the groups above 0, then `comp` and `sidechain` when they are on. The effect line is written whenever any of them is (`fx none` when only a compressor or sidechain is on). Knobs are written as whole percents, and a sidechain always with its length and shape. With no effect, no send and the compressor and sidechain off, nothing is written.

When Arc knows the pads (Live has read them), the share also carries one comment line right after the header, before the first section, naming the pads the card's notes use (pad hits and KEYS notes) that have no sound on the user's EP-133 and get none from a `sound` line: `# no sound on: C7 D7`, in keypad order for each group. Readers ignore it, as they ignore any comment; it tells you those pads are empty, so their notes would play nothing. A card Arc can't tell (pads not read) has no such line.

The pad shaping of each pad the section's notes use is written as `pad` lines right after the section's sound lines, in keypad order. A line holds only the settings that differ from the pad's defaults, in the order `pitch level pan attack release mode`: pitch not 0, level not 100, pan not 0, attack not 0, mode not `oneshot`, and release when it isn't what the mode starts with (255 for `oneshot`, 15 for the others). A pad with nothing to write gets no line.

## Sound list (Arc's share, outside the card)
When sharing, Arc can add the user's sounds after the card's closing fence, so Claude can choose from them. The list starts with a line `My EP-133's sounds (slot name), from <the EP-133 | the last read | the factory pack>:`, followed by one sound per line as `<slot> <name>` in slot order. It isn't part of the card, and readers ignore it, because they stop at the card's closing fence.

The EP-133 lists its factory sounds without names: a slot's name is its file name, `200.pcm` for slot 200. When Arc has the factory pack (**Get** on the Factory sounds row in Live tools) it lists the pack's name for those slots instead, so they read as `200 HH CLOSED`. When some listed name is still like that, Arc adds one line right after the header: `Names like 200.pcm are factory sounds the EP-133 keeps without a name. By slot: kicks 1-99, snares 100-199, hats 200-299, percussion 300-399, bass 400-499, melodic 500-599.` Readers skip it, as they skip the header.

