# Arc, screen by screen

What Arc does, written so you can explain it to a user. Arc is a free, open-source companion for the teenage engineering EP-133 K.O. II. It runs as an Android app and in the browser (Chrome or Edge, at https://arc-pi-mauve.vercel.app). It talks to the EP-133 over USB-C. It has no account and no server; nothing leaves the phone unless the user shares it. It has a `?demo` mode in the browser (add `?demo` to the address) with a simulated EP-133, so someone without a device can still try it.

Not every screen is on both. The **web app** has the pads, KEYS, the guide and the backup library, and has the sequencer's *core* (patterns, steps, scenes, FX) with no screens yet. The **Android app** has everything below. If you are not sure which one the user has, ask before telling them to tap something.

## The tag at the top left

A tag naming the section opens the list: **Backups**, **Live**, **Device**, and **Settings** set apart below. A **GUIDE** tab on the left edge slides in the EP-133 shortcut guide. The top bar also has the connection key (green with a dot when connected; tap it to connect, hold it to disconnect) and **?**, which explains whatever is on screen.

## Backups

Back up every sound and project on the device to a `.pak` file on the phone, restore a whole backup or only some projects with the sounds they use, keep a library of backups with names and notes, share or save them, import `.pak` files made by the official Sample Tool, compare two backups or a backup against the device, search sounds by name across every backup, and add WAV samples to sample slots (with trim). It is the librarian side of Arc. Beats on cards do not live here.

## Device

Browse the connected device's projects and sounds, play a sound on the phone, see which sound is on each pad of a project. Reading and writing here is real: it changes the EP-133.

## Live: the pads

**Live** mirrors the EP-133 as the user plays it, and works without it. It shows the four groups (A-D) as 3 by 4 grids of pads, printed as on the device: `7 8 9 / 4 5 6 / 1 2 3 / . 0 ENTER`. The user can show all four groups or one big group with A-D keys under it. Pads show the **sound name** read from the device, then listen: it changes nothing on the device unless the user uses EDIT. Without the device Live still shows the pads as last read (**Offline**) or the factory sounds, and plays them on the phone.

- **KEYS / PADS** switches the grid between the 12 pads and the pad's sound played chromatically (a 3 by 4 grid or a piano, with the key, scale and octave).
- **EDIT** (the SOUND function key on Android) lets the user give a pad another sound and change its settings (pitch, level, play mode, trim, envelope, MIDI channel, mute group). Offline, this changes the pads in Arc only until the device is connected.
- **Function keys** (Android) SOUND, PROJECT, TEMPO, FX, printed like the device's: SOUND is EDIT, PROJECT steps the project (1-9), TEMPO opens the tempo sheet (hold) with its TIMING tab, FX opens the effects.
- Notes from the device show on the phone's pads brighter with velocity. Play/stop and tempo follow the device's MIDI clock when its clock out is on.

## Live: patterns (Android)

The pads played go into a looping pattern that plays on the phone, like the device's:

- **RECORD** and **PLAY** sit together on the display line. Tap RECORD to arm, then PLAY for a one-bar count-in, or both at once. While it plays, a tap on RECORD punches recording in and out. **Hold RECORD** for the pattern sheet: LENGTH for each group (1-99 bars), AUTO length, TIMING, COUNT-IN, SCENE CHANGE, UNDO, ERASE, CLEAR.
- **ERASE** latches so a tap on a pad erases its notes, or a held pad erases as the playhead passes. **UNDO** (the arrow) takes back the last pass, up to 32 steps for each project.
- Patterns are kept for each project **in Arc's own files, never written to the EP-133**. Each group loops at its own length. A pattern plays *whatever sound is on the pad* at that moment.
- The tempo is the app's (the device's while it sends MIDI clock), shared by all patterns. Changing it mid-play keeps the pattern in time.

### STEP (the step sequencer)

The **STEP** cell on the display line unrolls the step panel while the pattern is stopped: a strip of one bar of steps at the TIMING interval, **-** and **+** to move the cursor, hold the panel's **RECORD** and tap pads to put them on the step, **VEL** and **LEN** knobs for the step's notes, **NUDGE** to move one pad's note, **CORRECT** to put a pad's notes back on the grid.

### TIMING and swing

Hold TEMPO and open the second tab, **TIMING**. **INTERVAL** is 1/1 to 1/32 including triplets (1/8T, 1/16T), the arp's step and the grid recording snaps to. **RECORD** is QUANTIZE or FREE TIME. **SWING** runs from 50% (straight) to 75% and applies at 1/8 and 1/16 only, delaying the odd steps. The same tab holds the arp: **ARP** on KEYS, **RPT** (note repeat) on pads.

### Scenes

The **S01** cell opens the **SCENE panel**. A project has up to 99 scenes, each group has up to 99 patterns, and a scene is the pattern each group plays. The panel steps the scene and each group's pattern, **COMMIT** duplicates the scene, **CLR/DEL** clears or deletes it, **CHANGE** says when a switch takes over (immediate, bar end, pattern end), and **CLIP** copies and pastes a pattern, a bar or a pad's notes.

### FX

The FX sheet has the EP-133's six master effects (delay, reverb, distortion, chorus, filter, compressor) with an XY pad, a send for each group, an output compressor, a sidechain, and twelve **punch-ins** when FX is held. They are the phone's own; nothing is sent to the EP-133, and its FX settings are never read.

### SAMPLE and TAKE

The mic key in the top bar opens **SAMPLE**: hold a pad to record a sound into it from the mic, a resample of Live's own mix or USB audio, with level, threshold, bars and latch. Each take opens a **New sample** sheet (START, LENGTH, normalise, trim silence) and **KEEP** puts it on the pad and, when connected, uploads it. **TAKE** records the pads and keys played into a WAV file of what you heard.

## The Guide

100 EP-133 key combinations in tabs with search, each with its keys drawn like the device, numbered steps and a link to the official guide section. It is the source of [ep133-guide.md](ep133-guide.md): the same entries.

## Settings

Theme, connect automatically, keep the screen on, how many backups to keep, Live's options (pad numbering, note names, key labels, piano size, haptics, whether SAMPLE's takes open a review sheet), the debug log, the version.

## Cards: sharing a beat and pasting one back (Android)

In Live, open **Live tools** (the strip on the right edge). Between the view settings and TAKES is a **CLAUDE** section (its **(i)** explains beat cards and how to add this skill). Its card, **Beat cards**, has three keys:

- **SHARE SCENE S02** sends the scene playing as an **ARC BEAT card** (see [beat-card.md](beat-card.md)): its four patterns, the blank ones left out.
- **SHARE A · 01** sends one pattern: the playing pattern of the group shown (the label follows the group and the pattern number).
- **PASTE BEAT** reads the card on the clipboard.

A share opens the phone's share sheet with plain text: a line asking you to analyse the beat with this skill, then the card in a code block. It carries the tempo Live plays at, the TIMING swing, one section for each group and a row for each pad with its **sound name** (so you can tell a kick from a snare), a `notes` list for anything that does not fit the grid, and a `# tidied` comment: velocities are rounded to 127, 100 or 64 and short gates to a step. The share keys are dimmed when the scene or pattern has no notes.

Under the card are two links: **Get the arc-beats skill** (the zip, for Settings, Capabilities, Skills in the Claude app) and **Learn with Claude**, which shares a starter prompt for lesson 1 of [lessons.md](lessons.md).

Getting a card back: the user copies it from your code block and taps **PASTE BEAT**, or shares your reply from the Claude app to Arc, which opens Live with the same sheet. Text with no `ARC BEAT` line gets the message "No beat card in that text."

The **beat card sheet** shows the card's name (or "Beat card") and what is in it, such as "Beat card · 4 bars · 5 pads · 23 hits", then for each group a read-only step grid (a row for each pad, lit by how hard each hit is; the first two bars of a long pattern, then "+2 bars"). Under the grids:

- **Goes to A · 04 (next free)**: each section goes into its group's next free pattern. Nothing is overwritten.
- **New scene S03**: a card with more than one section also adds a scene that plays the new patterns, the groups the card does not have keeping the patterns of the scene playing.
- **Tempo 92** with a chip, **SET · NOW 122**: the card's tempo is only offered, and the chip is off until the user turns it on. It is hidden when the tempo is the same or the card has none.
- **Swing 58 · placed in the notes**: the swing is already in where the hits sit; nothing is set.
- The card's mistakes, with their lines (warnings amber, errors red), and **COPY PROBLEMS**, which copies them as text for the user to paste to you.

**IMPORT** puts the patterns in; it is off, with the reason, when the card has errors ("Fix the errors to import this card.") or a group has no free pattern ("Group B has no free pattern."). **CANCEL** closes the sheet. One undo (the arrow next to the pattern keys, or UNDO in the Pattern sheet) takes the whole import back, and the toast says so: "Imported to A · 04. UNDO takes it back." It plays at once, stopped or playing, and works offline. The patterns are a practice copy in Arc: importing never writes to the EP-133.

How to tell the user:

1. Open **Live**, then **Live tools**, and find **CLAUDE**. Choose the scene or pattern to share: **SHARE SCENE** or **SHARE** (the group shown), then send it to the Claude app or paste it into the chat.
2. After your reply, copy the card from the code block and tap **PASTE BEAT** in Live tools (or share your reply to Arc). Check the sheet and tap **IMPORT**.
3. Play it. Tap the undo arrow to take it back.
