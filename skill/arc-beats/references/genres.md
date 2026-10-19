# Genre recipes

Fifty-seven starting points, including a techno family of twelve (Techno, Detroit, minimal, dub, acid, hypnotic, peak-time, melodic, industrial, hard techno, schranz and hard groove), each a complete ARC BEAT card (see [beat-card.md](beat-card.md) for the format). Two of them, Breakcore arrangement and Schranz arrangement, are whole track ideas: cards of five scenes with a chain. Use them as a base: change the tempo and a few steps and say what you changed. The cards are checked by the skill's test, so they are valid as written.

The last seven, marked **(EP-40)**, are reggae, dub and dancehall for the EP-40 Riddim kit: one drop, rockers, steppers, dub, digital riddim, dancehall and UK dub. Their pads are that kit's (kick A1, rimshot A2, closed hat A4, siren D1; see [ep40-kit.md](ep40-kit.md)), not the assumed kit below. Each makes its bass on B1 with a `synth` line, since the pack's bass one-shots don't say their note, and four put the pack's guitar skank (`sound C1 607 guit amin`) on C1: P01 leaves both pads silent. Use them when the share says the EP-133 plays the EP-40 kit, or when the user asks for these styles and confirms that kit. For the EP-40's loops, follow the loop rules in ep40-kit.md.

`scripts/beatcard.py analyse` compares a user's beat with these recipes, reading the `BPM:` and `Swing:` lines and the card of each section below. Keep that shape if you add a recipe: a `##` heading, the two lines, then one fenced card.

Some styles are defined by their effects, and those recipes carry `fx`, `send`, `comp` and `sidechain` lines right after `swing` (see "Effects" in [beat-card.md](beat-card.md)): house, tech house and peak-time techno (a sidechain pump), melodic techno (a delay on the arpeggio and a pump), dub techno, dub and UK dub (delay), acid techno (distortion on the acid), industrial techno and breakcore (distortion and compression), hard techno, hard groove and schranz (distortion, compression and a pump) and lo-fi (low-pass filter). A line under the card says in one sentence what they do. The importing user can switch **APPLY FX** off to keep their own FX; a recipe without these lines leaves the FX alone. Write them only when the style needs them.

## The assumed kit

When the user has not copied a pattern out of Arc, the card does not know what is on their pads. Then use this layout and say it is an assumption: *"I've assumed a drum kit on group A (kick on 7, snare on 9 ...). If your pads differ, copy a pattern from Arc and I'll use your pad names."* It is a common layout, not something read from the device: the official factory pack groups its sounds by slot number (kicks 1-99, snares 100-199, hi-hats 200-299, percussion 300-399, bass 400-499, melodic 500-599), but which sound sits on which pad is the user's to change.

| Pad | Sound | Pad | Sound | Pad | Sound |
|---|---|---|---|---|---|
| A7 | kick | A8 | kick 2 | A9 | snare |
| A4 | closed hat | A5 | open hat | A6 | clap |
| A1 | rim | A2 | tom | A3 | shaker |
| A. | cowbell | A0 | perc | AENTER | crash |

- **Group B** is a bass sound on pad 7, **C** a chord or keys sound on pad 7, **D** a lead or effect sound on pad 7. They are played in KEYS mode, so they live in the `notes` list. `note C4` is the sample's own pitch (MIDI 60), so a bass line sits around C1-C3.
- **No sound for a part?** When the user's list (or the factory pack) has nothing that fits, such as a lead on the empty group D, a real 808 sub or an acid bass, add a `synth` line for that pad so Arc makes one; the recipes and the rules are in [synth-sounds.md](synth-sounds.md). A made bass plays its own note (C2) at `note C4`, so move a card's bass line up two octaves for it: `note F1` becomes `note F3`, `note E2` becomes `note E4`. Most cards below have no synth lines, so they play whatever is on the pads. The ones that do make a sound the factory pack lacks, because that sound is the style: acid techno (the acid line), amapiano (the log drum), trap and drill (a long 808), phonk (a distorted 808 and a cowbell lead), G-funk (the whining lead), the two schranz cards (a hard kick, a reese and a hook) and the EP-40 recipes (the bass).
- Names after the pad are only for reading. The pattern plays whatever sound is on the pad.
- Hats: `x` is a normal hit, `o` a quiet one, `X` an accent. A digit 1-9 is a velocity of 14 times the digit.

## Feel words

Arc's prompt can put up to two feel words before the genre: *a dreamy lo-fi beat*, *a dark, hypnotic hard groove track* (a `- Feel:` line in the request). Start from the genre's recipe as always and keep its tempo range, then let each word move the card as below. Two words add up; when they pull apart (driving and laid-back), the first one leads. Say in a line what the words changed.

| Word | Tempo (in the recipe's range) | Rhythm | Notes and sounds | FX and pads |
|---|---|---|---|---|
| Dreamy | lower half | fewer hats, softer hits (`o`, digits 4-7), no busy fills | long chords (`gate 384`), sevenths and ninths, a slow lead | delay or reverb on the chords' group (`send C`), longer `release` |
| Dark | any | a sparse top; kick and bass carry it | minor or Phrygian, the bass low (C1-G1), no major chords | a low-pass `fx filter` (30-40) sent from the chords |
| Uplifting | upper half | open hats on the offbeats, a clap on 2 and 4 | major or Dorian chords, a rising lead, octave jumps in the bass | reverb on the lead's group |
| Laid-back | its lower edge | the swing near the top of its range, the snare a little late (`at 1.2.1+6`), soft ghost notes | a simple bass, few notes | none |
| Driving | its upper edge | four on the floor or straight eighths, sixteenth hats, accents on the offbeats | a short bass note on every offbeat | `sidechain` from the kick to the bass |
| Aggressive | its upper edge | accents (`X`), rolls and fills every two bars | a distorted or detuned bass | `fx distortion` with a `send` on drums and bass, `comp` |
| Dusty | lower half | more swing, uneven velocities | warm, muted sounds (in the sound list: vinyl, dusty, lo-fi, tape) | a low-pass `fx filter` (about 27) on every group; Decimate as a punch-in tip |
| Gritty | any | hard accents | crushed, bit-reduced sounds | `fx distortion` on the drums, `comp` |
| Spacious | any | few hits (a quarter of the slots or less), a bar that drops out | long notes, throws on the rim or snare | a dotted-eighth `fx delay 62` sent lightly from the rim's group |
| Minimal | any | three or four pads, one small change every four bars | one-note bass | none |
| Bouncy | any | a syncopated kick, swing 56-60, short gates | an octave-jumping bass | none |
| Hypnotic | any | a one-bar motif that repeats, a three-step percussion line over the four-beat bar, one change every four or eight bars | a single-note riff that repeats | a filter or delay that moves slowly (as a punch-in tip) |

## House
- BPM: 120-128
- Swing: 52-56
- Feel: four on the floor, a clap on 2 and 4, open hats on the offbeats and quiet closed hats in between, a light shuffle. A short bass stab on the offbeat, pumped by the kick, and an organ or piano chord stab on the off-sixteenths.

```
ARC BEAT 1
name House groove
tempo 124
swing 54
sidechain A7 B 30 55

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A6 clap        | .... X... .... X... |
A5 open hat    | ..x. ..x. ..x. ..x. |
A4 closed hat  | .o.o .o.o .o.o .o.o |

[B] bars 1
notes
B7 at 1.1.3 note E2 gate 1/8
B7 at 1.2.3 note E2 gate 1/8
B7 at 1.3.3 note G2 gate 1/8
B7 at 1.4.3 note E2 gate 1/8

[C] bars 1
notes
C7 at 1.1.4+2 note G3 vel 100
C7 at 1.1.4+2 note B3 vel 100
C7 at 1.1.4+2 note D4 vel 100
C7 at 1.1.4+2 note E4 vel 100
C7 at 1.2.3 note G3 vel 90
C7 at 1.2.3 note B3 vel 90
C7 at 1.2.3 note D4 vel 90
C7 at 1.2.3 note E4 vel 90
C7 at 1.4.2+2 note G3 vel 100
C7 at 1.4.2+2 note B3 vel 100
C7 at 1.4.2+2 note D4 vel 100
C7 at 1.4.2+2 note E4 vel 100
```

The organ or piano stab on C7 is an E minor seventh on the off-sixteenths (the a of 1, the and of 2, the e of 4), never on a kick: house chords push against the beat. The `sidechain` line makes the kick (A7) duck the bass group (B) every time it plays: the bass pumps back up between the kicks. Turn the 30 (length) up for a longer pump. The swing (54, so the stabs on the off-sixteenths sit 2 ticks late to match the hats) is the light MPC shuffle of 90s house; take it to 58 for a jackin' New York or Chicago feel, or to 50 for a straight modern one.

## Techno
- BPM: 126-138
- Swing: 50
- Feel: relentless and straight. A kick on every beat, an open hat on every offbeat, closed hats that push forward, an off-grid rim for tension and a short bass on each offbeat and the sixteenth after it. Keep the clap away or very sparse.

```
ARC BEAT 1
name Driving techno
tempo 132
swing 50

[A] bars 2 step 1/16
A7 kick        | X... X... X... X... | X... X... X... X... |
A5 open hat    | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. ..x. |
A4 closed hat  | x..o x..o x..o x..o | x..o x..o x..o x..o |
A1 rim         | ..o. ...o ..o. .o.. | ..o. ...o .o.. ..o. |

[B] bars 2
notes
B7 at 1.1.3 note F1 gate 1/16 vel 110
B7 at 1.1.4 note F1 gate 1/16 vel 70
B7 at 1.2.3 note F1 gate 1/16 vel 110
B7 at 1.2.4 note F1 gate 1/16 vel 70
B7 at 1.3.3 note F1 gate 1/16 vel 110
B7 at 1.3.4 note F1 gate 1/16 vel 70
B7 at 1.4.3 note F1 gate 1/16 vel 110
B7 at 1.4.4 note G#1 gate 1/16 vel 80
B7 at 2.1.3 note F1 gate 1/16 vel 110
B7 at 2.1.4 note F1 gate 1/16 vel 70
B7 at 2.2.3 note F1 gate 1/16 vel 110
B7 at 2.2.4 note F1 gate 1/16 vel 70
B7 at 2.3.3 note F1 gate 1/16 vel 110
B7 at 2.3.4 note F1 gate 1/16 vel 70
B7 at 2.4.3 note D#1 gate 1/16 vel 110
B7 at 2.4.4 note F1 gate 1/16 vel 80
```

The bass never plays on a beat: a loud note on the offbeat with the open hat and a quiet one after it, so the kick keeps the low end to itself and the bass rolls in the gaps. One note, F, with a small turn at the end of each bar is enough; change the note for the key, not the rhythm. The textbook techno beat adds a clap or snare on 2 and 4 (the Detroit sound); Berlin-style techno often thins it to one clap on beat 2 (`A6 clap | .... x... .... .... |`) or leaves it out, as here.

## Detroit techno
- BPM: 120-130
- Swing: 54-60
- Feel: soulful and machine-funky, the first-wave sound of the late 1980s. A 909-style kick on every beat, a clap on 2 and 4, an open hat on every offbeat, a closed hat on each beat and a swung one just before the next, a rim between the kicks, and warm minor seventh chords that stab on and off the beat on C7.

```
ARC BEAT 1
name Detroit soul
tempo 125
swing 56

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A6 clap        | .... X... .... X... |
A5 open hat    | ..x. ..x. ..x. ..x. |
A4 closed hat  | x..o x..o x..o x..o |
A1 rim         | ...o .... .o.. ..o. |

[C] bars 2
notes
C7 at 1.1.1 note F3 gate 1/4 vel 100
C7 at 1.1.1 note G#3 gate 1/4 vel 100
C7 at 1.1.1 note C4 gate 1/4 vel 100
C7 at 1.1.1 note D#4 gate 1/4 vel 100
C7 at 1.2.4+3 note F3 gate 1/8 vel 85
C7 at 1.2.4+3 note G#3 gate 1/8 vel 85
C7 at 1.2.4+3 note C4 gate 1/8 vel 85
C7 at 1.2.4+3 note D#4 gate 1/8 vel 85
C7 at 2.1.1 note D#3 gate 1/4 vel 100
C7 at 2.1.1 note F#3 gate 1/4 vel 100
C7 at 2.1.1 note A#3 gate 1/4 vel 100
C7 at 2.1.1 note C#4 gate 1/4 vel 100
C7 at 2.2.4+3 note D#3 gate 1/8 vel 85
C7 at 2.2.4+3 note F#3 gate 1/8 vel 85
C7 at 2.2.4+3 note A#3 gate 1/8 vel 85
C7 at 2.2.4+3 note C#4 gate 1/8 vel 85
```

The chords are Fm7 then D#m7, the same shape a whole step down, which keeps the stabs moving without leaving the mood. The stab on the off sixteenth carries `+3`, the swing of 56 by hand, so it sits with the swung hats and rim (see BUILD in SKILL.md). The rim fills gaps between the kicks and never lands on one. Put a string, pad or piano sound on C7: strings for the lush side of the style, a piano for the "Strings of Life" side. The second wave (Underground Resistance, Jeff Mills) is harder and straighter, at about 130-140 with swing 50: use the Techno recipe and add these chords for it.

## Minimal techno
- BPM: 124-130
- Swing: 50-56
- Feel: stripped back and clicky, the 2000s German sound (Perlon, M_nus, Kompakt). Four on the floor, one thin offbeat hat, a few rim and perc clicks with a lot of space between them, a subtle shuffle and a short sub blip.

```
ARC BEAT 1
name Minimal clicks
tempo 127
swing 54

[A] bars 2 step 1/16
A7 kick        | X... X... X... X... | X... X... X... X... |
A4 closed hat  | ..o. ..x. ..o. ..x. | ..o. ..x. ..o. ..o. |
A1 rim         | ...x ..o. .... .x.. | .x.. .... ...x ..o. |
A0 perc        | .... .o.. .... .... | .... .... ..x. .... |

[B] bars 2
notes
B7 at 1.2.3 note E1 gate 1/8 vel 100
B7 at 1.4.4+2 note E1 gate 1/16 vel 70
B7 at 2.3.3 note E1 gate 1/8 vel 100
B7 at 2.4.2+2 note G1 gate 1/16 vel 70
```

The sub blips on off sixteenths carry `+2`, the swing of 54 by hand, so they shuffle with the rim and perc.

The space between the hits matters as much as the hits: add a part only by taking another away, and change one small thing every four or eight bars. The 1990s Detroit minimal of Robert Hood is rawer and straighter: a 909 kick and hats, swing 50, and a one-bar synth riff that repeats with almost no change.

## Dub techno
- BPM: 118-126
- Swing: 50-54
- Feel: deep and hazy. A soft four on the floor kick (pick a muffled one), a quiet offbeat hat, a deep sub under it and a minor chord stab on C7 whose repeats get quieter and fade into a delay. Leave the rest empty.

```
ARC BEAT 1
name Dub chord echo
tempo 122
swing 52
fx delay 62 60
send C 30

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A4 closed hat  | ..o. ..o. ..o. ..o. |

[B] bars 2
notes
B7 at 1.1.3 note F1 gate 1/8 vel 100
B7 at 1.3.3 note F1 gate 1/8 vel 90
B7 at 2.1.3 note F1 gate 1/8 vel 100
B7 at 2.3.3 note F1 gate 1/8 vel 90

[C] bars 2
notes
C7 at 1.1.3 note F3 gate 1/4 vel 100
C7 at 1.1.3 note G#3 gate 1/4 vel 100
C7 at 1.1.3 note C4 gate 1/4 vel 100
C7 at 1.2.2+1 note F3 gate 1/4 vel 60
C7 at 1.2.2+1 note G#3 gate 1/4 vel 60
C7 at 1.2.2+1 note C4 gate 1/4 vel 60
C7 at 1.3.1 note F3 gate 1/4 vel 30
C7 at 1.3.1 note G#3 gate 1/4 vel 30
C7 at 1.3.1 note C4 gate 1/4 vel 30
C7 at 2.3.3 note F3 gate 1/4 vel 100
C7 at 2.3.3 note G#3 gate 1/4 vel 100
C7 at 2.3.3 note C4 gate 1/4 vel 100
C7 at 2.4.2+1 note F3 gate 1/4 vel 60
C7 at 2.4.2+1 note G#3 gate 1/4 vel 60
C7 at 2.4.2+1 note C4 gate 1/4 vel 60
```

The chord is F minor (F, G#, C). Its echo is written by hand: each stab repeats three sixteenths later at a lower velocity. The repeat that lands on an off sixteenth carries `+1`, the swing of 52. The `fx delay` line adds a real delay on the chords (62 is a dotted eighth, three sixteenths, the same spacing, and 60 a long tail of repeats), and `send C 30` sends a third of the chord group to it, so the echoes get wetter and longer. Raise the send for more dub, or drop the quieter hand-written repeats and let the delay do all the work.

The sub plays F on the offbeats of beats 1 and 3, in the gaps between the kicks, and stays out of the delay; pick the deepest, roundest bass on B7. A dark, filtered chord sound on C7 suits the style better than a bright one. The model is the 1990s Berlin sound of Basic Channel and Maurizio; for the later, more ambient sound of Deepchord and Echospace, go slower, longer and softer, with the chords held instead of stabbed.

## Acid techno
- BPM: 135-150
- Swing: 50
- Feel: fast and driving with no clap. Four on the floor, sixteenth hats with an open hat on every offbeat, and a squelchy, overdriven 303-style line on B7: a saw through a resonant filter that snaps shut on every note, accents from the velocity, tension from octave jumps and a flat fifth.

```
ARC BEAT 1
name Acid squelch
tempo 142
swing 50
fx distortion 45 50
send B 50

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A4 closed hat  | xoxo xoxo xoxo xoxo |
A5 open hat    | ..x. ..x. ..x. ..x. |

[B] bars 1
synth B7 bass note C2 wave saw decay 20 tone 20 reso 80 sweep 75 drive 30 name acid
pad B7 mode key
notes
B7 at 1.1.1 note A3 gate 1/16 vel 120
B7 at 1.1.2 note A3 gate 1/16 vel 70
B7 at 1.1.3 note A4 gate 1/16 vel 110
B7 at 1.1.4 note A3 gate 1/8 vel 70
B7 at 1.2.2 note C4 gate 1/16 vel 90
B7 at 1.2.3 note A3 gate 1/16 vel 120
B7 at 1.2.4 note A4 gate 1/16 vel 100
B7 at 1.3.1 note A3 gate 1/16 vel 70
B7 at 1.3.2 note A3 gate 1/16 vel 70
B7 at 1.3.3 note D#4 gate 1/8 vel 120
B7 at 1.3.4 note A3 gate 1/16 vel 70
B7 at 1.4.1 note A4 gate 1/16 vel 110
B7 at 1.4.2 note C4 gate 1/16 vel 90
B7 at 1.4.3 note A3 gate 1/16 vel 120
B7 at 1.4.4 note G4 gate 1/16 vel 100
```

The acid is the style, and a factory bass has no resonant filter, so the card makes one with a `synth` line (see [synth-sounds.md](synth-sounds.md)): a saw bass with the resonance high (`reso 80`) and a filter that starts open and falls on every note (`sweep 75`), which is the squelch. It is made at C2, so the line is written two octaves up: `note A3` plays A1. When the user's list has a real acid bass, a `sound` line on B7 wins. The `fx distortion 45 50` line with `send B 50` overdrives only the acid, as a distortion pedal on a 303 does; the drums stay clean.

To make it move, turn the synth's `tone` up (20 to 50) or `reso` up a few bars at a time, or hold FX and sweep the filter as a punch-in. The classic acid techno trick is a 12-step line over the 4/4 kick: make `[B] bars 3` and write a 12-sixteenth phrase four times, so its start moves on by a beat each time it repeats.

## Hypnotic techno
- BPM: 128-136
- Swing: 50
- Feel: raw and rolling, with no clap. Four on the floor, a rumble bass that rolls after each kick, and toms and perc that loop against the kick so the groove never settles.

```
ARC BEAT 1
name Hypnotic loop
tempo 132
swing 50

[A] bars 2 step 1/16
A7 kick        | X... X... X... X... | X... X... X... X... |
A4 closed hat  | ..xo ..xo ..xo ..xo | ..xo ..xo ..xo ..xo |
A2 tom         | ..x. ...x .x.. ..x. | x... ..x. ...x .x.. |
A0 perc        | .... .o.. ..o. .o.. | ..o. .... .o.. ..o. |
A1 rim         | .... .... ...o .... | .... ..o. .... .... |

[B] bars 1
notes
B7 at 1.1.2 note D1 gate 1/16 vel 100
B7 at 1.1.3 note D1 gate 1/16 vel 80
B7 at 1.1.4 note D1 gate 1/16 vel 60
B7 at 1.2.2 note D1 gate 1/16 vel 100
B7 at 1.2.3 note D1 gate 1/16 vel 80
B7 at 1.2.4 note D1 gate 1/16 vel 60
B7 at 1.3.2 note D1 gate 1/16 vel 100
B7 at 1.3.3 note D1 gate 1/16 vel 80
B7 at 1.3.4 note D1 gate 1/16 vel 60
B7 at 1.4.2 note D1 gate 1/16 vel 100
B7 at 1.4.3 note D1 gate 1/16 vel 80
B7 at 1.4.4 note D1 gate 1/16 vel 60
```

The rumble is three quiet sixteenths after every kick. Shorten or lengthen its notes to change how heavy the low end feels.

## Peak-time techno
- BPM: 130-138
- Swing: 50
- Feel: big-room and built for the floor, the Drumcode and "Peak Time / Driving" sound. Four on the floor with a big kick, a clap on 2 and 4, open hats on the offbeats, a shaker that drives on top, a rolling bass that the kick pumps and a short stab riff that hooks the loop. The four bars are a build: a crash on bar 1, the clap and shaker coming in, a clap roll to finish.

```
ARC BEAT 1
name Peak-time build
tempo 134
swing 50
sidechain A7 BC 25 55

[A] bars 4 step 1/16
A7 kick        | X... X... X... X... | X... X... X... X... | X... X... X... X... | X... X... X... X... |
AENTER crash   | X... .... .... .... | .... .... .... .... | .... .... .... .... | .... .... .... .... |
A6 clap        | .... .... .... .... | .... X... .... X... | .... X... .... X... | .... X... .... xxxx |
A5 open hat    | ..o. ..o. ..o. ..o. | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. ..x. |
A3 shaker      | .... .... .... .... | .o.o .o.o .o.o .o.o | xoxo xoxo xoxo xoxo | xoxo xoxo xoxo xoxo |

[B] bars 1
notes
B7 at 1.1.3 note E1 gate 1/16 vel 110
B7 at 1.1.4 note E1 gate 1/16 vel 80
B7 at 1.2.3 note E1 gate 1/16 vel 110
B7 at 1.2.4 note E1 gate 1/16 vel 80
B7 at 1.3.3 note E1 gate 1/16 vel 110
B7 at 1.3.4 note E1 gate 1/16 vel 80
B7 at 1.4.3 note G1 gate 1/16 vel 110
B7 at 1.4.4 note E1 gate 1/16 vel 80

[C] bars 2
notes
C7 at 1.1.3 note E4 gate 1/16 vel 110
C7 at 1.2.2 note E4 gate 1/16 vel 90
C7 at 1.3.3 note E4 gate 1/16 vel 110
C7 at 1.4.2 note G4 gate 1/16 vel 90
C7 at 2.1.3 note E4 gate 1/16 vel 110
C7 at 2.2.2 note E4 gate 1/16 vel 90
C7 at 2.3.3 note D4 gate 1/16 vel 110
C7 at 2.4.2 note B3 gate 1/16 vel 90
```

The bass rolls on the offbeat and the sixteenth after it, on E with a G at the end of the bar, and `sidechain A7 BC 25 55` ducks it and the stab on every kick, so both pump back up between the kicks. The riff on C7 (a chord or stab sound) is two bars of short hits on the "and" and on the "e" after the next beat, never on a beat, so it never fights the kick. It stays on E and moves only at the end of each bar.

Keep the hook that small: a peak-time riff is a one- or two-bar loop that a filter opens up over the track (a punch-in, not a card line). For more weight, roll the bass on all three sixteenths after each kick (as in Hypnotic techno); for an acid flavour, put an acid line on B instead (see Acid techno).

## Melodic techno
- BPM: 120-126
- Swing: 50
- Feel: wide and emotional, the Afterlife sound. Clean drums (kick, clap on 2 and 4, eighth hats), a rolling bass between the kicks that the kick pumps, and an eighth-note arpeggio on D7 that walks one chord and then the next, echoing through a delay.

```
ARC BEAT 1
name Melodic arpeggio
tempo 122
swing 50
fx delay 62 45
send D 30
sidechain A7 B 25 60

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A6 clap        | .... x... .... x... |
A4 closed hat  | x.x. x.x. x.x. x.x. |
A3 shaker      | .o.o .o.o .o.o .o.o |

[B] bars 1
notes
B7 at 1.1.2 note A1 gate 1/16 vel 95
B7 at 1.1.3 note A1 gate 1/16 vel 75
B7 at 1.1.4 note A1 gate 1/16 vel 85
B7 at 1.2.2 note A1 gate 1/16 vel 95
B7 at 1.2.3 note A1 gate 1/16 vel 75
B7 at 1.2.4 note A1 gate 1/16 vel 85
B7 at 1.3.2 note A1 gate 1/16 vel 95
B7 at 1.3.3 note A1 gate 1/16 vel 75
B7 at 1.3.4 note A1 gate 1/16 vel 85
B7 at 1.4.2 note A1 gate 1/16 vel 95
B7 at 1.4.3 note A1 gate 1/16 vel 75
B7 at 1.4.4 note G1 gate 1/16 vel 85

[D] bars 2
notes
D7 at 1.1.1 note A3 gate 1/8 vel 105
D7 at 1.1.3 note C4 gate 1/8 vel 85
D7 at 1.2.1 note E4 gate 1/8 vel 85
D7 at 1.2.3 note A4 gate 1/8 vel 85
D7 at 1.3.1 note E4 gate 1/8 vel 105
D7 at 1.3.3 note C4 gate 1/8 vel 85
D7 at 1.4.1 note E4 gate 1/8 vel 85
D7 at 1.4.3 note C4 gate 1/8 vel 85
D7 at 2.1.1 note F3 gate 1/8 vel 105
D7 at 2.1.3 note A3 gate 1/8 vel 85
D7 at 2.2.1 note C4 gate 1/8 vel 85
D7 at 2.2.3 note F4 gate 1/8 vel 85
D7 at 2.3.1 note C4 gate 1/8 vel 105
D7 at 2.3.3 note A3 gate 1/8 vel 85
D7 at 2.4.1 note C4 gate 1/8 vel 85
D7 at 2.4.3 note A3 gate 1/8 vel 85
```

The arpeggio is two bars (A minor, then F) against a one bar bass, so the bass loops twice under each pass of the lead. The effect lines give it its width: `fx delay 62 45` is a dotted-eighth echo with a few repeats, `send D 30` puts only the arpeggio into it, so the drums and the bass stay dry, and `sidechain A7 B 25 60` ducks the bass on every kick, so it rolls and pumps instead of blurring into the kick.

Group D is empty on a fresh EP-133, so give D7 a pluck or a soft lead (see "No sound for a part?" above). For a bigger drop, hold a chord on C7 under the arpeggio (`gate 384`), A minor in bar 1 and F in bar 2.

## Industrial techno
- BPM: 130-140
- Swing: 50
- Feel: heavy, dirty and mechanical, the sound of the 2010s revival (Perc Trax, Ancient Methods). A second kick (A8) is layered under the first and pushes off the beat, a noisy snare on 2 and 4 instead of a clap, a sparse open hat, metallic cowbell and rim hits, and a few hits placed off the grid so the pattern feels broken. Distort and shorten the sounds on the device to taste.

```
ARC BEAT 1
name Industrial pressure
tempo 136
swing 50
fx distortion 65 35
send A 50 B 60
comp 55 30

[A] bars 2 step 1/16
A7 kick        | X... X... X... X... | X... X... X... X... |
A8 kick 2      | x... x... ..x. ...x | x... x... x... x.x. |
A9 noise snare | .... x... .... x... | .... x... .... x... |
A5 open hat    | ..x. .... ..x. .... | ..x. .... ..x. ..x. |
A. cowbell     | .... o... .... ...o | .... .... o... ..o. |
A1 rim         | x..x ..x. .x.. x... | ..x. x..x .x.. ..x. |
notes
A. at 1.2.3+10 vel 110
A1 at 1.4.2+14 vel 90
A. at 2.3.4+7 vel 120
A1 at 2.4.3+16 vel 80

[B] bars 2
notes
B7 at 1.1.2 note C1 gate 1/4 vel 110
B7 at 1.3.2 note C1 gate 1/4 vel 100
B7 at 2.1.2 note C1 gate 1/4 vel 110
B7 at 2.3.2 note C#1 gate 1/4 vel 100
```

The four notes after the grid are the harsh off-grid hits: each sits a few ticks off a sixteenth, so they land just before or after the grid. The snare on A9 should be more noise than crack: pick the noisiest snare in the list and keep it a little behind the kick. The effect lines do the distorting for you: `fx distortion 65 35` is heavy drive with a dark tone, `send A 50 B 60` runs about half the drums and most of the bass through it, and `comp 55 30` squeezes everything together with a quick compressor. The rawer, loop-based 90s sound is closer to Hard groove below.

## Hard techno
- BPM: 145-160
- Swing: 50
- Feel: fast and punishing, the 2020s revival at about 150. A pounding, distorted four on the floor kick, a rumble bass that rolls after every kick and pumps with it, a clap on 2 and 4 and relentless sixteenth hats accented on the offbeat. The kick and the rumble are the track; keep anything on top sparse.

```
ARC BEAT 1
name Hard techno pound
tempo 152
swing 50
fx distortion 45 55
send A 25 B 35
comp 50 25
sidechain A7 B 20 50

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A6 clap        | .... x... .... x... |
A4 closed hat  | xxXx xxXx xxXx xxXx |

[B] bars 1
notes
B7 at 1.1.2 note F1 gate 1/16 vel 110
B7 at 1.1.3 note F1 gate 1/16 vel 90
B7 at 1.1.4 note F1 gate 1/16 vel 100
B7 at 1.2.2 note F1 gate 1/16 vel 110
B7 at 1.2.3 note F1 gate 1/16 vel 90
B7 at 1.2.4 note F1 gate 1/16 vel 100
B7 at 1.3.2 note F1 gate 1/16 vel 110
B7 at 1.3.3 note F1 gate 1/16 vel 90
B7 at 1.3.4 note F1 gate 1/16 vel 100
B7 at 1.4.2 note F1 gate 1/16 vel 110
B7 at 1.4.3 note F1 gate 1/16 vel 90
B7 at 1.4.4 note F1 gate 1/16 vel 100
```

The rumble is three sixteenths of a low note after each kick, like the distorted tail a hard techno kick drags behind it; a sub or a short dark bass on B7 suits it. The effect lines give the kick its edge: `fx distortion 45 55` is a medium drive with a neutral tone, `send A 25 B 35` mixes some of the drums and the rumble into it, `comp 50 25` glues the mix with a fast compressor, and `sidechain A7 B 20 50` ducks the rumble on every kick, so it swells back in between.

Next to Schranz it is a little slower (about 150-155 against 160), its low end is short rumble notes in the gaps rather than a held, pumping reese, it has no drive loop and no hook, and its hats are one straight run of sixteenths rather than an offbeat open hat over tick hats. To dress it up, add one thing at a time: a short rave stab on D7 once a bar, an acid line (see Acid techno) or a vocal shout. The 90s hard techno sound, at 135-145, lives on in Hard groove and Industrial techno.

## Schranz
- BPM: 155-165
- Swing: 50
- Feel: the modern revival sound: fast, hard and bouncy. A short overdriven kick on every beat, a reese bass (three detuned saws) held a bar at a time and pumped by the kick's sidechain, the drive (a noisy, overdriven tom on the three sixteenths between the kicks), an offbeat open hat, quiet tick hats, a clap on 2 and 4 and a short stab hook between the kicks. Every fourth bar the kick drops out on beat 4 for a clap roll.

```
ARC BEAT 1
name Schranz pressure
tempo 160
swing 50
fx distortion 55 55
send A 30 B 45 D 35
comp 65 20
sidechain A7 B 30 60

[A] bars 4 step 1/16
synth A7 kick note F1 decay 30 bend 70 click 60 drive 70 name schranz_kick
synth A4 hat decay 8 tone 80 name tick_hat
synth A5 openhat decay 25 tone 75 name offbeat_hat
synth A6 clap decay 30 tone 60 drive 40 name clap
synth A2 tom note C3 decay 12 tone 60 noise 50 drive 80 name drive
A7 kick        | X... X... X... X... | X... X... X... X... | X... X... X... X... | X... X... X... .... |
A4 tick hat    | .o.o .o.o .o.o .o.o | .o.o .o.o .o.o .o.o | .o.o .o.o .o.o .o.o | .o.o .o.o .o.o .o.o |
A5 open hat    | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. ..x. |
A6 clap        | .... x... .... x... | .... x... .... x... | .... x... .... x... | .... x... .... 579X |
A2 drive       | .oXo .oXo .oXo .oXo | .oXo .oXo .oXo .oXo | .oXo .oXo .oXo .oXo | .oXo .oXo .oXo .... |

[B] bars 4
synth B7 bass note C2 decay 90 length 2 tone 35 sweep 0 detune 65 drive 30 name reese
pad B7 mode key
notes
B7 at 1.1.1 note F4 gate 384
B7 at 2.1.1 note F4 gate 384
B7 at 3.1.1 note C#4 gate 384
B7 at 4.1.1 note D#4 gate 384

[D] bars 4
synth D7 stab note C4 chord oct decay 20 tone 65 detune 35 drive 60 name hook
pad D7 mode key
notes
D7 at 1.1.3 note F4
D7 at 1.2.2 note F4 vel 100
D7 at 1.2.4 note G#4
D7 at 1.3.3 note F4
D7 at 1.4.2 note C5
D7 at 1.4.4 note G#4 vel 100
D7 at 2.1.3 note F4
D7 at 2.2.2 note F4 vel 100
D7 at 2.2.4 note G#4
D7 at 2.3.3 note D#5
D7 at 2.4.2 note C5
D7 at 2.4.3 note G#4 vel 100
D7 at 3.1.3 note F4
D7 at 3.2.2 note F4 vel 100
D7 at 3.2.4 note G#4
D7 at 3.3.3 note F4
D7 at 3.4.2 note C5
D7 at 3.4.4 note G#4 vel 100
D7 at 4.1.3 note F4
D7 at 4.2.2 note F4 vel 100
D7 at 4.2.4 note G#4
D7 at 4.3.3 note F4
```

This recipe makes its own sounds with `synth` lines (see [synth-sounds.md](synth-sounds.md)): the made sounds are most of the style, and a factory kit played through this grid doesn't sound like schranz. When the user's list has a hard kick or a reese that fits, a `sound` line on the same pad wins. The parts:

- **The bounce** is the reese and the sidechain together: `sidechain A7 B 30 60` ducks the held reese on every kick, so it pumps back up between them. The reese plays F, F, C# and D#, one bar each; a `note F4` plays F2, since it was made at C2 (the KEYS rule).
- **The drive**, `.oXo` on A2, is the grit between the kicks: loudest on the offbeat, quiet on the e and the a, where the tick hats sit too, so the two add up instead of cluttering.
- **The hook** on D7 is a short saw stab with its octave, on the offbeats and sixteenths, never on a beat, so it never fights the kick. It is a two-bar call and answer in F minor (F, G#, C, D#) that rests on the fourth bar's last beat.
- **The gap**: in bar 4 the kick and the drive stop on beat 4, the reese swells with nothing ducking it, and the clap rolls up (`579X`) into the next bar.
- **The effect lines**: `fx distortion 55 55` is a medium drive, `send A 30 B 45 D 35` puts the reese into it hardest, then the hook and the drums, and `comp 65 20` is a hard, fast compressor on the whole mix.

Keep it lean: the drive, the hats and the hook already fill every sixteenth, and another sixteenth layer turns it to mush. To tweak: `detune` 50-80 on the reese for its width, the sidechain's length (30) up for more pump, `drive` or `click` up on the kick for more punch, `chord fifth` on the hook for a darker power-chord stab, `level 75` on the hook to tuck it in. Classic 2000s schranz (Chris Liebing, DJ Rush) is the drums alone at about 150, crushed harder: leave out groups B and D, drop the sidechain and send A to the distortion at 50 or more.

## Schranz arrangement
- BPM: 155-165
- Swing: 50
- Feel: the Schranz recipe as a track: five scenes and a chain, about 90 seconds before it loops. An intro of kick, drive and tick hats; the groove, where the open hat, the clap and the pumping reese come in; the drop, where the hook lands; a breakdown with no kick, so the reese swells unpumped under the open hat and the clap; a build where the kick doubles up to sixteenths; and the drop again.

```
ARC BEAT 1
name Schranz track
tempo 160
swing 50
fx distortion 55 55
send A 30 B 45 D 35
comp 65 20
sidechain A7 B 30 60
chain 1x2 2x2 3x4 4x2 5 3x4

scene Intro
[A] bars 4 step 1/16
synth A7 kick note F1 decay 30 bend 70 click 60 drive 70 name schranz_kick
synth A4 hat decay 8 tone 80 name tick_hat
synth A5 openhat decay 25 tone 75 name offbeat_hat
synth A6 clap decay 30 tone 60 drive 40 name clap
synth A2 tom note C3 decay 12 tone 60 noise 50 drive 80 name drive
A7 kick        | X... X... X... X... | X... X... X... X... | X... X... X... X... | X... X... X... .... |
A4 tick hat    | .o.o .o.o .o.o .o.o | .o.o .o.o .o.o .o.o | .o.o .o.o .o.o .o.o | .o.o .o.o .o.o .o.o |
A2 drive       | .oXo .oXo .oXo .oXo | .oXo .oXo .oXo .oXo | .oXo .oXo .oXo .oXo | .oXo .oXo .oXo .... |

[B] bars 4
synth B7 bass note C2 decay 90 length 2 tone 35 sweep 0 detune 65 drive 30 name reese
pad B7 mode key

[D] bars 4
synth D7 stab note C4 chord oct decay 20 tone 65 detune 35 drive 60 name hook
pad D7 mode key

scene Groove
[A] bars 4 step 1/16
A7 kick        | X... X... X... X... | X... X... X... X... | X... X... X... X... | X... X... X... .... |
A4 tick hat    | .o.o .o.o .o.o .o.o | .o.o .o.o .o.o .o.o | .o.o .o.o .o.o .o.o | .o.o .o.o .o.o .o.o |
A5 open hat    | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. ..x. |
A6 clap        | .... x... .... x... | .... x... .... x... | .... x... .... x... | .... x... .... 579X |
A2 drive       | .oXo .oXo .oXo .oXo | .oXo .oXo .oXo .oXo | .oXo .oXo .oXo .oXo | .oXo .oXo .oXo .... |

[B] bars 4
notes
B7 at 1.1.1 note F4 gate 384
B7 at 2.1.1 note F4 gate 384
B7 at 3.1.1 note C#4 gate 384
B7 at 4.1.1 note D#4 gate 384

scene Drop

[D] bars 4
notes
D7 at 1.1.3 note F4
D7 at 1.2.2 note F4 vel 100
D7 at 1.2.4 note G#4
D7 at 1.3.3 note F4
D7 at 1.4.2 note C5
D7 at 1.4.4 note G#4 vel 100
D7 at 2.1.3 note F4
D7 at 2.2.2 note F4 vel 100
D7 at 2.2.4 note G#4
D7 at 2.3.3 note D#5
D7 at 2.4.2 note C5
D7 at 2.4.3 note G#4 vel 100
D7 at 3.1.3 note F4
D7 at 3.2.2 note F4 vel 100
D7 at 3.2.4 note G#4
D7 at 3.3.3 note F4
D7 at 3.4.2 note C5
D7 at 3.4.4 note G#4 vel 100
D7 at 4.1.3 note F4
D7 at 4.2.2 note F4 vel 100
D7 at 4.2.4 note G#4
D7 at 4.3.3 note F4

scene Breakdown
[A] bars 4 step 1/16
A5 open hat    | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. ..x. |
A6 clap        | .... x... .... x... | .... x... .... x... | .... x... .... x... | .... x... .... x... |

[D] bars 4

scene Build
[A] bars 4 step 1/16
A7 kick        | X... .... X... .... | X... X... X... X... | X.X. X.X. X.X. X.X. | XXXX XXXX XXXX .... |
A4 tick hat    | .o.o .o.o .o.o .o.o | .o.o .o.o .o.o .o.o | xxxx xxxx xxxx xxxx | XXXX XXXX XXXX .... |
A6 clap        | .... x... .... x... | .... x... .... x... | ..x. ..x. ..x. ..x. | 4455 6677 8899 XXXX |
```

The `chain` line plays the intro twice, the groove twice, the drop four times, the breakdown twice, the build once and the drop four times again: 60 bars, then it loops. An empty section (`[D] bars 4` with nothing under it) imports as a blank pattern, so it mutes that group in its scene: the intro has no reese or hook, and the breakdown and the build have no hook. A group a scene leaves out plays the previous scene's pattern: the drop writes only the hook over the groove's drums and reese, and the build keeps the reese, which its doubling kick chops through the sidechain like a riser. The synth lines sit in the first scene; the sounds are the pads', so every scene plays them. The effect lines are the project's, so they apply to every scene; for a filter sweep in the breakdown, hold FX and press pad 4 (low-pass) or 5 (high-pass).

## Hard groove
- BPM: 135-145
- Swing: 54-58
- Feel: pumping and funky, the swung cousin of hard techno: the loop-based, percussion-heavy sound Ben Sims named in the 90s, now back in a revival. Kick on every beat, a clap on 2 and 4 with a ghost clap, swung xoxx hats, congas, a tom and a sparse cowbell, and a bouncy bass whose off sixteenths are nudged late.

```
ARC BEAT 1
name Hard groove workout
tempo 140
swing 56
fx distortion 35 45
send B 40
comp 45 60
sidechain A7 B 25 60

[A] bars 2 step 1/16
A7 kick        | X... X... X... X... | X... X... X... X... |
A6 clap        | .... x... .... x..o | .... x... .... x... |
A5 open hat    | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. ..x. |
A4 closed hat  | xoxx xoxx xoxx xoxx | xoxx xoxx xoxx xoxx |
A0 conga       | ..x. .o.x ..x. o..x | ..x. .o.x ..x. o.x. |
A2 tom         | .... ...x .... .x.. | .... ...x .... .x.. |
A. cowbell     | .... .... ..o. .... | .... .... ..o. ...o |
A3 shaker      | oxox oxox oxox oxox | oxox oxox oxox oxox |

[B] bars 2
notes
B7 at 1.1.3 note G1 gate 1/16 vel 110
B7 at 1.1.4+3 note G1 gate 1/16 vel 80
B7 at 1.2.3 note G1 gate 1/16 vel 110
B7 at 1.3.2+3 note A#1 gate 1/16 vel 90
B7 at 1.3.3 note G1 gate 1/16 vel 110
B7 at 1.4.3 note G2 gate 1/16 vel 100
B7 at 1.4.4+3 note F1 gate 1/16 vel 80
B7 at 2.1.3 note G1 gate 1/16 vel 110
B7 at 2.1.4+3 note G1 gate 1/16 vel 80
B7 at 2.2.3 note G1 gate 1/16 vel 110
B7 at 2.3.2+3 note A#1 gate 1/16 vel 90
B7 at 2.3.3 note C2 gate 1/16 vel 110
B7 at 2.4.3 note A#1 gate 1/16 vel 100
```

The bass notes on the second and fourth sixteenths carry `+3`, the swing of 56 by hand, so the bounce sits with the swung hats and congas. The effect lines are light: `fx distortion 35 45` with `send B 40` gives the bass the mid-range bite the style wants, `comp 45 60` glues the mix, and `sidechain A7 B 25 60` lets the bass bounce off the kick.

The style grew from DJs looping funk and disco breaks, so a short loop or vocal chop from a funk record on a free pad is the most hard groove thing to add. It has no breakdown: vary it by muting and bringing back the percussion.

## Boom bap
- BPM: 84-96
- Swing: 54-62
- Feel: the East Coast 90s sound. A hard kick and a snappy snare (the boom and the bap) on 2 and 4, a late kick, eighth hats with swung ghosts, a bass that plays with the kick and a sampled chord chop on top.

```
ARC BEAT 1
name Lazy boom bap
tempo 90
swing 58

[A] bars 2 step 1/16
A7 kick        | X... ..x. ..x. .... | X... .... x.x. .... |
A9 snare       | .... X... .... X... | .... X... .o.. X..o |
A4 closed hat  | x.x. x.xo x.x. x.xo | x.x. x.xo x.x. x.xo |

[B] bars 2
notes
B7 at 1.1.1 note A1 gate 1/8 vel 110
B7 at 1.2.3 note A1 gate 1/16 vel 90
B7 at 1.3.3 note C2 gate 1/8 vel 100
B7 at 2.1.1 note G1 gate 1/8 vel 110
B7 at 2.3.1 note E1 gate 1/16 vel 90
B7 at 2.3.3 note G1 gate 1/8 vel 100

[C] bars 2
notes
C7 at 1.1.1 note C4 gate 288 vel 80
C7 at 1.1.1 note E4 gate 288 vel 80
C7 at 1.1.1 note G4 gate 288 vel 80
C7 at 1.4.3 note C4 gate 1/8 vel 70
C7 at 1.4.3 note E4 gate 1/8 vel 70
C7 at 1.4.3 note G4 gate 1/8 vel 70
C7 at 2.1.1 note B3 gate 288 vel 80
C7 at 2.1.1 note D4 gate 288 vel 80
C7 at 2.1.1 note G4 gate 288 vel 80
C7 at 2.4.3 note B3 gate 1/8 vel 70
C7 at 2.4.3 note D4 gate 1/8 vel 70
C7 at 2.4.3 note G4 gate 1/8 vel 70
```

Boom bap is drums and a sample. The kick plays 1 and the "and" of 2 and 3, then 1, 3 and its "and" in bar 2; the snare sits on 2 and 4, with a ghost and a pickup into the loop in bar 2. Swing 58 pushes the ghost hats and ghost snares late, which gives the MPC lope; the eighth hats stay on the beat. The bass on B7 plays only with the kick, so the low end lands as one hit. Group C stands in for the sample: an A minor seventh (with the bass) and a G chord, each chopped again on the last "and" of its bar, kept soft so the snare cuts through.

Better still, sample a few bars of a soul or jazz record onto C7 and play it at these points, pitched down a few semitones. To tweak: swing 60-62 at 86-88 BPM for a lazier, Pete Rock feel, or a ghost hat on every off sixteenth (`xoxo`) for a busier one.

## Lo-fi
- BPM: 70-86
- Swing: 56-66
- Feel: soft, behind the beat and a little sloppy. A sparse kit at low velocities with a quiet rim, a two-bar loop of four jazzy seventh chords on a Rhodes, a soft bass on the roots, and everything dulled by a low-pass filter.

```
ARC BEAT 1
name Dusty lo-fi
tempo 76
swing 62
fx filter 27 20
send A 100 C 100

[A] bars 2 step 1/16
A7 kick        | 8... ..6. .... .5.. | 8... ..6. ..5. .... |
A9 snare       | .... 7... .... 7... | .... 7... .... 7..3 |
A4 closed hat  | 5.3. 5.3. 5.3. 5.4. | 5.3. 5.3. 5.3. 5.4. |
A1 rim         | .... .... ..3. .... | .... .... ..3. .... |

[B] bars 2
notes
B7 at 1.1.1 note F1 gate 168 vel 90
B7 at 1.3.1 note E1 gate 168 vel 85
B7 at 2.1.1 note D1 gate 168 vel 90
B7 at 2.3.1 note C2 gate 168 vel 85

[C] bars 2
notes
C7 at 1.1.1 note F3 gate 180 vel 80
C7 at 1.1.1 note A3 gate 180 vel 80
C7 at 1.1.1 note C4 gate 180 vel 80
C7 at 1.1.1 note E4 gate 180 vel 80
C7 at 1.3.1 note E3 gate 180 vel 75
C7 at 1.3.1 note G3 gate 180 vel 75
C7 at 1.3.1 note B3 gate 180 vel 75
C7 at 1.3.1 note D4 gate 180 vel 75
C7 at 2.1.1 note D3 gate 180 vel 80
C7 at 2.1.1 note F3 gate 180 vel 80
C7 at 2.1.1 note A3 gate 180 vel 80
C7 at 2.1.1 note C4 gate 180 vel 80
C7 at 2.3.1 note C3 gate 180 vel 75
C7 at 2.3.1 note E3 gate 180 vel 75
C7 at 2.3.1 note G3 gate 180 vel 75
C7 at 2.3.1 note B3 gate 180 vel 75
```

`fx filter 27 20` is a low-pass filter (any cutoff below 50 is low-pass) set low and with a little resonance, and `send A 100 C 100` runs the drums and the chords through it, so they lose their highs and sound like an old tape. The bass stays dry; it has no highs to lose. Move the 27 down for a duller sound, up for a brighter one.

The chords are what a lo-fi listener misses first: Fmaj7, Em7, Dm7 and Cmaj7, two beats each, stepping down over two bars, with a short gap before each change. Put a Rhodes or a soft piano on C7. The bass plays only the roots. The drums stay sparse: a kick on 1 and one or two lazy hits, the snare on 2 and 4, soft hats. For ninths, add a note a ninth above each root (G4 on the Fmaj7). For the keys to breathe with the kick, add `sidechain A7 C 20 50`. This is the 2010s YouTube style; its roots are Nujabes and J Dilla (see Boom bap and Neo-soul for their kind of beat).

## Trap
- BPM: 130-150 (a half-time feel: the snare is on 3 and the hats run double)
- Swing: 50
- Feel: the 2010s Atlanta sound. A lone clap on 3, a sparse kick with a long 808 under every hit, straight eighth hats that double up, a triplet roll and a 32nd roll into the loop.

```
ARC BEAT 1
name Trap half-time
tempo 140
swing 50

[A] bars 2 step 1/16
A7 kick        | X... ..x. .... .... | X... .... ..x. ...x |
A6 clap        | .... .... X... .... | .... .... X... .... |
A4 closed hat  | x.x. x.xx x.x. x.xx | x.x. .... x.x. .... |
A5 open hat    | .... .... .... ..x. | .... .... .... .... |
notes
A4 at 2.2.1 vel 100
A4 at 2.2.1+16 vel 64
A4 at 2.2.1+32 vel 80
A4 at 2.2.3 vel 100
A4 at 2.2.3+16 vel 64
A4 at 2.2.3+32 vel 80
A4 at 2.4.1 vel 50
A4 at 2.4.1+12 vel 60
A4 at 2.4.2 vel 72
A4 at 2.4.2+12 vel 84
A4 at 2.4.3 vel 96
A4 at 2.4.3+12 vel 108
A4 at 2.4.4 vel 118
A4 at 2.4.4+12 vel 127

[B] bars 2
synth B7 sub note C2 decay 80 drive 35 name 808
pad B7 mode legato
notes
B7 at 1.1.1 note C4 gate 140
B7 at 1.2.3 note C4 gate 236
B7 at 2.1.1 note G3 gate 236
B7 at 2.3.3 note A#3 gate 140
B7 at 2.4.4 note C4 gate 24
```

The 808 is the style, and the factory pack has no long one, so a `synth` line makes it: a sine sub with some drive that rings for seconds. It plays with the kick, one note per kick, and stops where the next one starts. Its notes are written two octaves up: it was made at C2, so `note C4` plays C2 (the KEYS rule in [synth-sounds.md](synth-sounds.md)). `pad B7 mode legato` keeps it to one note at a time, and where a note starts before the last one ends (the A# into the last C) the pitch moves without a new hit: the nearest the EP-133 gets to an 808 glide. The hats are straight: eighths with sixteenth pairs, a triplet roll on beat 2 of bar 2 (`+16` and `+32` are triplet sixteenths) and a 32nd crescendo into the loop, both in the `notes` list because they are off the 1/16 grid.

A dark minor loop on C7 (bells, piano, flute or strings, two to four bars) is the usual third part. Early 2000s trap (Shawty Redd, DJ Toomp) is the same frame with fewer rolls and orchestral stabs on top.

## Drill
- BPM: 138-146
- Swing: 50
- Feel: UK drill, which Brooklyn drill took over: half time, hats in a 3+3+2 skip, a snare on 3 in bar 1 that moves to 4 in bar 2, a sparse kick that jumps around, a sliding 808 and dark minor chords.

```
ARC BEAT 1
name Cold drill
tempo 142
swing 50

[A] bars 2 step 1/16
A7 kick        | X... .... .... ..x. | X..x ..x. .... ..x. |
A9 snare       | .... .... X... .... | .... .... ..o. X... |
A4 closed hat  | x..x ..x. x..x ..xo | x..x ..x. x..x .... |
A0 perc        | x... .... .... .... | .... .... x... ..x. |
notes
A4 at 2.4.3 vel 100
A4 at 2.4.3+16 vel 64
A4 at 2.4.3+32 vel 84

[B] bars 2
synth B7 sub note C2 decay 80 drive 35 name 808
pad B7 mode legato
notes
B7 at 1.1.1 note C#4 gate 330
B7 at 1.4.3 note C#4 gate 46
B7 at 2.1.1 note A3 gate 70
B7 at 2.1.4 note A3 gate 96
B7 at 2.2.3 note A4 gate 120
B7 at 2.3.3 note G#4 gate 94
B7 at 2.4.3 note G#3 gate 46

[C] bars 2
notes
C7 at 1.1.1 note C#4 gate 384 vel 70
C7 at 1.1.1 note E4 gate 384 vel 70
C7 at 1.1.1 note G#4 gate 384 vel 70
C7 at 2.1.1 note A3 gate 384 vel 70
C7 at 2.1.1 note C#4 gate 384 vel 70
C7 at 2.1.1 note E4 gate 384 vel 70
```

This is UK drill, the style most people mean today, and the template Brooklyn drill (Pop Smoke, 808Melo) took over almost as it is. The hats skip in threes and twos (`x..x ..x.`, a pattern from grime), the snare lands on beat 3 of bar 1 and on beat 4 of bar 2, so the backbeat stumbles, and the kick and a perc fill the gaps. The 808 is the made sub from Trap, written two octaves up (`note C#4` plays C#2), and it slides: with `pad B7 mode legato`, a note that starts before the last one ends changes the pitch without a new hit. It hits with the kicks in bar 1, then in bar 2 slides from A up an octave and down to G#, so the bass line is the hook. The chords on C7 (C# minor, then A) stand in for the dark piano or strings loop; keep them quiet.

Chicago drill (Chief Keef, Young Chop, from about 2012) is closer to the Trap recipe: a held 808 that stays on its note, hats on the beat with triplet rolls, the snare on 3 and brass or bell melodies.

## Drum and bass
- BPM: 170-176
- Swing: 50
- Feel: the modern rolling two-step. A kick on 1 and on the "and" of 3, the snare on 2 and 4, ghost snares in the gaps and running eighth hats. Under it a reese or sub that holds long notes and rolls into the next bar; the bass carries the track as much as the drums.

```
ARC BEAT 1
name Two-step roller
tempo 174
swing 50

[A] bars 2 step 1/16
A7 kick        | X... .... ..X. .... | X... ..x. ..X. .... |
A9 snare       | .... X..o .o.. X... | .... X..o .o.. X..o |
A4 closed hat  | x.x. x.x. x.x. x.x. | x.x. x.x. x.x. x... |
A5 open hat    | .... .... .... .... | .... .... .... ..x. |

[B] bars 2
notes
B7 at 1.1.1 note F1 gate 240
B7 at 1.3.3 note F1 gate 1/8
B7 at 1.4.1 note G#1 gate 1/8
B7 at 1.4.3 note F1 gate 1/8
B7 at 2.1.1 note F1 gate 192
B7 at 2.3.1 note D#1 gate 1/8
B7 at 2.3.3 note C#1 gate 1/4
B7 at 2.4.3 note C1 gate 1/8
```

The drums are the two-step every dnb beat starts from: the kick on step 1 and step 11, the snare on 5 and 13, and quiet ghost snares (`o`) on the e and the a around them, as a break layered under the kit would add. Bar 2 adds a kick on the "and" of 2 and an open hat into the loop. The bass on B7 is the part that makes it dnb rather than a fast breakbeat: a long F up to the second kick, struck again with it, then a short G#-F answer, and a falling D#, C#, C turnaround in bar 2. A reese suits it best (the factory pack has one at slot 429, `sound B7 429 reese`); a clean sub works for a rounder sound.

To tweak: one kick and one snare a bar is enough, so add ghosts rather than kicks. For jump-up, shorten the bass notes and make them jump an octave; for a smoother sound go to Liquid drum and bass; for the older, break-led sound go to Jungle. On the device, a light `sidechain A7 B` keeps the kick clear of a long bass.

## Jungle
- BPM: 160-170
- Swing: 52-58
- Feel: the Amen break, chopped, with a deep sub at half its speed. The kick and snare follow the Amen (kicks on 1, the "and" of 1 and the "and" and a of 3; snares on 2 and 4 with ghost snares between), a ride or hat on every eighth keeps time, and bar 2 delays the last snare as the Amen does. Under it a reggae-style sub holds long notes.

```
ARC BEAT 1
name Chopped break
tempo 166
swing 54

[A] bars 2 step 1/16
A7 kick        | X.x. .... ..xx .... | X.x. .... ..x. .... |
A9 snare       | .... X..o .o.. X..o | .... X..o .o.. ..Xo |
A4 ride        | x.x. x.x. x.x. x.x. | x.x. x.x. x.x. x.x. |

[B] bars 2
notes
B7 at 1.1.1 note A1 gate 240
B7 at 1.4.1 note C2 gate 1/8
B7 at 1.4.3 note D2 gate 1/8
B7 at 2.1.1 note E1 gate 192
B7 at 2.3.1 note G1 gate 192
```

Bar 1 is the first bar of the Amen break: kicks on steps 1, 3, 11 and 12, the loud snares on 5 and 13, ghost snares on 8, 10 and 16. Bar 2 is its third bar, the one with the late snare: the snare on beat 4 moves to step 15, which gives the break its stumble. The eighths on A4 stand for the Amen's ride; a ride sound on that pad is closer. The bass on B7 is the dub and reggae side of jungle: a few long notes (A, then C and D, then E and G) that move at half the speed of the drums.

To tweak: chop it further by swapping single steps between the bars, add a 32nd snare roll in the `notes` list at the end of bar 2 (as in Breakcore), or put a dub siren or a vocal shout on D7. This is the 1994-95 ragga jungle sound at about 165; modern jungle runs closer to 170-175 and leans toward Drum and bass.

## Breakcore
- BPM: 160-200
- Swing: 50
- Feel: the modern revival sound: a chopped Amen break played fast, dry and distorted, under soft, sad chords that stay clean. The kick and snare follow the Amen in bar 1 and break apart in bar 2, a ride-style open hat keeps time, the snare stutters in 32nds and rolls into the next loop, and a sub follows the chords.

```
ARC BEAT 1
name Amen shred
tempo 180
swing 50
fx distortion 55 50
send A 45 B 30
comp 60 15

[A] bars 2 step 1/16
A7 kick        | X.x. .... ..xx .... | X..x ..x. x..x .... |
A9 snare       | .... X..o .o.. X..o | .... X.oX .oX. .... |
A5 ride        | x.x. x.x. x.x. x.x. | x.x. x.x. .... .... |
AENTER crash   | X... .... .... .... | .... .... .... .... |
notes
A9 at 1.4.4+12 vel 90
A7 at 2.2.3+12 vel 90
A9 at 2.4.1 vel 50
A9 at 2.4.1+12 vel 60
A9 at 2.4.2 vel 72
A9 at 2.4.2+12 vel 84
A9 at 2.4.3 vel 96
A9 at 2.4.3+12 vel 108
A9 at 2.4.4 vel 118
A9 at 2.4.4+12 vel 127

[B] bars 2
notes
B7 at 1.1.1 note A1 gate 192 vel 120
B7 at 1.3.3 note A1 gate 1/8 vel 100
B7 at 2.1.1 note F1 gate 192 vel 120
B7 at 2.4.1 note G1 gate 1/8 vel 110

[C] bars 2
notes
C7 at 1.1.1 note A3 gate 384 vel 80
C7 at 1.1.1 note C4 gate 384 vel 80
C7 at 1.1.1 note E4 gate 384 vel 80
C7 at 1.1.1 note G4 gate 384 vel 80
C7 at 2.1.1 note F3 gate 384 vel 80
C7 at 2.1.1 note A3 gate 384 vel 80
C7 at 2.1.1 note C4 gate 384 vel 80
C7 at 2.1.1 note E4 gate 384 vel 80
```

Bar 1 is the Amen at 180 (kicks on steps 1, 3, 11 and 12, snares on 5 and 13 with ghosts between) with one 32nd stutter at its end. Bar 2 is the chaos bar: a scattered kick, a snare that jumps (`X.oX .oX.`), the ride stops and a 32nd roll climbs from soft to full. The roll and the stutters sit in the `notes` list because they fall between sixteenths (`+12` is half a sixteenth, a 32nd). The chords on C7 are what the revival listener hears first: A minor 7 then F major 7, held a bar each, and the sub on B7 plays their roots. Pick a pad, strings or a soft piano for C7.

The effect lines crush the drums and leave the chords alone: `fx distortion 55 50` is a hard, neutral drive, `send A 45 B 30` puts the drums and the sub into it and C not at all, and `comp 60 15` is a very fast compressor that pumps the loop. The contrast, dry and broken drums against clean, held chords, is the style. The older sound (Venetian Snares, DJ Scud, about 2000-2005) is harsher: leave out [C], double the kick with a distorted kick on A8, raise the tempo to 190-200 and the send on A to 60.

## Breakcore arrangement
- BPM: 160-200
- Swing: 50
- Feel: the Breakcore recipe as a track idea: five scenes and a chain. An intro of the chords, a held sub, a ride and one kick a bar; the Amen shred as the drop; a breakdown with no kick or snare, only the chords, the sub and a quarter-note ride; a snare-roll build; then a second drop that is denser (every sixteenth a hat). Arc imports each scene as a scene of its own and plays them in the chain's order.

```
ARC BEAT 1
name Breakcore track
tempo 180
swing 50
fx distortion 55 50
send A 45 B 30
comp 60 15
chain 1x2 2x2 3 4 5x2

scene Intro
[A] bars 2 step 1/16
A7 kick        | X... .... .... .... | X... .... .... .... |
A5 ride        | x.x. x.x. x.x. x.x. | x.x. x.x. x.x. x.x. |
AENTER crash   | X... .... .... .... | .... .... .... .... |

[B] bars 2
notes
B7 at 1.1.1 note A1 gate 384 vel 100
B7 at 2.1.1 note F1 gate 384 vel 100

[C] bars 2
notes
C7 at 1.1.1 note A3 gate 384 vel 80
C7 at 1.1.1 note C4 gate 384 vel 80
C7 at 1.1.1 note E4 gate 384 vel 80
C7 at 1.1.1 note G4 gate 384 vel 80
C7 at 2.1.1 note F3 gate 384 vel 80
C7 at 2.1.1 note A3 gate 384 vel 80
C7 at 2.1.1 note C4 gate 384 vel 80
C7 at 2.1.1 note E4 gate 384 vel 80

scene Drop
[A] bars 2 step 1/16
A7 kick        | X.x. .... ..xx .... | X..x ..x. x..x .... |
A9 snare       | .... X..o .o.. X..o | .... X.oX .oX. .... |
A5 ride        | x.x. x.x. x.x. x.x. | x.x. x.x. .... .... |
AENTER crash   | X... .... .... .... | .... .... .... .... |
notes
A9 at 1.4.4+12 vel 90
A7 at 2.2.3+12 vel 90
A9 at 2.4.1 vel 50
A9 at 2.4.1+12 vel 60
A9 at 2.4.2 vel 72
A9 at 2.4.2+12 vel 84
A9 at 2.4.3 vel 96
A9 at 2.4.3+12 vel 108
A9 at 2.4.4 vel 118
A9 at 2.4.4+12 vel 127

[B] bars 2
notes
B7 at 1.1.1 note A1 gate 192 vel 120
B7 at 1.3.3 note A1 gate 1/8 vel 100
B7 at 2.1.1 note F1 gate 192 vel 120
B7 at 2.4.1 note G1 gate 1/8 vel 110

scene Breakdown
[A] bars 2 step 1/16
A5 ride        | x... x... x... x... | x... x... x... x... |

[B] bars 2
notes
B7 at 1.1.1 note A1 gate 384 vel 110
B7 at 2.1.1 note F1 gate 384 vel 110

scene Build
[A] bars 2 step 1/16
A7 kick        | X... .... X... .... | X... X... X... X... |
A9 snare       | .... .... .... .... | 3.5. 6.7. 8.9. XXXX |
A5 ride        | x.x. x.x. x.x. x.x. | xxxx xxxx xxxx xxxx |

scene Drop 2
[A] bars 2 step 1/16
A7 kick        | X.x. ..x. ..xx .... | X..x ..x. x..x ..xx |
A9 snare       | .... X..o .oX. X..o | .... X.oX .oX. X.XX |
A4 closed hat  | xxxx xxxx xxxx xxxx | xxxx xxxx xxxx xxxx |
AENTER crash   | X... .... .... .... | X... .... .... .... |

[B] bars 2
notes
B7 at 1.1.1 note A1 gate 192 vel 127
B7 at 1.3.3 note A1 gate 1/8 vel 110
B7 at 2.1.1 note F1 gate 192 vel 127
B7 at 2.4.1 note G1 gate 1/8 vel 115
```

The `chain` line plays the intro twice, the drop twice, the breakdown, the build and the second drop twice: 16 bars, then it loops. Each scene lasts as long as its longest pattern (2 bars here). A group a scene leaves out plays the previous scene's pattern: the chords on C sit only in the intro and carry on through every scene, and the build has no `[B]`, so the breakdown's sub carries on under the roll. The `fx`, `send` and `comp` lines are the project's, so they apply to every scene; the chords get no send, so they stay clean. To change the sound between scenes, play punch-ins live. For a longer drop, raise its passes (`2x4`); to take the track further, add a scene and put its number in the chain.

## UK garage
- BPM: 130-136
- Swing: 58-66
- Feel: shuffled and skippy, the 2-step garage of the late 1990s. A kick on 1 and on the "and" of 3, so it skips beats 2 and 4, a snare on 2 and 4, a hat on every sixteenth with the off ones pushed late by heavy swing, a rimshot here and there, a bouncy bass that jumps an octave and a short vocal chop as the hook.

```
ARC BEAT 1
name Two-step garage
tempo 132
swing 60

[A] bars 2 step 1/16
A7 kick        | X... .... ..x. .... | X... .... ..x. ..x. |
A9 snare       | .... X... .... X... | .... X... .... X... |
A4 closed hat  | xoxo xoxo xoxo xoxo | xoxo xoxo xoxo xoxo |
A1 rim         | ..o. .... ...o .... | ..o. ...o .... .o.. |

[B] bars 2
notes
B7 at 1.1.1 note G1 gate 1/8
B7 at 1.1.4+5 note G2 vel 90
B7 at 1.2.3 note G1 vel 100
B7 at 1.3.3 note A#1 gate 1/8
B7 at 1.4.2+5 note G1 vel 90
B7 at 1.4.4+5 note D2 vel 100
B7 at 2.1.1 note G1 gate 1/8
B7 at 2.1.4+5 note G2 vel 90
B7 at 2.2.3 note G1 vel 100
B7 at 2.3.3 note D#2 gate 1/8
B7 at 2.4.3 note D2 vel 100

[D] bars 2
notes
D7 at 1.2.1 note G4 gate 1/8 vel 110
D7 at 2.2.1 note G4 gate 1/8 vel 110
D7 at 2.4.2+5 note A#4 vel 90
D7 at 2.4.3 note A#4 vel 100
D7 at 2.4.4+5 note D5 gate 1/8 vel 110
```

The bass on B7 and the chop on D7 are played in KEYS. Their notes on the off sixteenths carry `+5`, the swing of 60 by hand, so they sit with the swung hats (see BUILD in SKILL.md). The chop wants a short vocal sample, a word or a syllable, on D7: it lands on beat 2 of each bar and ends bar 2 with a stuttered, swung three-note tag. With no vocal in the list, a short organ stab or pluck does the same job. In bar 2 the kick pushes into the next bar on the "and" of 4.

Garage swing is heavy: 58-66 here, and classic beats go as high as 68 on an MPC. Many garage tracks, from speed garage to the 2020s revival, run a kick on every beat under the same shuffle; for that, fill the kick row in on 1, 2, 3 and 4 and keep the rest.

## Breakbeat
- BPM: 120-135
- Swing: 50-56
- Feel: a funky break with a bassline that leads. The kick bounces around the snare on 2 and 4, a ghost snare adds lift, and a busy, syncopated bass on B7 jumps an octave and walks up at the end of the second bar.

```
ARC BEAT 1
name Big beat break
tempo 126
swing 52

[A] bars 2 step 1/16
A7 kick        | X... ..x. x... ..x. | X... ..x. x.x. .... |
A9 snare       | .... X... .... X..o | .... X..o .o.. X... |
A4 closed hat  | x.x. x.x. x.x. x... | x.x. x.x. x.x. x.x. |
A5 open hat    | .... .... .... ..x. | .... .... .... .... |

[B] bars 2
notes
B7 at 1.1.1 note E1 gate 1/8
B7 at 1.1.4+1 note E1 vel 90
B7 at 1.2.3 note G1 gate 1/8
B7 at 1.3.1 note E1 gate 1/8
B7 at 1.3.4+1 note E2 vel 100
B7 at 1.4.3 note D2 gate 1/8
B7 at 2.1.1 note E1 gate 1/8
B7 at 2.1.4+1 note E1 vel 90
B7 at 2.2.3 note G1 gate 1/8
B7 at 2.3.1 note A1 gate 1/8
B7 at 2.3.3 note A#1 gate 1/8
B7 at 2.4.1 note B1 gate 1/8
B7 at 2.4.3 note D2
```

The break is the funk-record kind breaks music is built on: a kick on 1, the "and" of 2, 3 and the "and" of 4, the snare on 2 and 4, and in bar 2 two ghost snares and a kick on the "and" of 3 that push the bar along. The bass is what sets breaks apart from a hip-hop beat at the same tempo: it plays nearly as much as the drums, between the kicks, with an octave jump in bar 1 and a walk up (A, A#, B, D) into the loop. Its notes on the off sixteenths carry `+1`, the swing of 52 by hand, so they sit with the swung hats. A gritty, filtered bass suits it (an acid or a distorted bass sound on B7).

This is the late-1990s nu skool and big beat sound (Chemical Brothers, Stanton Warriors), which most of today's breaks still follows. For big beat, put a kick on every beat under the break and add an acid line; for the modern UK breaks sound, raise it to 130-135.

## Reggaeton and dembow
- BPM: 88-98
- Swing: 50
- Feel: the dembow rhythm. A kick on every beat and a snare in 3 + 3 + 2 (steps 4, 7, 12 and 15), which never sits on 2 and 4. A short hat on the beats, a shaker in sixteenths and a sub bass on 1 and 3. Simple, dry and loud.

```
ARC BEAT 1
name Dembow
tempo 94
swing 50

[A] bars 2 step 1/16
A7 kick        | X... X... X... X... | X... X... X... X... |
A9 snare       | ...x ..x. .o.x ..x. | ...x ..x. .o.x 6789 |
A4 closed hat  | x... x... x... x... | x... x... x... x... |
A3 shaker      | ooxx ooxx ooxx ooxx | ooxx ooxx ooxx ooxx |

[B] bars 2
notes
B7 at 1.1.1 note A1 gate 1/4
B7 at 1.3.1 note A1 gate 1/4
B7 at 2.1.1 note F1 gate 1/4
B7 at 2.3.1 note G1 gate 1/4
```

The snare carries the groove, so keep it loud and short; the kick is tight and the sub on B7 follows it on beats 1 and 3, A for a bar, then F and G. The ghost snare on step 10 adds feel, and bar 2 ends in a snare fill into the next loop. The hats stay sparse, one a beat, while the shaker plays quiet, quiet, loud, loud. Reggaeton works in 8-bar sections and often switches the snare sound between them; the hook (a vocal, a lead or a guitar) sits on top.

Dominican dembow (El Alfa and others) is the same idea at about 115-130 with a harder, busier snare: raise the tempo and add snare hits rather than changing the kick.

## Afrobeats
- BPM: 98-112
- Swing: 50-56
- Feel: light and bouncy. A kick that skips beat 2, a clap on 2 and 4, a rim on the 3-2 clave, a shaker on every sixteenth and a short bass that follows the kick.

```
ARC BEAT 1
name Afrobeats bounce
tempo 104
swing 54

[A] bars 1 step 1/16
A7 kick        | X... ..x. ..x. .... |
A6 clap        | .... X... .... X... |
A1 rim         | x..x ..x. ..x. x... |
A3 shaker      | xoxo xoxo xoxo xoxo |

[B] bars 1
notes
B7 at 1.1.1 note G1 gate 1/8
B7 at 1.2.3 note G1 gate 1/16
B7 at 1.3.3 note A#1 gate 1/8
B7 at 1.4.2+2 note C2 gate 1/16
B7 at 1.4.3 note D2 gate 1/8
```

Afrobeats is the umbrella name for West African pop (Wizkid, Burna Boy, Davido), and its drums lead the song. The rim plays the 3-2 clave in one bar (steps 1, 4, 7, 11 and 13), the figure most Afrobeats grooves lean on, against a kick that skips beat 2 and a steady shaker. The bass on B7 follows the kick and climbs G, A#, C, D into the next bar; its note on an off sixteenth carries `+2`, the swing of 54 by hand. Recent Afrobeats often borrows amapiano's log drum: for that, start from the Amapiano recipe.

## Jersey club
- BPM: 130-140
- Swing: 50
- Feel: the Jersey kick: five a bar, two on the beat and three that tumble into the next bar (steps 1, 5, 9, 12 and 15). A clap with the last kicks, hats only on 2 and 4, a squeak between the kicks and an 808 bass that copies the kick. Straight, fast and hard.

```
ARC BEAT 1
name Jersey bounce
tempo 135
swing 50

[A] bars 2 step 1/16
A7 kick        | X... X... X..X ..X. | X... X... X..X ..X. |
A6 clap        | .... .... x..x .... | .... .... x.ox .... |
A4 closed hat  | .... x... .... x... | .... x... .... x... |
A0 perc squeak | ..x. ..x. .... .... | ..x. ..x. .... ...o |

[B] bars 2
notes
B7 at 1.1.1 note F1 gate 1/4
B7 at 1.2.1 note F1 gate 1/4
B7 at 1.3.1 note F1 gate 72
B7 at 1.3.4 note F1 gate 72
B7 at 1.4.3 note F1 gate 1/8
B7 at 2.1.1 note F1 gate 1/4
B7 at 2.2.1 note F1 gate 1/4
B7 at 2.3.1 note G#1 gate 72
B7 at 2.3.4 note G#1 gate 72
B7 at 2.4.3 note G1 gate 1/8
```

The kick is the style: two quarter notes, two dotted eighths and an eighth, the same every bar and never swung. The clap lands with the third and fourth kicks, with a ghost between them in bar 2, and the closed hat only marks 2 and 4. A0 stands in for the bed squeak, the creaking-bed sample from Trillville's "Some Cut" that runs through Jersey club: put a squeak, a shout or any short sample from the user's list there. The bass on B7 plays the kick's rhythm in KEYS, F for a bar, then G# and G.

The other half of the style is a chopped vocal: one syllable repeated on the kick's rhythm or in quick sixteenths. The factory kit has none, so ask for the user's own sample on D7. Jersey club grew out of Baltimore club, which is slower (about 130) and built on the "Think" break; the same kick now turns up in rap and pop (Lil Uzi Vert, Drake).

## Footwork
- BPM: 155-165
- Swing: 50
- Feel: fast and off-kilter. Kicks every three sixteenths, so they run against the beat, with a pitched 808 under them, a clap on 3 for a half-time feel, hats in triplets across the bar and a snare triplet roll. Leave space for a chopped vocal.

```
ARC BEAT 1
name Footwork stumble
tempo 160
swing 50

[A] bars 2 step 1/16
A7 kick        | X..X ..X. .X.. X... | X..X ..X. .X.. .... |
A6 clap        | .... .... X... .... | .... .... X... .... |
notes
A4 at 1.1.1 vel 90
A4 at 1.1.3+16 vel 70
A4 at 1.2.2+8 vel 90
A4 at 1.3.1 vel 70
A4 at 1.3.3+16 vel 90
A4 at 1.4.2+8 vel 70
A4 at 2.1.1 vel 90
A4 at 2.1.3+16 vel 70
A4 at 2.2.2+8 vel 90
A4 at 2.3.1 vel 70
A4 at 2.3.3+16 vel 90
A4 at 2.4.2+8 vel 70
A9 at 2.4.1 vel 60
A9 at 2.4.1+16 vel 72
A9 at 2.4.2+8 vel 84
A9 at 2.4.3 vel 96
A9 at 2.4.3+16 vel 110
A9 at 2.4.4+8 vel 127

[B] bars 2
notes
B7 at 1.1.1 note F1 gate 72
B7 at 1.1.4 note F1 gate 72
B7 at 1.2.3 note F1 gate 72
B7 at 1.3.2 note F1 gate 72
B7 at 1.4.1 note F1 gate 1/4
B7 at 2.1.1 note F1 gate 72
B7 at 2.1.4 note F1 gate 72
B7 at 2.2.3 note G#1 gate 72
B7 at 2.3.2 note D#1 gate 1/4
```

The kick plays 3 + 3 + 3 + 3 + 4 sixteenths, the skipping pulse footwork took from Chicago ghetto house, and leaves out its last hit in bar 2 to make room for the roll. The bass on B7 doubles the kick in KEYS, F, then G# and D#: in footwork the kick and the bass are often one pitched 808, so a long 808 sub (see synth-sounds.md) fits when the user's list has none. The hats on A4 play quarter-note triplets, six a bar, which only fit the notes list. Against the straight kick and clap they give the triplet pull the style lives on, and the snare's sixteenth-note triplets in bar 2's last beat are the classic roll.

Footwork switches between this half-time feel and full time, so dancers can catch their breath and then go fast again: for a full-time bar, put the clap on 2 and 4. The rest is a vocal chop from the user's own samples, one or two words repeated in short loops. Juke, the older Chicago style, is the same speed with a straighter four-on-the-floor kick.

## Hip-house
- BPM: 112-124
- Swing: 52-58
- Feel: house drums with a hip-hop snare and a bit of swing. The kick plays four on the floor with one extra push at the end of the bar, the snare has a break's ghost notes, and a short bass riff leaves room for a rap.

```
ARC BEAT 1
name Hip-house
tempo 118
swing 54

[A] bars 1 step 1/16
A7 kick        | X... X... X... X..x |
A9 snare       | .... X..o .o.. X... |
A4 closed hat  | x... x... x... x... |
A5 open hat    | ..x. ..x. ..x. ..x. |

[B] bars 1
notes
B7 at 1.1.1 note G1 gate 1/8 vel 110
B7 at 1.1.4+2 note G1 gate 1/16 vel 90
B7 at 1.2.3 note A#1 gate 1/8 vel 100
B7 at 1.3.1 note G1 gate 1/8 vel 110
B7 at 1.3.4+2 note D2 gate 1/16 vel 90
B7 at 1.4.3 note F1 gate 1/8 vel 100
```

The house half is the 909 layout: the kick on every beat, the closed hat on the beat and the open hat on the offbeat. The hip-hop half is the snare on 2 and 4 instead of a clap, with two ghost notes after beat 2, as in a sampled break, and the kick's push into the next bar. The bass is a short riff in G minor that leaves room for a rapper. This is late-80s Chicago and London hip-house (Fast Eddie, Tyree, the Beatmasters), around 120; the 2010s electro-hop hits are faster and closer to EDM, with the House recipe's clap and pump.

## Pop and rock backbeat
- BPM: 90-130
- Swing: 50
- Feel: the beat everyone knows. Kick on 1 and 3, snare on 2 and 4, hats on every eighth. The best first beat to build and to change.

```
ARC BEAT 1
name Basic backbeat
tempo 100
swing 50

[A] bars 1 step 1/16
A7 kick        | X... .... X... .... |
A9 snare       | .... X... .... X... |
A4 closed hat  | x.x. x.x. x.x. x.x. |
```

## Deep house
- BPM: 118-124
- Swing: 56-62
- Feel: warm and rolling, with a deep shuffle. Four on the floor, a soft clap on 2 and 4, open hats on the offbeats over shuffled closed hats, a minor ninth chord stab answering the kick, and a round, muted bass that skips around the beat.

```
ARC BEAT 1
name Deep warmth
tempo 122
swing 58

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A6 clap        | .... x... .... x... |
A5 open hat    | ..x. ..x. ..x. ..x. |
A4 closed hat  | .o.o .o.o .o.o .o.o |

[B] bars 1
notes
B7 at 1.1.4+4 note A1 gate 1/16 vel 100
B7 at 1.2.3 note A1 gate 1/8 vel 90
B7 at 1.3.4+4 note C2 gate 1/16 vel 100
B7 at 1.4.3 note G1 gate 1/8 vel 90

[C] bars 1
notes
C7 at 1.1.3 note A3 gate 1/8 vel 85
C7 at 1.1.3 note C4 gate 1/8 vel 85
C7 at 1.1.3 note E4 gate 1/8 vel 85
C7 at 1.1.3 note G4 gate 1/8 vel 85
C7 at 1.1.3 note B4 gate 1/8 vel 85
C7 at 1.3.3 note A3 gate 1/8 vel 80
C7 at 1.3.3 note C4 gate 1/8 vel 80
C7 at 1.3.3 note E4 gate 1/8 vel 80
C7 at 1.3.3 note G4 gate 1/8 vel 80
C7 at 1.3.3 note B4 gate 1/8 vel 80
```

Deep house is the most swung of the house family: the bass's pushes on the a of 1 and 3 sit 4 ticks late to match the hats at swing 58. The chord is an A minor ninth (A, C, E, G, B), a short Rhodes or organ stab on the offbeats of 1 and 3, so it answers the kick; the bass is muted and round, under the chord. This is the classic Chicago and New Jersey sound (Larry Heard, Kerri Chandler); the 2010s chart "deep house" is closer to the House recipe with a bouncy organ bass. For a pad version, hold one chord a bar (`gate 384`) instead of the stabs.

## Tech house
- BPM: 124-128
- Swing: 54-60
- Feel: tight, shuffled and groovy. A punchy kick on every beat, a clap on 2 and 4, closed hats around an offbeat open hat, and a rolling bassline between the kicks, ducked by them, that carries the track.

```
ARC BEAT 1
name Tech groove
tempo 126
swing 56
sidechain A7 B 25 50

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A6 clap        | .... X... .... X... |
A4 closed hat  | oo.x oo.x oo.x oo.x |
A5 open hat    | ..x. ..x. ..x. ..x. |

[B] bars 1
notes
B7 at 1.1.3 note F1 gate 1/16 vel 110
B7 at 1.1.4+3 note F1 gate 1/16 vel 80
B7 at 1.2.3 note F1 gate 1/16 vel 110
B7 at 1.2.4+3 note G#1 gate 1/16 vel 90
B7 at 1.3.3 note F1 gate 1/16 vel 110
B7 at 1.3.4+3 note F1 gate 1/16 vel 80
B7 at 1.4.3 note F1 gate 1/16 vel 110
B7 at 1.4.4+3 note C2 gate 1/16 vel 90
```

The bass is the star: a short note on every "and" and a quieter one on every "a", so it rolls between the kicks and never sits on them, on three notes (F, G#, C). The `sidechain` line ducks it a little on every kick so the two don't fight. The closed hat leaves the and to the open hat and leans on the a, which with swing 56 gives the skip; the bass's notes on the a are 3 ticks late to match. This is modern tech house (Fisher, Chris Lake, Michael Bibi); 90s London tech house (Terry Francis, Mr C) is drier and dubbier, closer to the Techno recipe. To tweak: a vocal chop or a short stab on D7 on the and of 4, a percussion fill every 8 bars.

## Disco and nu-disco
- BPM: 112-122
- Swing: 50-54
- Feel: bright and live. Four on the floor, a snare or clap on 2 and 4, open hats on every offbeat, a tambourine or shaker in sixteenths, and an octave-jumping bassline under major seventh chords.

```
ARC BEAT 1
name Mirror ball
tempo 118
swing 52

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A9 snare       | .... X... .... X... |
A5 open hat    | ..x. ..x. ..x. ..x. |
A3 tambourine  | oxox oxox oxox oxox |

[B] bars 1
notes
B7 at 1.1.1 note F1 gate 1/16 vel 110
B7 at 1.1.3 note F2 gate 1/16 vel 100
B7 at 1.2.1 note F1 gate 1/16 vel 110
B7 at 1.2.3 note F2 gate 1/16 vel 100
B7 at 1.3.1 note A1 gate 1/16 vel 110
B7 at 1.3.3 note A2 gate 1/16 vel 100
B7 at 1.4.1 note C2 gate 1/16 vel 110
B7 at 1.4.3 note C3 gate 1/16 vel 100

[C] bars 1
notes
C7 at 1.1.1 note F3 gate 192 vel 85
C7 at 1.1.1 note A3 gate 192 vel 85
C7 at 1.1.1 note C4 gate 192 vel 85
C7 at 1.1.1 note E4 gate 192 vel 85
```

The octave bass is the style: the root low on the beat and an octave up on the "and", F, F, A and C under an F major seventh. The open hat on every offbeat is disco's hissing hat, and the tambourine fills the sixteenths. Nu-disco is the same groove with a filtered loop or a synth bass: a low-pass `fx filter` on the chords is the quick way.

## Afro house
- BPM: 118-124
- Swing: 52-58
- Feel: hypnotic and percussive. A steady, round kick, a soft rim on 2 and 4, shakers in sixteenths, and toms and percussion in a rolling three-against-four pattern; a deep bass note and a long, soft minor chord, changing every bar.

```
ARC BEAT 1
name Afro roll
tempo 122
swing 54

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A1 rim         | .... x... .... x... |
A3 shaker      | xoxo xoxo xoxo xoxo |
A2 tom         | ..x. .x.. x..x ..x. |
A0 perc        | x..x ..x. .x.. x... |

[B] bars 2
notes
B7 at 1.1.1 note D1 gate 1/4 vel 110
B7 at 1.3.3 note D1 gate 1/8 vel 95
B7 at 2.1.1 note C1 gate 1/4 vel 110
B7 at 2.3.3 note C1 gate 1/8 vel 95

[C] bars 2
notes
C7 at 1.1.1 note A3 gate 384 vel 75
C7 at 1.1.1 note C4 gate 384 vel 75
C7 at 1.1.1 note D4 gate 384 vel 75
C7 at 1.1.1 note F4 gate 384 vel 75
C7 at 2.1.1 note G3 gate 384 vel 75
C7 at 2.1.1 note C4 gate 384 vel 75
C7 at 2.1.1 note D4 gate 384 vel 75
C7 at 2.1.1 note E4 gate 384 vel 75
```

The percussion is the style: the tom and the perc each play every third sixteenth, so they run three against the four kicks and start again each bar, while the shaker keeps the sixteenths. The bass and the chord change every bar, D minor seventh then C add nine (the i and VII of D minor), and the chord is held the whole bar, soft, so the drums stay in front. This is the South African sound (Black Coffee, Culoe De Song); the newer global afro house (Keinemusik) is more melodic, with a chant or vocal hook on D7. For more movement, change the rim on 2 and 4 to a clap, or give the perc a conga.

## Amapiano
- BPM: 108-115
- Swing: 52-58
- Feel: laid-back and bouncy. A soft kick on the beat, a shaker in sixteenths, a rim on syncopated off-sixteenths, a sparse clap, jazzy held chords, and the log drum: a deep, pitched, knocking bass hit (a made sound on B7) that plays between the beats.

```
ARC BEAT 1
name Log drum
tempo 112
swing 56

[A] bars 1 step 1/16
A7 kick        | x... x... x... x... |
A3 shaker      | xoxo xoxo xoxo xoxo |
A1 rim         | ...x ..x. .x.. ..x. |
A6 clap        | .... .... .... x... |

[B] bars 1
synth B7 kick note C2 decay 45 bend 25 click 30 drive 45 name log_drum
pad B7 mode key
notes
B7 at 1.1.4+3 note F3 gate 1/8 vel 115
B7 at 1.2.3 note F3 gate 1/16 vel 90
B7 at 1.3.2+3 note G#3 gate 1/8 vel 115
B7 at 1.4.1 note C4 gate 1/16 vel 100
B7 at 1.4.3 note A#3 gate 1/8 vel 110

[C] bars 2
notes
C7 at 1.1.1 note G#3 gate 384 vel 75
C7 at 1.1.1 note C4 gate 384 vel 75
C7 at 1.1.1 note D#4 gate 384 vel 75
C7 at 1.1.1 note G4 gate 384 vel 75
C7 at 2.1.1 note G#3 gate 384 vel 75
C7 at 2.1.1 note C4 gate 384 vel 75
C7 at 2.1.1 note C#4 gate 384 vel 75
C7 at 2.1.1 note F4 gate 384 vel 75
```

The log drum is the style ("without the log drum, it's not amapiano"): a deep, pitched, slightly distorted bass hit that is both bass and drum. Factory kits don't have one, so the `synth` line makes it: a kick body at C2 with a short pitch drop, a click and drive for its knock. It plays in KEYS, so `note F3` plays F1 (the KEYS rule). The kick stays soft and steady and the log drum plays between the beats, on the a of 1, the and of 2, the e of 3 and the and of 4: mostly every third sixteenth, like a tresillo over the shaker, touching a beat only on 4. The chords are jazzy and held: F minor ninth, then C# major seventh. This is the mainstream log-drum sound (Kabza De Small, DJ Maphorisa); the softer "private school" amapiano (Kelvin Momo) uses a mellower log drum (`drive 15`, `decay 35`) and more keys. To tweak: the log drum's `bend` up for more "bwom", the same `pitch` on pads B7 and C7 (a `pad` line) for another key.

## Phonk
- BPM: 130-150
- Swing: 50-54
- Feel: drift phonk, the cowbell sound most people mean today. Half time with a clap on 3, rolling hats, a hard-distorted 808 with the kick and a short, distorted cowbell melody in a minor key on top.

```
ARC BEAT 1
name Cowbell drift
tempo 140
swing 50

[A] bars 2 step 1/16
A7 kick        | X... ...x ..X. .... | X... ...x ..X. ..x. |
A6 clap        | .... .... X... .... | .... .... X... .... |
A4 closed hat  | x.x. x.xx x.x. x.xx | x.x. x.xx x.x. xxxx |

[B] bars 2
synth B7 sub note C2 decay 70 bend 15 drive 70 name dirty_808
pad B7 mode legato
notes
B7 at 1.1.1 note C4 gate 160
B7 at 1.2.4 note C4 gate 64
B7 at 1.3.3 note C4 gate 136
B7 at 2.1.1 note C4 gate 160
B7 at 2.2.4 note C4 gate 64
B7 at 2.3.3 note C#4 gate 110
B7 at 2.4.3 note C4 gate 48

[D] bars 2
synth D7 cowbell note C5 decay 30 drive 50 name phonk_bell
pad D7 mode key
notes
D7 at 1.1.1 note C4 vel 120
D7 at 1.1.4 note C4 vel 100
D7 at 1.2.3 note D#4 vel 110
D7 at 1.3.1 note C4 vel 120
D7 at 1.3.4 note C#4 vel 100
D7 at 1.4.3 note C4 vel 110
D7 at 2.1.1 note C4 vel 120
D7 at 2.1.4 note C4 vel 100
D7 at 2.2.3 note D#4 vel 110
D7 at 2.3.1 note F4 vel 120
D7 at 2.3.4 note D#4 vel 100
D7 at 2.4.3 note C#4 vel 110
```

The cowbell melody is the style: the TR-808 cowbell, distorted and played as the lead. Group D is empty on a fresh EP-133, so `synth D7 cowbell` makes one (two squares a fifth apart, as on the 808) with drive. It was made at C5, so `note C4` plays C5. The riff is C and its neighbours in C Phrygian (C#, D#, F) on the 3+3+2 points of each bar. Under it the 808 is a made sub driven hard (`drive 70`), on C with each kick, sliding from C# down to C at the end of bar 2 (legato, as in Trap), its notes written two octaves up.

A phonk track also carries a Memphis rap vocal chop, pitched down and distorted: sample one onto a free pad and hit it once every two or four bars. Some drift tracks put the kick on every beat for the drop. Older phonk (SpaceGhostPurrp, DJ Smokey, early 2010s) is slower and dustier, built on chopped Memphis samples without the cowbell lead.

## G-funk
- BPM: 88-100
- Swing: 54-62
- Feel: smooth and rolling, West Coast 90s. A laid-back kick, a snare with a clap on 2 and 4, swung sixteenth hats, a rubbery bass that walks the chords, soft electric piano chords and a high, whining lead that slurs from note to note.

```
ARC BEAT 1
name Sunset ride
tempo 94
swing 58

[A] bars 2 step 1/16
A7 kick        | X... ..x. X.x. .... | X... ..x. X... ..x. |
A9 snare       | .... X... .... X... | .... X... .... X..o |
A6 clap        | .... x... .... x... | .... x... .... x... |
A4 closed hat  | x.xo x.xo x.xo x.xo | x.xo x.xo x.xo x.xo |

[B] bars 2
notes
B7 at 1.1.1 note E1 gate 1/8 vel 110
B7 at 1.1.4+4 note E2 gate 1/16 vel 85
B7 at 1.2.3 note E1 gate 1/8 vel 100
B7 at 1.3.1 note G1 gate 1/8 vel 105
B7 at 1.3.3 note A1 gate 1/8 vel 100
B7 at 1.4.3 note B1 gate 1/8 vel 95
B7 at 2.1.1 note A1 gate 1/8 vel 110
B7 at 2.1.4+4 note A2 gate 1/16 vel 85
B7 at 2.2.3 note A1 gate 1/8 vel 100
B7 at 2.3.1 note G1 gate 1/8 vel 105
B7 at 2.4.1 note F#1 gate 1/8 vel 95
B7 at 2.4.3 note D2 gate 1/8 vel 100

[C] bars 2
notes
C7 at 1.1.1 note G3 gate 336 vel 75
C7 at 1.1.1 note B3 gate 336 vel 75
C7 at 1.1.1 note D4 gate 336 vel 75
C7 at 1.1.1 note F#4 gate 336 vel 75
C7 at 2.1.1 note G3 gate 336 vel 75
C7 at 2.1.1 note B3 gate 336 vel 75
C7 at 2.1.1 note C#4 gate 336 vel 75
C7 at 2.1.1 note E4 gate 336 vel 75

[D] bars 2
synth D7 lead note C6 length 2 tone 45 detune 5 name whine
pad D7 mode legato
notes
D7 at 1.1.1 note E4 gate 200 vel 100
D7 at 1.3.1 note D4 gate 60 vel 90
D7 at 1.3.3 note B3 gate 200 vel 95
D7 at 2.1.1 note C#4 gate 240 vel 100
D7 at 2.3.3 note B3 gate 96 vel 90
D7 at 2.4.3 note D4 gate 48 vel 90
```

The whine is the style: a high synth lead, close to a whistle, gliding between long notes (a Minimoog on Dr. Dre's records). Group D is empty on a fresh EP-133, so `synth D7 lead` makes one at C6, dark and barely detuned; `note C4` plays C6 and `note E4` E6. `pad D7 mode legato` slurs it: where a note starts before the last one ends, the pitch changes without a new attack, the nearest the EP-133 gets to the Moog's glide. The chords on C7 are E minor 9 and A9 without their roots (the bass has them), a two-chord funk vamp; an electric piano suits them (`515 epiano 360` in the factory pack). The bass hits with the kick, pops up an octave on the swung sixteenth (`+4`, the swing of 58 by hand) and walks up to the next chord.

To tweak: leave the lead out for two bars between phrases so it stays a hook, or drop the clap for a drier snare.

## Liquid drum and bass
- BPM: 170-176
- Swing: 50-54
- Feel: smooth and flowing. The two-step kick and snare, soft ghost snares, rolling hats, a deep sub that follows the chords, and lush minor and major ninth chords held a bar each.

```
ARC BEAT 1
name Liquid flow
tempo 174
swing 50

[A] bars 2 step 1/16
A7 kick        | X... .... ..X. .... | X... .... ..X. .... |
A9 snare       | .... X..o .o.. X... | .... X..o .o.. X..o |
A4 closed hat  | x.xo x.xo x.xo x.xo | x.xo x.xo x.xo x.xo |

[B] bars 2
notes
B7 at 1.1.1 note D1 gate 288 vel 110
B7 at 1.4.3 note F1 gate 1/8 vel 90
B7 at 2.1.1 note A#1 gate 240 vel 110
B7 at 2.3.3 note A1 gate 1/4 vel 100

[C] bars 2
notes
C7 at 1.1.1 note D3 gate 384 vel 75
C7 at 1.1.1 note F3 gate 384 vel 75
C7 at 1.1.1 note A3 gate 384 vel 75
C7 at 1.1.1 note C4 gate 384 vel 75
C7 at 1.1.1 note E4 gate 384 vel 70
C7 at 2.1.1 note A#2 gate 384 vel 75
C7 at 2.1.1 note D3 gate 384 vel 75
C7 at 2.1.1 note F3 gate 384 vel 75
C7 at 2.1.1 note A3 gate 384 vel 75
C7 at 2.1.1 note C4 gate 384 vel 70
```

The drums are the plain two-step (kick on 1 and the "and" of 3, snare on 2 and 4) with ghost snares on the a of 2 and the e of 3, and hats that roll on the eighths with a soft sixteenth before each one. The chords are what make it liquid: D minor 9 in bar 1, then B-flat major 9 in bar 2, each held a full bar on C7 at a soft velocity. The sub on B7 plays each chord's root long and adds one short note to pass to the next. Pick a Rhodes, piano, strings or a soft pad for C7 (the factory pack's epiano or string sounds) and a clean sub for B7.

To tweak: a ride on the eighths instead of the hats for a jazzier feel, swing 52-54 for a looser roll, or a 4-bar progression (add G minor 9 and A minor 7) for a longer loop.

## Electro
- BPM: 125-135
- Swing: 50
- Feel: robotic and funky, 808 electro. A syncopated kick, a hard snare on 2 and 4 with no ghosts, sixteenth hats with holes punched in them, a cowbell for the machine-funk hook, and a short, stabbed bass. Every hit at full level or an accent, never in between.

```
ARC BEAT 1
name Robot funk
tempo 128
swing 50

[A] bars 2 step 1/16
A7 kick        | X... ..X. ..X. .... | X... ..X. ..X. ..X. |
A9 snare       | .... X... .... X... | .... X... .... X... |
A6 clap        | .... .... .... .... | .... .... .... X... |
A4 closed hat  | xxxx xx.x xxxx x.xx | xxxx xx.x xxxx x.x. |
A5 open hat    | .... .... .... .... | .... .... .... ...x |
A. cowbell     | .... .... .x.. ..x. | .... .... .x.. ..x. |

[B] bars 2
notes
B7 at 1.1.1 note C1 gate 1/16 vel 115
B7 at 1.2.3 note C1 gate 1/16 vel 100
B7 at 1.3.3 note D#1 gate 1/16 vel 105
B7 at 1.4.2 note C1 gate 1/16 vel 100
B7 at 2.1.1 note C1 gate 1/16 vel 115
B7 at 2.2.3 note C1 gate 1/16 vel 100
B7 at 2.3.3 note G1 gate 1/16 vel 105
B7 at 2.4.2 note A#1 gate 1/16 vel 100
B7 at 2.4.4 note C2 gate 1/16 vel 100
```

Electro is programmed, not played: rigid, straight and with almost no velocity changes, as on the 808's step sequencer. The kick weaves around the snare (1, the "and" of 2 and the "and" of 3, plus the "and" of 4 in bar 2), the snare plays only the backbeat, and the hats run sixteenths with a few gaps, which is what makes them skittish rather than a steady wash. At the end of bar 2 a clap doubles the last snare and an open hat closes the phrase. The bass on B7 answers the kick with short notes and climbs C, G, A#, C at the end. 808 sounds suit it best: an 808 kick with a long decay, a bright, snappy snare, the 808 cowbell.

This is the early-1980s sound (Planet Rock, Cybotron, Egyptian Lover). Detroit electro (Drexciya, DJ Stingray) is darker and often faster, up to about 140: drop the cowbell, use minor notes in the bass and add a zap or a cold stab on D7.

## Dubstep
- BPM: 138-142
- Swing: 50
- Feel: heavy and spacious, half time: the 140 sound with a wobble bass that most people mean by dubstep. A kick on 1, the snare on 3, sparse hats that leave beat 3 to the snare, and a bass that hits with the kick, then wobbles through the second half of the bar.

```
ARC BEAT 1
name Half step
tempo 140
swing 50

[A] bars 2 step 1/16
A7 kick        | X... .... .... .... | X... .... .... ..x. |
A9 snare       | .... .... X... .... | .... .... X... .... |
A4 closed hat  | ..x. ..x. .... x.x. | ..x. ..x. .... x.xo |

[B] bars 2
notes
B7 at 1.1.1 note F1 gate 1/4 vel 120
B7 at 1.2.3 note F1 gate 1/8 vel 100
B7 at 1.3.1 note F1 gate 1/8 vel 110
B7 at 1.3.3 note F1 gate 1/8 vel 100
B7 at 1.4.1 note G#1 gate 1/8 vel 110
B7 at 1.4.3 note F1 gate 1/8 vel 100
B7 at 2.1.1 note F1 gate 1/4 vel 120
B7 at 2.2.3 note F1 gate 1/8 vel 100
B7 at 2.3.1 note D#1 gate 32 vel 110
B7 at 2.3.1+32 note D#1 gate 32 vel 100
B7 at 2.3.1+64 note D#1 gate 32 vel 100
B7 at 2.4.1 note C2 gate 32 vel 110
B7 at 2.4.1+32 note C2 gate 32 vel 100
B7 at 2.4.1+64 note C2 gate 32 vel 100
```

The wobble is written as notes: the bass note is played again on every eighth in bar 1 and on eighth triplets (`+32` and `+64`) in bar 2. A bass whose filter closes after each hit (a wobble, growl or acid sound) then says "wub" on each one, in time. With a clean sub on B7 instead, the same card is deep dubstep.

Two other scenes share the drums. Deep dubstep (Digital Mystikz and today's 140 scene) is a sine sub with little or no wobble, more space and a dub delay on a snare or rim. Brostep and riddim (the 2010s US sound) put loud, distorted mid-range growls in the gaps; riddim repeats one short bass phrase over triplet percussion.

## Grime
- BPM: 138-142
- Swing: 50
- Feel: raw and cold, the eskibeat sound of early 2000s East London. A sparse kick, a hard snare on 3, plain hats, a square-wave bass in short phrases and a plinky pentatonic riff above it. Choppy, with room for an MC.

```
ARC BEAT 1
name Eskibeat
tempo 140
swing 50

[A] bars 2 step 1/16
A7 kick        | X... .... .x.. .... | X... .... .x.. ..x. |
A9 snare       | .... .... X... .... | .... .... X... .... |
A4 closed hat  | x... x... x... x.x. | x... x... x... x.x. |

[B] bars 2
notes
B7 at 1.1.1 note E1 gate 1/4 vel 120
B7 at 1.2.4 note E1 gate 1/16 vel 100
B7 at 1.3.3 note G1 gate 1/8 vel 110
B7 at 1.4.3 note E2 gate 1/16 vel 100
B7 at 2.1.1 note E1 gate 1/4 vel 120
B7 at 2.2.4 note E1 gate 1/16 vel 100
B7 at 2.3.3 note D1 gate 1/8 vel 110
B7 at 2.4.1 note D2 gate 1/16 vel 100
B7 at 2.4.3 note B1 gate 1/8 vel 110

[D] bars 1
notes
D7 at 1.1.1 note E4 gate 1/16 vel 110
D7 at 1.1.4 note E4 gate 1/16 vel 100
D7 at 1.2.3 note G4 gate 1/16 vel 110
D7 at 1.3.2 note E4 gate 1/16 vel 100
D7 at 1.4.1 note D4 gate 1/16 vel 110
```

B7 wants a square-wave bass (the factory pack has square basses): it is the sound grime is built on, the hollow, gliding squares of Wiley's early beats. It holds beat 1, answers after the snare and jumps an octave at the end of each bar. D7 is the eski riff, five notes of E minor pentatonic on a short bell, pluck or square lead, one bar that repeats against the bass's two. MCs work in 8- and 16-bar sections, so change the riff or drop the drums every eight bars, not every bar. The snare on 3 is the usual choice; some beats put it on 2 and 4 for a faster, garage feel.

## Bassline
- BPM: 135-140
- Swing: 54-60
- Feel: bouncy UK bassline, the Sheffield sound. Four on the floor, a clap on 2 and 4, skippy garage hats, and a loud organ bass that jumps around the bar between the kicks.

```
ARC BEAT 1
name Organ bounce
tempo 137
swing 56

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A6 clap        | .... X... .... X... |
A4 closed hat  | x.xx x.xx x.xx x.xx |

[B] bars 1
notes
B7 at 1.1.3 note A1 gate 1/16 vel 115
B7 at 1.2.2+3 note A2 gate 1/16 vel 100
B7 at 1.2.3 note A1 gate 1/16 vel 110
B7 at 1.3.3 note C2 gate 1/16 vel 115
B7 at 1.4.2+3 note G1 gate 1/16 vel 100
B7 at 1.4.3 note G2 gate 1/16 vel 110
```

The bass on B7 is the lead: it never plays on the kick, it answers it on the offbeats and the sixteenths and jumps an octave. Its notes on the off sixteenths carry `+3`, the swing of 56. Give B7 an organ bass, the M1-style organ that most bassline uses (the factory pack has organ basses), or a warping reese for the other classic sound, the B-line. Modern bassline (the 2020s revival) keeps this beat and the organ riff, with bigger build-ups and drops.

## UK funky
- BPM: 128-132
- Swing: 54-60
- Feel: tribal and swung, the London funky of 2008-2010. A kick on the beat with a syncopated extra, a clap on 2 and 4, rims and toms in a soca-like pattern, a swung shaker, a sub bass on the offbeats and a short chord stab.

```
ARC BEAT 1
name Funky tribal
tempo 130
swing 56

[A] bars 2 step 1/16
A7 kick        | X... X..x X... X... | X... X... X... X..x |
A6 clap        | .... X... .... X... | .... X... .... X... |
A1 rim         | ..x. .x.. ..x. x... | ..x. .x.. ..x. x..x |
A2 tom         | .... ..x. .x.. ..x. | .... ..x. .x.. .xx. |
A3 shaker      | xoxo xoxo xoxo xoxo | xoxo xoxo xoxo xoxo |

[B] bars 2
notes
B7 at 1.1.3 note G1 gate 1/8 vel 110
B7 at 1.2.3 note G1 gate 1/8 vel 100
B7 at 1.3.4+3 note A#1 gate 1/16 vel 100
B7 at 1.4.3 note G1 gate 1/8 vel 110
B7 at 2.1.3 note G1 gate 1/8 vel 110
B7 at 2.2.3 note G1 gate 1/8 vel 100
B7 at 2.3.4+3 note A#1 gate 1/16 vel 100
B7 at 2.4.3 note C1 gate 1/8 vel 110

[C] bars 1
notes
C7 at 1.2.3 note G3 gate 1/16 vel 90
C7 at 1.2.3 note A#3 gate 1/16 vel 90
C7 at 1.2.3 note D4 gate 1/16 vel 90
C7 at 1.2.3 note F4 gate 1/16 vel 90
C7 at 1.4.3 note G3 gate 1/16 vel 80
C7 at 1.4.3 note A#3 gate 1/16 vel 80
C7 at 1.4.3 note D4 gate 1/16 vel 80
C7 at 1.4.3 note F4 gate 1/16 vel 80
```

The percussion carries it: the rim and the tom play a syncopated, soca-like line over the steady kick, and bar 2 adds a kick and a tom pickup into the next bar. Congas or bongos on A1 and A2 suit it better when the list has them. The bass on B7 is a plain sub on the offbeats, between the kicks, that drops to a low C at the end of bar 2; its note on the off sixteenth carries `+3`, the swing of 56. The stab on C7 is a G minor seventh on an organ or piano sound, cut short. The 2020s revival runs slower (about 118-125) and darker, with rolling basses taken from amapiano.

## Halftime
- BPM: 165-175
- Swing: 50-56
- Feel: slow and heavy at drum and bass tempo: one snare a bar, on 3, so it feels like 85. A kick on 1 and the "and" of 2, eighth hats with swung ghosts, a little percussion, and a big reese or growl bass in the gaps.

```
ARC BEAT 1
name Half speed
tempo 170
swing 54

[A] bars 2 step 1/16
A7 kick        | X... ..x. .... .... | X... ..x. .... .x.. |
A9 snare       | .... .... X... .... | .... .... X... ..o. |
A4 closed hat  | x.xo x.x. x.xo x.x. | x.xo x.x. x.xo xoxo |
A0 perc        | .... .o.. .... .... | .... .... .... o... |

[B] bars 2
notes
B7 at 1.1.1 note F1 gate 168 vel 120
B7 at 1.3.3 note F1 gate 1/8 vel 100
B7 at 1.4.1 note G#1 gate 1/4 vel 110
B7 at 2.1.1 note F1 gate 168 vel 120
B7 at 2.3.3 note D#1 gate 1/8 vel 100
B7 at 2.4.2+2 note C2 gate 1/8 vel 110
```

The card runs at the real tempo, 170, so it mixes with drum and bass; the snare on 3 is what halves the feel. The hats take their swing from hip-hop: eighths with a ghost on the late sixteenth, swung at 54. B7 wants a reese or a growl bass (the factory pack has a reese): it holds the first half of each bar, rests under the snare and answers after it. The note on the off sixteenth carries `+2`, the swing of 54.

## Baile funk
- BPM: 125-135
- Swing: 50
- Feel: Rio's funk carioca. The tamborzão: a kick and tom pattern that pushes against the beat, a hard clap, and percussion all over. Loud and simple.

```
ARC BEAT 1
name Tamborzão
tempo 130
swing 50

[A] bars 1 step 1/16
A7 kick        | X..X ..X. X..X ..X. |
A6 clap        | .... X... .... X... |
A2 tom         | ..x. .... ..x. .x.. |
A0 perc        | x.x. x.x. x.x. x.x. |
```

The tamborzão (DJ Luciano, 1998) put Afro-Brazilian drum figures, the atabaque's above all, on a drum machine over Miami bass: here the kick in 3 + 3 + 2 is the boom, the tom on A2 the drum that answers it and A0 the steady percussion. A long 808 note on B7 under the first kick of each half bar adds the Miami bass weight, and a shouted MC line or a horn stab is the hook. Older funk looped the electro record "Volt Mix" at about 125-128; since 2018 Rio's main sound is funk 150 BPM, the same figures at about 150, and São Paulo's mandelão is sparser with a blown-out bass.

## Moombahton
- BPM: 100-112
- Swing: 50
- Feel: Dutch house slowed to reggaeton's speed. Four on the floor, the dembow snare, open hats on the offbeats, a thick bass held across the beat and a quick tom fill every second bar.

```
ARC BEAT 1
name Moombah
tempo 110
swing 50

[A] bars 2 step 1/16
A7 kick        | X... X... X... X... | X... X... X... X... |
A9 snare       | ...X ..X. ...X ..X. | ...X ..X. ...X .... |
A5 open hat    | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. ..x. |
A2 tom         | .... .... .... .... | .... .... .... xxXX |

[B] bars 2
notes
B7 at 1.1.1 note G1 gate 144 vel 110
B7 at 1.2.3 note G1 gate 1/8 vel 100
B7 at 1.3.1 note G1 gate 1/4 vel 110
B7 at 1.4.1 note A#1 gate 1/4 vel 100
B7 at 2.1.1 note D#1 gate 144 vel 110
B7 at 2.2.3 note D#1 gate 1/8 vel 100
B7 at 2.3.1 note F1 gate 192 vel 110
```

Moombahton began in 2009 when Dave Nada slowed Afrojack's Dutch house remix of "Moombah" from 128 to 108 BPM for a party that wanted reggaeton, so it is house drums with the dembow snare on top. The tom fill closes every second bar. The bass on B7 is long and thick, G and A# then D# and F, with a short note on the dembow's "and" of 2. On top go the Dutch house sounds: a squeaky, detuned lead riff or a rave stab on D7, from the user's list. Later moombahton went two ways: moombahcore, with dubstep's distorted bass, and a pop version (Major Lazer) a little slower, around 100.

## Trip-hop
- BPM: 74-92
- Swing: 52-60
- Feel: slow, dark and heavy, 1990s Bristol style. A big, lazy break with the kick doubled before beat 2, a fat snare on 2 and 4, soft eighth hats, a deep dub bass that leaves space, and two minor chords that hang a bar each.

```
ARC BEAT 1
name Bristol fog
tempo 84
swing 56

[A] bars 2 step 1/16
A7 kick        | X..x .... ..X. ..x. | X..x .... X.x. .... |
A9 snare       | .... X... .... X... | .... X... .... X..o |
A4 closed hat  | x.o. x.o. x.o. x.o. | x.o. x.o. x.o. x.oo |

[B] bars 2
notes
B7 at 1.1.1 note G1 gate 168 vel 110
B7 at 1.3.1 note G1 gate 1/8 vel 95
B7 at 1.3.3 note A#1 gate 1/8 vel 95
B7 at 2.1.1 note D#1 gate 264 vel 110
B7 at 2.4.1 note D1 gate 1/8 vel 95
B7 at 2.4.3 note F1 gate 1/8 vel 90

[C] bars 2
notes
C7 at 1.1.1 note G3 gate 384 vel 70
C7 at 1.1.1 note A#3 gate 384 vel 70
C7 at 1.1.1 note D4 gate 384 vel 70
C7 at 1.1.1 note F4 gate 384 vel 70
C7 at 2.1.1 note D#3 gate 384 vel 70
C7 at 2.1.1 note G3 gate 384 vel 70
C7 at 2.1.1 note A#3 gate 384 vel 70
C7 at 2.1.1 note D4 gate 384 vel 70
```

Trip-hop is a hip-hop break slowed down until it drags, with dub's bass and a film score's mood on top. The tempo is the first thing: keep it under about 90. The kick plays 1, the "a" of 1, and a lazy pair in the second half of the bar; bar 2 moves it to beat 3 and adds a ghost snare into the loop. The bass is dub-style: a long G, a short move up, then a held E-flat under the second chord, with gaps where the drums breathe. The chords are Gm7 and E-flat major seven, a bar each, on strings, a Rhodes or an organ (C7).

The sound matters as much as the notes: the drums should sound sampled off an old record, dull and a bit dirty. Pick vinyl or dusty kick and snare sounds from the list, or add `fx distortion 25 30` with `send A 30` for grit, and hold Decimate (FX + 9) over a bar now and then. This recipe is the Massive Attack, Portishead and Tricky sound; later trip-hop keeps the same slow, heavy beat with cleaner drums.

## Downtempo
- BPM: 90-110
- Swing: 52-58
- Feel: relaxed and warm, hip-hop slowed for the chill-out room. A light kick with a lazy second hit, a rim and a soft clap together on 2 and 4, a shaker, a conga answering in the second half of the bar, a round bass that walks the chord, and warm seventh chords with space between them.

```
ARC BEAT 1
name Easy air
tempo 100
swing 54

[A] bars 2 step 1/16
A7 kick        | X... ...6 .x.. .... | X... ...6 .x.. ..6. |
A1 rim         | .... x... .... x... | .... x... .... x... |
A6 clap        | .... o... .... o... | .... o... .... o... |
A3 shaker      | .o.o .o.o .o.o .o.o | .o.o .o.o .o.o .o.o |
A0 perc        | .... .... .... .ox. | .... .... ..o. .ox. |

[B] bars 2
notes
B7 at 1.1.1 note D2 gate 1/4 vel 105
B7 at 1.2.4+2 note D2 gate 1/16 vel 80
B7 at 1.3.1 note A1 gate 1/8 vel 95
B7 at 1.4.3 note F#2 gate 1/8 vel 85
B7 at 2.1.1 note E2 gate 1/4 vel 105
B7 at 2.2.4+2 note E2 gate 1/16 vel 80
B7 at 2.3.1 note B1 gate 1/8 vel 95
B7 at 2.4.3 note C#2 gate 1/8 vel 85

[C] bars 2
notes
C7 at 1.1.1 note D3 gate 288 vel 75
C7 at 1.1.1 note F#3 gate 288 vel 75
C7 at 1.1.1 note A3 gate 288 vel 75
C7 at 1.1.1 note C#4 gate 288 vel 75
C7 at 2.1.1 note E3 gate 288 vel 72
C7 at 2.1.1 note G3 gate 288 vel 72
C7 at 2.1.1 note B3 gate 288 vel 72
C7 at 2.1.1 note D4 gate 288 vel 72
```

The first kick of each bar is on the grid and loud; the others are softer and syncopated. The rim and the soft clap on the same steps make one hybrid backbeat, lighter than a snare. The conga (A0, any hand drum) answers in the second half of each bar, so the start stays open. The bass plays the root, a soft repeat swung by hand (`+2` at swing 54), the fifth, and a note that leads into the next chord. The chords are Dmaj7 and Em7, three beats each, with a beat of silence before the change. Use a Rhodes, a soft pad or strings on C7.

This is the 1990s style of Kruder & Dorfmeister, Thievery Corporation and Nightmares on Wax. Later Bonobo tracks such as Cirrus run faster, about 120, with a soft four-on-the-floor kick under layers of hand percussion; for that, start from Deep house with these chords and drop the clap.

## Neo-soul
- BPM: 80-95
- Swing: 56-66
- Feel: loose and human, Dilla and Voodoo style. Kicks that drag, a snare clearly late on 2 and 4, heavily swung hats with ghost notes, a bass line that sits far behind the beat, and lush ninth chords on a Rhodes.

```
ARC BEAT 1
name Late snare
tempo 88
swing 62

[A] bars 2 step 1/16
A7 kick        | X... ..x. .x.. .x.. | X... ..x. .x.. ..x. |
A4 closed hat  | xoxo xoxo xoxo xoxo | xoxo xoxo xoxo xoxx |
notes
A9 at 1.2.1+6 vel 115
A9 at 1.4.1+6 vel 115
A9 at 2.2.1+6 vel 115
A9 at 2.3.4+6 vel 40
A9 at 2.4.1+6 vel 115

[B] bars 2
notes
B7 at 1.1.1+6 note E1 gate 1/8 vel 105
B7 at 1.2.3+6 note G1 gate 1/16 vel 85
B7 at 1.2.4+12 note A1 gate 1/16 vel 80
B7 at 1.3.1+6 note B1 gate 1/8 vel 100
B7 at 1.4.3+6 note D2 gate 1/16 vel 85
B7 at 1.4.4+12 note G#1 gate 1/16 vel 80
B7 at 2.1.1+6 note A1 gate 1/8 vel 105
B7 at 2.2.3+6 note C2 gate 1/16 vel 85
B7 at 2.3.1+6 note E2 gate 1/8 vel 100
B7 at 2.4.1+6 note G1 gate 1/8 vel 90
B7 at 2.4.3+6 note F#1 gate 1/16 vel 85

[C] bars 2
notes
C7 at 1.1.1 note G3 gate 360 vel 78
C7 at 1.1.1 note B3 gate 360 vel 78
C7 at 1.1.1 note D4 gate 360 vel 78
C7 at 1.1.1 note F#4 gate 360 vel 78
C7 at 2.1.1 note C4 gate 360 vel 75
C7 at 2.1.1 note E4 gate 360 vel 75
C7 at 2.1.1 note G4 gate 360 vel 75
C7 at 2.1.1 note B4 gate 360 vel 75
```

The whole style is in the timing. The snare is in the notes list, 6 ticks late (about 40 ms at 88), so it lands behind the kick and hats; a ghost snare before beat 4 of bar 2 lifts the turnaround. The bass is late too: 6 ticks on the beats and the "and"s, and 12 on the swung sixteenths (6 for the swing, 6 for the drag). It walks the chords (E, G, A, B, D, then a G-sharp into A) the way Pino Palladino played on D'Angelo's Voodoo, far back in the pocket. The chords are Em9 and Am9 played without their roots (G B D F#, then C E G B), since the bass has the root; that open, rootless shape is the neo-soul keys sound. Put a Rhodes on C7.

To loosen it further, move single kicks a few ticks early or late in the notes list, but keep beat 1 on the grid so the loop still feels anchored. This is the late-1990s Soulquarians sound (D'Angelo, Erykah Badu, J Dilla, Questlove). Much later neo-soul is played straighter: for it, lower the swing and the drag.

## Synthwave
- BPM: 85-118
- Swing: 50
- Feel: retro and driving, the 1980s seen from now. A big kick on every beat, a huge gated snare on 2 and 4, straight eighth hats, a tom fill into the loop, a saw bass pulsing in octave eighths, and a four-chord minor loop (Am, F, C, G) in wide chords.

```
ARC BEAT 1
name Neon drive
tempo 110
swing 50

[A] bars 2 step 1/16
A7 kick        | X... X... X... X... | X... X... X... X... |
A9 snare       | .... X... .... X... | .... X... .... X... |
A4 closed hat  | x.x. x.x. x.x. x.x. | x.x. x.x. x.x. x... |
A2 tom         | .... .... .... .... | .... .... .... .xxX |

[B] bars 2
notes
B7 at 1.1.1 note A1 gate 1/16 vel 110
B7 at 1.1.3 note A2 gate 1/16 vel 95
B7 at 1.2.1 note A1 gate 1/16 vel 110
B7 at 1.2.3 note A2 gate 1/16 vel 95
B7 at 1.3.1 note F1 gate 1/16 vel 110
B7 at 1.3.3 note F2 gate 1/16 vel 95
B7 at 1.4.1 note F1 gate 1/16 vel 110
B7 at 1.4.3 note F2 gate 1/16 vel 95
B7 at 2.1.1 note C2 gate 1/16 vel 110
B7 at 2.1.3 note C3 gate 1/16 vel 95
B7 at 2.2.1 note C2 gate 1/16 vel 110
B7 at 2.2.3 note C3 gate 1/16 vel 95
B7 at 2.3.1 note G1 gate 1/16 vel 110
B7 at 2.3.3 note G2 gate 1/16 vel 95
B7 at 2.4.1 note G1 gate 1/16 vel 110
B7 at 2.4.3 note G2 gate 1/16 vel 95

[C] bars 2
notes
C7 at 1.1.1 note A3 gate 192 vel 80
C7 at 1.1.1 note C4 gate 192 vel 80
C7 at 1.1.1 note E4 gate 192 vel 80
C7 at 1.3.1 note F3 gate 192 vel 80
C7 at 1.3.1 note A3 gate 192 vel 80
C7 at 1.3.1 note C4 gate 192 vel 80
C7 at 2.1.1 note G3 gate 192 vel 80
C7 at 2.1.1 note C4 gate 192 vel 80
C7 at 2.1.1 note E4 gate 192 vel 80
C7 at 2.3.1 note G3 gate 192 vel 80
C7 at 2.3.1 note B3 gate 192 vel 80
C7 at 2.3.1 note D4 gate 192 vel 80
```

The sound most people hear first is the snare: big, roomy and cut off sharp, the 1980s gated reverb. Put the biggest snare from the list on A9, and if it has a long tail, `pad A9 mode key release 40` cuts it short like a gate. The tom fill on the last three sixteenths of bar 2 is the other 1980s mark; a Simmons-style electronic tom fits best. The bass is a saw or square synth bass (the factory pack has some on group B) jumping between the root and its octave in eighths. The chords move Am, F, C, G, two beats each; put a pad or brass sound on C7.

This is the driving, outrun sound at about 110. For the slower, dreamier style (about 85-100), keep the same parts and use long chords (`gate 384`). For darksynth, push the tempo to the top of the range, play the bass in sixteenths and swap the chords for a low, distorted riff. For an arpeggio, play the chord notes one at a time in sixteenths on D7, with a `sound` or `synth` line for it (group D is empty on a fresh EP-133).

## One drop (EP-40)
- BPM: 70-80
- Swing: 56-66
- Feel: roots reggae. Beat 1 is left empty, and the kick and the rimshot land together on beat 3. The hats play every eighth with a shuffle, and an open hat on the last eighth leads into the next bar. A short guitar chord, the skank, falls on 2 and 4, and the bass leaves beat 1 empty too. The pads are the EP-40 kit's (P01; see [ep40-kit.md](ep40-kit.md)), so use this one when the share says the EP-133 plays that kit.

```
ARC BEAT 1
name One drop
tempo 76
swing 60

[A] bars 2 step 1/8
A1 kick        | .... X... | .... X... |
A2 rimshot     | .... X... | .... X... |
A4 closed hat  | xoxo xoxo | xoxo xox. |
A5 open hat    | .... .... | .... ...x |

[B] bars 2
synth B1 bass note C2 decay 40 tone 20 sweep 15 name roots_bass
pad B1 mode key
notes
B1 at 1.1.3+10 note A3 gate 1/8
B1 at 1.2.1 note A3 gate 1/8
B1 at 1.2.3+10 note C4 gate 1/8
B1 at 1.3.1 note E4 gate 1/4
B1 at 1.4.1 note D4 gate 1/8
B1 at 1.4.3+10 note C4 gate 1/8
B1 at 2.1.3+10 note A3 gate 1/8
B1 at 2.2.1 note G3 gate 1/8
B1 at 2.3.1 note E3 gate 1/4
B1 at 2.4.1 note G3 gate 1/4

[C] bars 2
sound C1 607 guit amin
pad C1 mode key release 10
C1 skank       | .... x... .... x... | .... x... .... x... |
```

The drums are on a 1/8 grid, so the swing moves the offbeat eighths: that is the reggae shuffle. On a 1/16 grid the eighths stay straight whatever the swing. At swing 60 the offbeat eighths come 10 ticks late, so the bass notes on an "and" carry `+10` by hand (the notes list is never swung). The bass is made on B1 (`synth`), a round, dark bass at C2, because the pack's bass one-shots don't say their note; `note A3` plays A1. The skank is the pack's `607 guit amin` on C1, cut short by `mode key release 10`. P01 leaves B1 and C1 silent, so nothing is replaced. With the user's list, any stab from 600-628 works, with the bass moved to its key; `615 horn skank amin` or the organ `600 beethree amin a` swap in as they are.

Keep beat 1 empty in the bass and the drums alike: that hole is the one drop. For a heavier shuffle take the swing to 66, close to triplets, and the bass's `+10` to `+15`.

## Rockers (EP-40)
- BPM: 75-85
- Swing: 50-58
- Feel: the harder roots beat Sly Dunbar brought in at Channel One in the mid 70s, in place of the one drop. The kick plays 1 and 3, the rimshot lands on 3 with a quiet double tap just before it, and the hats sit on the offbeats. The bass drives in eighths under a skank on 2 and 4.

```
ARC BEAT 1
name Rockers
tempo 80
swing 54

[A] bars 2 step 1/16
A1 kick        | X... .... X... .... | X... .... X... .... |
A2 rimshot     | .... ...o X... .... | .... ...o X... .... |
A4 closed hat  | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. ..x. |
A5 open hat    | .... .... .... .... | .... .... .... ..x. |

[B] bars 2
synth B1 bass note C2 decay 40 tone 20 sweep 15 name roots_bass
pad B1 mode key
notes
B1 at 1.1.1 note A3 gate 1/8
B1 at 1.1.3 note A3 gate 1/8
B1 at 1.2.3 note C4 gate 1/8
B1 at 1.3.1 note E4 gate 1/8
B1 at 1.3.3 note D4 gate 1/8
B1 at 1.4.1 note C4 gate 1/4
B1 at 2.1.1 note A3 gate 1/8
B1 at 2.1.3 note A3 gate 1/8
B1 at 2.2.3 note G3 gate 1/8
B1 at 2.3.1 note E3 gate 1/4
B1 at 2.4.1 note G3 gate 1/8
B1 at 2.4.3 note G3 gate 1/8

[C] bars 2
sound C1 607 guit amin
pad C1 mode key release 10
C1 skank       | .... x... .... x... | .... x... .... x... |
```

The bass and the skank are the One drop recipe's sounds: a bass made on B1 (`note A3` plays A1) and the pack's `607 guit amin` on C1, cut short. The ghost rimshot just before beat 3 sits on an off sixteenth, so the swing nudges it late; the hats and the bass are on eighths and stay straight. Sources name these beats differently: some call a kick on 1 and 3 a two drop, and use "rockers" for the four-on-the-floor of Steppers below.

## Steppers (EP-40)
- BPM: 72-84
- Swing: 50-54
- Feel: a kick on every beat under a reggae tempo, the beat Sly Dunbar made famous in the late 70s. The rimshot still lands on beat 3, and the hats sit on the offbeats with an open hat at the end of the bar. The bass marches with the kick, mostly on the beat, and the skank stays on 2 and 4.

```
ARC BEAT 1
name Steppers
tempo 78
swing 50

[A] bars 1 step 1/16
A1 kick        | X... X... X... X... |
A2 rimshot     | .... .... X... .... |
A4 closed hat  | ..x. ..x. ..x. .... |
A5 open hat    | .... .... .... ..x. |

[B] bars 2
synth B1 bass note C2 decay 40 tone 20 sweep 15 name roots_bass
pad B1 mode key
notes
B1 at 1.1.1 note A3 gate 1/4
B1 at 1.2.1 note A3 gate 1/4
B1 at 1.3.1 note C4 gate 1/8
B1 at 1.3.3 note D4 gate 1/8
B1 at 1.4.1 note E4 gate 1/4
B1 at 2.1.1 note A3 gate 1/4
B1 at 2.2.1 note A3 gate 1/4
B1 at 2.3.1 note G3 gate 1/4
B1 at 2.4.1 note E3 gate 1/4

[C] bars 2
sound C1 607 guit amin
pad C1 mode key release 10
C1 skank       | .... x... .... x... | .... x... .... x... |
```

The bass and the skank are the One drop recipe's sounds: a bass made on B1 (`note A3` plays A1) and the pack's `607 guit amin` on C1, cut short. The drums are one bar and repeat under the two-bar bass. For more push, add ghost rimshots on a few sixteenths around beat 3, or move it to UK dub's pace.

## Dub (EP-40)
- BPM: 65-78
- Swing: 50-56
- Feel: the riddim stripped to drums and bass, with space for the echo. The kick is on 1, the rimshot on 3 and only a few hats. The bass carries it. The skank plays once in each bar and runs off into a long delay, and a siren at the end of the second bar does the same.

```
ARC BEAT 1
name Dub plate
tempo 72
swing 52
fx delay 70 65
send A 15 C 60 D 70

[A] bars 2 step 1/16
A1 kick        | X... .... .... ..o. | X... .... .... .... |
A2 rimshot     | .... .... X... .... | .... .... X... .... |
A4 closed hat  | .... x... .... x... | .... x... .... x.o. |

[B] bars 2
synth B1 bass note C2 decay 40 tone 20 sweep 15 name roots_bass
pad B1 mode key
notes
B1 at 1.1.3 note A3 gate 1/8
B1 at 1.2.1 note A3 gate 1/8
B1 at 1.2.3 note C4 gate 1/8
B1 at 1.3.1 note E4 gate 1/4
B1 at 2.1.3 note D4 gate 1/8
B1 at 2.2.1 note C4 gate 1/8
B1 at 2.3.1 note A3 gate 192

[C] bars 2
sound C1 607 guit amin
pad C1 mode key release 10
C1 skank       | .... x... .... .... | .... .... .... x... |

[D] bars 2 step 1/16
D1 siren       | .... .... .... .... | .... .... .... X... |
```

The delay is a quarter note (`fx delay 70 65`) with a long tail. The sends throw the skank (`send C 60`) and the siren (`D 70`) into it, and only a touch of the drums (`A 15`), so the rimshot echoes without the kick turning to mud. The bass gets none: in dub it stays dry, loud and in front. The bass and the skank are the One drop recipe's sounds on B1 and C1. A dub mix drops parts out and brings them back; for that, add a second scene with only the bass and the rimshot, then let the skank back in.

## Digital riddim (EP-40)
- BPM: 90-100
- Swing: 50
- Feel: mid-80s digital dancehall in the spirit of Sleng Teng, which was built on a Casio keyboard's preset of drums and bass. A busy, machine-straight kick in threes, rimshots on 2 and 4 and steady eighth hats, under a bass riff that is the tune: one bar three times, then an answer in the fourth.

```
ARC BEAT 1
name Digital riddim
tempo 96
swing 50

[A] bars 1 step 1/16
A1 kick        | X..X ..X. X..X ..X. |
A2 rimshot     | .... X... .... X... |
A4 closed hat  | x.x. x.x. x.x. x.x. |

[B] bars 4
synth B1 bass note C2 wave square decay 25 tone 45 sweep 10 name digi_bass
pad B1 mode key
notes
B1 at 1.1.1 note A3 gate 1/8
B1 at 1.1.4 note A3
B1 at 1.2.3 note C4 gate 1/8
B1 at 1.3.1 note A3 gate 1/8
B1 at 1.3.4 note G3
B1 at 1.4.3 note E3 gate 1/8
B1 at 2.1.1 note A3 gate 1/8
B1 at 2.1.4 note A3
B1 at 2.2.3 note C4 gate 1/8
B1 at 2.3.1 note A3 gate 1/8
B1 at 2.3.4 note G3
B1 at 2.4.3 note E3 gate 1/8
B1 at 3.1.1 note A3 gate 1/8
B1 at 3.1.4 note A3
B1 at 3.2.3 note C4 gate 1/8
B1 at 3.3.1 note A3 gate 1/8
B1 at 3.3.4 note G3
B1 at 3.4.3 note E3 gate 1/8
B1 at 4.1.1 note D4 gate 1/8
B1 at 4.1.4 note D4
B1 at 4.2.3 note F4 gate 1/8
B1 at 4.3.1 note E4 gate 1/8
B1 at 4.3.4 note D4
B1 at 4.4.3 note C4 gate 1/8
```

The riff is the style, so the card makes it: a short square-wave bass on B1 (`synth`), plain like a home keyboard's, at C2, so `note A3` plays A1. It follows the kick's three-three-two in A minor, and bar 4 answers from D. The pack's bass one-shots don't say their note, which a riff in key needs; with the user's list, one of 400-417 on B1 works once it is tuned by ear (`pad B1 pitch`). Everything is straight (swing 50): the machines didn't swing.

## Dancehall (EP-40)
- BPM: 96-110
- Swing: 50-54
- Feel: dancehall from the 90s to now. Each half bar is two dotted eighths and an eighth (three, three and two sixteenths): the kick on beat 1 and the last sixteenth of the beat, the rimshot (in the clap's place) on the "and" of 2; the same again from beat 3. Eighth hats keep time, a sine bass doubles the kick, and a shout from D3 ends the second bar.

```
ARC BEAT 1
name Dancehall
tempo 104
swing 50

[A] bars 2 step 1/16
A1 kick        | X..X .... X..X .... | X..X .... X..X .... |
A2 rimshot     | .... ..X. .... ..X. | .... ..X. .... ..X. |
A4 closed hat  | x.x. x.x. x.x. x.x. | x.x. x.x. x.x. x.xo |

[B] bars 2
synth B1 sub note C2 decay 40 drive 20 name dh_sub
pad B1 mode key
notes
B1 at 1.1.1 note A3 gate 1/8
B1 at 1.1.4 note A3 gate 1/8
B1 at 1.3.1 note G3 gate 1/8
B1 at 1.3.4 note G3 gate 1/8
B1 at 2.1.1 note F3 gate 1/8
B1 at 2.1.4 note F3 gate 1/8
B1 at 2.3.1 note G3 gate 1/8
B1 at 2.3.4 note E3 gate 1/8

[D] bars 2 step 1/16
D3 shout       | .... .... .... .... | .... .... .... X... |
```

The rimshot on the "and" of 2 and 4, not on 2 and 4, is the displaced backbeat that makes it dancehall. For a clap there, put the pack's `159 clap` on A2 with a sound line. The bass is made on B1, a plain sine (`sub`) with a little drive, at C2, so `note A3` plays A1; it doubles the kick on A, G, F and G, and turns the second bar with an E. Digital riddim above is the mid-80s sound.

## UK dub (EP-40)
- BPM: 135-145
- Swing: 50
- Feel: UK steppers dub at sound-system pace, the sound of Jah Shaka and Iration Steppas. A four-on-the-floor kick, the rimshot on beat 3 so it feels half-time, hats on every sixteenth and an open hat on the offbeats, under a deep sine bass in long notes. A siren at the end of the fourth bar runs off into a long delay.

```
ARC BEAT 1
name UK dub
tempo 140
swing 50
fx delay 60 55
send D 60

[A] bars 1 step 1/16
A1 kick        | X... X... X... X... |
A2 rimshot     | .... .... X... .... |
A4 closed hat  | xoxo xoxo xoxo xoxo |
A5 open hat    | ..x. ..x. ..x. ..x. |

[B] bars 4
synth B1 sub note C2 decay 40 drive 20 name steppa_sub
pad B1 mode key
notes
B1 at 1.1.1 note A3 gate 192
B1 at 1.3.1 note A3 gate 1/4
B1 at 1.4.1 note C4 gate 1/4
B1 at 2.1.1 note D4 gate 192
B1 at 2.3.1 note C4 gate 192
B1 at 3.1.1 note A3 gate 192
B1 at 3.3.1 note A3 gate 1/4
B1 at 3.4.1 note C4 gate 1/4
B1 at 4.1.1 note E4 gate 192
B1 at 4.3.1 note G3 gate 192

[D] bars 4 step 1/16
D1 siren       | .... .... .... .... | .... .... .... .... | .... .... .... .... | .... .... .... ..X. |
```

The bass is the weight of it: a clean sine (`sub`) made on B1 with a little drive, at C2, so `note A3` plays A1. It holds half bars and moves A, C, D, C, then answers with E and G in the fourth bar. The delay carries the siren over the bar line; take the send down if it clouds the kick. For a skank, the One drop recipe's stab on C1, on the offbeats with `send C 40`, fits here too.
