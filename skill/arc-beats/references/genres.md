# Genre recipes

Sixteen starting points, each a complete ARC BEAT card (see [beat-card.md](beat-card.md) for the format). Use them as a base: change the tempo and a few steps and say what you changed. The cards are checked by the skill's test, so they are valid as written.

`scripts/beatcard.py analyse` compares a user's beat with these recipes, reading the `BPM:` and `Swing:` lines and the card of each section below. Keep that shape if you add a recipe: a `##` heading, the two lines, then one fenced card.

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

## UK garage
- BPM: 130-136
- Swing: 56-62
- Feel: shuffled and skippy. Every sixteenth gets a hat and the swing pushes the off hats late. Snare on 2 and 4, kick on 1 and on the "and" of 3.

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
```

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
