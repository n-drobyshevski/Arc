# Remaking a song

Read this when Arc's Claude page sends *Use the arc-beats skill to remake a song for my EP-133 as closely as the EP-133 allows ...* (the REMAKE tab, often opened by sharing a song from Spotify, YouTube Music, Apple Music, SoundCloud or Shazam to Arc), then a list (`- Song:`, `- Link:`, `- Scope:`, `- Tempo:`, `- First:`, `- Copy:`, `- Write:`), or when the user asks for "a beat like" a song they name.

The goal is a card that sounds as close to the song as the EP-133 allows, built from what is published about it. You cannot hear the song and cannot play the link: everything comes from pages and search results, so say *rebuilt from published information, not by ear*. The groove, the harmony, the sounds and the structure are copied; the hook is written fresh; there are no lyrics.

## 1. Pin the song

- **Search even if you know it.** Names repeat, and a remix, a live take or a cover has another tempo and form. Use web search; if it is off, say so and ask the user to turn it on (Settings, Capabilities in the Claude app). Do not fill the gaps from memory.
- **Open the link.** `open.spotify.com/track/...`, `music.youtube.com/watch?v=...`, `music.apple.com/...?i=...`, `soundcloud.com/...` and `shazam.com/track/...` pages name the title and artist. A `spotify.link` (or `spoti.fi`) page holds an `open.spotify.com/track/...` link: follow it. An album, playlist or artist link is not one song: ask which.
- **Name the version**: the title, the artist, and the release or remix ("the 2019 single, not the extended mix").
- **Ask when unsure.** When the words and the link disagree, or the search gives two songs, ask one short question instead of guessing.

## 2. Find the facts, from two sources or more

| Fact | Where | Settle a disagreement by |
|---|---|---|
| Tempo | SongBPM, Tunebat, Musicstax; Beatport for electronic music | Half or double time: the genre's range in [genres.md](genres.md) (a dnb track listed at 87 is 174; trap is written at 140 even when it feels 70) |
| Key | the same sites, Hooktheory, chord sheets | A key a fifth off, or the relative major or minor (C major or A minor): the chords. The chord the chorus lands on and the bass returns to is the tonic |
| Time signature and swing | the same sites, tutorials | Straight or swung 16ths, a triplet feel: tutorials and interviews; else the genre's recipe |
| Genre | the sites, the label, reviews | The recipe in genres.md that fits the tempo and the drums |
| Sections and bar counts | Hooktheory, Ultimate Guitar, tutorials, a timed lyric or structure page | Count bars from the time: bars = seconds × tempo ÷ (60 × beats a bar), so ÷ 240 in 4/4 and ÷ 180 in 3/4 |
| Drums, chords, sounds, FX | Sound On Sound's *Inside Track*, interviews with the artist or producer, remake and "how it was made" tutorials, WhoSampled (a sampled break is the drum pattern) | The more specific source: a session interview beats a forum guess |

- **Two sources agree** and the fact is confirmed. One good source is likely. None is a guess, written in the song's genre from its recipe; drums and sounds are often guesses.
- **When a site won't open**, use what its search snippet says, and say it came from a snippet. Only name a page you opened or a snippet you saw; never cite a page you did not read.

## 3. Map it to the EP-133

- **Groups:** A drums, B bass, C chords (keys, a pad, a guitar stab), D the hook. Extra percussion stays in A.
- **Sounds:** from the user's sound list when the share has one, by the song's sound (a Rhodes is an electric piano, a TR-808 kick an 808 kick); else from the factory pack in [factory-sounds.md](factory-sounds.md); else a `synth` line from [synth-sounds.md](synth-sounds.md). Group D is empty in a fresh project, so the hook on D7 needs a sound or synth line. Put the song's sound in the row label (`A7 808 kick`), so the user knows what to look for.
- **FX:** the card's effect lines are the project's, one set for the whole card. Take them from the nearest recipe in genres.md (a dub delay, a house pump). An effect the song uses in one section only (a filter sweep into the drop, a tape stop) is a punch-in for your reply (PUNCH-IN TIPS in SKILL.md), not a card line.
- **Tempo** 40-240: halve or double a tempo outside it. **Swing** 50-75. Swing the notes list by hand (BUILD step 3 in SKILL.md).
- **Time:** a card's bar is four beats. A 6/8 or 12/8 feel goes on a `1/8T` grid (12 steps a bar), so two 6/8 bars make one card bar (a 12/8 bar is one); a 3/4 song fits four of its bars in three card bars: say so. Turn a section's bars into card bars before you work out its passes.
- **Pitch:** `note C4` is the sample's own pitch. A bass sits around C1-C3; on a `synth` bass move it up two octaves (genres.md, "The assumed kit").

## 4. The arrangement

- **The whole song** (`- Scope: the whole song ...`): one scene per distinct section, in the order they first come (intro, verse, chorus, bridge, outro), 16 at most. Each scene is the section's loop, 1-4 bars, and the `chain` line repeats it for the section's real bars: an 8-bar verse whose scene is 2 bars plays 4 passes (`2x4` when it is scene 2), a 16-bar chorus of 4 bars plays 4 passes too. A pass lasts the scene's longest pattern, a group it carries over included ([beat-card.md](beat-card.md), Chains in Arc): give every group in a scene the same length, or count the carried one when you work out passes; `analyse` gives each step's bars a pass. A section that comes back is the same scene again in the chain. The chain holds 64 steps of up to 8 passes, enough for a song; when a section's bars don't divide by its scene's, round and say so. Name each scene after its section (`scene Chorus`). A group a scene leaves out carries on, so write only what changes, as long as a carried group is no longer than the scene; give the first scene every group it needs.
- **The main loop** (`- Scope: its main groove ...`): the chorus or the drop as one scene of 4-8 bars, with no `scene` or `chain` line. The drums can loop a bar or two inside it while the chords and the hook run the whole length, as in the example below.

## 5. What to copy and what to write

- **Copy:** the tempo, the swing, the drum pattern (where the kicks land, the backbeat, the hat rhythm), the kinds of sound, the FX, the chord progression, and the sections with their bar counts. That is the song's feel, and it is what the user asked for.
- **Write your own hook**: a melody in the song's key, register and feel (where it starts in the bar, how busy it is), but its own notes.
- **Write the bass** from the chord roots in the song's rhythm. When the bass line is the song's main riff, write your own instead.
- **No lyrics, and no melody copied note for note**, even when asked. Say so in one line (*the hook is my own, in the song's key and feel*) and go on with the rest.

## 6. Say what you know

- **Before the card**, a fact list: one line for each fact, with its value, its source and how sure it is: confirmed (sources agree), likely (one good source) or a guess.
- **The same lines go in the card** as `#` comments, right after the `ARC BEAT 1` line. Arc and the script ignore comments, and the facts travel with the card.
- **Say it is rebuilt** from published information, not by ear.
- **When the tempo is unsure** (the sources disagree, or there is only one), suggest the user plays the song and taps along: on the EP-133 by tapping TEMPO (`SEQ-26` in [ep133-guide.md](ep133-guide.md)), in Arc on the tempo sheet's TAP pad (hold TEMPO).

## 7. Check it

- `scripts/beatcard.py check` until it prints `OK`, then `analyse`.
- Compare the arrangement's `total_bars` and `seconds` with the song's length: a 3:30 song at 120 BPM is 105 bars. Say how far apart they are and why (a fade-out, a section left as a loop).
- A main loop is 4-8 bars: check the bars.

## An example: a remake loop

An invented song: the facts and sources below are made up to show the format. The song is house at 118 BPM in A minor, with the chords A minor, F, C and G a bar each. The drums loop one bar; the bass, chords and hook run four.

```
ARC BEAT 1
# Example Song · Example Artist, rebuilt from published information, not by ear
# tempo 118: confirmed (SongBPM, Tunebat)
# key A minor: likely (Tunebat; SongBPM gives C major, the relative major; the chords end on A minor)
# 4/4, a light swing: likely (a remake tutorial)
# chords Am F C G, a bar each: confirmed (Hooktheory, a chord sheet)
# drums and sounds: guess (the house recipe)
# hook and bass: written fresh, not the song's
name Example Song loop
tempo 118
swing 52

[A] bars 1
A7 kick        | X... X... X... X... |
A6 clap        | .... X... .... X... |
A5 open hat    | ..x. ..x. ..x. ..x. |
A4 closed hat  | .o.o .o.o .o.o .o.o |

[B] bars 4
notes
B7 at 1.1.3 note A2 gate 1/8
B7 at 1.2.3 note A2 gate 1/8
B7 at 1.3.3 note A2 gate 1/8
B7 at 1.4.3 note A2 gate 1/8
B7 at 2.1.3 note F2 gate 1/8
B7 at 2.2.3 note F2 gate 1/8
B7 at 2.3.3 note F2 gate 1/8
B7 at 2.4.3 note F2 gate 1/8
B7 at 3.1.3 note C3 gate 1/8
B7 at 3.2.3 note C3 gate 1/8
B7 at 3.3.3 note C3 gate 1/8
B7 at 3.4.3 note C3 gate 1/8
B7 at 4.1.3 note G2 gate 1/8
B7 at 4.2.3 note G2 gate 1/8
B7 at 4.3.3 note G2 gate 1/8
B7 at 4.4.3 note G2 gate 1/8

[C] bars 4
notes
C7 at 1.1.1 note A3 gate 336 vel 90
C7 at 1.1.1 note C4 gate 336 vel 90
C7 at 1.1.1 note E4 gate 336 vel 90
C7 at 2.1.1 note A3 gate 336 vel 90
C7 at 2.1.1 note C4 gate 336 vel 90
C7 at 2.1.1 note F4 gate 336 vel 90
C7 at 3.1.1 note G3 gate 336 vel 90
C7 at 3.1.1 note C4 gate 336 vel 90
C7 at 3.1.1 note E4 gate 336 vel 90
C7 at 4.1.1 note G3 gate 336 vel 90
C7 at 4.1.1 note B3 gate 336 vel 90
C7 at 4.1.1 note D4 gate 336 vel 90

[D] bars 4
synth D7 pluck note C4 decay 30 tone 50 sweep 50 name hook
notes
D7 at 1.1.3 note E5 gate 1/8
D7 at 1.2.1 note C5 gate 1/8
D7 at 1.2.4+1 note A4 gate 1/16
D7 at 1.3.3 note C5 gate 1/4
D7 at 2.1.3 note A4 gate 1/8
D7 at 2.2.1 note C5 gate 1/8
D7 at 2.3.1 note F5 gate 1/4
D7 at 3.1.3 note E5 gate 1/8
D7 at 3.2.1 note G5 gate 1/8
D7 at 3.2.4+1 note E5 gate 1/16
D7 at 3.3.3 note C5 gate 1/4
D7 at 4.1.3 note B4 gate 1/8
D7 at 4.2.1 note D5 gate 1/8
D7 at 4.3.1 note G4 gate 1/4
```

The bass plays each chord's root on the offbeats, as house basses do; the chords are held a bar each; the hook is new, in A minor and in the pluck's register. The `+1` on the hook's off-sixteenths is the swing of 52 (SKILL.md, BUILD step 3). A whole-song card has the same comments and a `scene` for each section with a `chain` line, such as `chain 1x2 2x4 3x4 2x4 3x4 4x2` for an intro, verse, chorus, verse, chorus and outro.

## The reply

1. The fact list, then *rebuilt from published information, not by ear* and the one line on the hook.
2. The card in one code block, checked.
3. A line for each scene saying which part of the song it is (*Scene 2 · Chorus: the chorus, 16 bars as four passes of 4*), or for a loop, which part it is.
4. The paste line from BUILD step 6 in SKILL.md (for a card of scenes, the two lines from "BUILD: a track idea"), the sound line if the card changes sounds, and a punch-in or two for effects the song uses in one place.
