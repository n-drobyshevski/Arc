# Genre recipes

Twenty-eight starting points, including a techno family of twelve (Techno, Detroit, minimal, dub, acid, hypnotic, peak-time, melodic, industrial, hard techno, schranz and hard groove), each a complete ARC BEAT card (see [beat-card.md](beat-card.md) for the format). Use them as a base: change the tempo and a few steps and say what you changed. The cards are checked by the skill's test, so they are valid as written.

`scripts/beatcard.py analyse` compares a user's beat with these recipes, reading the `BPM:` and `Swing:` lines and the card of each section below. Keep that shape if you add a recipe: a `##` heading, the two lines, then one fenced card.

Some styles are defined by their effects, and those recipes carry `fx`, `send`, `comp` and `sidechain` lines right after `swing` (see "Effects" in [beat-card.md](beat-card.md)): house (sidechain pump), dub techno (delay), industrial techno, hard techno, schranz and breakcore (distortion and compression) and lo-fi (low-pass filter). A line under the card says in one sentence what they do. The importing user can switch **APPLY FX** off to keep their own FX; a recipe without these lines leaves the FX alone. Write them only when the style needs them.

## The assumed kit

When the user has not copied a pattern out of Arc, the card does not know what is on their pads. Then use this layout and say it is an assumption: *"I've assumed a drum kit on group A (kick on 7, snare on 9 ...). If your pads differ, copy a pattern from Arc and I'll use your pad names."* It is a common layout, not something read from the device: the official factory pack groups its sounds by slot number (kicks 1-99, snares 100-199, hi-hats 200-299, percussion 300-399, bass 400-499, melodic 500-599), but which sound sits on which pad is the user's to change.

| Pad | Sound | Pad | Sound | Pad | Sound |
|---|---|---|---|---|---|
| A7 | kick | A8 | kick 2 | A9 | snare |
| A4 | closed hat | A5 | open hat | A6 | clap |
| A1 | rim | A2 | tom | A3 | shaker |
| A. | cowbell | A0 | perc | AENTER | crash |

- **Group B** is a bass sound on pad 7, **C** a chord or keys sound on pad 7, **D** a lead or effect sound on pad 7. They are played in KEYS mode, so they live in the `notes` list. `note C4` is the sample's own pitch (MIDI 60), so a bass line sits around C1-C3.
- Names after the pad are only for reading. The pattern plays whatever sound is on the pad.
- Hats: `x` is a normal hit, `o` a quiet one, `X` an accent. A digit 1-9 is a velocity of 14 times the digit.

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
- BPM: 150-160
- Swing: 50
- Feel: very dense and loopy. A hard four on the floor kick, a clap on 2 and 4 that rolls at the end, hats and shaker on every sixteenth, and a rim that moves against the bar so no two beats feel the same. A rumble bass rolls after every kick and climbs in the last bar.

```
ARC BEAT 1
name Schranz pressure
tempo 152
swing 50
fx distortion 60 40
send A 35 B 45
comp 65 20

[A] bars 2 step 1/16
A7 kick        | X... X... X... X... | X... X... X... X.X. |
A6 clap        | .... x... .... x... | .... x... .... xxxX |
A4 closed hat  | xoxo Xoxo Xoxo Xoxo | xoxo Xoxo Xoxo .... |
A5 open hat    | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. .... |
A1 rim         | x..x ..x. .x.. x..x | ..x. .x.. x..x ..x. |
A3 shaker      | .xx. .xx. .xx. .xx. | .xx. .xx. .xx. .xx. |

[B] bars 2
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
B7 at 1.4.4 note F#1 gate 1/16 vel 100
B7 at 2.1.2 note F1 gate 1/16 vel 110
B7 at 2.1.3 note F1 gate 1/16 vel 90
B7 at 2.1.4 note F1 gate 1/16 vel 100
B7 at 2.2.2 note F1 gate 1/16 vel 110
B7 at 2.2.3 note F1 gate 1/16 vel 90
B7 at 2.2.4 note F1 gate 1/16 vel 100
B7 at 2.3.2 note G#1 gate 1/16 vel 110
B7 at 2.3.3 note G#1 gate 1/16 vel 90
B7 at 2.3.4 note G#1 gate 1/16 vel 100
B7 at 2.4.2 note G#1 gate 1/16 vel 110
B7 at 2.4.3 note G#1 gate 1/16 vel 90
B7 at 2.4.4 note G#1 gate 1/16 vel 100
```

Bar 2 is the fill: a doubled kick, the clap roll, thinner hats and a bass that steps up. Repeat bar 1 for longer phrases and use bar 2 every fourth or eighth bar. The effect lines are the schranz sound: `fx distortion 60 40` is a strong, slightly dark drive, `send A 35 B 45` pushes the drums and the rumble into it, and `comp 65 20` is a hard, fast compressor that makes everything breathe with the kick.

## Hard groove
- BPM: 135-145
- Swing: 54-58
- Feel: pumping and funky, the swung cousin of hard techno. Kick on every beat, a clap on 2 and 4 with a ghost clap, swung xoxx hats, congas, a tom and a sparse cowbell, and a bouncy bass whose off sixteenths are nudged late.

```
ARC BEAT 1
name Hard groove workout
tempo 140
swing 56

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
