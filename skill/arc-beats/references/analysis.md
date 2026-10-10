# Analysing a beat

How to read a card the user copied out of Arc, what to say about it and how to suggest changes. The numbers come from `scripts/beatcard.py analyse`; the words below say what they mean. A number is a prompt for a remark, never the remark itself: say what it sounds like.

```
python3 scripts/beatcard.py check beat.txt      # is the card valid? fix errors first
python3 scripts/beatcard.py analyse beat.txt    # add --json for the raw fields
python3 scripts/beatcard.py grid beat.txt       # a picture of the steps to look at
```

If code execution is not available, read the card yourself with the same checklist and say your numbers are estimates.

## What the script reports

| Field | Meaning | How to read it |
|---|---|---|
| `pad_hits`, `keys_notes` | Notes on the pads, and notes played in KEYS mode (pitched, from the `notes` list) | Hits are the drums. KEYS notes are bass or melody. No KEYS notes means no pitch: ask if it is meant to be a drum loop |
| `hits_per_bar` | Pad hits in each bar | Equal numbers mean the bars repeat; a higher last bar is often a fill |
| `density_pct` | Share of the 16th slots of a bar where any pad plays | Under 40 sparse, 40 to 70 normal, over 80 busy. Trap and drill sit low, jungle and footwork high |
| `pads.*` | Per pad: `name`, `role`, `name_assumed`, `hits`, `per_bar`, `velocity`, `longest_gap`, `positions` | The kick usually has the fewest hits, hats the most |
| `velocity` | `min`, `max`, `mean`, `stdev`, `distinct`, and counts of `ghosts` (70 and under; `o` is 64), `normal` and `accents` (120 and up, `X`) | `stdev` under 5 with one `distinct` value is machine-flat. Over 15 is very dynamic |
| `roles.*.slots` | 16 characters showing which 16th slots of a bar a kind of sound (kick, snare, clap, hat ...) plays, all bars folded together | Slots 0 4 8 12 are the beats, 2 6 10 14 the "ands". This is where "the snare is on 2 and 4" comes from |
| `syncopation` | `score` (bar average, hats, cymbals and percussion left out), `label`, `by_pad`, `counted_pads` | Up to 2 straight, up to 6 some syncopation, over 6 syncopated. `by_pad` shows who carries it |
| `longest_gap` | Longest stretch with nothing playing, in 16th steps, and where it starts. Loops round | Over 4 steps is a deliberate hole, 8 a breath, none means no space |
| `swing` | `header`, `applies`, `measured`, `swung_hits` | If `applies` is false the swing line does nothing. `measured` near `header` means the grid obeys it |
| `features` | Recognised patterns: four on the floor, backbeat, half-time backbeat, offbeat hats, eighth or sixteenth hats, ghost notes, syncopated kick, 3-3-2 pulse, swung | Vocabulary, not verdicts |
| `variation` | `distinct_bars`, `identical_bars`, `last_bar_busier` | One distinct bar in four is a plain loop. A busier last bar is a fill |
| `similar_to` | The closest genre recipes in genres.md (drums 70%, tempo 20%, swing 10%) | 80 and up: that style. 60 to 80: a cousin. Say "closest to" and name the difference |

Pads with no sound name get the assumed kit's names (`name_assumed`). Say so ("I assumed A7 is your kick"), or better, ask the user to copy the pattern from Arc so the card carries their names.

## The checklist

Go in order, a sentence or two each, and start with something that works.

1. **Groove and feel.** Where is the backbeat (snare or clap on 2 and 4 is full time, only on 3 is half-time)? Where do the kicks land against it? Straight 8ths, 16ths or triplets? Name the closest style.
2. **Density.** Busy or sparse for the genre? Which pad adds the most? A beat that is full everywhere leaves no room for bass or vocal.
3. **Velocity.** A hat row of all `x` sounds like a machine. Suggest accents on the beats, ghosts between (`X x o`), a quiet hit before a loud one.
4. **Swing.** 50 is straight, 54 to 58 a light shuffle, 62 and up lazy. Swing moves only 1/8 and 1/16 grid rows; hits in the `notes` list are never swung, so a roll stays tight.
5. **Space.** Where does nothing play? Leaving out a kick on one beat, or the hats for half a bar, often beats adding a hit.
6. **Arrangement.** One bar on repeat? Beats change every 4 or 8 bars, with a fill in the bar before. Does the card use B, C, D (bass, chords, lead) or only drums?
7. **Tempo.** Does the BPM fit the style (genres.md)? A half-time genre at 70 can be felt as 140.

## Edits to propose

Two or three, not ten. Each is concrete (a pad, a step, a number) and says what it changes in the sound. Then return a complete new card in one fenced block and say in a line each what changed. Keep the user's pad names and tempo unless changing them on purpose. Remind them that pasting adds a new pattern and overwrites nothing.

Good edits are small: move or remove a kick; add a ghost `o` before a snare or lower the offbeat hats; change swing by 2 to 4 points; make the last bar a fill (more snare, hats stop, a roll in the `notes` list); double the length (`bars 2`) and change the second bar; add a bass or chord line in another group.

## Vocabulary

Give a short gloss the first time.

- **Four on the floor:** kick on every beat.
- **Backbeat:** snare or clap on 2 and 4. **Half-time:** snare only on 3, so it feels twice as slow at the same tempo.
- **Syncopation:** hits on the weak parts of the beat ("and", "a") against the pulse.
- **Ghost notes:** very quiet hits that add texture (`o`, velocity 64, or a low digit). **Accent:** a louder hit (`X`, 127).
- **Swing %:** how late the odd steps play. 50 straight, 66 a triplet shuffle, 75 the EP-133's limit.
- **Density:** how many of the available steps carry a hit.
- **Call and response:** one part asks and another answers in the gap.
- **Fill:** a short busy run at the end of a phrase leading into the next.
- **Variation every 4 or 8 bars:** change one thing at the end of a phrase so the loop does not stand still.
- **Tresillo (3-3-2):** a pulse split 3 + 3 + 2 sixteenths; it drives dembow, afrobeats and jersey club.
- **Gate / velocity:** how long a note sounds / how hard it is hit.
- **Quantise / free time:** snap notes to the grid / leave them where played.
- **Step / bar:** one cell of the grid (a 16th by default) / 4 beats, 16 steps at 1/16.

## A short reply

> The kick sits on 1, the "and" of 2 and 3, with the snare on 2 and 4: a classic boom bap backbeat, closest to the Boom bap recipe (87 percent). Swing is 58, lazy and right for 90 BPM. Two things hold it back: the hats are one volume, and the bars are identical.

Then the edits, then the new card.
