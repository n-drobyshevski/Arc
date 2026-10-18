# Teaching a card: play it yourself

Read this when the user wants to **play** a beat rather than import it: Arc's Claude page sends *Use the arc-beats skill to teach me to play this EP-133 beat from Arc myself, on the device, not just import it.*, then a list (`- Way:`, `- Me:`, `- Start:`) and the card, or they ask "how do I play this?" about a card.

The goal is that their hands can play the beat, not that they understand it. Teach it as a lesson: one small thing to play, how to tell it is right, then wait.

## Before the first step

1. **Read the card.** When code execution is available run `scripts/beatcard.py analyse` and `grid` on it: the tempo, the bars, which rows are the kick, snare and hats (by the sound line's name, else the row label), the ghost notes and accents, the swing and the `notes` list (KEYS parts). Never name a pad the card does not have.
2. **Work out the starting tempo.** `- Start: at 50% of its tempo` on a card at 92 BPM is 46 BPM. Tell them how to set it from SEQ-26 of [ep133-guide.md](ep133-guide.md), and in Arc the tempo in Live tools. When a step plays cleanly four times running, raise it by about a tenth, up to the card's tempo.
3. **Map the pads.** The keypad is `7 8 9 / 4 5 6 / 1 2 3 / . 0 ENTER` in each group. Say where each part's pad is in those words ("the kick is 7, top left of group A").

## Counting

Sixteen steps a bar are counted **1 e and a, 2 e and a, 3 e and a, 4 e and a**: step 1 is "1", step 2 "e", step 3 "and", step 4 "a", step 5 "2", and so on. Write a part as its counts ("kick on 1 and 3, and on the 'a' of 2"), not as step numbers. Have them count out loud at the start; it is the fastest way to lock in.

## The way

- **Finger drumming** (`- Way: finger drumming`): one part at a time, in this order: the kick, then the snare or clap (the backbeat: 2 and 4), then the hats, then percussion, then ghost notes and accents, then the fill. Give each pad a hand and a finger. A good split for group A: hats (4, 5) with the right index and middle fingers, kick (7) and snare (9) with the left index and ring fingers, or the other way round for left-handers; ask once. Loop four bars of each new part on top of the old ones before adding the next. The metronome (SEQ-27) helps at the start; turn it off once the kick holds the time. When it holds, let them record it (SEQ-1) and listen back.
- **Step entry** (`- Way: step entry`): row by row with SEQ-8, the resolution from SEQ-11 matching the card's `step`, accents and ghost notes with SEQ-9, the swing with SEQ-12, the length with SEQ-6. Say each row as its steps to press ("steps 1, 5, 9 and 13"), quote the combo by its id, and check each row by playing it back before the next.
- **Performing it** (`- Way: performing it live`), usually for a card of scenes: a cue sheet, bar by bar, in the chain's order: which scene comes when (SEQ-24), where to play a fill on the pads over the loop, which punch-in to hold and when to let go (the PUNCH-IN TIPS in SKILL.md, FX-6), group solos (FX-5) and the fader (FX-11) for drops. Rehearse one change at a time, then the whole run.
- **KEYS parts** (`- Way: its bass and melody parts in KEYS`): KEYS mode with FX-17, the octave or root with FX-18 and the scale with FX-19. Translate the `notes` list into which keypad pad plays which note in their scale, then counts as above (`at 1.3.1` is beat 3 of bar 1). One phrase of one or two bars at a time.

## The level

- **A beginner** (`- Me: a beginner`): one part per step, counting out loud, slow, and say what "right" sounds like ("the kick lands with the click on 1 and 3"). Celebrate the first clean loop.
- **An improver** (`- Me: I've had some practice`): two parts per step, start nearer the tempo, point out the ghost notes and the swing.
- **A sure hand** (`- Me: I'm sure on the pads`): whole groups at once, then the feel: velocities, swing, where the fills go, how to vary it live.

## Each step

Give one step per message: what to play (pads, counts, hand), at what tempo, how to tell it is right, and what to do if it isn't (slower, or that part alone). Then stop and wait for them. When they say it works, the next step; when they say it doesn't, a smaller step or a slower tempo, never more words. When the whole beat plays, suggest recording it on the EP-133 (SEQ-1 or SEQ-4) and offer a variation to learn next.

Use only the key combos in [ep133-guide.md](ep133-guide.md), quoted by id; if one is missing, say it isn't in the official guide.
