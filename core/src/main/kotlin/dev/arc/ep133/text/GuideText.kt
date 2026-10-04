package dev.arc.ep133.text

/** One key combination: what it does, the keys, the official guide section it comes from. */
data class GuideEntry(val action: String, val keys: String, val source: String, val note: String? = null)

data class GuideSection(val title: String, val entries: List<GuideEntry>)

/**
 * The shortcut guide (an addition to the web version). Every entry is
 * paraphrased from teenage engineering's official EP-133 K.O. II user guide
 * (version 2.5, OS 2.5) and links to the section it comes from. Each one was
 * checked against that page a second time; nothing here comes from anywhere
 * else, and combos the guide does not document are left out.
 */
object GuideText {
    const val TITLE = "Shortcut guide"
    const val GUIDE = "Guide"
    const val OFFICIAL_URL = "https://teenage.engineering/guides/ep-133"
    const val OPEN_OFFICIAL = "Open the official guide"
    const val SOURCE = "Source"
    const val INTRO = "Key combinations from teenage engineering's official user guide for OS 2.5, in our own words."
    const val CHECK_NOTE = "Check against your device: combinations can change between OS versions."
    const val SEARCH = "Search"
    const val NO_MATCHES = "Nothing matches."

    /**
     * Sections with only the entries whose action, keys or note contain every
     * word of [query] (case-insensitive); empty sections are left out.
     */
    fun filter(query: String): List<GuideSection> {
        val words = query.trim().lowercase().split(Regex("\\s+")).filter { it.isNotEmpty() }
        if (words.isEmpty()) return sections
        return sections.mapNotNull { s ->
            val hits = s.entries.filter { e ->
                val text = (e.action + " " + e.keys + " " + e.note.orEmpty()).lowercase()
                words.all { it in text }
            }
            if (hits.isEmpty()) null else GuideSection(s.title, hits)
        }
    }

    val sections: List<GuideSection> = listOf(
        GuideSection(
            "Sounds",
            listOf(
                GuideEntry(
                    "Load a sample onto a pad: in SOUND mode, pick a group and then press the pad you want to load",
                    "SOUND, then GROUP A-D, then a pad",
                    "https://teenage.engineering/guides/ep-133/modes#8.1-sound",
                    "SOUND mode handles which sample goes on which pad, deleting samples, and basic amplitude and pitch. Capacity is 999 samples or 128 MB.",
                ),
                GuideEntry(
                    "Step through the sample library one slot at a time to change the sound on the selected pad",
                    "- / + (in SOUND mode)",
                    "https://teenage.engineering/guides/ep-133/modes#8.1-sound",
                    "Factory layout by number: kicks 1-99, snares 100-199, hi-hats 200-299, percussion 300-399, bass 400-499, melodic 500-599. OS 2.0.1 notes say pad settings are kept when you browse away with +/- and come back to the original sound.",
                ),
                GuideEntry(
                    "Move through sample numbers in steps of ten instead of one",
                    "SHIFT + - / + (in SOUND mode)",
                    "https://teenage.engineering/guides/ep-133/modes#8.1-sound",
                ),
                GuideEntry(
                    "Load a sample directly by entering its slot number",
                    "Hold SOUND + type the number on the pads",
                    "https://teenage.engineering/guides/ep-133/modes#8.1-sound",
                ),
                GuideEntry(
                    "Show a sample's name on the display",
                    "Hold the pad (in SOUND mode)",
                    "https://teenage.engineering/guides/ep-133/modes#8.1-sound",
                    "A sample only has a name if it was imported or renamed with the EP sample tool. OS 2.5 release notes (fix): long names now scroll in a loop while the pad is held.",
                ),
                GuideEntry(
                    "Set the selected pad's level (AMP) and pitch (PTC)",
                    "SOUND mode: KNOB X = AMP, KNOB Y = PTC",
                    "https://teenage.engineering/guides/ep-133/modes#8.1-sound",
                    "Holding SHIFT while turning X or Y slows the knob down for fine adjustment.",
                ),
                GuideEntry(
                    "Open SOUND EDIT for the selected sound and move between its six edit pages",
                    "SHIFT + SOUND to enter; - / + to change page",
                    "https://teenage.engineering/guides/ep-133/modes#8.2-sound-edit",
                    "Edits apply only to the sound inside the current project and are not written back to the sample file. Crop on the trim page is the exception.",
                ),
                GuideEntry(
                    "Save the edits made to the current sound",
                    "Hold SHIFT + SOUND for 2 seconds",
                    "https://teenage.engineering/guides/ep-133/modes#8.2-sound-edit",
                    "OS 2.0.1 fix: saving this way now also works during playback.",
                ),
                GuideEntry(
                    "Choose how the pad plays the sample and set its stereo position",
                    "SOUND EDIT, sound page: KNOB X = play mode (oneshot / key / legato), KNOB Y = pan",
                    "https://teenage.engineering/guides/ep-133/modes#8.2.1-sound-mode",
                    "Oneshot is monophonic and plays the whole sample. Key is polyphonic, so copies of the same sample can overlap. Legato is monophonic and continues from the current position when the note changes while held.",
                ),
                GuideEntry(
                    "Set the sample's start point and how long it plays (trim)",
                    "SOUND EDIT, trim page: KNOB X = start point, KNOB Y = length",
                    "https://teenage.engineering/guides/ep-133/modes#8.2.2-trim",
                    "OS 2.5 notes: holding SHIFT while turning X or Y zooms trim fine-tuning to a 1-second window, and the trim page shows the playback position in seconds while a pad is held.",
                ),
                GuideEntry(
                    "Crop the sample file permanently to the current trim points",
                    "Hold SHIFT + SOUND (on the trim page)",
                    "https://teenage.engineering/guides/ep-133/modes#8.2.2-trim",
                    "Destructive: it overwrites the file and cannot be undone. Added in OS 2.5.",
                ),
                GuideEntry(
                    "Shape how the sound fades in and whether it rings on after release (attack/release)",
                    "SOUND EDIT, envelope page: KNOB X = attack, KNOB Y = release",
                    "https://teenage.engineering/guides/ep-133/modes#8.2.3-envelope",
                    "Release decides whether the sound keeps playing after the pad is let go or stops right away.",
                ),
                GuideEntry(
                    "Choose the time-stretch mode and set the sample's tempo or length in bars",
                    "SOUND EDIT, time page: KNOB X = stretch mode (BPM / BAR / reverse), KNOB Y = sample BPM (BPM mode) or length in bars (BAR mode)",
                    "https://teenage.engineering/guides/ep-133/modes#8.2.4-time",
                    "BPM mode follows the project tempo once you enter the sample's own BPM. BAR mode stretches the sample to fill the chosen number of bars.",
                ),
                GuideEntry(
                    "Make a sample play backwards",
                    "SHIFT + SOUND, press + until 'tim' shows, then turn KNOB X until 'rev' shows",
                    "https://teenage.engineering/guides/ep-133/whats-new",
                    "Presented as a new feature in OS 2.5. Reverse is also listed as a stretch mode on the time page.",
                ),
                GuideEntry(
                    "Set the pad's MIDI channel and root note",
                    "SOUND EDIT, MIDI page: KNOB X = MIDI channel, KNOB Y = root note",
                    "https://teenage.engineering/guides/ep-133/modes#8.2.5-midi",
                ),
                GuideEntry(
                    "Make pads choke each other (mute group), so only the most recently hit pad in the group plays",
                    "SOUND EDIT, go to the mute group page with - / +, then press pads to add them",
                    "https://teenage.engineering/guides/ep-133/modes#8.2.6-mute-group",
                    "Reach the page with - / + like the other sound edit pages. With no pad selected all pads flash; lit pads are in the group.",
                ),
                GuideEntry(
                    "Copy a sound from one pad to another",
                    "SOUND mode: select source pad, SHIFT + GROUP C; select target pad, SHIFT + GROUP D",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.5-copy-paste",
                ),
                GuideEntry(
                    "Copy every sound in a group to another group",
                    "SOUND mode: SHIFT + GROUP C twice; choose target group, SHIFT + GROUP D",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.5-copy-paste",
                ),
                GuideEntry(
                    "Delete the selected sample from device memory for good",
                    "Hold ERASE + SOUND until SND blinks",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.6-erase-undo",
                    "Permanent. Samples can only be deleted from SOUND mode.",
                ),
                GuideEntry(
                    "Choose which library slot a new recording goes into",
                    "Hold SOUND, type a slot number on the pads, press ENTER, then SAMPLE",
                    "https://teenage.engineering/guides/ep-133/functions#10.1-sample",
                ),
            ),
        ),
        GuideSection(
            "Sampling",
            listOf(
                GuideEntry(
                    "Enter sample mode. Every pad lights up and the LEDs blink to show the sampler is ready.",
                    "SAMPLE",
                    "https://teenage.engineering/guides/ep-133/functions#10.1-sample",
                    "If a take comes out wrong, record it again.",
                ),
                GuideEntry(
                    "Record into a pad. Recording runs for as long as you hold the pad down. When the pad holds a sample it stops blinking and stays lit. Press the pad again to hear what you recorded.",
                    "(in sample mode) hold a pad",
                    "https://teenage.engineering/guides/ep-133/functions#10.1-sample",
                    "While you stay in sample mode you can keep recording to more pads.",
                ),
                GuideEntry(
                    "Choose the input source: built-in mic, line in mono or stereo (IN), line in left only (L.IN) or right only (R.IN), resample of the device's own output in mono or stereo (RSP), or USB audio in mono or stereo (USB).",
                    "(in sample mode) - / +",
                    "https://teenage.engineering/guides/ep-133/functions#10.1-sample",
                ),
                GuideEntry(
                    "Set the input recording level.",
                    "(in sample mode) KNOB X",
                    "https://teenage.engineering/guides/ep-133/functions#10.1-sample",
                ),
                GuideEntry(
                    "Set the threshold, so recording only starts once the incoming sound is loud enough.",
                    "(in sample mode) KNOB Y",
                    "https://teenage.engineering/guides/ep-133/functions#10.1-sample",
                ),
                GuideEntry(
                    "Hands-free sampling. The device holds the pad for you, so recording continues after you let go. Use it with the resample source to capture chords or single sounds as you play them.",
                    "(in sample mode) SHIFT + pad",
                    "https://teenage.engineering/guides/ep-133/functions#10.1-sample",
                    "Hands-free sampling, optionally followed by PLAY, is the way to record without holding a pad.",
                ),
                GuideEntry(
                    "Stop a hands-free recording while it is running.",
                    "SAMPLE (during a hands-free recording)",
                    "https://teenage.engineering/guides/ep-133/functions#10.1-sample",
                    "A normal recording ends when you release the pad.",
                ),
                GuideEntry(
                    "Resample the current pattern. Turn on hands-free sampling, then start playback. The recording lasts exactly as long as the selected pattern.",
                    "(in sample mode) SHIFT + pad, then PLAY",
                    "https://teenage.engineering/guides/ep-133/functions#10.1-sample",
                    "Select the resample (RSP) source first. It works best to enter sampling while the pattern is already playing.",
                ),
                GuideEntry(
                    "Record a set number of bars. With hands-free sampling on, choose how many bars, then press PLAY to record that many bars once.",
                    "(hands-free on) - / +, then PLAY",
                    "https://teenage.engineering/guides/ep-133/functions#10.1-sample",
                ),
                GuideEntry(
                    "Leave sample mode.",
                    "MAIN",
                    "https://teenage.engineering/guides/ep-133/functions#10.1-sample",
                ),
                GuideEntry(
                    "Detect the tempo of audio coming in through line in or the mic. The device shows the tempo it found and sets the project tempo to match.",
                    "Hold SAMPLE + TEMPO",
                    "https://teenage.engineering/guides/ep-133/modes#8.4.2-tempo-match",
                ),
                GuideEntry(
                    "Resample a chord into another group. Pick the sound and turn on KEYS mode. Enter the sampler, choose resampling as the source, pick the destination group, and start hands-free sampling on a pad. Go back to the group with the sound, play the chord, then stop.",
                    "SAMPLE, +, group button, SHIFT + pad, play chord, SAMPLE to stop",
                    "https://teenage.engineering/guides/ep-133/how-to#12.10-resample-a-chord",
                ),
                GuideEntry(
                    "Sample audio from a computer or phone over USB-C. First set the K.O.II as that device's audio output.",
                    "SAMPLE, + to select USB, then pad",
                    "https://teenage.engineering/guides/ep-133/how-to#12.11-record-a-sample-using-usb-audio",
                ),
                GuideEntry(
                    "Auto-chop a recorded sample into slices spread across a group's pads. Use - / + to choose how many slices.",
                    "SHIFT + SAMPLE (CHOP), then GROUP A-D, then - / +",
                    "https://teenage.engineering/guides/ep-133/functions#10.3-chop",
                    "This replaces that group's existing pad assignments. To switch between equal-length and attack-mode chopping, hold the same group button and press - / +.",
                ),
            ),
        ),
        GuideSection(
            "Sequencer",
            listOf(
                GuideEntry(
                    "Start live recording after a four-beat count-in (from stopped)",
                    "RECORD (press and release), then PLAY",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.1-live-record",
                    "Pressing PLAY again stops recording and pauses playback. Pressing RECORD instead stops recording and lets the pattern keep playing.",
                ),
                GuideEntry(
                    "Start live recording right away, with no count-in",
                    "RECORD + PLAY (pressed together)",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.1-live-record",
                ),
                GuideEntry(
                    "Record from the start of the pattern instead of from the current bar",
                    "RECORD (to arm recording), then SHIFT + PLAY",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.1-live-record",
                ),
                GuideEntry(
                    "Overdub: add notes to a pattern that is already playing",
                    "PLAY, then hold RECORD and hit the pads",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.1-live-record",
                ),
                GuideEntry(
                    "Overwrite recording: clear the existing recording and replace it with the new take",
                    "RECORD, ERASE, +",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.1-live-record",
                ),
                GuideEntry(
                    "Set the pattern length in bars (shorter or longer)",
                    "RECORD, then - / + (while playing: hold RECORD and press - / +)",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.1-live-record",
                    "Default length is 1 bar. A pattern can be up to 99 bars long, per group.",
                ),
                GuideEntry(
                    "Double the pattern length and copy the existing notes into the new half",
                    "RECORD (arm), then hold SHIFT + +",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.1-live-record",
                ),
                GuideEntry(
                    "Step sequencing: move through steps, then put a pad's sound on the current step",
                    "While stopped: - / + to choose the step; hold RECORD + pad to place the sound",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.2-step-sequence",
                    "Pads that hold a note on the current step light up. In step mode, holding RECORD and moving the fader stores that fader position on the step. This latches, so it stays set after you let go.",
                ),
                GuideEntry(
                    "Change the velocity or length of every note on the selected step",
                    "Hold SHIFT + turn KNOB X (velocity) / KNOB Y (note length)",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.2-step-sequence",
                    "Note length can be anything from 1 tick to 1 bar.",
                ),
                GuideEntry(
                    "Nudge one pad's note on the current step",
                    "While stopped: hold SHIFT + pad, then press - / +",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.7-offset-notes",
                    "In quantize mode the note moves by whole steps (the note interval). In free time it moves in ticks, between grid lines. The sequencer runs at 96 PPQN, so one 1/16 step is 24 ticks.",
                ),
                GuideEntry(
                    "Choose the step resolution (note interval)",
                    "TIMING, then turn KNOB X",
                    "https://teenage.engineering/guides/ep-133/functions#10.4-timing",
                    "Available intervals: 1/1, 1/2, 1/4, 1/8, 1/8T, 1/16, 1/16T, 1/32. The default is 1/16.",
                ),
                GuideEntry(
                    "Set the swing amount",
                    "TIMING, then turn KNOB Y",
                    "https://teenage.engineering/guides/ep-133/functions#10.4-timing",
                    "Only takes effect at the 1/8 and 1/16 intervals. Interval and swing affect notes you record afterwards, not notes already recorded.",
                ),
                GuideEntry(
                    "Switch between quantized recording and free-time recording",
                    "TIMING, then - (quantize) or + (free time)",
                    "https://teenage.engineering/guides/ep-133/functions#10.4-timing",
                    "Quantize snaps recorded notes to the chosen interval. Free time keeps the timing exactly as you played it.",
                ),
                GuideEntry(
                    "Note repeat: play a pad over and over at the current interval (also used to record hi-hat rolls)",
                    "Hold TIMING + pad (latched: TIMING, then hold SHIFT + pad; repeat the same combo to stop)",
                    "https://teenage.engineering/guides/ep-133/functions#10.4.1-note-repeat",
                    "In KEYS mode, holding TIMING and several pads plays an arpeggio, as long as the sounds are oneshot or legato type. The OS 2.5 notes list the arpeggio as new in that release. Note repeat responds to pad pressure when velocity sensitivity is turned on.",
                ),
                GuideEntry(
                    "Timing correct: quantize after recording, for one whole pad or just the notes you pick",
                    "SHIFT + TIMING to open it. While stopped, press a pad to quantize all of its notes. While playing, hold a pad to quantize only the notes that play while it is held.",
                    "https://teenage.engineering/guides/ep-133/functions#10.4.2-timing-correct",
                    "In timing correct, KNOB X sets the target interval and KNOB Y sets swing (at 8 or 16). While playing, the screen shows how many notes were corrected.",
                ),
                GuideEntry(
                    "Move every note on one pad earlier or later",
                    "SHIFT + TIMING (timing correct), then hold the pad and press - / +",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.7-offset-notes",
                    "New in OS 2.5. Each press moves the notes by one tick.",
                ),
                GuideEntry(
                    "Erase notes from a pad while the pattern plays",
                    "While playing: hold ERASE + pad(s)",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.6-erase-undo",
                    "You can hold several pads at once, and this also works on notes recorded in KEYS mode.",
                ),
                GuideEntry(
                    "Erase a pad's entire track in the pattern",
                    "While stopped: hold ERASE + pad until TRK blinks",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.6-erase-undo",
                ),
                GuideEntry(
                    "Erase the current pattern of a group",
                    "Hold ERASE + group button (A-D) until PTN blinks",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.6-erase-undo",
                ),
                GuideEntry(
                    "Undo",
                    "SHIFT + B (GROUP B)",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.6-erase-undo",
                    "The umbrella icon lights up when there is something to undo.",
                ),
                GuideEntry(
                    "Copy the current bar or the whole pattern, then paste it",
                    "In MAIN: SHIFT + C to copy (press once for the bar, twice for the pattern); SHIFT + D to paste",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.5-copy-paste",
                    "SHIFT + - / + moves between bars.",
                ),
                GuideEntry(
                    "Copy one pad's notes and paste them onto another pad",
                    "Hold the pad + SHIFT + C to copy; hold the target pad + SHIFT + D to paste",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.4-fader",
                    "Added in OS 2.5.",
                ),
                GuideEntry(
                    "Pick a pattern for a group, or jump to the next empty pattern",
                    "Hold a group button (A-D) + - / +, or type the number on the pads; SHIFT + A jumps to the next free pattern",
                    "https://teenage.engineering/guides/ep-133/modes#8.3-main",
                    "Holding several group buttons changes all of their patterns together.",
                ),
                GuideEntry(
                    "Pick a scene, or commit (duplicate the current scene so you can build a variation)",
                    "Hold MAIN + - / + (or type the scene number on the pads); commit = SHIFT + MAIN",
                    "https://teenage.engineering/guides/ep-133/modes#8.3-main",
                    "Scenes are numbered 01-99. Hold ERASE + MAIN for 2 seconds to clear the scene (CLR), or to delete it if it is empty and not in the song list (DEL).",
                ),
                GuideEntry(
                    "Song mode: open the song list editor and arrange scenes",
                    "Hold MAIN + ENTER pad to open. Inside: - / + changes song position, SHIFT + A adds a scene, SHIFT + - / + changes which scene sits at the position, SHIFT + C cuts it, SHIFT + D inserts it",
                    "https://teenage.engineering/guides/ep-133/modes#8.3.1-song-mode",
                    "In the editor, PLAY starts from the selected position and SHIFT + PLAY starts from the beginning of the song. A song holds at most 99 scenes.",
                ),
                GuideEntry(
                    "Set tempo: open tempo mode, tap it, turn the knob, or type a value",
                    "TEMPO (tap repeatedly to tap tempo); KNOB X sets BPM; hold TEMPO + type the number on the pads (the . pad adds decimals)",
                    "https://teenage.engineering/guides/ep-133/modes#8.4-tempo",
                    "KNOB X covers 60-180 BPM. Typed values can go from 40 to 399 BPM.",
                ),
                GuideEntry(
                    "Metronome volume, and making the metronome play during normal playback",
                    "TEMPO, then turn KNOB Y for volume. For the mode: SHIFT + ERASE (system settings), go to sequencer settings > 'met', and pick on / rec / cnt",
                    "https://teenage.engineering/guides/ep-133/modes#8.4-tempo",
                    "The default mode is 'rec' (metronome only while recording). 'on' plays it during playback as well, and 'cnt' plays it only during the count-in.",
                ),
                GuideEntry(
                    "Set the current pattern's time signature",
                    "MAIN + TEMPO, then KNOB X / KNOB Y",
                    "https://teenage.engineering/guides/ep-133/modes#8.4.1-time-signature",
                ),
            ),
        ),
        GuideSection(
            "Effects and performance",
            listOf(
                GuideEntry(
                    "Open the FX page while the pattern is running. This is where you choose the single master effect that all groups send to.",
                    "FX (while playing)",
                    "https://teenage.engineering/guides/ep-133/effects",
                    "Every group can feed one master FX, and the full mix then passes through a master compressor. The line input can also be sent to the chosen FX.",
                ),
                GuideEntry(
                    "Cycle through the available master effects: delay, reverb, distortion, chorus, filter and compressor",
                    "FX, then - / +",
                    "https://teenage.engineering/guides/ep-133/effects",
                    "Push the fader up to hear the effect; - / + switches effects.",
                ),
                GuideEntry(
                    "Set how much of the selected group goes to the master FX",
                    "FX page open, move FADER",
                    "https://teenage.engineering/guides/ep-133/effects",
                    "The send amount applies to the group that is currently selected.",
                ),
                GuideEntry(
                    "Adjust the two controls of the chosen effect. Delay: X = time between repeats, Y = number of repeats (feedback). Reverb: X = room size (length), Y = tone (color). Distortion: X = drive, Y = tone (color). Chorus: X = modulation rate, Y = feedback. Filter: X = cutoff, Y = resonance. Compressor: X = drive, Y = speed.",
                    "FX page open, turn KNOB X / KNOB Y",
                    "https://teenage.engineering/guides/ep-133/effects",
                    "For the filter, turning KNOB X left cuts high frequencies and turning it right cuts low frequencies.",
                ),
                GuideEntry(
                    "Solo a group during playback. Hold more than one group pad to solo several groups together.",
                    "Hold FX + press GROUP A-D (while playing)",
                    "https://teenage.engineering/guides/ep-133/effects",
                    "The official guide documents no combo for muting a group or a pad. 'Mute group' is a choke group, listed under Sounds.",
                ),
                GuideEntry(
                    "Use Punch-In FX 2.0. While FX is held, the 12 pads act as performance effects.",
                    "Hold FX + press pads (with PLAY running)",
                    "https://teenage.engineering/guides/ep-133/effects#11.7-punch-in-fx",
                    "The pads respond to pressure, and you can stack several punch-in effects at once. Start playback first.",
                ),
                GuideEntry(
                    "Open the output settings (master compressor). KNOB X sets drive and KNOB Y sets how fast it reacts (speed).",
                    "SHIFT + FX, then KNOB X / KNOB Y",
                    "https://teenage.engineering/guides/ep-133/effects#11.9-output",
                ),
                GuideEntry(
                    "Go to the sidechain page inside the output settings",
                    "SHIFT + FX, then PLUS",
                    "https://teenage.engineering/guides/ep-133/effects#11.9.1-sidechain",
                    "Notes trigger the sidechain ducking, not audio, so it works even when the trigger sound is silent.",
                ),
                GuideEntry(
                    "Pick what triggers the sidechain duck (a sound) and which groups get ducked (destinations). On the same page, KNOB X sets how long the duck lasts and KNOB Y sets its shape.",
                    "Sidechain page: hold a group pad + press a sound pad (source); hold SHIFT + press a group pad (destination); KNOB X / KNOB Y (length / shape)",
                    "https://teenage.engineering/guides/ep-133/effects#11.9.1-sidechain",
                ),
                GuideEntry(
                    "Run the line input through the built-in FX. In main mode, KNOB X sets input gain and KNOB Y sets how much goes to the internal FX.",
                    "MAIN, then KNOB X / KNOB Y",
                    "https://teenage.engineering/guides/ep-133/effects#11.8-live-input-fx",
                ),
                GuideEntry(
                    "Pick which parameter the fader controls for the current group. By default it controls group level. The other options are the labels printed above the pads.",
                    "Hold FADER + press a pad",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.4-fader",
                    "By default the fader controls level. Holding FADER on its own makes the pads blink for any assignment that already has recorded automation.",
                ),
                GuideEntry(
                    "Record fader moves into the pattern as automation",
                    "Hold RECORD + move FADER",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.4-fader",
                    "When you step sequence, this combo stores the fader position on the current step. The value stays (latches) and does not spring back.",
                ),
                GuideEntry(
                    "Make finer adjustments: the fader moves in smaller increments, and the X/KNOB Ys respond more slowly",
                    "Hold SHIFT + move FADER (or turn KNOB X / KNOB Y)",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.4-fader",
                ),
                GuideEntry(
                    "Put the fader's virtual position back to the default for every assignment in the current group (screen shows RES). Doing the combo again reverses the reset (screen shows SET).",
                    "SHIFT + FADER",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.4-fader",
                ),
                GuideEntry(
                    "Set a group's volume for the whole project. This is separate from the fader's level assignment (which sets pattern volume), covers every scene and pattern, and cannot be automated.",
                    "Hold GROUP A-D + move FADER",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.4-fader",
                ),
                GuideEntry(
                    "Delete fader automation. With playback stopped, hold the combo (about 2 seconds, until FDR then DEL shows) to clear automation for all assignments. During playback, it removes fader moves as the pattern runs. Add the assignment's pad to clear only that one parameter.",
                    "Hold ERASE + FADER (add the assignment's pad to target one parameter)",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.6-erase-undo",
                    "Hold for 2 seconds; it applies to the selected group and pattern. In both cases the fader values for all assignments are set to where they were when the combo was pressed.",
                ),
                GuideEntry(
                    "Turn on keys mode, which plays the selected pad's sample chromatically across all 12 pads",
                    "Select a pad, then KEYS",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.3-keys",
                ),
                GuideEntry(
                    "Keys mode: move up or down an octave, or transpose the root note",
                    "Hold KEYS + - / + (octave); hold KEYS + press a pad (transpose)",
                    "https://teenage.engineering/guides/ep-133/play-and-record#9.3-keys",
                    "Above the highest octave, the notes repeat that top octave so you can keep playing.",
                ),
                GuideEntry(
                    "Keys mode: change the key, or change the scale",
                    "Hold KEYS + turn KNOB X (key); hold KEYS + turn KNOB Y (scale)",
                    "https://teenage.engineering/guides/ep-133/how-to#12.2-change-the-scale-in-keys-mode",
                    "The pad scale can also be set in system settings (SHIFT + ERASE).",
                ),
                GuideEntry(
                    "Switch between the four groups (A-D). Each group holds 99 patterns and 12 sounds.",
                    "GROUP A / B / C / D",
                    "https://teenage.engineering/guides/ep-133/buttons-and-combos#4.1-groups",
                ),
            ),
        ),
        GuideSection(
            "Projects and system",
            listOf(
                GuideEntry(
                    "Load a different project (there are 9 project slots)",
                    "Hold MAIN + pad 1-9",
                    "https://teenage.engineering/guides/ep-133/modes",
                    "Do this from MAIN, the home screen. A new unit ships with projects 1-5 filled with sounds and 6-9 empty. Each project has 4 groups and up to 99 scenes, and each group holds up to 99 patterns. Switching project while playing waits for the end of the bar.",
                ),
                GuideEntry(
                    "Clear or delete the current scene",
                    "Hold ERASE + MAIN for 2 seconds",
                    "https://teenage.engineering/guides/ep-133/play-and-record",
                    "An empty scene that isn't in the song list is deleted, and DEL blinks on screen. Any other scene has its contents wiped, and CLR shows.",
                ),
                GuideEntry(
                    "Open the system settings",
                    "SHIFT + ERASE",
                    "https://teenage.engineering/guides/ep-133/system",
                ),
                GuideEntry(
                    "Get around system settings: browse, select, go back one level, leave",
                    "- / + to browse, ENTER pad to select; SHIFT + ENTER to go back a level; MAIN to exit",
                    "https://teenage.engineering/guides/ep-133/system",
                    "Leave system settings with MAIN.",
                ),
                GuideEntry(
                    "Go straight to a setting by entering its 3-digit code",
                    "In system settings: type the code on the number pads, then ENTER (e.g. 3-0-1, ENTER = pad velocity high)",
                    "https://teenage.engineering/guides/ep-133/system",
                    "How the codes are grouped: 1xx MIDI, 2xx sync, 3xx pad/LED/knob, 4xx sequencer, 5xx sampling/USB.",
                ),
                GuideEntry(
                    "Choose how MIDI clock is handled: off, receive only, or send only",
                    "SHIFT + ERASE, then code 100 (off, default) / 101 (clock in) / 102 (clock out) + ENTER",
                    "https://teenage.engineering/guides/ep-133/system",
                    "Also reachable through the menu: MIDI > Clock.",
                ),
                GuideEntry(
                    "Set the MIDI channel",
                    "SHIFT + ERASE, then 110 (receive on all channels, send on ch 1), 111-126 (channels 1-16), or 127 (off: pads use MIDI only if a channel is assigned in SOUND EDIT) + ENTER",
                    "https://teenage.engineering/guides/ep-133/system",
                    "Code 127 was added in OS 2.0.1. Those release notes say pads then both send and receive MIDI voice messages only when SOUND EDIT gives them a channel.",
                ),
                GuideEntry(
                    "Turn MIDI thru on or off, and choose whether MIDI controllers reset when the sequencer stops",
                    "SHIFT + ERASE, then 130 (thru off) / 131 (thru on); 140 (no reset at stop, default) / 141 (reset controllers at stop) + ENTER",
                    "https://teenage.engineering/guides/ep-133/system",
                    "MIDI thru arrived in OS 2.0. The OS 2.0.2 release notes and the current settings table disagree on 140 and 141; this follows the table (140 = off, the default).",
                ),
                GuideEntry(
                    "Set the clock rates for the analog sync input and output",
                    "SHIFT + ERASE, then sync in: 200 (1/8) / 201 (1/16, default) / 202 (24 ppqn); sync out: 210 (1/8) / 211 (1/16, default) / 212 (24 ppqn) + ENTER",
                    "https://teenage.engineering/guides/ep-133/system",
                    "To link two K.O. IIs, set both to 1/16 for in and out. To clock a Pocket Operator set to SY2, use sync out 8. To follow a PO set to SY1, use sync in 8. For vintage drum machines use sync 24; some use DIN sync, which needs an adaptor or a special cable.",
                ),
                GuideEntry(
                    "Choose what USB audio input does: feed the sampler only, or the sampler plus live monitoring",
                    "SHIFT + ERASE, then 510 (sampler only, default) / 511 (sampler + monitoring) + ENTER",
                    "https://teenage.engineering/guides/ep-133/system",
                    "USB audio arrived in OS 2.5. To sample over USB: on the computer or phone, pick the K.O. II as the audio output; on the K.O. II, press SAMPLE, press + to choose USB as the source, then press a pad to record.",
                ),
                GuideEntry(
                    "Set the sample rate used for recording",
                    "SHIFT + ERASE, then 500 (lo, 26.25 kHz) / 501 (mid, 32 kHz) / 502 (high, 46.875 kHz, default) + ENTER",
                    "https://teenage.engineering/guides/ep-133/system",
                    "Added in OS 2.5. According to the release notes, a lower rate saves storage and gives a grittier, lo-fi character. It can also be reached through the menu path smp > rec.",
                ),
                GuideEntry(
                    "Pad and hardware settings: velocity, sample audition, LED brightness, how knobs and fader take over",
                    "SHIFT + ERASE, then velocity 300 (off, default) / 301 (hi, light touch) / 302 (lo, hard playing); audition 310 on / 311 off; LED brightness 320 lo / 321 mid / 322 high; takeover 330 (scaling, default) / 331 (catch) + ENTER",
                    "https://teenage.engineering/guides/ep-133/system",
                ),
                GuideEntry(
                    "Sequencer-wide settings: metronome, when scene changes happen, song loop, where playback starts",
                    "SHIFT + ERASE, then metronome 400 (record + play) / 401 (record only, default) / 402 (count-in only); scene change 410 (immediate, default) / 411 (at bar end) / 412 (at pattern end); song loop 420 off / 421 on; play start 430 (current bar) / 431 (pattern start) + ENTER",
                    "https://teenage.engineering/guides/ep-133/system",
                    "Setting 412 was added in OS 2.0.",
                ),
                GuideEntry(
                    "Start in lock mode, which stops any changes to projects, patterns, scenes, pads and settings",
                    "Hold MAIN while switching the unit on",
                    "https://teenage.engineering/guides/ep-133/system",
                    "'lok' appears on screen for about a second. Anything changed while locked is reset the next time the unit restarts.",
                ),
                GuideEntry(
                    "Format the internal drive: a full wipe, and also the fix for file-system error codes",
                    "With the unit off, hold SHIFT + ERASE and switch it on",
                    "https://teenage.engineering/guides/ep-133/erase-drive",
                    "This removes all user work and all factory sounds, and the factory sounds cannot be recovered. FMT shows for about 10 seconds, then the unit starts up empty. This is the fix for error codes E.05, E.10, E.11 and E.12 and says to update to the latest OS afterwards. Don't confuse it with SHIFT + ERASE while the unit is running, which only opens system settings.",
                ),
                GuideEntry(
                    "Switch on, and the ways to power the unit",
                    "Slide the orange power switch at the top right",
                    "https://teenage.engineering/guides/ep-133/power-on",
                    "The unit runs on 4 fresh AAA batteries, which go under the top lid. It also runs from USB-C at 5 V, minimum 1 A; a USB-IF compliant charger is recommended. When the battery voltage dips the unit reboots cleanly and shows BAT.",
                ),
                GuideEntry(
                    "Update the firmware (OS)",
                    "No button combo: connect over USB-C and use teenage engineering's web update utility (teenage.engineering/apps/update)",
                    "https://teenage.engineering/guides/ep-133/power-on",
                    "There is no button combo at power-up for updating. Back up first, then use the official updater over USB-C.",
                ),
                GuideEntry(
                    "Play the pads from a USB or TRS MIDI keyboard",
                    "No combo: connect the keyboard, then play; press KEYS to spread one pad chromatically across the keyboard",
                    "https://teenage.engineering/guides/ep-133/how-to",
                    "A USB MIDI keyboard needs a MIDI host, such as a computer or a host box, between it and the K.O. II. A keyboard with TRS MIDI connects with a 3.5 mm TRS cable; a DIN keyboard needs a TRS-to-DIN cable. The MIDI or USB icon on screen lights up when notes arrive.",
                ),
            ),
        ),
    )
}
