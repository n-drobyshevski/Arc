#!/usr/bin/env python3
"""ARC BEAT cards: check, analyse, midi and grid.

Reads the text card format of references/beat-card.md the way Arc does (the
reading rules there are the spec) and works on it. Python 3.9+, standard
library only.

    beatcard.py check   [CARD|-] [--json] [--sounds SOUNDS.txt]
    beatcard.py analyse [CARD|-] [--json] [--recipes genres.md]
    beatcard.py midi    [CARD|-] [-o OUT.mid] [--loops N] [--channel 1-16]
    beatcard.py grid    [CARD|-]

CARD is a file; without it, or with "-", the card is read from standard
input. Anything before the first line starting with ARC BEAT is ignored, so
a whole chat reply works too. Exit status: 0 fine, 1 the card has errors,
2 the command line or a file is wrong.

Effect lines (fx, send, comp, sidechain) in the header and pad lines inside
a section are read and checked the way Arc reads them; grid and analyse show
them. SOUNDS.txt is the user's sound list as Arc's share adds it after the card
(a header line, then one "<slot> <name>" line per sound; the header is
optional; so is the note after it about names like 200.pcm, which is skipped).
With it, check warns about each sound line whose slot or name isn't in the
list, and notes each one that uses a slot the EP-133 keeps without a name.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import struct
import sys
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Constants (the spec's numbers)
# ---------------------------------------------------------------------------

VERSION = 1
TICKS_PER_BEAT = 96
TICKS_PER_BAR = 384
MAX_NOTES = 2048
NAME_MAX = 40
TEMPO_MIN, TEMPO_MAX = 40.0, 240.0
SWING_MIN, SWING_MAX = 50, 75
#: The EP-133's sound slots.
SLOT_MIN, SLOT_MAX = 1, 999

#: Step sizes in ticks (96 a beat, 384 a bar).
STEP_TICKS = {"1/8": 48, "1/16": 24, "1/32": 12, "1/8T": 32, "1/16T": 16}
#: Gate names in ticks.
GATE_TICKS = {"1/4": 96, "1/8": 48, "1/16": 24, "1/32": 12, "1/8T": 32, "1/16T": 16}
#: Steps that swing: only 1/8 and 1/16, as on the device's TIMING.
SWING_STEPS = ("1/8", "1/16")

#: Pad labels as printed, in order of their note offset 0..11.
PAD_LABELS = [".", "0", "ENTER", "1", "2", "3", "4", "5", "6", "7", "8", "9"]
LABEL_OFFSET = {".": 0, "0": 1, "E": 2, "ENTER": 2, **{str(n): n + 2 for n in range(1, 10)}}
#: The keypad top row first (7 8 9 / 4 5 6 / 1 2 3 / . 0 ENTER) as note offsets.
KEYPAD_ORDER = [9, 10, 11, 6, 7, 8, 3, 4, 5, 0, 1, 2]
GROUPS = "ABCD"
#: MIDI note of the first pad (PadNotes.FIRST): A is 36-47, B 48-59, C 60-71, D 72-83.
FIRST_PAD_NOTE = 36
KEYS_ROOT = 60

#: The pads of the assumed factory kit, used for roles when a card names no sounds.
#: The same table is in references/genres.md.
ASSUMED_KIT = {
    "A7": "kick",
    "A8": "kick 2",
    "A9": "snare",
    "A4": "closed hat",
    "A5": "open hat",
    "A6": "clap",
    "A1": "rim",
    "A2": "tom",
    "A3": "shaker",
    "A.": "cowbell",
    "A0": "perc",
    "AENTER": "crash",
}

#: The master effects an fx line names, in the order Arc offers them.
FX_TYPES = ("none", "delay", "reverb", "distortion", "chorus", "filter", "compressor")
#: The settings a pad line can give, in the order Arc writes them.
PAD_SETTINGS = ("pitch", "level", "pan", "attack", "release", "mode")
PLAY_MODES = ("oneshot", "key", "legato")
#: The lines that set the project's FX; header only.
FX_WORDS = ("fx", "send", "comp", "sidechain")
#: What the two knobs of each effect do: (X name, Y name).
FX_KNOBS = {
    "delay": ("length", "feedback"),
    "reverb": ("size", "colour"),
    "distortion": ("drive", "colour"),
    "chorus": ("rate", "feedback"),
    "filter": ("cutoff", "resonance"),
    "compressor": ("drive", "speed"),
}
#: The pad sheet's ranges (PadSettings).
PITCH_MAX, LEVEL_MAX, PAN_MAX, ENV_MAX = 12, 100, 16, 255

ERROR = "error"
WARNING = "warning"
NOTE = "note"


@dataclass
class Problem:
    line: int
    level: str
    code: str
    message: str

    def __str__(self) -> str:
        return "line %d: %s: %s" % (self.line, self.level, self.message)

    def to_dict(self) -> dict:
        return {"line": self.line, "level": self.level, "code": self.code, "message": self.message}


@dataclass
class Hit:
    """One note of a pattern: a pad hit (semi is None) or a KEYS note."""

    pad: int  # note offset 0..11
    tick: int
    vel: int
    gate: int  # ticks
    semi: Optional[int]
    line: int
    row: Optional[int] = None  # index into Pattern.rows when it came from a grid row
    step: Optional[int] = None  # the step index on that row


@dataclass
class Row:
    pad: int
    label: str  # the pad as written, "A7"
    name: str
    line: int


@dataclass
class Sound:
    """A sound line: the slot a pad should play and, when given, the name the user's list has for it."""

    slot: int
    name: str  # "" when the line gave none
    line: int


@dataclass
class PadShape:
    """A pad line: the pad's shaping, only the settings the line gave (None for the rest)."""

    line: int
    pitch: Optional[float] = None  # semitones, -12..12
    level: Optional[int] = None  # 0..100
    pan: Optional[int] = None  # -16..16, negative is left
    attack: Optional[int] = None  # envelope ticks 0..255
    release: Optional[int] = None  # envelope ticks 0..255
    mode: Optional[str] = None  # oneshot, key or legato

    def given(self) -> Dict[str, object]:
        """The settings given, by name, in the order Arc writes them."""
        return {k: getattr(self, k) for k in PAD_SETTINGS if getattr(self, k) is not None}


@dataclass
class CardComp:
    """A comp line: off, or on with a drive and a speed (percent 0..100)."""

    on: bool
    drive: float = 50.0
    speed: float = 50.0


@dataclass
class CardSidechain:
    """A sidechain line: off, or the pad that ducks the groups (0..3) for a length and a shape (percent 0..100)."""

    on: bool
    group: int = 0
    pad: int = 0
    groups: List[int] = field(default_factory=list)
    length: float = 30.0
    shape: float = 50.0


@dataclass
class Fx:
    """The card's effect lines; each kind is None when the card has no such line. Knobs are percent, 0..100."""

    effect: Optional[str] = None  # one of FX_TYPES
    x: Optional[float] = None
    y: Optional[float] = None
    sends: Optional[Dict[int, float]] = None  # group 0..3 -> percent; the groups left out play 0
    comp: Optional[CardComp] = None
    sidechain: Optional[CardSidechain] = None
    line: int = 0  # the first effect line

    def kinds(self) -> List[str]:
        """The kinds of line the card has: fx, send, comp, sidechain."""
        return [k for k, present in (("fx", self.effect is not None), ("send", self.sends is not None), ("comp", self.comp is not None), ("sidechain", self.sidechain is not None)) if present]


@dataclass
class Pattern:
    group: int  # 0..3
    number: Optional[int]
    bars: int = 1
    step: str = "1/16"
    line: int = 0
    rows: List[Row] = field(default_factory=list)
    hits: List[Hit] = field(default_factory=list)
    sounds: Dict[int, Sound] = field(default_factory=dict)  # by pad offset
    pads: Dict[int, PadShape] = field(default_factory=dict)  # by pad offset

    @property
    def letter(self) -> str:
        return GROUPS[self.group]

    @property
    def step_ticks(self) -> int:
        return STEP_TICKS[self.step]

    @property
    def length(self) -> int:
        return self.bars * TICKS_PER_BAR

    def pad_names(self) -> Dict[int, str]:
        names: Dict[int, str] = {}
        for r in self.rows:
            if r.name and r.pad not in names:
                names[r.pad] = r.name
        return names

    def sound_names(self) -> Dict[int, str]:
        """The names the sound lines give, by pad."""
        return {pad: s.name for pad, s in self.sounds.items() if s.name}


@dataclass
class Card:
    name: str = ""
    tempo: Optional[float] = None
    swing: int = 50
    patterns: List[Pattern] = field(default_factory=list)
    problems: List[Problem] = field(default_factory=list)
    fx: Optional[Fx] = None

    @property
    def errors(self) -> List[Problem]:
        return [p for p in self.problems if p.level == ERROR]

    @property
    def warnings(self) -> List[Problem]:
        return [p for p in self.problems if p.level == WARNING]

    @property
    def ok(self) -> bool:
        return not self.errors


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------


def swing_offset(step: str, k: int, swing: int) -> int:
    """How many ticks late step k plays: odd steps of 1/8 and 1/16, ties rounding up (Steps.tickOf)."""
    if step not in SWING_STEPS or k % 2 == 0:
        return 0
    return ((swing - SWING_MIN) * STEP_TICKS[step] + 25) // 50


def position(tick: int) -> str:
    """A tick as bar.beat.sixteenth, with +n for leftover ticks ("1.2.3+8")."""
    bar, rest = divmod(tick, TICKS_PER_BAR)
    beat, rest = divmod(rest, TICKS_PER_BEAT)
    sixteenth, extra = divmod(rest, 24)
    text = "%d.%d.%d" % (bar + 1, beat + 1, sixteenth + 1)
    return text + ("+%d" % extra if extra else "")


def pad_label(group: int, offset: int) -> str:
    """The pad as it is written in a row: A7, A., A0, AENTER."""
    return GROUPS[group] + PAD_LABELS[offset]


def pad_note(group: int, offset: int) -> int:
    """The MIDI note of a pad (PadNotes.note): 36 + 12 * group + offset."""
    return FIRST_PAD_NOTE + 12 * group + offset


_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def note_name(midi: int) -> str:
    """"C4" for 60 (PadNotes.noteName)."""
    return _NOTE_NAMES[midi % 12] + str(midi // 12 - 1)


#: MIDI note by name, C-1 (0) to G9 (127), as note_name makes them.
_NOTE_NUMBERS = {note_name(n): n for n in range(128)}


def parse_note_name(text: str) -> Optional[int]:
    """The MIDI number of a note name C-1..G9 (C4 is 60), or None. Only the names note_name makes count: capitals, sharps written C#4 (so no B#3)."""
    return _NOTE_NUMBERS.get(text)


def parse_pad(token: str) -> Tuple[int, int]:
    """(group 0..3, offset 0..11) of a pad token such as A7, A., AE or AENTER; ValueError with a reason if it isn't one."""
    if len(token) < 2 or token[0] not in GROUPS:
        hint = " (group letters and pad labels are capitals)" if token[:1] in "abcd" and len(token) >= 2 else ""
        raise ValueError("'%s' is not a pad: write the group letter A-D, then . 0 E or 1-9, like A7%s" % (token, hint))
    label = token[1:]
    if label not in LABEL_OFFSET:
        raise ValueError("'%s' is not a pad: after the group letter use . 0 E (or ENTER) or 1-9" % token)
    return GROUPS.index(token[0]), LABEL_OFFSET[label]


#: The blanks a card knows: space, tab and no-break space. Other white space is ordinary text.
_SPACE = " \t\u00a0"


def _trim(text: str) -> str:
    return text.strip(_SPACE)


def _tokens(text: str) -> List[str]:
    return [t for t in re.split(r"[ \t\u00a0]+", text) if t]


def clean_text(text: str) -> str:
    """A name as a card keeps it: no #, | or line breaks (they would end it), single spaces (BeatCards.cleanText)."""
    return re.sub(r"[#|\t\r\n\u00a0 ]+", " ", text).strip()


def same_name(a: str, b: str) -> bool:
    """Whether two sound names are the same to Arc: ignoring case, spaces round them and a ".wav" ending (PadSoundCache.sameName)."""
    def norm(s: str) -> str:
        s = s.strip().lower()
        return (s[:-4] if s.endswith(".wav") else s).strip()

    return norm(a) == norm(b)


def strip_comment(line: str) -> str:
    """Drop a comment: a # at the start of the line or after a blank. (C#4 keeps its sharp.)"""
    m = re.search(r"(^|[ \t\u00a0])#", line)
    return _trim(line[: m.start()] if m else line)


# ---------------------------------------------------------------------------
# Reading
# ---------------------------------------------------------------------------

_HEADER_WORDS = ("name", "tempo", "swing")
_PERCENT = re.compile(r"[0-9]{1,3}(\.[0-9])?")
_PERCENT_TEXT = "0 to 100, whole or with one decimal"
_PITCH = re.compile(r"[+-]?[0-9]{1,2}(\.[0-9]{1,2})?")
_SIGNED = re.compile(r"[+-]?[0-9]{1,9}")
_FX_LIST = "none, delay, reverb, distortion, chorus, filter or compressor"
_NOTE_KEYS = ("at", "t", "vel", "gate", "note", "semi")
_STEP_CHARS = {"X": 127, "x": 100, "o": 64, **{str(n): 14 * n for n in range(1, 10)}}
_CARD_START = re.compile(r"[ \t ]*ARC[ \t ]+BEAT(?:[ \t ]|\Z)", re.I)
_LINE_BREAK = re.compile(r"\r\n|\r|\n")
_AT = re.compile(r"([0-9]{1,6})\.([0-9]{1,6})\.([0-9]{1,6})(?:([+-])([0-9]{1,6}))?")
_BEATS_PER_BAR = 4


def _first_is_pad(text: str) -> bool:
    try:
        parse_pad(_tokens(text)[0])
    except ValueError:
        return False
    return True


class _Reader:
    """Reads one card; follows references/beat-card.md rule by rule, as BeatCard.kt does."""

    def __init__(self, text: str) -> None:
        self.card = Card()
        self.lines = _LINE_BREAK.split(text[1:] if text.startswith("﻿") else text)
        self.draft: Optional[Pattern] = None  # the section being read
        self.skip = False  # the section line couldn't be read: its lines are ignored
        self.dropped = False  # a second section of a group: read for its problems, then dropped
        self.in_notes = False
        self.section_lines = 0
        self.seen_groups: Dict[int, int] = {}
        self.fx = Fx()

    def err(self, line: int, code: str, message: str) -> None:
        self.card.problems.append(Problem(line, ERROR, code, message))

    def warn(self, line: int, code: str, message: str) -> None:
        self.card.problems.append(Problem(line, WARNING, code, message))

    # -- driver ------------------------------------------------------------

    def read(self) -> Card:
        start = next((i for i, l in enumerate(self.lines) if _CARD_START.match(l)), None)
        if start is None:
            self.err(1, "no-card", "no line starts with ARC BEAT, so there is no card here")
            return self.card
        if not self.version(start):
            return self.card
        for i in range(start + 1, len(self.lines)):
            text = _trim(strip_comment(self.lines[i]))
            if text == "```" or text.upper() == "END":
                break
            if text == "":
                continue
            self.line(i + 1, text)
        self.close()
        if self.section_lines == 0:
            self.err(start + 1, "no-sections", "the card has no section: add [A], [B], [C] or [D] with grid rows")
        self.card.fx = self.fx if self.fx.kinds() else None
        return self.card

    def version(self, start: int) -> bool:
        line = start + 1
        t = _tokens(strip_comment(self.lines[start]))
        v = t[2] if len(t) > 2 else None
        if v is None or not re.fullmatch(r"[0-9]{1,6}", v) or int(v) < 1:
            self.err(line, "bad-version", "the version after ARC BEAT must be a whole number, like ARC BEAT 1")
            return False
        if int(v) > VERSION:
            self.err(line, "newer-version", "made by a newer Arc (card version %d, this reader knows %d)" % (int(v), VERSION))
            return False
        return True

    def line(self, n: int, text: str) -> None:
        if text.startswith("["):
            self.start_section(n, text)
            return
        if self.draft is None:
            self.header(n, text)
            return
        if self.skip:
            return
        if text.lower() == "notes":
            self.in_notes = True
        elif _tokens(text)[0].lower() == "sound":
            self.sound(n, text)
        elif _tokens(text)[0].lower() == "pad":
            self.pad_line(n, text)
        elif _tokens(text)[0].lower() in FX_WORDS:
            self.err(n, "late-fx", "'%s' belongs before the first section" % _tokens(text)[0])
        elif self.in_notes:
            self.note(n, text)
        elif "|" in text:
            self.row(n, text)
        elif _first_is_pad(text):
            self.err(n, "bad-line", "'%s' needs a | before its steps: a grid row looks like 'A7 kick | X... .... |'" % _tokens(text)[0])
        else:
            word = _tokens(text)[0]
            if word.lower() in _HEADER_WORDS:
                self.warn(n, "late-header", "'%s' belongs before the first section; ignored here" % word)
            else:
                self.warn(n, "unknown-word", "unknown word '%s' ignored" % word)

    # -- header ------------------------------------------------------------

    def header(self, n: int, text: str) -> None:
        word = _tokens(text)[0]
        key = word.lower()
        rest = _trim(text[len(word) :])
        if key == "notes":
            self.err(n, "notes-outside-section", "'notes' has to come inside a section like [A]")
        elif key == "sound":
            self.err(n, "sound-outside-section", "'sound' has to come after a section line like [A]")
        elif key == "pad":
            self.err(n, "pad-outside-section", "'pad' has to come after a section line like [A]")
        elif key in FX_WORDS:
            self.fx_line(n, word, key, _tokens(rest))
        elif "|" in text or _first_is_pad(text):
            self.err(n, "row-outside-section", "a grid row has to come after a section line like [A]")
        elif key in _HEADER_WORDS:
            self.header_value(n, key, rest)
        else:
            self.warn(n, "unknown-header", "unknown header word '%s' ignored" % word)

    def header_value(self, n: int, key: str, rest: str) -> None:
        card = self.card
        if key == "name":
            if rest == "":
                self.warn(n, "empty-name", "the name is empty; ignored")
            elif len(rest) > NAME_MAX:
                self.warn(n, "long-name", "the name is longer than %d characters; shortened" % NAME_MAX)
                card.name = _trim(rest[:NAME_MAX])
            else:
                card.name = rest
        elif key == "tempo":
            t = _tokens(rest)
            ok = len(t) == 1 and re.fullmatch(r"[0-9]{1,3}(\.[0-9])?", t[0]) is not None and TEMPO_MIN <= float(t[0]) <= TEMPO_MAX
            if not ok:
                self.err(n, "bad-tempo", "tempo '%s' must be 40 to 240, whole or with one decimal" % rest)
            else:
                card.tempo = float(t[0])
        else:
            t = _tokens(rest)
            ok = len(t) == 1 and re.fullmatch(r"[0-9]{1,3}", t[0]) is not None and SWING_MIN <= int(t[0]) <= SWING_MAX
            if not ok:
                self.err(n, "bad-swing", "swing '%s' must be a whole number from 50 (straight) to 75" % rest)
            else:
                card.swing = int(t[0])

    # -- sections ----------------------------------------------------------

    def open(self, pattern: Pattern, skip: bool, dropped: bool) -> None:
        self.draft, self.skip, self.dropped, self.in_notes = pattern, skip, dropped, False

    def skipped(self, n: int, code: str, message: str) -> None:
        """A section line that can't be used: its lines are skipped, as they would only repeat the fault."""
        self.err(n, code, message)
        self.open(Pattern(0, None, line=n), skip=True, dropped=True)

    def start_section(self, n: int, text: str) -> None:
        self.close()
        self.section_lines += 1
        end = text.find("]")
        if end < 0:
            self.skipped(n, "bad-section", "a section line looks like [A] or [B12], with the bracket closed")
            return
        inner = _trim(text[1:end])
        m = re.fullmatch(r"([A-D])([0-9]*)", inner)
        if not m:
            self.skipped(n, "bad-section", "section '[%s]' must be [A] to [D], optionally with a pattern number like [B12]" % inner)
            return
        digits = m.group(2)
        number = None
        if digits:
            number = int(digits) if len(digits) <= 2 and 1 <= int(digits) <= 99 else None
            if number is None:
                self.skipped(n, "bad-pattern-number", "the pattern number in [%s%s] must be 1 to 99" % (m.group(1), digits))
                return
        group = GROUPS.index(m.group(1))
        pattern = Pattern(group, number, line=n)
        bad = self.options(n, pattern, _tokens(text[end + 1 :]))
        dropped = group in self.seen_groups
        if dropped:
            self.err(n, "duplicate-group", "group %s already has a section on line %d" % (m.group(1), self.seen_groups[group]))
        else:
            self.seen_groups[group] = n
        self.open(pattern, skip=bad, dropped=dropped)

    def options(self, n: int, pattern: Pattern, tokens: List[str]) -> bool:
        """Reads the options of a section line into [pattern]; true when one of them is wrong."""
        bad = False
        i = 0
        while i < len(tokens):
            word = tokens[i].lower()
            value = tokens[i + 1] if i + 1 < len(tokens) else None
            if word in ("bars", "step"):
                if word == "bars":
                    if value is not None and re.fullmatch(r"[0-9]{1,3}", value) and 1 <= int(value) <= 99:
                        pattern.bars = int(value)
                    else:
                        self.err(n, "bad-bars", "bars must be a whole number from 1 to 99")
                        bad = True
                else:
                    if value is not None and value.upper() in STEP_TICKS:
                        pattern.step = value.upper()
                    else:
                        self.err(n, "bad-step", "step must be one of 1/8 1/16 1/32 1/8T 1/16T")
                        bad = True
                i += 2
            else:
                self.warn(n, "unknown-option", "unknown section option '%s' ignored" % tokens[i])
                i += 2 if value is not None and value.lower() not in ("bars", "step") else 1
        return bad

    def close(self) -> None:
        """Ends the section being read: duplicates folded, the limit checked, the pattern added."""
        pattern = self.draft
        if pattern is None:
            return
        self.draft = None
        if self.skip:
            return
        self.merge_doubles(pattern)
        if len(pattern.hits) > MAX_NOTES:
            self.err(pattern.line, "too-many-notes", "[%s] has %d notes, the most is %d" % (pattern.letter, len(pattern.hits), MAX_NOTES))
        if self.dropped:
            return
        self.card.patterns.append(pattern)

    # -- grid rows ---------------------------------------------------------

    def row(self, n: int, text: str) -> None:
        pattern = self.draft
        assert pattern is not None
        bar = text.index("|")
        left, right = _trim(text[:bar]), text[bar + 1 :]
        parts = _tokens(left)
        if not parts:
            self.err(n, "bad-pad", "the row starts with '|': it needs a pad first, like A7")
            return
        label = parts[0]
        name = _trim(left[len(label) :])
        try:
            group, offset = parse_pad(label)
        except ValueError as e:
            self.err(n, "bad-pad", str(e))
            return
        if group != pattern.group:
            self.err(n, "wrong-group", "pad %s is in group %s but the section is [%s]" % (label, GROUPS[group], pattern.letter))
            return
        chunks = ["".join(c for c in part if c not in _SPACE) for part in right.split("|")]
        chunks = [c for c in chunks if c]
        steps = "".join(chunks)
        per_bar = TICKS_PER_BAR // pattern.step_ticks
        hits: List[List[int]] = []  # step, velocity, steps held
        holding = False
        for k, ch in enumerate(steps):
            if ch in _STEP_CHARS:
                hits.append([k, _STEP_CHARS[ch], 1])
                holding = True
            elif ch == "-":
                if not holding:
                    self.err(n, "orphan-hold", "row %s: '-' at step %d (bar %d) has no hit before it to hold" % (label, k + 1, k // per_bar + 1))
                    return
                hits[-1][2] += 1
            elif ch == ".":
                holding = False
            else:
                self.err(n, "bad-step-char", "row %s: '%s' at step %d (bar %d) isn't a step: use X x o 1-9 - ." % (label, ch, k + 1, k // per_bar + 1))
                return
        if len(steps) != pattern.bars * per_bar:
            self.err(n, "step-count", self.count_message(label, chunks, len(steps), per_bar, pattern.bars))
            return
        row_index = len(pattern.rows)
        pattern.rows.append(Row(offset, label, name, n))
        for k, vel, held in hits:
            tick = k * pattern.step_ticks + swing_offset(pattern.step, k, self.card.swing)
            pattern.hits.append(Hit(offset, tick, vel, held * pattern.step_ticks, None, n, row_index, k))

    @staticmethod
    def count_message(label: str, chunks: List[str], total: int, per_bar: int, bars: int) -> str:
        if len(chunks) == bars and any(len(c) != per_bar for c in chunks):
            bad = ["bar %d has %d" % (i + 1, len(c)) for i, c in enumerate(chunks) if len(c) != per_bar]
            return "row %s: %s steps, needs %d a bar" % (label, ", ".join(bad), per_bar)
        need = bars * per_bar
        if total < need:
            return "row %s has %d steps, needs %d (%d bar%s of %d): bar %d is short" % (
                label, total, need, bars, "" if bars == 1 else "s", per_bar, total // per_bar + 1)
        return "row %s has %d steps, needs %d (%d bar%s of %d): %d too many, starting in bar %d" % (
            label, total, need, bars, "" if bars == 1 else "s", per_bar, total - need, bars + 1)

    # -- sound lines -------------------------------------------------------

    def sound(self, n: int, text: str) -> None:
        """sound <pad> <slot> [name], anywhere in a section (after notes too). A second line for a pad replaces the first."""
        pattern = self.draft
        assert pattern is not None
        rest = _trim(text[len(_tokens(text)[0]) :])
        parts = _tokens(rest)
        if not parts:
            self.err(n, "bad-sound", "a sound line looks like 'sound A7 12 Kick': the pad, the slot, then the name if you know it")
            return
        try:
            group, offset = parse_pad(parts[0])
        except ValueError as e:
            self.err(n, "bad-pad", str(e))
            return
        if group != pattern.group:
            self.err(n, "wrong-group", "pad %s is in group %s but the section is [%s]" % (parts[0], GROUPS[group], pattern.letter))
            return
        rest = _trim(rest[len(parts[0]) :])
        slot_text = _tokens(rest)[0] if rest else ""
        if not (re.fullmatch(r"[0-9]{1,9}", slot_text) and SLOT_MIN <= int(slot_text) <= SLOT_MAX):
            self.err(n, "bad-slot", "sound slot '%s' must be a whole number from %d to %d" % (slot_text, SLOT_MIN, SLOT_MAX))
            return
        old = pattern.sounds.get(offset)
        if old is not None:
            self.warn(n, "duplicate-sound", "%s already has a sound on line %d; the later line is kept" % (pad_label(pattern.group, offset), old.line))
        pattern.sounds[offset] = Sound(int(slot_text), clean_text(rest[len(slot_text) :]), n)

    # -- effect lines (header only) -----------------------------------------

    @staticmethod
    def percent(token: str) -> Optional[float]:
        """A knob value as a card writes it, 0 to 100 (whole or one decimal); None when it isn't one."""
        if not _PERCENT.fullmatch(token) or float(token) > 100:
            return None
        return float(token)

    def extra(self, n: int, word: str, tokens: List[str], start: int) -> None:
        """Words left over after the line's last value are ignored, with a warning."""
        if len(tokens) > start:
            self.warn(n, "fx-extra", "the %s line has extra words from '%s'; ignored" % (word, tokens[start]))

    def fx_line(self, n: int, word: str, key: str, t: List[str]) -> None:
        """fx / send / comp / sidechain; [t] are the words after [word]. A line with a fault changes nothing."""
        fx = self.fx
        if key == "fx":
            effect = next((e for e in FX_TYPES if t and e == t[0].lower()), None)
            if effect is None:
                self.err(n, "bad-fx", "fx needs an effect: %s" % _FX_LIST if not t else "'%s' is not an effect: use %s" % (t[0], _FX_LIST))
                return
            x = y = 50.0
            if len(t) > 1:
                x = self.percent(t[1])
                if x is None:
                    self.err(n, "bad-fx-value", "fx x '%s' must be %s" % (t[1], _PERCENT_TEXT))
                    return
            if len(t) > 2:
                y = self.percent(t[2])
                if y is None:
                    self.err(n, "bad-fx-value", "fx y '%s' must be %s" % (t[2], _PERCENT_TEXT))
                    return
            self.extra(n, word, t, 3)
            if fx.effect is not None:
                self.warn(n, "duplicate-fx", "two fx lines; the later is kept")
            fx.effect, fx.x, fx.y = effect, x, y
        elif key == "send":
            if not t:
                self.err(n, "bad-send", "a send line looks like 'send A 40 B 20': a group, then 0 to 100, as often as needed")
                return
            line: Dict[int, float] = {}
            for i in range(0, len(t), 2):
                if len(t[i]) != 1 or t[i] not in GROUPS:
                    self.err(n, "bad-send", "'%s' is not a group: use A to D" % t[i])
                    return
                if i + 1 >= len(t):
                    self.err(n, "bad-send", "send %s needs a value, %s" % (t[i], _PERCENT_TEXT))
                    return
                value = self.percent(t[i + 1])
                if value is None:
                    self.err(n, "bad-send", "send %s '%s' must be %s" % (t[i], t[i + 1], _PERCENT_TEXT))
                    return
                line[GROUPS.index(t[i])] = value
            fx.sends = {**(fx.sends or {}), **line}
        elif key == "comp":
            if not t:
                self.err(n, "bad-comp", "a comp line looks like 'comp off' or 'comp 40 60': a drive and a speed")
                return
            if t[0].lower() == "off":
                self.extra(n, word, t, 1)
                comp = CardComp(False)
            else:
                drive = self.percent(t[0])
                if drive is None:
                    self.err(n, "bad-comp", "comp drive '%s' must be %s, or use comp off" % (t[0], _PERCENT_TEXT))
                    return
                if len(t) < 2:
                    self.err(n, "bad-comp", "comp needs a speed after the drive, like 'comp 40 60'")
                    return
                speed = self.percent(t[1])
                if speed is None:
                    self.err(n, "bad-comp", "comp speed '%s' must be %s" % (t[1], _PERCENT_TEXT))
                    return
                self.extra(n, word, t, 2)
                comp = CardComp(True, drive, speed)
            if fx.comp is not None:
                self.warn(n, "duplicate-comp", "two comp lines; the later is kept")
            fx.comp = comp
        else:
            if not t:
                self.err(n, "bad-sidechain", "a sidechain line looks like 'sidechain off' or 'sidechain A7 BC': the pad, then the groups it ducks")
                return
            if t[0].lower() == "off":
                self.extra(n, word, t, 1)
                side = CardSidechain(False)
            else:
                try:
                    group, offset = parse_pad(t[0])
                except ValueError as e:
                    self.err(n, "bad-pad", str(e))
                    return
                if len(t) < 2:
                    self.err(n, "bad-sidechain", "sidechain %s needs the groups it ducks, like 'sidechain A7 BC'" % t[0])
                    return
                if not re.fullmatch(r"[A-D]+", t[1]):
                    self.err(n, "bad-sidechain", "sidechain groups '%s' must be the letters A to D, like BC" % t[1])
                    return
                length, shape = 30.0, 50.0
                if len(t) > 2:
                    length = self.percent(t[2])
                    if length is None:
                        self.err(n, "bad-sidechain", "sidechain length '%s' must be %s" % (t[2], _PERCENT_TEXT))
                        return
                if len(t) > 3:
                    shape = self.percent(t[3])
                    if shape is None:
                        self.err(n, "bad-sidechain", "sidechain shape '%s' must be %s" % (t[3], _PERCENT_TEXT))
                        return
                self.extra(n, word, t, 4)
                side = CardSidechain(True, group, offset, sorted({GROUPS.index(c) for c in t[1]}), length, shape)
            if fx.sidechain is not None:
                self.warn(n, "duplicate-sidechain", "two sidechain lines; the later is kept")
            fx.sidechain = side
        if not fx.line:
            fx.line = n

    # -- pad lines ----------------------------------------------------------

    @staticmethod
    def whole(value: str, low: int, high: int) -> Optional[int]:
        """A whole number from [low] to [high] (a + or - allowed); None when it isn't one."""
        if not _SIGNED.fullmatch(value) or not low <= int(value) <= high:
            return None
        return int(value)

    def pad_line(self, n: int, text: str) -> None:
        """pad <pad> [pitch n] [level n] [pan n] [attack n] [release n] [mode m], anywhere in a section. A second line for a pad merges into the first."""
        pattern = self.draft
        assert pattern is not None
        t = _tokens(text)
        if len(t) < 2:
            self.err(n, "bad-pad-line", "a pad line looks like 'pad A7 pitch -7 level 90': the pad, then its settings")
            return
        try:
            group, offset = parse_pad(t[1])
        except ValueError as e:
            self.err(n, "bad-pad", str(e))
            return
        if group != pattern.group:
            self.err(n, "wrong-group", "pad %s is in group %s but the section is [%s]" % (t[1], GROUPS[group], pattern.letter))
            return
        label = pad_label(group, offset)
        shape = PadShape(n)
        i = 2
        while i < len(t):
            word = t[i].lower()
            value = t[i + 1] if i + 1 < len(t) else None
            if word not in PAD_SETTINGS:
                self.warn(n, "unknown-pad-setting", "unknown setting '%s' on the %s pad line ignored (use %s)" % (t[i], label, ", ".join(PAD_SETTINGS)))
                i += 2 if value is not None and value.lower() not in PAD_SETTINGS else 1
                continue
            if value is None:
                self.err(n, "bad-pad-line", "%s pad: %s needs a value" % (label, word))
                return
            if word == "pitch":
                if not _PITCH.fullmatch(value) or abs(float(value)) > PITCH_MAX:
                    self.err(n, "bad-pad-line", "%s pad: pitch '%s' must be -12 to 12 semitones, whole or with up to two decimals" % (label, value))
                    return
                shape.pitch = float(value) + 0.0
            elif word == "mode":
                if value.lower() not in PLAY_MODES:
                    self.err(n, "bad-pad-line", "%s pad: mode '%s' must be oneshot, key or legato" % (label, value))
                    return
                shape.mode = value.lower()
            else:
                low, high = {"level": (0, LEVEL_MAX), "pan": (-PAN_MAX, PAN_MAX)}.get(word, (0, ENV_MAX))
                number = self.whole(value, low, high)
                if number is None:
                    self.err(n, "bad-pad-line", "%s pad: %s '%s' must be a whole number from %d to %d%s" % (label, word, value, low, high, ", negative is left" if word == "pan" else ""))
                    return
                setattr(shape, word, number + 0)
            i += 2
        if not shape.given():
            self.err(n, "bad-pad-line", "%s pad: give at least one of pitch, level, pan, attack, release or mode" % label)
            return
        before = pattern.pads.get(offset)
        if before is not None:
            self.warn(n, "duplicate-pad-line", "%s already has a pad line on line %d; merged, the later settings win" % (label, before.line))
            for key, value in before.given().items():
                if getattr(shape, key) is None:
                    setattr(shape, key, value)
        pattern.pads[offset] = shape

    # -- notes list --------------------------------------------------------

    def note(self, n: int, text: str) -> None:
        pattern = self.draft
        assert pattern is not None
        tokens = _tokens(text)
        try:
            group, offset = parse_pad(tokens[0])
        except ValueError as e:
            self.err(n, "bad-pad", str(e))
            return
        if group != pattern.group:
            self.err(n, "wrong-group", "pad %s is in group %s but the section is [%s]" % (tokens[0], GROUPS[group], pattern.letter))
            return
        tick: Optional[int] = None
        tick_key = ""
        vel = 127
        gate = 24
        semi: Optional[int] = None
        semi_key = ""
        i = 1
        while i < len(tokens):
            word = tokens[i].lower()
            value = tokens[i + 1] if i + 1 < len(tokens) else None
            if word not in _NOTE_KEYS:
                self.warn(n, "unknown-note-option", "unknown option '%s' in a note ignored (use at, t, vel, gate, note, semi)" % tokens[i])
                i += 2 if value is not None and value.lower() not in _NOTE_KEYS else 1
                continue
            if value is None:
                self.err(n, "missing-value", "'%s' needs a value" % word)
                return
            if word in ("at", "t"):
                if tick_key and tick_key != word:
                    self.err(n, "note-two-times", "give 'at' or 't', not both")
                    return
                tick_key = word
                if word == "t":
                    if not re.fullmatch(r"[0-9]{1,9}", value):
                        self.err(n, "bad-tick", "t '%s' must be a whole tick number from 0" % value)
                        return
                    tick = int(value)
                else:
                    tick = self.at_tick(n, value)
                    if tick is None:
                        return
            elif word == "vel":
                if not (re.fullmatch(r"[0-9]{1,9}", value) and 1 <= int(value) <= 127):
                    self.err(n, "bad-vel", "vel '%s' must be 1 to 127" % value)
                    return
                vel = int(value)
            elif word == "gate":
                if value.upper() in GATE_TICKS:
                    gate = GATE_TICKS[value.upper()]
                elif re.fullmatch(r"[0-9]{1,9}", value) and int(value) >= 1:
                    gate = int(value)
                else:
                    self.err(n, "bad-gate", "gate '%s' must be a number of ticks or one of 1/4 1/8 1/16 1/32 1/8T 1/16T" % value)
                    return
            elif word == "note":
                if semi_key == "semi":
                    self.err(n, "note-and-semi", "give 'note' or 'semi', not both")
                    return
                semi_key = "note"
                midi = parse_note_name(value)
                if midi is None:
                    self.err(n, "bad-note-name", "note '%s' must be C-1 to G9 with a capital letter, sharps as C#4" % value)
                    return
                semi = midi - KEYS_ROOT
            else:
                if semi_key == "note":
                    self.err(n, "note-and-semi", "give 'note' or 'semi', not both")
                    return
                semi_key = "semi"
                if not (re.fullmatch(r"[+-]?[0-9]{1,9}", value) and -127 <= int(value) <= 127):
                    self.err(n, "bad-semi", "semi '%s' must be a whole number from -127 to 127" % value)
                    return
                semi = int(value)
            i += 2
        if tick is None:
            self.err(n, "note-no-time", "a note needs 'at <bar>.<beat>.<sixteenth>' or 't <tick>'")
            return
        if not 0 <= tick < pattern.length:
            self.err(n, "note-out-of-pattern", "tick %d is outside the pattern (0 to %d for %d bar%s)" % (
                tick, pattern.length - 1, pattern.bars, "" if pattern.bars == 1 else "s"))
            return
        pattern.hits.append(Hit(offset, tick, vel, gate, semi, n))

    def at_tick(self, n: int, value: str) -> Optional[int]:
        """The tick of 'bar.beat.sixteenth' with its leftover +n or -n ticks; None, after an error, when it isn't one."""
        m = _AT.fullmatch(value)
        if not m:
            self.err(n, "bad-at", "at '%s' must look like 1.2.3 (bar.beat.sixteenth), with +n or -n ticks if needed" % value)
            return None
        bar, beat, sixteenth = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if bar < 1 or not 1 <= beat <= _BEATS_PER_BAR or not 1 <= sixteenth <= 4:
            self.err(n, "bad-at", "at '%s': the bar counts from 1, and the beat and the sixteenth are 1 to 4" % value)
            return None
        delta = int(m.group(5) or 0) * (-1 if m.group(4) == "-" else 1)
        return (bar - 1) * TICKS_PER_BAR + (beat - 1) * TICKS_PER_BEAT + (sixteenth - 1) * 24 + delta

    # -- end ---------------------------------------------------------------

    def merge_doubles(self, pattern: Pattern) -> None:
        """Two notes on one pad at one tick count as one: the louder stays, with a warning."""
        kept: Dict[Tuple[int, int, Optional[int]], Hit] = {}
        order: List[Hit] = []
        for hit in pattern.hits:
            key = (hit.pad, hit.tick, hit.semi)
            old = kept.get(key)
            if old is None:
                kept[key] = hit
                order.append(hit)
                continue
            self.warn(hit.line, "duplicate-hit", "%s at %s is already played on line %d; the louder is kept" % (
                pad_label(pattern.group, hit.pad), position(hit.tick), old.line))
            if hit.vel > old.vel:
                order[order.index(old)] = hit
                kept[key] = hit
        pattern.hits = sorted(order, key=lambda h: (h.tick, h.pad, h.semi if h.semi is not None else -1000))


def parse_card(text: str) -> Card:
    """Read a card from [text] by the rules of references/beat-card.md; problems are in card.problems, by line."""
    card = _Reader(text).read()
    card.problems.sort(key=lambda p: p.line)  # stable, as Arc's reader sorts them
    return card


# ---------------------------------------------------------------------------
# Sound lists: the user's sounds, as Arc's share adds them after a card
# ---------------------------------------------------------------------------


def parse_sound_list(text: str) -> Dict[int, str]:
    """Slot -> name from a sound list: lines of "<slot> <name>", in the share's text or on their own. The header line and any other line that doesn't start with a slot are skipped; a slot given twice keeps the later."""
    out: Dict[int, str] = {}
    for line in _LINE_BREAK.split(text[1:] if text.startswith("\ufeff") else text):
        m = re.fullmatch(r"[ \t\u00a0]*([0-9]{1,3})(?:[ \t\u00a0]+(.*))?", line)
        if m and SLOT_MIN <= int(m.group(1)) <= SLOT_MAX:
            out[int(m.group(1))] = clean_text(m.group(2) or "")
    return out


def unnamed_slot(slot: int, name: Optional[str]) -> bool:
    """Whether [name] is the one the EP-133 gives a sound nobody named, its slot's file ("200.pcm" for slot 200): a factory sound whose name can't be checked (FactorySounds.unnamed)."""
    return name is not None and name.strip().lower() == "%03d.pcm" % slot


def resolve_sound(sound: Sound, available: Dict[int, str], current: Optional[int] = None) -> Optional[int]:
    """The slot Arc would use for a sound line, by the spec's import rule; None when it would skip the line.

    The slot is used when it holds the named sound (same_name) or, with no name,
    when the list has it. Otherwise the name is looked up: the pad's own slot
    [current] if it holds it, else the lowest slot that does. Failing that, a
    slot the list has under an unnamed name ("200.pcm") is used all the same.
    """
    name = None if unnamed_slot(sound.slot, sound.name) else sound.name  # "200.pcm" for slot 200 is no name
    if sound.slot in available and (not name or same_name(clean_text(available[sound.slot]), name)):
        return sound.slot
    if name:
        same = sorted(slot for slot, have in available.items() if same_name(clean_text(have), name))
        if current is not None and current in same:
            return current
        if same:
            return same[0]
    return sound.slot if unnamed_slot(sound.slot, available.get(sound.slot)) else None


def check_sounds(card: Card, available: Dict[int, str]) -> List[Problem]:
    """A warning for each sound line whose slot or name isn't in [available] (slot -> name): the slot holds another sound, the sound is in another slot (which Arc would use) or in none. Lines that use a slot listed unnamed ("200.pcm") get one note between them, at the first: their names can't be checked."""
    out: List[Problem] = []
    unnamed: List[Tuple[int, str, int]] = []  # (line, pad, slot): one note for them all, not one a line
    for pattern in card.patterns:
        for pad in KEYPAD_ORDER:
            sound = pattern.sounds.get(pad)
            if sound is None:
                continue
            label = pad_label(pattern.group, pad)
            slot = resolve_sound(sound, available)
            if slot is not None and unnamed_slot(slot, available.get(slot)):
                unnamed.append((sound.line, label, slot))
            if slot == sound.slot:
                continue
            holds = available.get(sound.slot)
            where = "slot %d holds '%s'" % (sound.slot, holds) if holds is not None else "slot %d isn't in the sound list" % sound.slot
            if slot is not None:
                out.append(Problem(sound.line, WARNING, "sound-moved", "%s: %s, not '%s'; that sound is in slot %d ('%s'), which Arc will use instead" % (
                    label, where, sound.name, slot, available[slot])))
            elif sound.name:
                out.append(Problem(sound.line, WARNING, "sound-missing", "%s: %s, and no slot holds '%s'; Arc will skip this sound line" % (label, where, sound.name)))
            else:
                out.append(Problem(sound.line, WARNING, "sound-missing", "%s: %s; Arc will skip this sound line" % (label, where)))
    if len(unnamed) == 1:
        line, label, slot = unnamed[0]
        out.append(Problem(line, NOTE, "sound-unnamed", "%s: slot %d is a factory sound without a name; using it by slot" % (label, slot)))
    elif unnamed:
        unnamed.sort()
        out.append(Problem(unnamed[0][0], NOTE, "sound-unnamed", "%s: slots %s are factory sounds without a name; using them by slot" % (
            ", ".join(u[1] for u in unnamed), ", ".join(str(u[2]) for u in unnamed))))
    return sorted(out, key=lambda p: p.line)


# ---------------------------------------------------------------------------
# Roles: what a pad's sound is, by its name
# ---------------------------------------------------------------------------

_ROLE_PATTERNS = [
    ("kick", r"\b(kick|bd|bass ?drum)\b"),
    ("snare", r"\b(snare|sd|rim ?shot)\b"),
    ("clap", r"\b(clap|snap)\b"),
    ("rim", r"\b(rim|stick|clave|block)\b"),
    ("hat", r"\b(hi.?hat|hh|hat|hats)\b"),
    ("cymbal", r"\b(crash|ride|cymbal|splash)\b"),
    ("tom", r"\btoms?\b"),
    ("perc", r"\b(shaker|tamb\w*|conga|bongo|cowbell|perc\w*|agogo|guiro|cabasa|shk|clav\w*|triangle)\b"),
    ("bass", r"\b(bass|sub|808)\b"),
]
BACKBEAT_ROLES = ("snare", "clap", "rim")
#: Sounds that keep time rather than carry the groove; the syncopation score leaves them out.
TIMEKEEPER_ROLES = ("hat", "cymbal", "perc")


def role_of(name: str) -> Optional[str]:
    """The role a sound name suggests (kick, snare, clap, rim, hat, cymbal, tom, perc, bass), or None."""
    low = name.lower()
    for role, pattern in _ROLE_PATTERNS:
        if re.search(pattern, low):
            return role
    return None


#: The factory pack's slot blocks (FeatureText.FACTORY_BLOCKS): the role a slot suggests when its sound has no name. 500-599 is melodic, no drum role.
FACTORY_ROLES = ((1, 99, "kick", "kicks"), (100, 199, "snare", "snares"), (200, 299, "hat", "hats"), (300, 399, "perc", "percussion"), (400, 499, "bass", "bass"), (500, 599, None, "melodic"))
#: Roles that count as the same kind of sound when a row's label and its sound line's slot are compared.
_FAMILY = {"kick": "kick", "snare": "backbeat", "clap": "backbeat", "rim": "backbeat", "hat": "hat", "cymbal": "hat", "perc": "perc", "tom": "perc", "bass": "bass"}


def factory_block(slot: int) -> Optional[Tuple[Optional[str], str]]:
    """(role, block name) of the factory block [slot] is in, or None outside 1-599."""
    for lo, hi, role, block in FACTORY_ROLES:
        if lo <= slot <= hi:
            return role, block
    return None


def _sound_role(sound: Optional[Sound]) -> Tuple[Optional[str], Optional[str]]:
    """The role a sound line suggests and how: by its name ("name"), or by its factory block when it has no real name ("slot")."""
    if sound is None:
        return None, None
    if sound.name and not unnamed_slot(sound.slot, sound.name):
        role = role_of(sound.name)
        if role:
            return role, "name"
    block = factory_block(sound.slot)
    return (block[0], "slot") if block and block[0] else (None, None)


def pad_roles(pattern: Pattern) -> Dict[int, Tuple[Optional[str], bool, str]]:
    """
    For each pad of [pattern] with pad hits: (role, assumed, name), the role its rhythm is read with. It comes from the
    pad's sound line's name, else its row's label, else (group A) the assumed kit's pad, else the factory block of the
    sound line's slot (a sound named like "200.pcm" says nothing by its name). The name shown is the first real one.
    """
    rows = pattern.pad_names()
    out: Dict[int, Tuple[Optional[str], bool, str]] = {}
    for hit in pattern.hits:
        if hit.semi is not None or hit.pad in out:
            continue
        sound = pattern.sounds.get(hit.pad)
        real = sound.name if sound and sound.name and not unnamed_slot(sound.slot, sound.name) else ""
        row = rows.get(hit.pad, "")
        if row and unnamed_slot(sound.slot if sound else -1, row):
            row = ""  # Arc labels a row with the pad's sound name, "343.pcm" for an unnamed one: no more telling
        by_sound, how = _sound_role(sound)
        kit = ASSUMED_KIT.get(pad_label(pattern.group, hit.pad), "") if pattern.group == 0 else ""
        if real and how == "name":
            out[hit.pad] = (by_sound, False, real)
        elif row and role_of(row):
            out[hit.pad] = (role_of(row), False, real or row)
        elif kit and not real and not row:
            out[hit.pad] = (role_of(kit), True, kit)
        elif how == "slot":
            out[hit.pad] = (by_sound, False, real or row or "slot %d (%s)" % (sound.slot, factory_block(sound.slot)[1]))
        else:
            name = real or row
            out[hit.pad] = (role_of(name) if name else None, False, name)
    return out


def sound_mismatches(pattern: Pattern) -> List[dict]:
    """
    Pads whose rhythm reads as one kind of sound ([pad_roles]: the row's label, or the assumed kit's pad) while the
    sound line suggests another: a kick row playing slot 343, in the factory's percussion block, say. Worth a remark
    (the beat may not sound as its rows read) and maybe a sound swap.
    """
    roles = pad_roles(pattern)
    out = []
    for pad in sorted(pattern.sounds, key=KEYPAD_ORDER.index):
        if pad not in roles:
            continue
        row_role, assumed, name = roles[pad]
        sound = pattern.sounds[pad]
        sound_role, how = _sound_role(sound)
        if row_role and sound_role and _FAMILY.get(row_role) != _FAMILY.get(sound_role):
            block = factory_block(sound.slot)
            out.append({
                "pad": pad_label(pattern.group, pad),
                "row": name,
                "row_role": row_role,
                "row_assumed": assumed,
                "slot": sound.slot,
                "sound_role": sound_role,
                "by": "the factory %s block" % block[1] if how == "slot" and block else "its name",
            })
    return out


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------


def slot_of(tick: int) -> int:
    """The 16th-note slot (0..15) of a tick within its bar: the nearest one, a tie going to the earlier."""
    return (((tick % TICKS_PER_BAR) + 11) // 24) % 16


def bar_of(tick: int) -> int:
    return tick // TICKS_PER_BAR


_SLOT_WEIGHT = [4 if s == 0 else 3 if s % 4 == 0 else 2 if s % 2 == 0 else 1 for s in range(16)]


def syncopation(bars: List[set]) -> float:
    """Average syncopation a bar, after Longuet-Higgins and Lee: a hit on a weak slot followed, before the next hit, by a rest on a stronger one scores the difference of their weights."""
    if not bars:
        return 0.0
    total = 0
    for b, slots in enumerate(bars):
        for s in slots:
            weight = _SLOT_WEIGHT[s]
            strongest = 0
            for step in range(1, 17):
                j = s + step
                following = bars[(b + j // 16) % len(bars)]
                if (j % 16) in following:
                    break
                strongest = max(strongest, _SLOT_WEIGHT[j % 16])
            if strongest > weight:
                total += strongest - weight
    return round(total / len(bars), 2)


def sync_label(score: float) -> str:
    if score <= 2:
        return "straight"
    if score <= 6:
        return "some syncopation"
    return "syncopated"


def _gap(ticks: List[int], length: int) -> Optional[dict]:
    """The longest stretch with no hit, looping round the pattern end."""
    if not ticks:
        return None
    ts = sorted(set(ticks))
    best, at = -1, 0
    for i, t in enumerate(ts):
        nxt = ts[i + 1] if i + 1 < len(ts) else ts[0] + length
        if nxt - t > best:
            best, at = nxt - t, t
    return {"steps": round(best / 24, 1), "ticks": best, "after": position(at)}


def _velocity(vels: List[int]) -> dict:
    if not vels:
        return {"min": None, "max": None, "mean": None, "stdev": None, "distinct": 0, "ghosts": 0, "normal": 0, "accents": 0}
    mean = sum(vels) / len(vels)
    var = sum((v - mean) ** 2 for v in vels) / len(vels)
    return {
        "min": min(vels),
        "max": max(vels),
        "mean": round(mean, 1),
        "stdev": round(math.sqrt(var), 1),
        "distinct": len(set(vels)),
        "ghosts": sum(1 for v in vels if v <= 70),
        "normal": sum(1 for v in vels if 70 < v < 120),
        "accents": sum(1 for v in vels if v >= 120),
    }


def _measured_swing(pattern: Pattern) -> Optional[float]:
    """The swing a pattern's grid hits show: how late the hits on odd 1/8 or 1/16 steps are, as 50-75%."""
    if pattern.step not in SWING_STEPS:
        return None
    t = pattern.step_ticks
    late = [h.tick - h.step * t for h in pattern.hits if h.row is not None and h.step is not None and h.step % 2 == 1]
    if not late:
        return None
    return round(50 + (sum(late) / len(late)) * 50 / t, 1)


def _slot_string(slots: Dict[int, int]) -> str:
    return "".join("x" if s in slots else "." for s in range(16))


def pattern_report(pattern: Pattern, card: Card) -> dict:
    hits = [h for h in pattern.hits if h.semi is None]
    keys = [h for h in pattern.hits if h.semi is not None]
    roles = pad_roles(pattern)
    bars = pattern.bars

    def per_bar(items: List[Hit]) -> List[int]:
        counts = [0] * bars
        for h in items:
            counts[bar_of(h.tick)] += 1
        return counts

    slots_by_bar: List[set] = [set() for _ in range(bars)]
    for h in hits:
        slots_by_bar[bar_of(h.tick)].add(slot_of(h.tick))

    pads: Dict[str, dict] = {}
    for pad in sorted({h.pad for h in hits}, key=KEYPAD_ORDER.index):
        mine = [h for h in hits if h.pad == pad]
        role, assumed, name = roles[pad]
        pads[pad_label(pattern.group, pad)] = {
            "name": name,
            "role": role,
            "name_assumed": assumed,
            "sound": _sound_data(pattern.sounds.get(pad)),
            "hits": len(mine),
            "per_bar": per_bar(mine),
            "velocity": _velocity([h.vel for h in mine]),
            "longest_gap": _gap([h.tick for h in mine], pattern.length),
            "positions": [position(h.tick) for h in mine],
        }

    # Which steps carry which kind of sound, folded over the bars.
    by_role: Dict[str, dict] = {}
    for role in sorted({r for r, _, _ in roles.values() if r}):
        pad_set = [p for p, (r, _, _) in roles.items() if r == role]
        mine = [h for h in hits if h.pad in pad_set]
        folded: Dict[int, int] = {}
        for h in mine:
            folded[slot_of(h.tick)] = folded.get(slot_of(h.tick), 0) + 1
        by_role[role] = {
            "pads": [pad_label(pattern.group, p) for p in pad_set],
            "hits": len(mine),
            "positions": [position(h.tick) for h in mine],
            "slots": _slot_string(folded),
            "syncopation": syncopation(_role_bars(mine, bars)),
        }

    features = _features(pattern, hits, roles, card)
    sync_pads = {label: syncopation(_role_bars([h for h in hits if h.pad == pad], bars)) for label, pad in
                 ((pad_label(pattern.group, p), p) for p in sorted({h.pad for h in hits}, key=KEYPAD_ORDER.index))}
    backbone = [pad_label(pattern.group, p) for p, (r, _, _) in roles.items() if r not in TIMEKEEPER_ROLES]
    sync = round(sum(sync_pads[l] for l in backbone), 2)
    swung = sum(1 for h in hits if h.row is not None and h.step is not None and h.step % 2 == 1 and pattern.step in SWING_STEPS)
    occupied = [len(s) for s in slots_by_bar]

    keys_report: Dict[str, dict] = {}
    for pad in sorted({h.pad for h in keys}, key=KEYPAD_ORDER.index):
        mine = [h for h in keys if h.pad == pad]
        midis = [KEYS_ROOT + h.semi for h in mine]
        keys_report[pad_label(pattern.group, pad)] = {
            "notes": len(mine),
            "lowest": note_name(min(midis)) if 0 <= min(midis) <= 127 else None,
            "highest": note_name(max(midis)) if 0 <= max(midis) <= 127 else None,
            "distinct_pitches": len(set(midis)),
            "positions": [position(h.tick) for h in mine],
        }

    return {
        "group": pattern.letter,
        "number": pattern.number,
        "bars": bars,
        "step": pattern.step,
        "pad_hits": len(hits),
        "keys_notes": len(keys),
        "hits_per_bar": per_bar(hits),
        "density_pct": round(100 * sum(occupied) / (16 * bars), 1),
        "pads": pads,
        "sounds": {pad_label(pattern.group, pad): _sound_data(pattern.sounds[pad]) for pad in KEYPAD_ORDER if pad in pattern.sounds},
        "pad_shaping": pad_shaping(pattern),
        "sound_mismatches": sound_mismatches(pattern),
        "keys": keys_report,
        "roles": by_role,
        "velocity": _velocity([h.vel for h in hits]),
        "swing": {
            "header": card.swing,
            "applies": pattern.step in SWING_STEPS,
            "swung_hits": swung,
            "measured": _measured_swing(pattern),
        },
        "syncopation": {"score": sync, "label": sync_label(sync), "by_pad": sync_pads, "counted_pads": backbone},
        "longest_gap": _gap([h.tick for h in hits], pattern.length),
        "features": features,
        "variation": _variation(pattern, hits),
    }


def _sound_data(sound: Optional[Sound]) -> Optional[dict]:
    return None if sound is None else {"slot": sound.slot, "name": sound.name or None}


def _sound_text(label: str, sound: Sound) -> str:
    return "%s slot %d%s" % (label, sound.slot, " " + sound.name if sound.name else "")


def _role_bars(hits: List[Hit], bars: int) -> List[set]:
    out: List[set] = [set() for _ in range(bars)]
    for h in hits:
        out[bar_of(h.tick)].add(slot_of(h.tick))
    return out


def _role_slots(hits: List[Hit], roles: Dict[int, Tuple[Optional[str], bool, str]], wanted: Tuple[str, ...], bars: int) -> List[set]:
    pads = [p for p, (r, _, _) in roles.items() if r in wanted]
    return _role_bars([h for h in hits if h.pad in pads], bars)


def _features(pattern: Pattern, hits: List[Hit], roles: Dict[int, Tuple[Optional[str], bool, str]], card: Card) -> List[str]:
    bars = pattern.bars
    kick = _role_slots(hits, roles, ("kick",), bars)
    back = _role_slots(hits, roles, BACKBEAT_ROLES[:2], bars)
    hat = _role_slots(hits, roles, ("hat",), bars)
    out: List[str] = []
    beats = {0, 4, 8, 12}
    if all(beats <= s for s in kick) and all(len(s) <= 6 for s in kick):
        out.append("four on the floor")
    if all({4, 12} <= s for s in back):
        out.append("backbeat (snare or clap on 2 and 4)")
    elif all(8 in s and not ({4, 12} & s) for s in back) and any(back):
        out.append("half-time backbeat (snare or clap on 3)")
    if any(hat) and all({2, 6, 10, 14} <= s and not (beats & s) for s in hat):
        out.append("offbeat hats")
    elif any(hat) and all(set(range(0, 16, 2)) <= s for s in hat):
        out.append("sixteenth hats" if all(len(s) >= 15 for s in hat) else "eighth-note hats")
    if any(sum(1 for h in hits if h.pad == p and h.vel <= 70) for p, (r, _, _) in roles.items() if r not in TIMEKEEPER_ROLES):
        out.append("ghost notes")
    kick_off = sum(len(s - beats) for s in kick)
    if kick_off >= 2 * bars and any(kick):
        out.append("syncopated kick")
    if any(_is_332(s) for s in _per_pad_bars([h for h in hits if roles[h.pad][0] not in ("hat", "cymbal")], bars)):
        out.append("3-3-2 pulse (tresillo, dembow) on a pad")
    m = _measured_swing(pattern)
    if m is not None and m >= 54:
        out.append("swung (about %d%%)" % round(m))
    if len(hits) == 0:
        out.append("no pad hits")
    return out


def _is_332(slots: set) -> bool:
    """Whether a pad's slots hold the 3 + 3 + 2 figure: 0 3 6, 8 11 14, or the dembow's 3 6 11 14."""
    return {0, 3, 6} <= slots or {8, 11, 14} <= slots or {3, 6, 11, 14} <= slots


def _per_pad_bars(hits: List[Hit], bars: int) -> List[set]:
    out: List[set] = []
    for pad in {h.pad for h in hits}:
        for b in range(bars):
            out.append({slot_of(h.tick) for h in hits if h.pad == pad and bar_of(h.tick) == b})
    return out


def _variation(pattern: Pattern, hits: List[Hit]) -> dict:
    bars = pattern.bars
    sigs = []
    for b in range(bars):
        sigs.append(frozenset((h.pad, h.tick % TICKS_PER_BAR, h.vel) for h in hits if bar_of(h.tick) == b))
    counts = [len(s) for s in sigs]
    return {
        "bars": bars,
        "distinct_bars": len(set(sigs)),
        "identical_bars": len(set(sigs)) == 1,
        "last_bar_busier": bars > 1 and counts[-1] > max(counts[:-1]) * 1.25 and counts[-1] > 0,
    }


# -- genre recipes -----------------------------------------------------------


def split_cards(markdown: str) -> List[Tuple[str, str, str]]:
    """The cards fenced in a Markdown file as (heading, text before the card since the heading, card text)."""
    out: List[Tuple[str, str, str]] = []
    heading, before, block, in_fence = "", [], [], False
    for line in markdown.splitlines():
        if line.strip().startswith("```"):
            if in_fence:
                if block and block[0].upper().startswith("ARC BEAT"):
                    out.append((heading, "\n".join(before), "\n".join(block)))
                    before = []
                block, in_fence = [], False
            else:
                in_fence = True
            continue
        if in_fence:
            block.append(line)
        elif re.match(r"#{1,4}\s", line):
            heading, before = re.sub(r"^#+\s*", "", line).strip(), []
        else:
            before.append(line)
    return out


def load_recipes(path: str) -> List[dict]:
    """The genre recipes of genres.md: name, BPM range, swing range and the card's drum fingerprint."""
    try:
        with open(path, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return []
    recipes = []
    for heading, before, card_text in split_cards(text):
        card = parse_card(card_text)
        if not card.ok:
            continue
        bpm = re.search(r"BPM:\s*(\d+(?:\.\d)?)\s*(?:-|–|to)\s*(\d+(?:\.\d)?)", before)
        single = re.search(r"BPM:\s*(\d+(?:\.\d)?)", before)
        sw = re.search(r"Swing:\s*(\d+)(?:\s*(?:-|–|to)\s*(\d+))?", before)
        lo, hi = (float(bpm.group(1)), float(bpm.group(2))) if bpm else ((float(single.group(1)),) * 2 if single else (None, None))
        recipes.append({
            "genre": heading,
            "bpm": (lo, hi) if lo is not None else None,
            "swing": (int(sw.group(1)), int(sw.group(2) or sw.group(1))) if sw else None,
            "fingerprint": fingerprint(card),
        })
    return recipes


def fingerprint(card: Card) -> Dict[str, set]:
    """The slots (0..15 of a bar) a card's kick, backbeat and hat play on in most of its bars, over all groups."""
    out: Dict[str, List[int]] = {"kick": [], "backbeat": [], "hat": []}
    bars_total = 0
    for pattern in card.patterns:
        roles = pad_roles(pattern)
        hits = [h for h in pattern.hits if h.semi is None]
        if not hits:
            continue  # a group of KEYS notes only (bass, chords) has no drums: its bars mustn't dilute theirs
        bars_total += pattern.bars
        for key, wanted in (("kick", ("kick",)), ("backbeat", BACKBEAT_ROLES[:2]), ("hat", ("hat",))):
            for slots in _role_slots(hits, roles, wanted, pattern.bars):
                out[key].extend(slots)
    result: Dict[str, set] = {}
    for key, slots in out.items():
        counts: Dict[int, int] = {}
        for s in slots:
            counts[s] = counts.get(s, 0) + 1
        result[key] = {s for s, n in counts.items() if n * 2 >= max(1, bars_total)}
    return result


def _jaccard(a: set, b: set) -> Optional[float]:
    if not a and not b:
        return None
    return len(a & b) / len(a | b)


def similarity(card: Card, recipes: List[dict], top: int = 3) -> List[dict]:
    """The genre recipes the card is closest to: drum slots 55%, tempo 35%, swing 10% (missing parts are left out). A tempo felt at half or double speed counts for less than one in range."""
    mine = fingerprint(card)
    scored = []
    for r in recipes:
        parts, weights = [], []
        theirs = r["fingerprint"]
        drums, dw = 0.0, 0.0
        for key, w in (("kick", 0.4), ("backbeat", 0.35), ("hat", 0.25)):
            j = _jaccard(mine[key], theirs[key])
            if j is None:
                continue
            drums += w * j
            dw += w
        if dw == 0:
            continue
        parts.append(drums / dw)
        weights.append(0.55)
        tempo_note = None
        if card.tempo is not None and r["bpm"] is not None:
            lo, hi = r["bpm"]
            best = 0.0
            for factor, penalty in ((1.0, 1.0), (2.0, 0.6), (0.5, 0.6)):
                t = card.tempo * factor
                d = 0.0 if lo <= t <= hi else min(abs(t - lo), abs(t - hi))
                score = penalty * max(0.0, 1 - d / (0.25 * (lo + hi) / 2))
                if score > best:
                    best = score
                    if d == 0:
                        tempo_note = "tempo in range" if factor == 1.0 else "tempo in range at %s speed" % ("double" if factor == 2.0 else "half")
            parts.append(best)
            weights.append(0.35)
        if r["swing"] is not None:
            lo_s, hi_s = r["swing"]
            d = 0 if lo_s <= card.swing <= hi_s else min(abs(card.swing - lo_s), abs(card.swing - hi_s))
            parts.append(max(0.0, 1 - d / 15))
            weights.append(0.1)
        score = sum(p * w for p, w in zip(parts, weights)) / sum(weights)
        scored.append({
            "genre": r["genre"],
            "score": round(100 * score),
            "drums": round(100 * parts[0]),
            "tempo": tempo_note or ("outside the usual range" if card.tempo is not None and r["bpm"] else None),
        })
    scored.sort(key=lambda s: (-s["score"], s["genre"]))
    return scored[:top]


def analyse_card(card: Card, recipes: Optional[List[dict]] = None) -> dict:
    """Everything the analyse command reports, as plain data."""
    patterns = [pattern_report(p, card) for p in card.patterns]
    all_hits = [h for p in card.patterns for h in p.hits if h.semi is None]
    return {
        "name": card.name,
        "tempo": card.tempo,
        "swing": card.swing,
        "groups": [p.letter for p in card.patterns],
        "fx": describe_fx(card.fx) if card.fx is not None else None,
        "pad_hits": len(all_hits),
        "keys_notes": sum(1 for p in card.patterns for h in p.hits if h.semi is not None),
        "velocity": _velocity([h.vel for h in all_hits]),
        "patterns": patterns,
        "similar_to": similarity(card, recipes) if recipes else [],
    }


# ---------------------------------------------------------------------------
# FX and pad shaping, read aloud
# ---------------------------------------------------------------------------

#: The delay's tempo-synced lengths, shortest first: X picks one of twelve (FxKnobs.DELAY_DIVISIONS).
DELAY_DIVISIONS = ("1/32", "1/16T", "1/16", "1/8T", "1/16D", "1/8", "1/4T", "1/8D", "1/4", "1/2T", "1/4D", "1/2")
#: The compressor's attack and release in ms: Y picks one of eight, fast to slow (FxKnobs.COMP_SPEEDS).
COMP_SPEEDS = ("0.5/40", "1/60", "2/100", "5/150", "10/200", "15/300", "20/400", "30/600")


def _round(v: float) -> int:
    """Round half up, as Arc's readouts do."""
    return int(math.floor(v + 0.5))


def _times(v: float) -> str:
    """A gain as "2.5x", whole from 10 up ("40x")."""
    return "%.1fx" % v if _round(v * 10) < 100 else "%dx" % _round(v)


def _hz(v: float) -> str:
    """A frequency as "400", "1.2k", whole kHz from 10k up."""
    r = _round(v)
    if r < 1000:
        return str(r)
    t = _round(v / 100)
    return "%d.%dk" % (t // 10, t % 10) if t < 100 else "%dk" % _round(v / 1000)


def _tilt(k: float, low: str, high: str, flat: str) -> str:
    """Y from the centre, as the XY pad reads it: "DARK 40", "FLAT", "BRIGHT 20"."""
    t = _round((k - 0.5) * 200)
    return "%s %d" % (low, -t) if t < 0 else "%s %d" % (high, t) if t > 0 else flat


def fx_readout(effect: str, x: float, y: float) -> Tuple[str, str]:
    """What the X and Y knobs (percent) of [effect] come to, as the FX sheet reads them (FxSettings.xReadout and yReadout)."""
    kx, ky = x / 100.0, y / 100.0
    if effect == "delay":
        return DELAY_DIVISIONS[min(11, int(kx * 12))], "%d%%" % _round(0.95 * ky * 100)
    if effect == "reverb":
        return "%d%%" % _round(kx * 100), _tilt(ky, "dark", "bright", "flat")
    if effect == "distortion":
        return _times(1 + 39 * kx * kx), _tilt(ky, "low-pass", "high-pass", "open")
    if effect == "chorus":
        return "%.2f Hz" % (0.05 + 4.95 * kx ** 3), "%d%%" % _round(0.7 * ky * 100)
    if effect == "filter":
        if kx < 0.47:
            cutoff = "low-pass " + _hz(60 + 19940 * (kx / 0.47) ** 3)
        elif kx > 0.53:
            cutoff = "high-pass " + _hz(20 + 7980 * ((kx - 0.53) / 0.47) ** 3)
        else:
            cutoff = "open"
        return cutoff, "Q %.1f" % (0.5 + 7.5 * ky)
    if effect == "compressor":
        return _times(1 + 7 * kx * kx), COMP_SPEEDS[min(7, int(ky * 8))] + " ms"
    return "", ""


def _percent_text(v: float) -> str:
    return "%g%%" % v


def describe_fx(fx: Fx) -> dict:
    """The card's effect lines as plain data with readable values: the effect and what its knobs do, the sends, the compressor and the sidechain."""
    out: dict = {"line": fx.line, "effect": None, "sends": None, "comp": None, "sidechain": None}
    if fx.effect is not None:
        item: dict = {"type": fx.effect}
        if fx.effect != "none":
            xr, yr = fx_readout(fx.effect, fx.x if fx.x is not None else 50.0, fx.y if fx.y is not None else 50.0)
            xn, yn = FX_KNOBS[fx.effect]
            item.update({"x": fx.x, "y": fx.y, "x_name": xn, "y_name": yn, "x_reads": xr, "y_reads": yr})
        out["effect"] = item
    if fx.sends is not None:
        out["sends"] = {GROUPS[g]: fx.sends.get(g, 0.0) for g in range(4)}
    if fx.comp is not None:
        if fx.comp.on:
            xr, yr = fx_readout("compressor", fx.comp.drive, fx.comp.speed)
            out["comp"] = {"on": True, "drive": fx.comp.drive, "speed": fx.comp.speed, "drive_reads": xr, "speed_reads": yr}
        else:
            out["comp"] = {"on": False}
    if fx.sidechain is not None:
        sc = fx.sidechain
        if sc.on:
            out["sidechain"] = {"on": True, "pad": pad_label(sc.group, sc.pad), "ducks": [GROUPS[g] for g in sc.groups], "length": sc.length, "shape": sc.shape}
        else:
            out["sidechain"] = {"on": False}
    return out


def fx_lines(info: dict) -> List[str]:
    """describe_fx's data as one readable line each: effect, sends, comp, sidechain (only those the card has)."""
    out: List[str] = []
    e = info["effect"]
    if e is not None:
        if e["type"] == "none":
            out.append("fx none")
        else:
            out.append("fx %s %g %g: %s %s, %s %s" % (e["type"], e["x"], e["y"], e["x_name"], e["x_reads"], e["y_name"], e["y_reads"]))
    if info["sends"] is not None:
        out.append("send: " + ", ".join("%s %s" % (g, _percent_text(v)) for g, v in info["sends"].items()))
    c = info["comp"]
    if c is not None:
        out.append("comp off" if not c["on"] else "comp %g %g: drive %s, speed %s" % (c["drive"], c["speed"], c["drive_reads"], c["speed_reads"]))
    s = info["sidechain"]
    if s is not None:
        out.append("sidechain off" if not s["on"] else "sidechain: %s ducks %s (length %s, shape %s)" % (s["pad"], " ".join(s["ducks"]), _percent_text(s["length"]), _percent_text(s["shape"])))
    return out


def pad_shape_text(shape: PadShape) -> str:
    """A pad line's settings read aloud: "pitch -7 st, level 90, pan L4, attack 3, release 20, mode key"."""
    parts = []
    for key, value in shape.given().items():
        if key == "pitch":
            parts.append("pitch %+g st" % value if value else "pitch 0 st")
        elif key == "pan":
            parts.append("pan %s" % ("L%d" % -value if value < 0 else "R%d" % value if value > 0 else "centre"))
        else:
            parts.append("%s %s" % (key, value))
    return ", ".join(parts)


def pad_shaping(pattern: Pattern) -> Dict[str, dict]:
    """A pattern's pad lines as plain data, by pad label in keypad order: the pad's name (when it has one), its settings and how they read."""
    names = {**pattern.sound_names(), **pattern.pad_names()}
    return {
        pad_label(pattern.group, pad): {"name": names.get(pad) or None, **pattern.pads[pad].given(), "reads": pad_shape_text(pattern.pads[pad]), "line": pattern.pads[pad].line}
        for pad in KEYPAD_ORDER
        if pad in pattern.pads
    }


# ---------------------------------------------------------------------------
# Grid
# ---------------------------------------------------------------------------


def vel_char(vel: int) -> str:
    """A velocity as a card character: X 127, x 100, o 64, a digit for 14 * n, else the nearest digit."""
    if vel == 127:
        return "X"
    if vel == 100:
        return "x"
    if vel == 64:
        return "o"
    return str(max(1, min(9, round(vel / 14))))


def render_grid(card: Card) -> str:
    out: List[str] = []
    title = card.name or "(no name)"
    meta = []
    if card.tempo is not None:
        meta.append("%g BPM" % card.tempo)
    meta.append("swing %d%%" % card.swing)
    out.append("%s   %s" % (title, "   ".join(meta)))
    if card.fx is not None:
        for text in fx_lines(describe_fx(card.fx)):
            out.append(text)
    for pattern in card.patterns:
        t = pattern.step_ticks
        per_beat = TICKS_PER_BEAT // t if TICKS_PER_BEAT % t == 0 else 4
        per_bar = TICKS_PER_BAR // t
        names = {**pattern.sound_names(), **pattern.pad_names()}  # a row's own name first, the sound line's when it has none
        out.append("")
        out.append("[%s%s] %d bar%s, step %s%s" % (
            pattern.letter, "%02d" % pattern.number if pattern.number else "", pattern.bars, "" if pattern.bars == 1 else "s",
            pattern.step, ", swung" if pattern.step in SWING_STEPS and card.swing > 50 else ""))
        for pad in KEYPAD_ORDER:
            if pad in pattern.sounds:
                out.append("sound " + _sound_text(pad_label(pattern.group, pad), pattern.sounds[pad]))
        for label, shape in pad_shaping(pattern).items():
            out.append("pad %s: %s" % (label, shape["reads"]))
        label_width = max([len(pad_label(pattern.group, o)) + 1 + len(names.get(o, "")) for o in range(12)] + [4])
        # Beat numbers over the steps.
        head = ""
        for k in range(pattern.bars * per_bar):
            if k % per_bar == 0 and k:
                head += "| "
            if k % per_beat == 0:
                head += "%-*s" % (per_beat + 1, (k % per_bar) // per_beat + 1 if per_beat > 1 else "")
        out.append("%-*s  %s" % (label_width, "", head.rstrip()))
        rows = []
        for pad in KEYPAD_ORDER:
            mine = [h for h in pattern.hits if h.pad == pad and h.semi is None and h.row is not None]
            if not mine:
                continue
            cells = ["."] * (pattern.bars * per_bar)
            for h in mine:
                if h.step is None or h.step >= len(cells):
                    continue
                cells[h.step] = vel_char(h.vel)
                for extra in range(1, max(1, h.gate // t)):
                    if h.step + extra < len(cells) and cells[h.step + extra] == ".":
                        cells[h.step + extra] = "-"
            rows.append((pad, cells))
        total = [0] * (pattern.bars * per_bar)
        for pad, cells in rows:
            for k, c in enumerate(cells):
                if c in _STEP_CHARS:
                    total[k] += 1
            out.append("%-*s  %s" % (label_width, (pad_label(pattern.group, pad) + " " + names.get(pad, "")).rstrip(), _group(cells, per_beat, per_bar)))
        if rows:
            cells = [str(min(9, n)) if n else "." for n in total]
            out.append("%-*s  %s" % (label_width, "hits", _group(cells, per_beat, per_bar)))
        extras = [h for h in pattern.hits if h.row is None]
        if extras:
            out.append("")
            out.append("notes (off the grid or KEYS):")
            for h in extras:
                what = "pad hit" if h.semi is None else "KEYS %s" % note_name(KEYS_ROOT + h.semi)
                out.append("  %s at %s  vel %d  gate %d ticks  %s" % (pad_label(pattern.group, h.pad), position(h.tick), h.vel, h.gate, what))
    return "\n".join(out)


def _group(cells: List[str], per_beat: int, per_bar: int) -> str:
    text = ""
    for k, c in enumerate(cells):
        if k and k % per_bar == 0:
            text += " | "
        elif k and k % per_beat == 0:
            text += " "
        text += c
    return text


# ---------------------------------------------------------------------------
# MIDI
# ---------------------------------------------------------------------------


def _vlq(value: int) -> bytes:
    out = [value & 0x7F]
    value >>= 7
    while value:
        out.append((value & 0x7F) | 0x80)
        value >>= 7
    return bytes(reversed(out))


def _track(events: List[Tuple[int, int, bytes]], end: int) -> bytes:
    """A track chunk from (tick, order, bytes) events; order puts a note off before a note on at one tick."""
    data = bytearray()
    last = 0
    for tick, _, body in sorted(events, key=lambda e: (e[0], e[1])):
        data += _vlq(tick - last) + body
        last = tick
    data += _vlq(max(0, end - last)) + b"\xff\x2f\x00"
    return b"MTrk" + struct.pack(">I", len(data)) + bytes(data)


def _meta_text(kind: int, text: str) -> bytes:
    raw = text.encode("utf-8")
    return bytes([0xFF, kind]) + _vlq(len(raw)) + raw


def card_to_midi(card: Card, loops: int = 1, channel: Optional[int] = None) -> bytes:
    """A type-1 standard MIDI file (96 ticks a beat) of the card at its tempo (120 if it has none).

    One tempo track, then for each group a track of its pad hits (notes 36-83 as
    the EP-133's note map, A 36-47 ... D 72-83) and, if it has any, a second
    track of its KEYS notes (60 + semi). The channel is the group's (A is 1,
    B 2, C 3, D 4) unless [channel] 1-16 is given. Each pattern repeats to fill
    [loops] times the longest one; swing is already in the ticks.
    """
    tempo = card.tempo if card.tempo is not None else 120.0
    longest = max([p.length for p in card.patterns] or [TICKS_PER_BAR])
    total = longest * max(1, loops)
    meta: List[Tuple[int, int, bytes]] = [
        (0, 0, _meta_text(0x03, card.name or "ARC BEAT")),
        (0, 1, bytes([0xFF, 0x51, 0x03]) + int(round(60_000_000 / tempo)).to_bytes(3, "big")),
        (0, 2, bytes([0xFF, 0x58, 0x04, 4, 2, 24, 8])),
    ]
    tracks = [_track(meta, total)]
    for pattern in card.patterns:
        ch = (channel - 1) if channel else pattern.group
        pad_events: List[Tuple[int, int, bytes]] = [(0, 0, _meta_text(0x03, "%s pads" % pattern.letter))]
        key_events: List[Tuple[int, int, bytes]] = [(0, 0, _meta_text(0x03, "%s keys" % pattern.letter))]
        has_keys = False
        for rep in range((total + pattern.length - 1) // pattern.length):
            base = rep * pattern.length
            for h in pattern.hits:
                start = base + h.tick
                if start >= total:
                    continue
                end = min(start + h.gate, base + pattern.length, total)
                end = max(end, start + 1)
                if h.semi is None:
                    note, events = pad_note(pattern.group, h.pad), pad_events
                else:
                    note, events = KEYS_ROOT + h.semi, key_events
                    has_keys = True
                    if not 0 <= note <= 127:
                        continue
                events.append((start, 1, bytes([0x90 | ch, note, h.vel])))
                events.append((end, 0, bytes([0x80 | ch, note, 0])))
        if len(pad_events) > 1:
            tracks.append(_track(pad_events, total))
        if has_keys:
            tracks.append(_track(key_events, total))
    header = b"MThd" + struct.pack(">IHHH", 6, 1, len(tracks), TICKS_PER_BEAT)
    return header + b"".join(tracks)


# ---------------------------------------------------------------------------
# Text output
# ---------------------------------------------------------------------------


def summary_line(card: Card) -> str:
    parts = []
    for p in card.patterns:
        pads = len({h.pad for h in p.hits if h.semi is None})
        keys = sum(1 for h in p.hits if h.semi is not None)
        parts.append("%s: %d bar%s step %s, %d pad%s, %d hit%s%s%s" % (
            p.letter, p.bars, "" if p.bars == 1 else "s", p.step, pads, "" if pads == 1 else "s",
            sum(1 for h in p.hits if h.semi is None), "" if sum(1 for h in p.hits if h.semi is None) == 1 else "s",
            ", %d KEYS note%s" % (keys, "" if keys == 1 else "s") if keys else "",
            ", %d sound%s" % (len(p.sounds), "" if len(p.sounds) == 1 else "s") if p.sounds else "") + (
            ", %d pad line%s" % (len(p.pads), "" if len(p.pads) == 1 else "s") if p.pads else ""))
    head = "OK"
    if card.name:
        head += ' "%s"' % card.name
    if card.tempo is not None:
        head += ", %g BPM" % card.tempo
    head += ", swing %d" % card.swing
    if card.fx is not None:
        head += ", fx (%s)" % ", ".join(card.fx.kinds())
    return head + " | " + "; ".join(parts)


def _sound_line(label: str, snd: dict) -> str:
    return "%s slot %d%s" % (label, snd["slot"], " " + snd["name"] if snd["name"] else "")


def render_analysis(report: dict) -> str:
    out: List[str] = []
    head = report["name"] or "(no name)"
    out.append("%s | tempo %s | swing %s | groups %s" % (head, report["tempo"] if report["tempo"] is not None else "-", report["swing"], " ".join(report["groups"])))
    if report.get("fx"):
        out.append("fx:")
        for text in fx_lines(report["fx"]):
            out.append("  " + text)
    v = report["velocity"]
    out.append("pad hits %d, KEYS notes %d, velocity %s-%s (mean %s, stdev %s, %d distinct; %d ghost, %d normal, %d accent)" % (
        report["pad_hits"], report["keys_notes"], v["min"], v["max"], v["mean"], v["stdev"], v["distinct"], v["ghosts"], v["normal"], v["accents"]))
    for p in report["patterns"]:
        out.append("")
        bars = "%d bar%s, step %s" % (p["bars"], "" if p["bars"] == 1 else "s", p["step"])
        if p["pad_hits"] == 0:
            # A group of KEYS notes only (bass, chords, a lead): the drum figures would all read 0.
            out.append("[%s] %s, KEYS notes only" % (p["group"], bars))
            for label, k in p["keys"].items():
                out.append("  KEYS %-5s %d notes, %s to %s, %d pitches" % (label, k["notes"], k["lowest"], k["highest"], k["distinct_pitches"]))
            for label, snd in p["sounds"].items():
                out.append("  sound %s" % _sound_line(label, snd))
            for label, shape in p["pad_shaping"].items():
                out.append("  pad %s%s: %s" % (label, " " + shape["name"] if shape["name"] else "", shape["reads"]))
            var = p["variation"]
            out.append("  variation: %d distinct bar%s of %d" % (var["distinct_bars"], "" if var["distinct_bars"] == 1 else "s", var["bars"]))
            continue
        per_bar = p["hits_per_bar"]
        if len(set(per_bar)) <= 1:
            spread = "%d a bar" % (per_bar[0] if per_bar else 0)
        else:
            spread = "by bar: %s" % ", ".join(str(n) for n in per_bar)
        out.append("[%s] %s, %d pad hits (%s), density %s%% of 16th slots" % (p["group"], bars, p["pad_hits"], spread, p["density_pct"]))
        for label, pad in p["pads"].items():
            gap = pad["longest_gap"]
            vel = pad["velocity"]
            name = pad["name"] + (" (assumed)" if pad["name_assumed"] else "")
            out.append("  %-7s %-12s %2d hits, vel %s-%s, longest gap %s steps%s" % (
                label, name, pad["hits"], vel["min"], vel["max"], gap["steps"] if gap else "-", ", ghosts %d" % vel["ghosts"] if vel["ghosts"] else ""))
        for label, snd in p["sounds"].items():
            out.append("  sound %s" % _sound_line(label, snd))
        for label, shape in p["pad_shaping"].items():
            out.append("  pad %s%s: %s" % (label, " " + shape["name"] if shape["name"] else "", shape["reads"]))
        for m in p.get("sound_mismatches", []):
            out.append("  mismatch %s: the rhythm reads as %s%s, but slot %d is a %s by %s" % (m["pad"], m["row_role"], " (assumed kit)" if m["row_assumed"] else "", m["slot"], m["sound_role"], m["by"]))
        for role, r in p["roles"].items():
            out.append("  role %-7s slots of a bar %s (%d hits, syncopation %s)" % (role, r["slots"], r["hits"], r["syncopation"]))
        for label, k in p["keys"].items():
            out.append("  KEYS %-5s %d notes, %s to %s, %d pitches" % (label, k["notes"], k["lowest"], k["highest"], k["distinct_pitches"]))
        s = p["swing"]
        out.append("  swing: header %d%%%s; measured %s; %d swung hits" % (
            s["header"], "" if s["applies"] else " (not applied: step is not 1/8 or 1/16)", "%s%%" % s["measured"] if s["measured"] is not None else "-", s["swung_hits"]))
        out.append("  syncopation %s (%s), counting %s" % (p["syncopation"]["score"], p["syncopation"]["label"], " ".join(p["syncopation"]["counted_pads"]) or "nothing"))
        g = p["longest_gap"]
        if g:
            out.append("  longest gap %s steps (%d ticks) after %s" % (g["steps"], g["ticks"], g["after"]))
        out.append("  features: %s" % (", ".join(p["features"]) or "none detected"))
        var = p["variation"]
        out.append("  variation: %d distinct bar%s of %d%s" % (var["distinct_bars"], "" if var["distinct_bars"] == 1 else "s", var["bars"], ", last bar busier (a fill?)" if var["last_bar_busier"] else ""))
    if report["similar_to"]:
        out.append("")
        out.append("closest genre recipes:")
        for s in report["similar_to"]:
            out.append("  %3d%%  %s (drums %d%%%s)" % (s["score"], s["genre"], s["drums"], ", " + s["tempo"] if s["tempo"] else ""))
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Command line
# ---------------------------------------------------------------------------


def _read(path: Optional[str]) -> str:
    if path is None or path == "-":
        return sys.stdin.read()
    with open(path, encoding="utf-8", errors="replace") as f:
        return f.read()


def _default_recipes() -> str:
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "references", "genres.md")


def _load(args: argparse.Namespace, quiet_ok: bool = False) -> Optional[Card]:
    try:
        text = _read(args.card)
    except OSError as e:
        print("beatcard: %s" % e, file=sys.stderr)
        sys.exit(2)
    card = parse_card(text)
    if not card.ok:
        for p in card.problems:
            print(p, file=sys.stderr)
        print("%d error%s: the card can't be read" % (len(card.errors), "" if len(card.errors) == 1 else "s"), file=sys.stderr)
        return None
    for p in card.warnings:
        print(p, file=sys.stderr)
    return card


def cmd_check(args: argparse.Namespace) -> int:
    try:
        card = parse_card(_read(args.card))
        available = None
        if args.sounds:
            with open(args.sounds, encoding="utf-8", errors="replace") as f:
                available = parse_sound_list(f.read())
    except OSError as e:
        print("beatcard: %s" % e, file=sys.stderr)
        return 2
    if available is not None:
        if not available:
            print("beatcard: no sounds found in %s: expected lines like '12 Kick 808'" % args.sounds, file=sys.stderr)
            return 2
        card.problems.extend(check_sounds(card, available))
        card.problems.sort(key=lambda p: p.line)
    if args.json:
        print(json.dumps({"ok": card.ok, "problems": [p.to_dict() for p in card.problems]}, indent=2))
        return 0 if card.ok else 1
    for p in card.problems:
        print(p)
    if card.ok:
        print(summary_line(card))
        return 0
    print("%d error%s, %d warning%s: the card can't be read" % (
        len(card.errors), "" if len(card.errors) == 1 else "s", len(card.warnings), "" if len(card.warnings) == 1 else "s"))
    return 1


def cmd_analyse(args: argparse.Namespace) -> int:
    card = _load(args)
    if card is None:
        return 1
    report = analyse_card(card, load_recipes(args.recipes or _default_recipes()))
    print(json.dumps(report, indent=2) if args.json else render_analysis(report))
    return 0


def cmd_grid(args: argparse.Namespace) -> int:
    card = _load(args)
    if card is None:
        return 1
    print(render_grid(card))
    return 0


def cmd_midi(args: argparse.Namespace) -> int:
    card = _load(args)
    if card is None:
        return 1
    if args.channel is not None and not 1 <= args.channel <= 16:
        print("beatcard: --channel must be 1 to 16", file=sys.stderr)
        return 2
    data = card_to_midi(card, args.loops, args.channel)
    out = args.output
    if out is None:
        slug = re.sub(r"[^a-z0-9]+", "-", (card.name or "beat").lower()).strip("-") or "beat"
        out = slug + ".mid"
    if out == "-":
        sys.stdout.buffer.write(data)
    else:
        with open(out, "wb") as f:
            f.write(data)
        print("wrote %s (%d bytes, %d tracks)" % (out, len(data), struct.unpack(">H", data[10:12])[0]))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="beatcard.py", description="Check, analyse, convert and print ARC BEAT cards.")
    sub = parser.add_subparsers(dest="command", required=True)

    def add(name: str, func, help: str, aliases: Tuple[str, ...] = ()) -> argparse.ArgumentParser:
        p = sub.add_parser(name, help=help, aliases=list(aliases))
        p.add_argument("card", nargs="?", help="card file; omit or '-' for standard input")
        p.set_defaults(func=func)
        return p

    p = add("check", cmd_check, "read a card and print its problems with line numbers")
    p.add_argument("--json", action="store_true", help="print the problems as JSON")
    p.add_argument("--sounds", metavar="FILE", help="the user's sound list (Arc's share text, or lines of '<slot> <name>'): warn about sound lines whose slot or name isn't in it")
    p = add("analyse", cmd_analyse, "describe a card's groove, density, velocity, swing and gaps", ("analyze",))
    p.add_argument("--json", action="store_true", help="print the report as JSON")
    p.add_argument("--recipes", help="genres.md to compare with (default: the skill's own)")
    add("grid", cmd_grid, "print the card as a step grid")
    p = add("midi", cmd_midi, "write the card as a type-1 .mid file")
    p.add_argument("-o", "--output", help="output file (default: the card's name .mid); '-' for standard output")
    p.add_argument("--loops", type=int, default=1, help="repeat the longest pattern this many times (default 1)")
    p.add_argument("--channel", type=int, help="MIDI channel 1-16 for every track (default: the group's, A is 1 ... D is 4)")
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")  # type: ignore[attr-defined]
        except (AttributeError, ValueError):
            pass
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
