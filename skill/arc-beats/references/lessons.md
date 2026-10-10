# Lessons: from a first beat to scenes, FX and sampling

Twelve short lessons for someone learning the EP-133 K.O. II and beat making. Teach them one step at a time and wait for the user between steps (see "Learning" in SKILL.md). Each lesson has the same parts:

- **Goal**: what they can do afterwards.
- **On the device**: the real thing first, with the combos cited by their id in [ep133-guide.md](ep133-guide.md) (`SEQ-1`). Read the entry, then say the steps in plain words. If something is not in the guide, say so; do not invent a combo.
- **In Arc**: the same idea on the phone, with Arc as a practice partner. Screens are described in [arc-app.md](arc-app.md). The sequencer screens (RECORD, STEP, TIMING, SCENE, FX, SAMPLE) are in the Android app today; the web app plays pads and KEYS but does not have them yet. Say which one applies if you are unsure what the user has.
- **Exercise**: a card to paste into Arc and play, change or break on purpose.
- **Check**: one question for the user, with the answer for you underneath.

Arc patterns stay in Arc: the card is a practice copy and nothing is written to the EP-133. To keep a beat on the device, the user plays or steps it in there with the combos.

Pick the lesson that fits what they say they can already do. Skip ahead freely; every lesson stands on its own.

## Lesson 1: Meet the pads

**Goal:** know the 12 pads, the four groups and what a project is.

**On the device**
- Every group (A, B, C, D) has 12 pads, `7 8 9 / 4 5 6 / 1 2 3 / . 0 ENTER`, and 99 patterns. Switch group with `FX-20`. Load another project with `SYS-1` (there are 9).
- Hear what is on a pad by pressing it. Hold the pad in SOUND mode to see the sample's name (`SND-5`); step through the library with `SND-2`; put a chosen sound on a pad with `SND-1`.
- Pressing a pad to play it is not a combo, so it is not in the guide. Just press it.

**In Arc:** open Live and play the pads. Switch group with the A-D keys under the grid. Tap a pad and watch the display name the sound. On a phone, one group fills the screen.

**Exercise:** four kicks, one on every beat. It is the simplest beat there is (*four on the floor*).

```
ARC BEAT 1
name Lesson 1 four kicks
tempo 100

[A] bars 1
A7 kick | X... X... X... X... |
```

**Check:** which pad is the kick in this card, and how many hits are in a bar?
*Answer: A7, four (one a beat; each `X...` is one beat of four steps).*

## Lesson 2: Tempo, bars and counting

**Goal:** count a bar as 1 2 3 4, set a tempo and hear a click.

**On the device**
- Set the tempo with `SEQ-26`: tap TEMPO to tap it in, turn KNOB X, or hold TEMPO and type the number.
- Make the click quieter or make it play all the time with `SEQ-27`. The time signature is `SEQ-28`; stay in 4/4 for now.

**In Arc:** the tempo is Arc's own (the app's, not the pattern's), and it is shared by every pattern. Hold TEMPO (Android) or use the tempo control to set it. When you paste a card with a `tempo`, Arc offers to set it, you decide.

**Exercise:** the first real beat. Kick on 1 and 3, snare on 2 and 4 (the *backbeat*). Four steps make a beat, four beats make a bar.

```
ARC BEAT 1
name Lesson 2 backbeat
tempo 90

[A] bars 1
A7 kick  | X... .... X... .... |
A9 snare | .... X... .... X... |
```

**Check:** on which counts does the snare fall? *Answer: 2 and 4 (steps 5 and 13 of the bar).*

## Lesson 3: Record your first loop live

**Goal:** play a pattern in with the pads, hear it loop, undo a mistake.

**On the device**
- Press RECORD, then PLAY for a four-beat count-in (`SEQ-1`), or RECORD and PLAY together to start straight away (`SEQ-2`). Start from the top of the pattern with `SEQ-3`.
- Add more while it plays (overdub) with `SEQ-4`. Replace the whole take with `SEQ-5`.
- Take back the last pass with `SEQ-20`. Remove one pad's notes while it plays with `SEQ-17`.

**In Arc (Android):** tap RECORD to arm, then PLAY; there is a count-in. Play pads. Tap ERASE and a pad to clear one sound, or the undo arrow to take back the last pass.

**Exercise:** add hats to the backbeat. Quiet hats between louder ones make it breathe.

```
ARC BEAT 1
name Lesson 3 hats on top
tempo 90

[A] bars 1
A7 kick       | X... .... X... .... |
A9 snare      | .... X... .... X... |
A4 closed hat | x.o. x.o. x.o. x.o. |
```

**Check:** what does the lower-case `o` mean? *Answer: a quiet hit (a ghost, velocity 64) against `x` (100) and `X` (127).*

## Lesson 4: Step by step

**Goal:** put sounds on exact steps without having to play them in time.

**On the device**
- Stop the pattern. Choose the step with - / + and hold RECORD with a pad to put its sound there (`SEQ-8`).
- Change how loud or long the notes on a step are (`SEQ-9`). Nudge one pad's note a little later or earlier (`SEQ-10`).
- Set the pattern length in bars with `SEQ-6`.

**In Arc (Android):** the STEP cell on the display line unrolls the step panel, with a strip of one bar of steps. Hold its RECORD and tap pads to place them; use - and + to move along.

**Exercise:** a kick that does not just sit on the beats. Put kicks on steps 1, 4, 7 and 11, then try moving one.

```
ARC BEAT 1
name Lesson 4 bouncy kick
tempo 96

[A] bars 1
A7 kick  | X..x ..x. ..x. .... |
A9 snare | .... X... .... X... |
```

**Check:** which beat does the kick on the last `x` fall near? *Answer: the "and" of 3 (step 11), half a beat after beat 3.*

## Lesson 5: Swing and timing

**Goal:** make a straight grid feel loose, and fix sloppy playing.

**On the device**
- Choose the step size (the grid) with `SEQ-11`: TIMING then KNOB X. Set swing with `SEQ-12`: TIMING then KNOB Y.
- Quantise on the way in or leave it free: `SEQ-13`. After recording, tidy the timing of one pad with `SEQ-15`, or push a pad's notes a little with `SEQ-16`.
- Swing delays every second step, and only at 1/8 and 1/16.

**In Arc:** hold TEMPO (Android) for the second tab, TIMING: INTERVAL, QUANTIZE or FREE TIME and SWING from 50% (straight) to 75%. A card's `swing` line sets how its grid rows swing; Arc offers to apply it.

**Exercise:** the same beat at three swing values. Paste it at 58, then change the `swing` line to 50 and to 66 and compare.

```
ARC BEAT 1
name Lesson 5 swing
tempo 88
swing 58

[A] bars 1
A7 kick       | X... ..x. ..x. .... |
A9 snare      | .... X... .... X... |
A4 closed hat | x.x. x.x. x.x. x.x. |
```

**Check:** which hats does swing move? *Answer: the odd steps of the 16th grid (2nd, 4th, ...), later by an amount that grows with the swing value. The hits on 1, 3, 5 ... stay put.*

## Lesson 6: Loud and quiet

**Goal:** use velocity to make a beat sound played, not typed.

**On the device**
- Velocity on a step is set with `SEQ-9`. How the pads react to your touch (soft, hard, off) is a setting: `SYS-12`.
- A pad's level is `SND-6` (KNOB X in SOUND mode).

**In Arc:** a card can write velocity two ways: `X x o` for loud, normal, ghost, or digits 1-9 (14 times the digit). Arc's exports use the three letters because they are easy to read, and a tidy option rounds a phone-played pattern to them.

**Exercise:** hats that sway between loud and quiet, and a ghost snare before the backbeat.

```
ARC BEAT 1
name Lesson 6 dynamics
tempo 92
swing 55

[A] bars 1
A7 kick       | X... ..x. .... .... |
A9 snare      | .... X..o .o.. X... |
A4 closed hat | 9.5. 7.5. 9.5. 7.6. |
```

**Check:** which hits are the ghost notes? *Answer: the two `o` on the snare row (steps 8 and 10).*

## Lesson 7: Rolls and note repeat

**Goal:** make fast hats, rolls and triplets.

**On the device**
- Note repeat plays a pad over and over at the step size: hold TIMING and a pad, or latch it (`SEQ-14`). Change the step with `SEQ-11`. Record a roll with RECORD on.

**In Arc (Android):** RPT on the pad plate repeats the pads you hold at the TIMING interval. Triplets are an interval too (1/8T, 1/16T).

**Exercise:** two lanes. The first card is a triplet feel: the whole bar is on a triplet grid (6 steps a beat). The second part of the lesson is a roll at the end of a 1/16 bar, which goes in the notes list because it is finer than the grid.

```
ARC BEAT 1
name Lesson 7 triplet feel
tempo 80

[A] bars 1 step 1/16T
A7 kick       | X..... X..... X..... X..... |
A9 snare      | ...... X..... ...... X..... |
A4 closed hat | x.x.x. x.x.x. x.x.x. x.x.x. |
```

```
ARC BEAT 1
name Lesson 7 hat roll
tempo 140

[A] bars 1 step 1/16
A7 kick       | X... .... ..x. .... |
A6 clap       | .... .... X... .... |
A4 closed hat | x.x. x.x. x.x. .... |
notes
A4 at 1.4.1 vel 50
A4 at 1.4.1+12 vel 70
A4 at 1.4.2 vel 90
A4 at 1.4.2+12 vel 110
A4 at 1.4.3 vel 127
A4 at 1.4.3+12 vel 127
```

**Check:** how many ticks apart are the roll's hits, and why? *Answer: 12 ticks, a 32nd note (96 ticks a beat; a 16th is 24).*

## Lesson 8: Longer patterns, fills and variation

**Goal:** stop a loop sounding like a loop.

**On the device**
- Make the pattern longer or shorter with `SEQ-6`; double it and copy the notes into the new half with `SEQ-7`.
- Copy a bar or a whole pattern and paste it with `SEQ-21`; copy one pad's notes to another pad with `SEQ-22`.
- Jump to the next empty pattern with `SEQ-23`. Clear a group's pattern with `SEQ-19`.

**In Arc:** the pattern sheet (hold RECORD) sets LENGTH for each group in bars; the x2 key doubles it. The SCENE panel's CLIP row copies and pastes a pattern, a bar or a pad.

**Exercise:** four bars, with a small change in bar 2 and a fill in bar 4. Beats usually change every four or eight bars, and a fill sits in the last beat before the change.

```
ARC BEAT 1
name Lesson 8 four bars
tempo 94

[A] bars 4
A7 kick       | X... .... X... .... | X... .... X... ..x. | X... .... X... .... | X... .... X... .... |
A9 snare      | .... X... .... X... | .... X... .... X... | .... X... .... X... | .... X... X.X. XXXX |
A4 closed hat | x.x. x.x. x.x. x.x. | x.x. x.x. x.x. x.x. | x.x. x.x. x.x. x.x. | x.x. x.x. .... .... |
```

**Check:** where is the fill, and what changes? *Answer: bar 4, from beat 3 on: the hats stop and the snare plays a quick run into the loop.*

## Lesson 9: Bass and melody in KEYS

**Goal:** play a sound in tune across the pads and write a bass line.

**On the device**
- Select a pad, then press KEYS to spread its sample over the 12 pads (`FX-17`). Move an octave or transpose with `FX-18`. Change the key or the scale with `FX-19`.
- A sample should be set to *key* play mode so notes can overlap: `SND-9`. The pad's root note is on the MIDI page: `SND-15`.

**In Arc:** the KEYS / PADS switch on the pads' plate; KEYS shows the sound as a 3 x 4 grid or a piano. A card writes KEYS notes in its `notes` list, as `note C4` (the sample's own pitch) or `semi -12` (an octave down).

**Exercise:** a drum loop with a four-note bass line in group B. Think of the bass as the second drum: it answers the kick.

```
ARC BEAT 1
name Lesson 9 bass
tempo 100

[A] bars 1
A7 kick  | X... .... X... .... |
A9 snare | .... X... .... X... |

[B] bars 1
notes
B7 at 1.1.1 note C2 gate 1/4
B7 at 1.2.4 note C2 gate 1/8
B7 at 1.3.1 note D#2 gate 1/4
B7 at 1.4.3 note G1 gate 1/4
```

**Check:** which beat does the first bass note share with the kick? *Answer: beat 1 (1.1.1). The second kick, on beat 3, shares it with the third note.*

## Lesson 10: Scenes and song

**Goal:** put a beat, a bass and chords together, and move between sections.

**On the device**
- Each group has 99 patterns. Pick a group's pattern with `SEQ-23`; a scene is the pattern each group plays. Pick or duplicate a scene (commit) with `SEQ-24`.
- Arrange scenes into a song with `SEQ-25`. Decide when a switch happens (at once, at the bar end or at the pattern end) with `SYS-13`.
- Clear or delete the current scene with `SYS-2`.

**In Arc (Android):** the scene cell (S01) on the display line opens the SCENE panel. COMMIT duplicates the scene so you can build a variation; the scene change setting is under CHANGE.

**Exercise:** one card with all four groups is a whole scene: drums, bass, chords and a lead. Pasting it adds the patterns and a new scene pointing at them.

```
ARC BEAT 1
name Lesson 10 verse scene
tempo 84
swing 56

[A] bars 2 step 1/16
A7 kick        | X... ..x. ..x. .... | X... .... x.x. .... |
A9 snare       | .... X... .... X... | .... X... .... X..o |
A4 closed hat  | x.x. x.x. x.x. x.x. | x.x. x.x. x.x. x.xo |

[B] bars 2
notes
B7 at 1.1.1 note A1 gate 1/4
B7 at 1.3.3 note A1 gate 1/8
B7 at 2.1.1 note F1 gate 1/4
B7 at 2.3.3 note G1 gate 1/4

[C] bars 2
notes
C7 at 1.1.1 note A3 gate 384
C7 at 1.1.1 note C4 gate 384
C7 at 1.1.1 note E4 gate 384
C7 at 2.1.1 note F3 gate 384
C7 at 2.1.1 note A3 gate 384
C7 at 2.1.1 note C4 gate 384

[D] bars 2
notes
D7 at 1.4.1 note E5 gate 1/8 vel 80
D7 at 2.2.3 note C5 gate 1/4 vel 80
```

**Check:** how many patterns does this card add, and why only one scene? *Answer: four patterns (one per group, each in its group's next free slot) and one new scene pointing at them; a card with several sections always adds a scene.*

## Lesson 11: Effects and performance

**Goal:** use the master effect, the sends and the punch-ins to shape a loop live.

**On the device**
- Open the FX page and cycle through the master effects with `FX-1` and `FX-2`; set each group's send with `FX-3` and the effect's two controls with `FX-4`.
- Solo a group with `FX-5`. Use the twelve punch-in effects while FX is held with `FX-6`.
- Make the loop breathe with a sidechain duck: `FX-8` and `FX-9`. The output compressor is `FX-7`.
- Assign the fader to a parameter with `FX-11` and record its moves with `FX-12`.

**In Arc (Android):** the FX sheet has the same effects on the phone's own engine: they never touch the EP-133. Hold FX for the punch-ins, one per pad.

**Exercise:** a riser to practise on: a snare that gets louder through the second bar, over a plain beat. Try a delay send on it, then punch in the filter at the end.

```
ARC BEAT 1
name Lesson 11 riser
tempo 124

[A] bars 2 step 1/16
A7 kick  | X... X... X... X... | X... X... X... X... |
A9 snare | .... .... .... .... | 1122 3344 5566 7899 |
A5 open hat | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. ..x. |
```

**Check:** what makes the snare a riser in the card? *Answer: its velocity digits climb from 1 (14) to 9 (126) across bar 2.*

## Lesson 12: Sampling and chopping

**Goal:** record a sound, put it on a pad and play slices of it as a beat.

**On the device**
- Press SAMPLE (`SMP-1`), hold a pad to record (`SMP-2`), and pick the source with `SMP-3`: mic, line in, resample (RSP) or USB. Choose the destination slot with `SND-20`.
- Record hands-free with `SMP-6`, resample the playing pattern with `SMP-8`, or capture a set number of bars with `SMP-9`. Auto-chop a sample into slices across a group with `SMP-14`.
- Trim the start and length with `SND-10`.

**In Arc (Android):** the mic key in the top bar opens the SAMPLE panel. Hold a pad to record into it; KEEP puts the take on the pad and uploads it to the EP-133 when connected.

**Exercise:** drums in A and four slices of one sample on D, played as a pattern. Whatever your slices sound like, this is how a chopped loop is built.

```
ARC BEAT 1
name Lesson 12 chops
tempo 90
swing 56

[A] bars 2 step 1/16
A7 kick  | X... ..x. .... .... | X... .... ..x. .... |
A9 snare | .... X... .... X... | .... X... .... X... |

[D] bars 2 step 1/16
D7 chop 1 | X... .... .... .... | X... .... .... .... |
D8 chop 2 | .... .... ..x. .... | .... ..x. .... .... |
D9 chop 3 | .... .... .... x... | .... .... x... .... |
D4 chop 4 | .... ..x. .... .... | .... .... .... ..x. |
```

**Check:** what happens if the pads of group D hold other sounds when you paste this? *Answer: the pattern plays whatever sound is on those pads; the names in the card are only labels.*
