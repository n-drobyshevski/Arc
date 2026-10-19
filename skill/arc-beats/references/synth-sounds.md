# Synth sounds

A `synth` line describes a sound in words and numbers, and Arc makes it: `synth A7 kick decay 70 name 808_kick`. On import Arc renders it, uploads it into a free slot of the EP-133 and puts it on the pad, or, offline, keeps it in Arc until the device is connected. The format is in "Synth sounds" in [beat-card.md](beat-card.md); this page is how to use it well.

## When to write which line

- **A `sound` line** when the user's sound list (or, without a list, the factory pack in [factory-sounds.md](factory-sounds.md)) has a sound that fits. Their own samples come first.
- **A `synth` line** when nothing there fits: an empty group B, C or D, a lead on D7, a real 808 sub, an acid bass, a pad or a chord stab, a riser, a dub zap. Or when the user asks for designed or made sounds.
- **Both lines on one pad** when you are not sure the sound is there: the `sound` line wins when Arc finds it on the EP-133, and the synth is made only when it doesn't.
- A synth line names no slot, so it never breaks the rule "never name a sound that is not in the list". It is the honest way to give a pad a sound the list lacks.

## Rules

- **One line a sound**, right after the section line and its `sound` lines, before `pad` lines, grid rows and `notes`. Older Arc reads a synth line there as only an unknown word (a warning); after `notes` it would refuse the card.
- **No `|`** in a synth line: older Arc would take it for a grid row.
- **The name is one word**, at most 13 characters, with `_` for a space: `name 808_kick` shows as *808 kick*. Arc adds a 6-character tag to it on the device (`808 kick 29f789`), so two different sounds never share a name.
- **Knobs are whole numbers 0-100**, a percent of the type's own range. Each type's defaults already make a good sound: start from the type and change 1 to 3 knobs.
- **Melodic types get `pad <pad> mode key`** (sub, bass, pluck, stab, bell, lead, pad), so the `notes` list can play them in KEYS.
- **Slides:** for an 808 or a lead that slurs, write `pad <pad> mode legato` and start a note before the last one ends: the held note takes the new pitch without a new attack (a step, not a glide, the nearest the EP-133 gets to one). The Trap, Drill, Phonk and G-funk recipes in genres.md do this.
- **The KEYS rule:** a pad in KEYS mode plays its sound as made when the notes list says C4. So `synth B7 bass note C2` with `pad B7 mode key` plays C2 at `note C4` and D2 at `note D4`. Make basses at C2 and keys at C3 or C4, then write the notes list as if C4 were the made note. A bass line from a genre card is written for a sample around C1-C3: under a bass made at C2, move every note up two octaves (`note F1` becomes `note F3`), or it plays far too low to hear.
- **Lengths stop at 4 seconds.** A hit's length follows its decay; `length` sets it by hand (lead 1, pad 3, riser 2 at first).
- **`level` balances a kit.** Every sound is made at the same loudness, then scaled by `level`. The defaults already set hats (60), open hats (55), claps (80), rims and cowbells (70) lower.

## The types

| Type | What it is | Defaults that matter |
|---|---|---|
| `kick` | a sine body whose pitch drops | note G1, decay 40, bend 50, click 30, drive 10 |
| `snare` | a body plus noise wires | note F#3, decay 30, tone 70, noise 70, snap 40, click 20 |
| `clap` | three quick noise bursts, then a tail | noise only, decay 35, tone 55 (band-pass), reso 20, level 80 |
| `hat` | six square partials, high-passed | wave metal, decay 15, tone 70, noise 40, level 60 |
| `openhat` | the hat, ringing longer | wave metal, decay 50, tone 70, noise 40, level 55 |
| `tom` | a kick tuned higher | note G2, decay 40, bend 30, click 15 |
| `rim` | a short knock | note A5, wave tri, decay 10, click 50, level 70 |
| `cowbell` | two squares a fifth apart | note C#5, chord fifth, decay 25, level 70 |
| `sub` | a clean sine bass | note C2, decay 30, drive 20 |
| `bass` | a saw bass through a low-pass | note C2, decay 30, tone 40, reso 20, sweep 40 |
| `pluck` | a short bright saw | note C4, decay 30, tone 50, sweep 50 |
| `stab` | a short chord | note C4, chord min, decay 25, tone 55, detune 20, sweep 40 |
| `bell` | an FM bell (tone is the FM depth) | note C5, decay 35, tone 40 |
| `zap` | a laser: the pitch falls fast | note C3, decay 25, tone 100, bend 100 |
| `lead` | a held saw | note C4, length 1 s, attack 5, tone 60, detune 15 |
| `pad` | a held chord that fades in | note C3, chord min, length 3 s, attack 60, decay 50, detune 40 |
| `riser` | noise that opens up | length 2 s, attack 100, tone 70 (band-pass, rising), reso 40 |

On `lead`, `pad` and `riser`, `decay` is the fade at the end. `bell` has no filter, so `reso` and `sweep` do nothing there.

## The settings

| Setting | Values | Default | What it does |
|---|---|---|---|
| `note` | C0 to C7, sharps only (`F#1`) | per type | the root pitch. On drums it tunes the body |
| `wave` | `sine tri saw square metal none` | per type | the oscillator. `metal` is six 808-hat squares; `none` is noise only |
| `chord` | `one min maj min7 maj7 dom7 sus2 sus4 fifth oct` | per type | notes stacked on the root |
| `attack` | 0-100 | per type | the fade-in: 10 is 2 ms, 30 is 54 ms, 50 is 250 ms, 70 is 686 ms, 100 is 2 s |
| `decay` | 0-100 | per type | how long it rings; a hit lasts about five of these. On lead, pad and riser it is the end fade |
| `length` | 0.05 to 4 seconds | auto for hits; lead 1, pad 3, riser 2 | the sample's length. Auto is the attack plus five times the decay |
| `tone` | 0-100 | per type | dark to bright (the filter's cutoff). On `bell` it is the FM depth |
| `reso` | 0-100 | per type | the filter's resonance: whistle and squelch |
| `sweep` | 0-100 | per type | the cutoff starts this far up and falls back in half the decay (acid, pluck) |
| `bend` | 0-100 | per type | the pitch starts higher and drops (punch, laser) |
| `click` | 0-100 | per type | a 1 ms tick at the start (beater, stick) |
| `noise` | 0-100 | per type | white noise mixed in (snare wires, air) |
| `snap` | 0-100 | off; snare 40 | gives the noise its own decay, so a snare's wires ring past its body |
| `drive` | 0-100 | per type | saturation |
| `detune` | 0-100 | per type | three voices per note, spread apart (width, reese, supersaw) |
| `level` | 1-100 | hat 60, open hat 55, clap 80, rim and cowbell 70, else 100 | loudness after the sound is made |
| `seed` | 0-999 | 0 | another take of the noise |
| `name` | one word, up to 13 characters | the type word | `_` shows as a space |

Arc makes every sound at 46875 Hz, mono, 16-bit, peaking just under full scale at level 100.

## Recipes

Four kits to copy from: drums, bass, keys and a lead with effects. Each line works as it is; take the ones you need into your card, on the pads you need. They are checked by the skill's tests, so they read with no problems.

### Drums

House at 124: kick on every beat, clap on 2 and 4, open hat on the offbeats and a fill in bar 2. A8, A0 and ENTER hold a long 808 kick, a punchy kick and a trap snare to swap in.

```
ARC BEAT 1
name Made drum kit
tempo 124

[A] bars 2 step 1/16
synth A7 kick note G1 decay 45 tone 25 bend 45 click 25 name house_kick
synth A8 kick note F1 decay 70 bend 40 click 10 drive 20 name 808_kick
synth A9 snare note G3 decay 30 tone 70 click 20 noise 70 name snare
synth A4 hat decay 10 tone 75 name closed_hat
synth A5 openhat decay 45 tone 70 name open_hat
synth A6 clap decay 35 tone 55 reso 20 name clap
synth A1 rim name rim
synth A2 tom note D2 decay 45 bend 35 name low_tom
synth A3 hat wave none decay 12 tone 60 noise 100 name shaker
synth A. cowbell name cowbell
synth A0 kick note A1 decay 25 bend 60 click 50 drive 30 name punch_kick
synth AE snare note A3 decay 20 tone 85 bend 30 noise 85 snap 30 name trap_snare
A7 house kick | X... X... X... X... | X... X... X... X... |
A9 snare      | .... .... .... .... | .... .... .... ..ox |
A4 closed hat | .o.o .o.o .o.o .o.o | .o.o .o.o .o.o .o.o |
A5 open hat   | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. ..x. |
A6 clap       | .... X... .... X... | .... X... .... X... |
A1 rim        | .... .... ...o .... | .... .... ...o .... |
A2 low tom    | .... .... .... .... | .... .... .... .x.. |
A. cowbell    | .... .... .... .... | .... ...o .... .... |
```

### Bass

Three basses made at C2, one after the other: a sub in bar 1, a wide reese in bar 2 and an acid line in bars 3 and 4. `note C4` in the notes list plays the C2 they were made at.

```
ARC BEAT 1
name Made basses
tempo 124

[B] bars 4 step 1/16
synth B7 sub note C2 decay 35 drive 25 name sub
synth B8 bass note C2 decay 90 length 2 tone 30 detune 55 name reese
synth B9 bass note C2 wave square decay 25 tone 25 reso 75 sweep 70 drive 40 name acid
pad B7 mode key
pad B8 mode key
pad B9 mode key
notes
B7 at 1.1.1 note C4 gate 1/4
B7 at 1.2.3 note C4 gate 1/8
B7 at 1.3.1 note D#4 gate 1/4
B7 at 1.4.3 note G3 gate 1/8
B8 at 2.1.1 note C4 gate 192
B8 at 2.3.1 note A#3 gate 192
B9 at 3.1.1 note C4
B9 at 3.1.3 note C5 vel 100
B9 at 3.1.4 note C4 vel 100
B9 at 3.2.2 note D#4
B9 at 3.2.4 note C4 vel 100
B9 at 3.3.1 note G4
B9 at 3.3.3 note C4 vel 100
B9 at 3.4.1 note A#3
B9 at 3.4.3 note C4 vel 100
B9 at 4.1.1 note C4
B9 at 4.1.3 note C5 vel 100
B9 at 4.2.1 note C4 vel 100
B9 at 4.2.3 note D#5
B9 at 4.3.1 note C4 vel 100
B9 at 4.3.3 note G4
B9 at 4.4.1 note F4 vel 100
B9 at 4.4.3 note D#4
```

### Keys

A dark pad under both bars, house stabs on the offbeats of bar 1, dub chords on the offbeats of bar 2 and a short pluck melody. The pad is made at C3 and the stabs and pluck at C4; each plays as made at `note C4`.

```
ARC BEAT 1
name Made keys
tempo 124

[C] bars 2 step 1/16
synth C7 pad note C3 chord min7 attack 60 decay 60 length 3 tone 40 name dark_pad
synth C8 stab note C4 chord min7 decay 20 tone 50 sweep 50 name house_stab
synth C9 stab note C4 chord min decay 35 tone 35 detune 30 name dub_chord
synth C5 pluck note C4 decay 30 tone 40 sweep 60 name pluck
pad C7 mode key
pad C8 mode key
pad C9 mode key
pad C5 mode key
C8 house stab | ..x. ..x. ..x. ..x. | .... .... .... .... |
C9 dub chord  | .... .... .... .... | ..x. ..x. ..x. ..x. |
notes
C7 at 1.1.1 note C4 gate 384
C7 at 2.1.1 note G#3 gate 384
C5 at 2.1.1 note G4 gate 1/8
C5 at 2.1.4 note D#4
C5 at 2.2.3 note C4 gate 1/8
C5 at 2.4.1 note A#3 gate 1/8
```

### Lead and effects

A lead line in bar 1, a bell answer in bar 2, a dub zap on the last offbeat of bar 1 and a riser across bar 2, so it opens into the loop's start. Group D is empty on a fresh EP-133, so these are the sounds that most often have nothing in the list to match.

```
ARC BEAT 1
name Made lead and FX
tempo 124

[D] bars 2 step 1/16
synth D7 lead note C4 tone 70 detune 20 name lead
synth D8 bell note C5 decay 30 tone 40 name bell
synth D9 zap note C3 decay 25 bend 100 name dub_zap
synth D4 riser length 2 tone 80 reso 40 name riser
pad D7 mode key
pad D8 mode key
D9 dub zap | .... .... .... ..x. | .... .... .... .... |
D4 riser   | .... .... .... .... | x... .... .... .... |
notes
D7 at 1.1.1 note C4 gate 1/8
D7 at 1.1.3 note D#4 gate 1/8
D7 at 1.2.1 note G4 gate 1/4
D7 at 1.3.3 note F4 gate 1/8
D7 at 1.4.1 note D#4 gate 1/4
D8 at 2.1.1 note G4 gate 1/4
D8 at 2.2.1 note D#4 gate 1/4
D8 at 2.3.1 note C4 gate 192
```

## Tweaks

| The user wants | Change |
|---|---|
| more punch | `bend` up, `click` up |
| a longer boom | `decay` up |
| darker | `tone` down |
| squelch | `reso` up with `sweep` up |
| wider | `detune` up |
| dirt | `drive` up |
| a hat that rings too long | `decay` down |
| another take of the same sound | `seed` (any number up to 999) |

Change one or two knobs at a time and say what each should do. A line with any setting changed is a new sound with a new tag, so Arc makes it again.

## What the sheet shows

- Each synth line Arc has to make is a row in the SOUNDS block, ticked: **Make 808 kick · Made by Arc from the card, into a free slot**, with a play button that plays it on the phone first.
- **Connected**, IMPORT makes the sound, uploads it into a free slot of the EP-133 and puts it on the pad.
- **Offline**, the row reads **Made by Arc, kept in Arc until you connect**: Live plays the made sound on that pad, and it goes to the device when the EP-133 is connected.
- **UNDO** puts the pad's old sound back. The made sound stays in its slot.
- **The next import** of the same line finds it on the device by its name (`808 kick 29f789`) and puts it on the pad without uploading it again; the row reads like any sound change, old → 808 kick 29f789.
- A `sound` line on the same pad that Arc finds on the device wins, and the synth is not made.
- Arc on the web reads and checks synth lines but makes no sounds.

## Mistakes

- A synth line after `notes`: older Arc refuses the card. Put it right after the section line.
- A `|` in the line: older Arc takes it for a grid row.
- Flats (`Bb1`, `Db2`): write sharps (`A#1`, `C#2`). Note names are uppercase, C0 to C7.
- A name of two words (`name 808 kick`): the second word is read as an unknown setting. Write `808_kick`.
- Knobs over 100, below 0 or with decimals (`decay 1.5`); `level` must be at least 1. `length` takes up to two decimals, 0.05 to 4.
- A synth line on a pad from another group than the section, or before the first section.
- A melodic type without `pad <pad> mode key`: a `oneshot` pad plays one note at a time and always to the end of its sound, whatever the gate.
