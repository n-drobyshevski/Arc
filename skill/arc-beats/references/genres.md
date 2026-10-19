# Genre recipes

Fifty-seven starting points, including a techno family of twelve (Techno, Detroit, minimal, dub, acid, hypnotic, peak-time, melodic, industrial, hard techno, schranz and hard groove), each a complete ARC BEAT card (see [beat-card.md](beat-card.md) for the format). Two of them, Breakcore arrangement and Schranz arrangement, are whole track ideas: cards of five scenes with a chain. Use them as a base: change the tempo and a few steps and say what you changed. The cards are checked by the skill's test, so they are valid as written.

The last seven, marked **(EP-40)**, are reggae, dub and dancehall for the EP-40 Riddim kit: one drop, rockers, steppers, dub, digital riddim, dancehall and UK dub. Their pads are that kit's (kick A1, rimshot A2, closed hat A4, siren D1; see [ep40-kit.md](ep40-kit.md)), not the assumed kit below. Use them when the share says the EP-133 plays the EP-40 kit, or when the user asks for these styles and confirms that kit. For the EP-40's loops, follow the loop rules in ep40-kit.md.

`scripts/beatcard.py analyse` compares a user's beat with these recipes, reading the `BPM:` and `Swing:` lines and the card of each section below. Keep that shape if you add a recipe: a `##` heading, the two lines, then one fenced card.

Some styles are defined by their effects, and those recipes carry `fx`, `send`, `comp` and `sidechain` lines right after `swing` (see "Effects" in [beat-card.md](beat-card.md)): house (sidechain pump), dub techno (delay), industrial techno, hard techno and breakcore (distortion and compression), schranz (distortion, compression and a sidechain pump) and lo-fi (low-pass filter). A line under the card says in one sentence what they do. The importing user can switch **APPLY FX** off to keep their own FX; a recipe without these lines leaves the FX alone. Write them only when the style needs them.

## The assumed kit

When the user has not copied a pattern out of Arc, the card does not know what is on their pads. Then use this layout and say it is an assumption: *"I've assumed a drum kit on group A (kick on 7, snare on 9 ...). If your pads differ, copy a pattern from Arc and I'll use your pad names."* It is a common layout, not something read from the device: the official factory pack groups its sounds by slot number (kicks 1-99, snares 100-199, hi-hats 200-299, percussion 300-399, bass 400-499, melodic 500-599), but which sound sits on which pad is the user's to change.

| Pad | Sound | Pad | Sound | Pad | Sound |
|---|---|---|---|---|---|
| A7 | kick | A8 | kick 2 | A9 | snare |
| A4 | closed hat | A5 | open hat | A6 | clap |
| A1 | rim | A2 | tom | A3 | shaker |
| A. | cowbell | A0 | perc | AENTER | crash |

- **Group B** is a bass sound on pad 7, **C** a chord or keys sound on pad 7, **D** a lead or effect sound on pad 7. They are played in KEYS mode, so they live in the `notes` list. `note C4` is the sample's own pitch (MIDI 60), so a bass line sits around C1-C3.
- **No sound for a part?** When the user's list (or the factory pack) has nothing that fits, such as a lead on the empty group D, a real 808 sub or an acid bass, add a `synth` line for that pad so Arc makes one; the recipes and the rules are in [synth-sounds.md](synth-sounds.md). A made bass plays its own note (C2) at `note C4`, so move a card's bass line up two octaves for it: `note F1` becomes `note F3`, `note E2` becomes `note E4`. The cards below have no synth lines, so they play whatever is on the pads, except the two schranz ones, whose made sounds are the style.
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
- Swing: 50-54
- Feel: four on the floor, a clap on 2 and 4, open hats on the offbeats and quiet closed hats in between. A short bass stab on the offbeat.

```
ARC BEAT 1
name House groove
tempo 124
swing 52
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
```

The `sidechain` line makes the kick (A7) duck the bass group (B) every time it plays: the bass pumps back up between the kicks. Turn the 30 (length) up for a longer pump.

## Techno
- BPM: 126-138
- Swing: 50
- Feel: relentless kick, no swing, hats that push forward and an off-grid rim for tension. Keep the clap away or very sparse.

```
ARC BEAT 1
name Driving techno
tempo 132
swing 50

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A5 open hat    | ..x. ..x. ..x. ..x. |
A4 closed hat  | x..o x..o x..o x..o |
A1 rim         | ..o. ...o ..o. .o.. |
```

## Detroit techno
- BPM: 125-132
- Swing: 50-56
- Feel: soulful and machine-funky. Four on the floor, a clap on 2 and 4, busy but light hats with a little swing, and warm minor seventh chords that stab off the beat on C7.

```
ARC BEAT 1
name Detroit soul
tempo 128
swing 54

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A6 clap        | .... X... .... X... |
A4 closed hat  | x.xo x.xo x.xo x.xo |
A0 perc        | .... ..o. .... .o.. |

[C] bars 2
notes
C7 at 1.1.1 note F3 gate 1/4 vel 100
C7 at 1.1.1 note G#3 gate 1/4 vel 100
C7 at 1.1.1 note C4 gate 1/4 vel 100
C7 at 1.2.4+2 note F3 gate 1/8 vel 85
C7 at 1.2.4+2 note G#3 gate 1/8 vel 85
C7 at 1.2.4+2 note C4 gate 1/8 vel 85
C7 at 2.1.1 note G#3 gate 1/4 vel 100
C7 at 2.1.1 note C4 gate 1/4 vel 100
C7 at 2.1.1 note D#4 gate 1/4 vel 100
C7 at 2.2.4+2 note G#3 gate 1/8 vel 85
C7 at 2.2.4+2 note C4 gate 1/8 vel 85
C7 at 2.2.4+2 note D#4 gate 1/8 vel 85
```

The chord on the off sixteenth carries `+2`, the swing of 54 by hand, so it sits with the swung hats (see BUILD in SKILL.md).

## Minimal techno
- BPM: 124-130
- Swing: 50-56
- Feel: stripped back and clicky. Four on the floor, one thin offbeat hat, a few rim and perc clicks with a lot of space between them, a subtle shuffle and a short sub blip.

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

## Dub techno
- BPM: 118-126
- Swing: 50-54
- Feel: deep and hazy. A soft four on the floor kick (pick a muffled one), a very sparse hat, and a minor chord stab on C7 whose repeats get quieter, like a delay. Leave the rest empty.

```
ARC BEAT 1
name Dub chord echo
tempo 122
swing 52
fx delay 62 60
send C 30

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A4 closed hat  | .... ..o. .... ..o. |

[C] bars 2
notes
C7 at 1.1.3 note F3 gate 1/4 vel 100
C7 at 1.1.3 note A3 gate 1/4 vel 100
C7 at 1.1.3 note C4 gate 1/4 vel 100
C7 at 1.2.2+1 note F3 gate 1/4 vel 60
C7 at 1.2.2+1 note A3 gate 1/4 vel 60
C7 at 1.2.2+1 note C4 gate 1/4 vel 60
C7 at 1.3.1 note F3 gate 1/4 vel 30
C7 at 1.3.1 note A3 gate 1/4 vel 30
C7 at 1.3.1 note C4 gate 1/4 vel 30
C7 at 2.3.3 note F3 gate 1/4 vel 100
C7 at 2.3.3 note A3 gate 1/4 vel 100
C7 at 2.3.3 note C4 gate 1/4 vel 100
C7 at 2.4.2+1 note F3 gate 1/4 vel 60
C7 at 2.4.2+1 note A3 gate 1/4 vel 60
C7 at 2.4.2+1 note C4 gate 1/4 vel 60
```

The echo is written by hand: each stab repeats three sixteenths later at a lower velocity. The repeat that lands on an off sixteenth carries `+1`, the swing of 52. The `fx delay` line adds a real delay on the chords (62 is a dotted eighth, three sixteenths, the same spacing, and 60 a long tail of repeats), and `send C 30` sends a third of the chord group to it, so the echoes get wetter and longer. Raise the send for more dub, or drop the quieter hand-written repeats and let the delay do all the work.

## Acid techno
- BPM: 135-150
- Swing: 50
- Feel: fast and driving with no clap. Four on the floor, sixteenth hats with an open hat on every offbeat, and a squelchy sixteenth line on B7: accents come from the velocity, tension from octave jumps and a flat fifth, and a longer gate where the line should slide.

```
ARC BEAT 1
name Acid squelch
tempo 142
swing 50

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A4 closed hat  | xoxo xoxo xoxo xoxo |
A5 open hat    | ..x. ..x. ..x. ..x. |

[B] bars 1
notes
B7 at 1.1.1 note A1 gate 1/16 vel 120
B7 at 1.1.2 note A1 gate 1/16 vel 70
B7 at 1.1.3 note A2 gate 1/16 vel 110
B7 at 1.1.4 note A1 gate 1/8 vel 70
B7 at 1.2.2 note C2 gate 1/16 vel 90
B7 at 1.2.3 note A1 gate 1/16 vel 120
B7 at 1.2.4 note A2 gate 1/16 vel 100
B7 at 1.3.1 note A1 gate 1/16 vel 70
B7 at 1.3.2 note A1 gate 1/16 vel 70
B7 at 1.3.3 note D#2 gate 1/8 vel 120
B7 at 1.3.4 note A1 gate 1/16 vel 70
B7 at 1.4.1 note A2 gate 1/16 vel 110
B7 at 1.4.2 note C2 gate 1/16 vel 90
B7 at 1.4.3 note A1 gate 1/16 vel 120
B7 at 1.4.4 note G2 gate 1/16 vel 100
```

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
- Feel: big-room and built for the floor. Four on the floor with a big kick, a clap on 2 and 4, open hats on the offbeats and a shaker that drives on top. The four bars are a build: a crash on bar 1, the clap and shaker coming in, a clap roll to finish.

```
ARC BEAT 1
name Peak-time build
tempo 134
swing 50

[A] bars 4 step 1/16
A7 kick        | X... X... X... X... | X... X... X... X... | X... X... X... X... | X... X... X... X... |
AENTER crash   | X... .... .... .... | .... .... .... .... | .... .... .... .... | .... .... .... .... |
A6 clap        | .... .... .... .... | .... X... .... X... | .... X... .... X... | .... X... .... xxxx |
A5 open hat    | ..o. ..o. ..o. ..o. | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. ..x. |
A3 shaker      | .... .... .... .... | .o.o .o.o .o.o .o.o | xoxo xoxo xoxo xoxo | xoxo xoxo xoxo xoxo |

[B] bars 1
notes
B7 at 1.1.3 note E1 gate 1/8
B7 at 1.2.3 note E1 gate 1/8
B7 at 1.3.3 note E1 gate 1/8
B7 at 1.4.3 note G1 gate 1/8
```

## Melodic techno
- BPM: 120-126
- Swing: 50
- Feel: wide and emotional. Clean drums (kick, clap on 2 and 4, eighth hats), a rolling bass between the kicks, and an eighth-note arpeggio on D7 that walks one chord and then the next.

```
ARC BEAT 1
name Melodic arpeggio
tempo 122
swing 50

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

The arpeggio is two bars (A minor, then F) against a one bar bass, so the bass loops twice under each pass of the lead.

## Industrial techno
- BPM: 130-140
- Swing: 50
- Feel: heavy, dirty and mechanical, with no clap. A second kick (A8) is layered under the first and pushes off the beat, a sparse open hat, metallic cowbell and rim hits, and a few hits placed off the grid so the pattern feels broken. Distort and shorten the sounds on the device to taste.

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

The four notes after the grid are the harsh off-grid hits: each sits a few ticks off a sixteenth, so they land just before or after the grid. The effect lines do the distorting for you: `fx distortion 65 35` is heavy drive with a dark tone, `send A 50 B 60` runs about half the drums and most of the bass through it, and `comp 55 30` squeezes everything together with a quick compressor.

## Hard techno
- BPM: 145-160
- Swing: 50
- Feel: fast and punishing. A pounding four on the floor kick, a clap on 2 and 4, relentless sixteenth hats accented on the offbeat and a rumble bass that rolls after every kick.

```
ARC BEAT 1
name Hard techno pound
tempo 152
swing 50
fx distortion 45 55
send A 25 B 35
comp 50 25

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

The effect lines give the kick its edge: `fx distortion 45 55` is a medium drive with a neutral tone, `send A 25 B 35` mixes some of the drums and the rumble into it, and `comp 50 25` glues the mix with a fast compressor.

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
- Feel: pumping and funky, the swung cousin of hard techno. Kick on every beat, a clap on 2 and 4 with a ghost clap, swung xoxx hats, congas, a tom and a sparse cowbell, and a bouncy bass whose off sixteenths are nudged late.

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

The bass notes on the second and fourth sixteenths carry `+3`, the swing of 56 by hand, so the bounce sits with the swung hats and congas.

## Boom bap
- BPM: 84-96
- Swing: 54-62
- Feel: heavy kick on 1 with a late kick, snare on 2 and 4, loose swung hats, a ghost snare at the end of the second bar.

```
ARC BEAT 1
name Lazy boom bap
tempo 90
swing 58

[A] bars 2 step 1/16
A7 kick        | X... ..x. ..x. .... | X... .... x.x. .... |
A9 snare       | .... X... .... X... | .... X... .o.. X..o |
A4 closed hat  | x.x. x.x. x.x. x.x. | x.x. x.x. x.x. x.xo |
```

## Lo-fi
- BPM: 70-86
- Swing: 56-66
- Feel: soft, behind the beat and a little sloppy. Low velocities, a quiet rim, and a chord that rings under it.

```
ARC BEAT 1
name Dusty lo-fi
tempo 76
swing 62
fx filter 27 20
send A 100 C 100

[A] bars 1 step 1/16
A7 kick        | 8... ..6. .... .5.. |
A9 snare       | .... 7... .... 7... |
A4 closed hat  | 5.3. 5.3. 5.3. 5.4. |
A1 rim         | .... .... ..3. .... |

[C] bars 1
notes
C7 at 1.1.1 note C4 gate 1/4
C7 at 1.1.1 note E4 gate 1/4
C7 at 1.1.1 note G4 gate 1/4
C7 at 1.1.1 note B4 gate 1/4
```

`fx filter 27 20` is a low-pass filter (any cutoff below 50 is low-pass) set low and with a little resonance, and `send A 100 C 100` runs the drums and the chord through it, so everything loses its highs and sounds like an old tape. Move the 27 down for a duller sound, up for a brighter one.

## Trap
- BPM: 130-150 (a half-time feel: the snare is on 3 and the hats run double)
- Swing: 50
- Feel: a lone snare on 3, a sparse kick, a long 808 and hats that stutter into a roll. The roll is on a 1/32 grid, so it sits in the `notes` list.

```
ARC BEAT 1
name Trap half-time
tempo 140
swing 50

[A] bars 2 step 1/16
A7 kick        | X... ..x. .... .... | X... .... ..x. ...x |
A6 clap        | .... .... X... .... | .... .... X... .... |
A4 closed hat  | x.x. x.xx x.x. x.xx | x.x. x.xx x.x. .... |
A5 open hat    | .... .... .... ..x. | .... .... .... .... |
notes
A4 at 2.4.1 vel 50
A4 at 2.4.1+12 vel 60
A4 at 2.4.2 vel 72
A4 at 2.4.2+12 vel 84
A4 at 2.4.3 vel 96
A4 at 2.4.3+12 vel 108
A4 at 2.4.4 vel 118
A4 at 2.4.4+12 vel 127

[B] bars 2
notes
B7 at 1.1.1 note C2 gate 1/4
B7 at 1.3.1 note C2 gate 1/4
B7 at 2.1.1 note G1 gate 1/4
B7 at 2.3.3 note A#1 gate 1/4
```

## Drill
- BPM: 138-146
- Swing: 50
- Feel: also half-time, but the kick is irregular and the 808 slides between notes. Hats are dense and uneven.

```
ARC BEAT 1
name Cold drill
tempo 142
swing 50

[A] bars 2 step 1/16
A7 kick        | X... ...x ..x. .... | X... ..x. .... ..x. |
A9 snare       | .... .... X... .... | .... .... X... ...o |
A4 closed hat  | x.xx x.x. xx.x x.x. | x.xx x.x. xx.x xxxx |

[B] bars 2
notes
B7 at 1.1.1 note C2 gate 1/4
B7 at 1.2.4 note D#2 gate 1/8
B7 at 1.3.3 note F2 gate 1/4
B7 at 2.1.1 note C2 gate 1/4
B7 at 2.3.3 note G#1 gate 1/4
```

## Drum and bass
- BPM: 170-176
- Swing: 50
- Feel: the two-step. A kick on 1 and a second one late in the bar, snare on 2 and 4, running hats. At this tempo the snare lands fast, so keep the bass long.

```
ARC BEAT 1
name Two-step roller
tempo 174
swing 50

[A] bars 2 step 1/16
A7 kick        | X... .... ..X. .... | X... ..x. ..X. .... |
A9 snare       | .... X... .... X... | .... X..o .o.. X... |
A4 closed hat  | x.x. x.x. x.x. x.x. | x.x. x.x. x.x. x... |
A5 open hat    | .... .... .... .... | .... .... .... ..x. |

[B] bars 2
notes
B7 at 1.1.1 note F1 gate 1/4
B7 at 1.2.4 note F1 gate 1/8
B7 at 1.3.3 note G#1 gate 1/4
B7 at 2.1.1 note F1 gate 1/4
B7 at 2.3.3 note C2 gate 192
```

## Jungle
- BPM: 160-170
- Swing: 52-58
- Feel: a chopped break with ghost snares everywhere, a kick that stumbles, and a ride or hat that keeps time. It is busy, but the loudest hits still fall on 2 and 4.

```
ARC BEAT 1
name Chopped break
tempo 166
swing 54

[A] bars 2 step 1/16
A7 kick        | X.x. .... ..xx .... | X.x. .... ..x. x... |
A9 snare       | .... X..o .o.X ...o | .... X..o .... X..o |
A4 closed hat  | x.x. x.x. x.x. x.x. | x.x. x.x. x.x. x.x. |
A5 open hat    | .... .... .... .... | .... .... .... ..x. |
```

## Breakcore
- BPM: 160-200
- Swing: 50
- Feel: a chopped amen break played too fast and cut to pieces. A distorted kick (A7 doubled with A8) and snare jump around the bar, the snare stutters and rolls on a 1/32 grid, a ride-style open hat keeps a ragged time and a crash marks the bar. Bar 2 is the chaos: a double-time hat burst, a scattered kick and a 32nd snare roll into the next loop. A low sub hit on B7 lands under the crash. Distort and shorten the kicks on the device to taste.

```
ARC BEAT 1
name Amen shred
tempo 180
swing 50
fx distortion 55 50
send A 45 B 30
comp 60 15

[A] bars 2 step 1/16
A7 kick        | X.x. ..x. .xx. .... | X..x ..x. xx.x ..x. |
A8 kick 2      | x... .... .x.. .... | x..x .... x... .... |
A9 snare       | .... X..o .o.. ..X. | .... X.oX .oX. .... |
A5 open hat    | x.x. x.x. x.x. x.x. | x... x... x... .... |
A4 closed hat  | .... .... .... .... | .... .... .... xxxx |
AENTER crash   | X... .... .... .... | .... .... .... .... |
notes
A9 at 1.3.4 vel 70
A9 at 1.3.4+12 vel 100
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
B7 at 1.1.1 note E1 gate 1/4 vel 120
B7 at 1.3.3 note E1 gate 1/8 vel 90
B7 at 2.1.1 note E1 gate 1/4 vel 120
B7 at 2.4.1 note G1 gate 1/8 vel 110
```

The snare roll and the stutters sit in the `notes` list because they fall between sixteenths (`+12` is half a sixteenth, a 32nd). Bar 2 is the chaos bar: swap it for bar 1 on most passes and bring it in every fourth bar. The hat burst (`xxxx`) in bar 2 is a double-time moment; the roll takes over from it. The effect lines crush the break: `fx distortion 55 50` is a hard, neutral drive, `send A 45 B 30` mixes the drums and the sub into it, and `comp 60 15` is a very fast compressor that pumps the whole loop.

## Breakcore arrangement
- BPM: 160-200
- Swing: 50
- Feel: a track idea, not a loop: five scenes and a chain. A stripped intro (a hat, one kick, a held sub), the amen shred as the drop, a breakdown with no kick or snare under a held sub, a snare-roll build, then a second drop that is denser (every sixteenth a hat). Arc imports each scene as a scene of its own and plays them in the chain's order.

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
A4 closed hat  | x.x. x.x. x.x. x.x. | x.x. x.x. x.x. x.x. |
AENTER crash   | X... .... .... .... | .... .... .... .... |

[B] bars 2
notes
B7 at 1.1.1 note E1 gate 384 vel 100
B7 at 2.1.1 note E1 gate 384 vel 100

scene Drop
[A] bars 2 step 1/16
A7 kick        | X.x. ..x. .xx. .... | X..x ..x. xx.x ..x. |
A8 kick 2      | x... .... .x.. .... | x..x .... x... .... |
A9 snare       | .... X..o .o.. ..X. | .... X.oX .oX. .... |
A5 open hat    | x.x. x.x. x.x. x.x. | x... x... x... .... |
A4 closed hat  | .... .... .... .... | .... .... .... xxxx |
AENTER crash   | X... .... .... .... | .... .... .... .... |

[B] bars 2
notes
B7 at 1.1.1 note E1 gate 1/4 vel 120
B7 at 1.3.3 note E1 gate 1/8 vel 90
B7 at 2.1.1 note E1 gate 1/4 vel 120
B7 at 2.4.1 note G1 gate 1/8 vel 110

scene Breakdown
[A] bars 2 step 1/16
A4 closed hat  | x... x... x... x... | x... x... x... x... |

[B] bars 2
notes
B7 at 1.1.1 note E1 gate 384 vel 110
B7 at 2.1.1 note G1 gate 384 vel 110

scene Build
[A] bars 2 step 1/16
A7 kick        | X... .... X... .... | X... X... X... X... |
A9 snare       | .... .... .... .... | 3.5. 6.7. 8.9. XXXX |
A4 closed hat  | x.x. x.x. x.x. x.x. | xxxx xxxx xxxx xxxx |

scene Drop 2
[A] bars 2 step 1/16
A7 kick        | X.x. ..x. .xx. ..x. | X..x ..x. xx.x ..xx |
A8 kick 2      | x... .x.. .x.. .... | x..x .... x.x. x... |
A9 snare       | .... X..o .oX. ..X. | .... X.oX .oX. X.XX |
A4 closed hat  | xxxx xxxx xxxx xxxx | xxxx xxxx xxxx xxxx |
A5 open hat    | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. .... |
AENTER crash   | X... .... .... .... | X... .... .... .... |

[B] bars 2
notes
B7 at 1.1.1 note E1 gate 1/4 vel 127
B7 at 1.3.3 note E1 gate 1/8 vel 100
B7 at 2.1.1 note E1 gate 1/4 vel 127
B7 at 2.4.1 note G1 gate 1/8 vel 115
```

The `chain` line plays the intro twice, the drop twice, the breakdown, the build and the second drop twice: 16 bars, then it loops. Each scene lasts as long as its longest pattern (2 bars here). A group a scene leaves out plays the previous scene's pattern: the build has no `[B]`, so the breakdown's sub carries on under the roll. The `fx`, `send` and `comp` lines are the project's, so they apply to every scene; to change the sound between scenes, play punch-ins live. For a longer drop, raise its passes (`2x4`); to take the track further, add a scene and put its number in the chain.

## UK garage
- BPM: 130-136
- Swing: 56-62
- Feel: shuffled and skippy. Every sixteenth gets a hat and the swing pushes the off hats late. Snare on 2 and 4, kick on 1 and on the "and" of 3. A bouncy bass that jumps an octave.

```
ARC BEAT 1
name Two-step garage
tempo 132
swing 58

[A] bars 1 step 1/16
A7 kick        | X... .... ..x. .... |
A9 snare       | .... X... .... X... |
A4 closed hat  | xoxo xoxo xoxo xoxo |
A1 rim         | ..o. .... ...o .... |

[B] bars 1
notes
B7 at 1.1.1 note G1 gate 1/8
B7 at 1.1.4+4 note G2 vel 90
B7 at 1.2.3 note G1 vel 100
B7 at 1.3.3 note A#1 gate 1/8
B7 at 1.4.2+4 note G1 vel 90
B7 at 1.4.4+4 note D2 vel 100
```

The bass on B7 is played in KEYS. Its notes on the off sixteenths carry `+4`, the swing of 58 by hand, so they sit with the swung hats (see BUILD in SKILL.md).

## Breakbeat
- BPM: 120-135
- Swing: 50-56
- Feel: a funky break. The kick bounces around the snare on 2 and 4, and a ghost snare adds lift at the end.

```
ARC BEAT 1
name Big beat break
tempo 126
swing 52

[A] bars 1 step 1/16
A7 kick        | X... ..x. x... ..x. |
A9 snare       | .... X... .... X..o |
A4 closed hat  | x.x. x.x. x.x. x... |
A5 open hat    | .... .... .... ..x. |
```

## Reggaeton and dembow
- BPM: 88-98
- Swing: 50
- Feel: the dembow rhythm. A kick on every beat and a snare in a 3 + 3 + 2 pattern, repeated, which never sits on 2 and 4.

```
ARC BEAT 1
name Dembow
tempo 94
swing 50

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A9 snare       | ...x ..x. ...x ..x. |
A4 closed hat  | x.x. x.x. x.x. x.x. |
A3 shaker      | .o.o .o.o .o.o .o.o |
```

## Afrobeats
- BPM: 98-112
- Swing: 50-56
- Feel: light and bouncy. A kick that skips, a clap on 2 and 4, a rim that plays 3 + 3 + 2 across the bar, and a shaker on every sixteenth.

```
ARC BEAT 1
name Afrobeats bounce
tempo 104
swing 54

[A] bars 1 step 1/16
A7 kick        | X... ..x. ..x. .... |
A6 clap        | .... X... .... X... |
A1 rim         | x..x ..x. x..x ..x. |
A3 shaker      | xoxo xoxo xoxo xoxo |
```

## Jersey club
- BPM: 130-140
- Swing: 50
- Feel: a bouncing kick that stutters in 3 + 3 + 2, a clap on 2 and 4 with a quick double clap at the end. Straight, fast and hard.

```
ARC BEAT 1
name Jersey bounce
tempo 135
swing 50

[A] bars 1 step 1/16
A7 kick        | X..x ..x. X..x ..x. |
A6 clap        | .... X... .... X.xx |
A4 closed hat  | x.x. x.x. x.x. x.x. |
A5 open hat    | ..x. ..x. ..x. ..x. |
```

## Footwork
- BPM: 155-165
- Swing: 50
- Feel: fast and off-kilter. The kick stumbles across the bar and the claps are sparse, with a lot of space for samples and vocal chops.

```
ARC BEAT 1
name Footwork stumble
tempo 160
swing 50

[A] bars 1 step 1/16
A7 kick        | X..x ..x. ..x. .x.. |
A6 clap        | .... X... .... X..x |
A4 closed hat  | x.xx x.xx x.xx x.xx |
A1 rim         | .... ..o. .... ..o. |
```

## Hip-house
- BPM: 112-124
- Swing: 52-58
- Feel: house drums with a hip-hop snare and a bit of swing. The kick plays four on the floor with one extra push at the end of the bar.

```
ARC BEAT 1
name Hip-house
tempo 118
swing 54

[A] bars 1 step 1/16
A7 kick        | X... X... X... X..x |
A9 snare       | .... X... .... X... |
A4 closed hat  | x.x. x.x. x.x. x.x. |
A5 open hat    | ..x. ..x. ..x. ..x. |
```

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
- Swing: 54-58
- Feel: warm and rolling. Four on the floor, a soft clap on 2 and 4, open hats on the offbeats over shuffled closed hats, a minor seventh chord stab answering the kick, and a round bass that skips around the beat.

```
ARC BEAT 1
name Deep warmth
tempo 122
swing 56

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A6 clap        | .... x... .... x... |
A5 open hat    | ..x. ..x. ..x. ..x. |
A4 closed hat  | .o.o .o.o .o.o .o.o |

[B] bars 1
notes
B7 at 1.1.4+3 note A1 gate 1/16 vel 100
B7 at 1.2.3 note A1 gate 1/8 vel 90
B7 at 1.3.4+3 note C2 gate 1/16 vel 100
B7 at 1.4.3 note G1 gate 1/8 vel 90

[C] bars 1
notes
C7 at 1.1.3 note A3 gate 1/8 vel 85
C7 at 1.1.3 note C4 gate 1/8 vel 85
C7 at 1.1.3 note E4 gate 1/8 vel 85
C7 at 1.1.3 note G4 gate 1/8 vel 85
C7 at 1.3.3 note A3 gate 1/8 vel 80
C7 at 1.3.3 note C4 gate 1/8 vel 80
C7 at 1.3.3 note E4 gate 1/8 vel 80
C7 at 1.3.3 note G4 gate 1/8 vel 80
```

## Tech house
- BPM: 124-128
- Swing: 52-56
- Feel: tight and groovy. A punchy kick on every beat, a clap on 2 and 4, a busy closed hat with an open hat on the offbeat, a shaker for movement, and a short, bouncing bassline that plays between the kicks.

```
ARC BEAT 1
name Tech groove
tempo 126
swing 54

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A6 clap        | .... X... .... X... |
A4 closed hat  | xoxx xoxx xoxx xoxx |
A5 open hat    | ..x. ..x. ..x. ..x. |
A3 shaker      | .o.o .o.o .o.o .o.o |

[B] bars 1
notes
B7 at 1.1.3 note F1 gate 1/16 vel 110
B7 at 1.1.4+2 note F1 gate 1/16 vel 80
B7 at 1.2.3 note F1 gate 1/16 vel 110
B7 at 1.3.3 note F1 gate 1/16 vel 110
B7 at 1.3.4+2 note G#1 gate 1/16 vel 90
B7 at 1.4.3 note F1 gate 1/16 vel 110
```

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

## Afro house
- BPM: 118-124
- Swing: 52-58
- Feel: hypnotic and percussive. A steady kick, a soft clap or rim on 2 and 4, shakers in sixteenths, and toms and percussion in a rolling three-against-four pattern; a deep bass note and a long, open chord.

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

[B] bars 1
notes
B7 at 1.1.1 note D1 gate 1/4 vel 110
B7 at 1.3.3 note D1 gate 1/8 vel 95
```

## Amapiano
- BPM: 108-115
- Swing: 52-58
- Feel: laid-back and bouncy. A soft kick on the beat, a shaker in sixteenths, a woodblock or rim on syncopated off-sixteenths, sparse claps, and the log drum: a deep, pitched bass hit (B7) that slides around the bar.

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
notes
B7 at 1.1.4+3 note F1 gate 1/8 vel 115
B7 at 1.2.3 note F1 gate 1/16 vel 90
B7 at 1.3.2+3 note G#1 gate 1/8 vel 115
B7 at 1.4.1 note C2 gate 1/16 vel 100
B7 at 1.4.3 note A#1 gate 1/8 vel 110
```

## Phonk
- BPM: 130-150
- Swing: 50-54
- Feel: dark and heavy, Memphis style. A booming kick and long 808 under it, a clap or snare on beat 3 (half time), rolling hats, and a cowbell melody on top playing a short minor riff.

```
ARC BEAT 1
name Cowbell drift
tempo 140
swing 50

[A] bars 1 step 1/16
A7 kick        | X... ...x ..X. .... |
A6 clap        | .... .... X... .... |
A4 closed hat  | x.x. x.xx x.x. x.xx |

[D] bars 1
notes
D7 at 1.1.1 note C4 gate 1/16 vel 120
D7 at 1.1.4 note C4 gate 1/16 vel 100
D7 at 1.2.3 note D#4 gate 1/16 vel 110
D7 at 1.3.1 note C4 gate 1/16 vel 120
D7 at 1.3.4 note G3 gate 1/16 vel 100
D7 at 1.4.3 note A#3 gate 1/16 vel 110
```

## G-funk
- BPM: 88-100
- Swing: 54-62
- Feel: smooth and rolling, West Coast. A laid-back kick, a snare on 2 and 4 with a clap layered, swung sixteenth hats, a rubbery bass line that walks the chord, and a high, whining lead.

```
ARC BEAT 1
name Sunset ride
tempo 94
swing 58

[A] bars 1 step 1/16
A7 kick        | X... ..x. X.x. .... |
A9 snare       | .... X... .... X... |
A6 clap        | .... x... .... x... |
A4 closed hat  | x.xo x.xo x.xo x.xo |

[B] bars 1
notes
B7 at 1.1.1 note E1 gate 1/8 vel 110
B7 at 1.1.4+4 note E1 gate 1/16 vel 90
B7 at 1.2.3 note G1 gate 1/8 vel 100
B7 at 1.3.1 note A1 gate 1/8 vel 110
B7 at 1.4.1 note B1 gate 1/8 vel 100
B7 at 1.4.3 note D2 gate 1/8 vel 95
```

## Liquid drum and bass
- BPM: 170-176
- Swing: 50-54
- Feel: smooth and flowing. The two-step kick and snare, soft ghost snares, rolling hats, a deep sub bass with long notes, and lush chords that sustain over two bars.

```
ARC BEAT 1
name Liquid flow
tempo 174
swing 50

[A] bars 1 step 1/16
A7 kick        | X... .... ..X. .... |
A9 snare       | .... X..o .... X... |
A4 closed hat  | x.xo x.xo x.xo x.xo |

[B] bars 1
notes
B7 at 1.1.1 note D1 gate 1/4 vel 110
B7 at 1.3.3 note F1 gate 1/4 vel 100

[C] bars 1
notes
C7 at 1.1.1 note D3 gate 384 vel 75
C7 at 1.1.1 note F3 gate 384 vel 75
C7 at 1.1.1 note A3 gate 384 vel 75
C7 at 1.1.1 note C4 gate 384 vel 75
```

## Electro
- BPM: 125-135
- Swing: 50
- Feel: robotic and funky, 808 electro. A syncopated kick, a hard snare or clap on 2 and 4, a straight sixteenth hat, toms or cowbell for a machine-funk hook, and a short, stabbed bass.

```
ARC BEAT 1
name Robot funk
tempo 128
swing 50

[A] bars 1 step 1/16
A7 kick        | X... ..X. ..X. .... |
A6 clap        | .... X... .... X... |
A4 closed hat  | xxxx xxxx xxxx xxxx |
A. cowbell     | .... .... .x.. ..x. |

[B] bars 1
notes
B7 at 1.1.1 note C1 gate 1/16 vel 115
B7 at 1.2.3 note C1 gate 1/16 vel 100
B7 at 1.3.3 note D#1 gate 1/16 vel 105
B7 at 1.4.2 note C1 gate 1/16 vel 100
```

## Dubstep
- BPM: 138-142
- Swing: 50
- Feel: heavy and spacious, half time. A kick on 1, the snare on 3 (the half-time backbeat), sparse hats, and a deep wobbling bass that fills the gaps.

```
ARC BEAT 1
name Half step
tempo 140
swing 50

[A] bars 1 step 1/16
A7 kick        | X... .... .... ..x. |
A9 snare       | .... .... X... .... |
A4 closed hat  | ..x. ..x. ..x. x.x. |

[B] bars 1
notes
B7 at 1.1.1 note F1 gate 1/4 vel 120
B7 at 1.2.3 note F1 gate 1/8 vel 100
B7 at 1.4.1 note G#1 gate 1/8 vel 110
B7 at 1.4.3 note F1 gate 1/8 vel 100
```

## Grime
- BPM: 138-142
- Swing: 50
- Feel: raw and cold. A sparse kick, a hard snare on 3 or 2 and 4, an eight-bar loop of square-wave stabs, and gaps for the MC. Choppy, not busy.

```
ARC BEAT 1
name Eskibeat
tempo 140
swing 50

[A] bars 1 step 1/16
A7 kick        | X... .... .x.. .... |
A9 snare       | .... .... X... .... |
A4 closed hat  | x... x... x... x.x. |

[D] bars 1
notes
D7 at 1.1.1 note E4 gate 1/16 vel 110
D7 at 1.1.4 note E4 gate 1/16 vel 100
D7 at 1.2.3 note G4 gate 1/16 vel 110
D7 at 1.3.2 note E4 gate 1/16 vel 100
D7 at 1.4.1 note D4 gate 1/16 vel 110
```

## Bassline
- BPM: 135-140
- Swing: 54-60
- Feel: bouncy UK bassline. Four on the floor, a clap on 2 and 4, skippy garage hats, and a loud, wobbly organ-bass that jumps around the bar.

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

## UK funky
- BPM: 128-132
- Swing: 54-60
- Feel: tribal and swung. A kick on the beat with a syncopated extra, a clap on 2 and 4, rims and toms in a soca-like pattern, a shaker, and a short chord stab.

```
ARC BEAT 1
name Funky tribal
tempo 130
swing 56

[A] bars 1 step 1/16
A7 kick        | X... X..x X... X... |
A6 clap        | .... X... .... X... |
A1 rim         | ..x. .x.. ..x. x... |
A2 tom         | .... ..x. .x.. ..x. |
A3 shaker      | xoxo xoxo xoxo xoxo |
```

## Halftime
- BPM: 80-88
- Swing: 50
- Feel: slow and heavy, drum and bass at half speed (or 160-176 counted in half). A kick on 1, the snare on 3, busy ghost hats and percussion, and a gritty bass. Often written with FX.

```
ARC BEAT 1
name Half speed
tempo 85
swing 50

[A] bars 1 step 1/16
A7 kick        | X... ..x. .... .x.. |
A9 snare       | .... .... X... ..o. |
A4 closed hat  | x.xo xoxo x.xo xoxx |
A0 perc        | .... .o.. .... o... |
```

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

## Moombahton
- BPM: 108-112
- Swing: 50
- Feel: dembow at house's slower speed. The dembow kick and snare, a clap on its offbeat hits, open hats, and a fat bass on the kicks.

```
ARC BEAT 1
name Moombah
tempo 110
swing 50

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A9 snare       | ...X ..X. ...X ..X. |
A5 open hat    | ..x. ..x. ..x. ..x. |

[B] bars 1
notes
B7 at 1.1.1 note G1 gate 1/8 vel 110
B7 at 1.3.1 note G1 gate 1/8 vel 110
B7 at 1.4.1 note A#1 gate 1/8 vel 100
```

## Trip-hop
- BPM: 84-96
- Swing: 50-56
- Feel: slow, dark and heavy, Bristol style. A big, lazy break: the kick doubled before the beat, a fat snare on 2 and 4, a hat on a dotted pulse, a deep bass, and minor chords that hang.

```
ARC BEAT 1
name Bristol fog
tempo 90
swing 52

[A] bars 1 step 1/16
A7 kick        | X..x .... ..X. ..x. |
A9 snare       | .... X... .... X... |
A4 closed hat  | x..x x..x x..x x..x |

[B] bars 1
notes
B7 at 1.1.1 note G1 gate 1/4 vel 105
B7 at 1.3.3 note A#1 gate 1/8 vel 95

[C] bars 1
notes
C7 at 1.1.1 note G3 gate 384 vel 70
C7 at 1.1.1 note A#3 gate 384 vel 70
C7 at 1.1.1 note D4 gate 384 vel 70
```

## Downtempo
- BPM: 95-110
- Swing: 52-58
- Feel: relaxed and airy. A light kick and rim groove, a soft clap, shakers, and warm chords with space between them.

```
ARC BEAT 1
name Easy air
tempo 100
swing 54

[A] bars 1 step 1/16
A7 kick        | X... ...x .x.. .... |
A1 rim         | .... x... .... x... |
A3 shaker      | .o.o .o.o .o.o .o.o |

[C] bars 1
notes
C7 at 1.1.1 note D3 gate 192 vel 80
C7 at 1.1.1 note F#3 gate 192 vel 80
C7 at 1.1.1 note A3 gate 192 vel 80
C7 at 1.3.1 note E3 gate 192 vel 75
C7 at 1.3.1 note G3 gate 192 vel 75
C7 at 1.3.1 note B3 gate 192 vel 75
```

## Neo-soul
- BPM: 80-95
- Swing: 56-66
- Feel: loose and human, Dilla-style. Kicks that drag, a snare a little late on 2 and 4, heavily swung hats with ghost notes, and lush ninth chords.

```
ARC BEAT 1
name Late snare
tempo 88
swing 62

[A] bars 1 step 1/16
A7 kick        | X... ..x. .x.. .x.. |
A9 snare       | .... X... .... X... |
A4 closed hat  | xoxo xoxo xoxo xoxo |
notes
A9 at 1.2.1+6 vel 50

[C] bars 1
notes
C7 at 1.1.1 note E3 gate 192 vel 80
C7 at 1.1.1 note G3 gate 192 vel 80
C7 at 1.1.1 note B3 gate 192 vel 80
C7 at 1.1.1 note F#4 gate 192 vel 80
C7 at 1.3.1 note A3 gate 192 vel 75
C7 at 1.3.1 note C4 gate 192 vel 75
C7 at 1.3.1 note E4 gate 192 vel 75
C7 at 1.3.1 note B4 gate 192 vel 75
```

## Synthwave
- BPM: 100-118
- Swing: 50
- Feel: retro and driving, 80s. A big kick on every beat or on 1 and 3, a gated snare on 2 and 4, straight eighth hats, an arpeggiated bass in eighths, and wide minor chords.

```
ARC BEAT 1
name Neon drive
tempo 110
swing 50

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A9 snare       | .... X... .... X... |
A4 closed hat  | x.x. x.x. x.x. x.x. |

[B] bars 1
notes
B7 at 1.1.1 note A1 gate 1/16 vel 110
B7 at 1.1.3 note A2 gate 1/16 vel 95
B7 at 1.2.1 note A1 gate 1/16 vel 110
B7 at 1.2.3 note A2 gate 1/16 vel 95
B7 at 1.3.1 note F1 gate 1/16 vel 110
B7 at 1.3.3 note F2 gate 1/16 vel 95
B7 at 1.4.1 note G1 gate 1/16 vel 110
B7 at 1.4.3 note G2 gate 1/16 vel 95

[C] bars 1
notes
C7 at 1.1.1 note A3 gate 192 vel 80
C7 at 1.1.1 note C4 gate 192 vel 80
C7 at 1.1.1 note E4 gate 192 vel 80
C7 at 1.3.1 note F3 gate 192 vel 80
C7 at 1.3.1 note A3 gate 192 vel 80
C7 at 1.3.1 note C4 gate 192 vel 80
```

## One drop (EP-40)
- BPM: 70-80
- Swing: 50-60
- Feel: roots reggae. Beat 1 is left empty, and the kick and the rimshot land together on beat 3. Hats play every eighth and swing a little. The pads are the EP-40 kit's (P01; see [ep40-kit.md](ep40-kit.md)), so use this one when the share says the EP-133 plays that kit.

```
ARC BEAT 1
name One drop
tempo 76
swing 56

[A] bars 1 step 1/16
A1 kick        | .... .... X... .... |
A2 rimshot     | .... .... X... .... |
A4 closed hat  | x.o. x.o. x.o. x.o. |
A5 open hat    | .... .... .... ..o. |
```

## Rockers (EP-40)
- BPM: 75-85
- Swing: 50-58
- Feel: the one drop with a kick on 1 as well, so it drives. The rimshot stays on beat 3, hats sit on the offbeats, and a second rim answers in between.

```
ARC BEAT 1
name Rockers
tempo 80
swing 54

[A] bars 1 step 1/16
A1 kick        | X... .... X... .... |
A2 rimshot     | .... .... X... .... |
A3 rim         | ..o. .... ..o. ...o |
A4 closed hat  | ..x. ..x. ..x. ..x. |
```

## Steppers (EP-40)
- BPM: 72-84
- Swing: 50-54
- Feel: a kick on every beat under a reggae tempo. The rimshot still lands on beat 3, and the hats sit on the offbeats with an open hat at the end of the bar. It marches.

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
```

## Dub (EP-40)
- BPM: 65-78
- Swing: 50-56
- Feel: the riddim stripped back to bones. The kick is on 1, the rimshot on 3 and a few hats. The space is for the delay, and a siren at the end of the second bar runs off into it.

```
ARC BEAT 1
name Dub plate
tempo 72
swing 52
fx delay 70 65
send A 30 D 70

[A] bars 2 step 1/16
A1 kick        | X... .... .... ..o. | X... .... .... .... |
A2 rimshot     | .... .... X... .... | .... .... X... .... |
A4 closed hat  | .... x... .... x... | .... x... .... x.o. |

[D] bars 2 step 1/16
D1 siren       | .... .... .... .... | .... .... .... X... |
```

The delay is long with high feedback, so the rimshot and the siren echo away; send more of A for a heavier dub.

## Digital riddim (EP-40)
- BPM: 90-100
- Swing: 50
- Feel: mid-80s digital dancehall in the spirit of Sleng Teng. A busy, machine-straight kick in threes, rimshots on 2 and 4 and steady eighth hats. Put a bass one-shot from the user's list on B and repeat a two-note figure.

```
ARC BEAT 1
name Digital riddim
tempo 96
swing 50

[A] bars 1 step 1/16
A1 kick        | X..X ..X. X..X ..X. |
A2 rimshot     | .... X... .... X... |
A4 closed hat  | x.x. x.x. x.x. x.x. |
```

## Dancehall (EP-40)
- BPM: 96-110
- Swing: 50-54
- Feel: modern dancehall. The kick is on 1 with a push before beat 3 and before the next bar, rimshots on 2 and 4, and hats on the offbeats with a double at the end. Shouts from D (D3, D4) go on bar ends.

```
ARC BEAT 1
name Dancehall
tempo 104
swing 50

[A] bars 1 step 1/16
A1 kick        | X... ..X. X... ..X. |
A2 rimshot     | .... X... .... X... |
A4 closed hat  | ..x. ..x. ..x. ..xx |
```

## UK dub (EP-40)
- BPM: 135-145
- Swing: 50
- Feel: UK steppers dub at sound-system pace. A four-on-the-floor kick, the rimshot on beat 3 so it feels half-time, hats on every sixteenth and an open hat on the offbeats. A long delay on D for sirens.

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

[D] bars 1 step 1/16
D1 siren       | .... .... .... ..X. |
```

The delay carries the siren over the bar line; take the send down if it clouds the kick.
