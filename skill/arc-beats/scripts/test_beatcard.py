#!/usr/bin/env python3
"""Tests for beatcard.py: the spec's reading rules, every error and warning, analyse, midi and grid.

    python3 skill/arc-beats/scripts/test_beatcard.py

Also checks the skill's own files: every card in the references is valid, the
lessons cite key combinations that exist in the generated guide, and SKILL.md
has the frontmatter and size Claude expects.
"""

import io
import os
import re
import struct
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)
REFS = os.path.join(SKILL, "references")
sys.path.insert(0, HERE)

import beatcard as bc  # noqa: E402


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def spec_card():
    """The example card at the top of references/beat-card.md."""
    m = re.search(r"```\n(ARC BEAT.*?)\n```", read(os.path.join(REFS, "beat-card.md")), re.S)
    assert m, "no card in beat-card.md"
    return m.group(1)


def codes(card, level=None):
    return [p.code for p in card.problems if level is None or p.level == level]


def one(text):
    """Parse a card made of [text] under a valid first line."""
    return bc.parse_card("ARC BEAT 1\n" + text)


def kick(steps="X... .... .... ...."):
    return "[A]\nA7 kick | %s |\n" % steps


class SpecExample(unittest.TestCase):
    def setUp(self):
        self.card = bc.parse_card(spec_card())

    def test_reads_clean(self):
        self.assertEqual(self.card.problems, [])
        self.assertEqual((self.card.name, self.card.tempo, self.card.swing), ("Lazy boom bap", 92.0, 58))

    def test_one_pattern(self):
        (p,) = self.card.patterns
        self.assertEqual((p.letter, p.number, p.bars, p.step, p.step_ticks), ("A", None, 1, "1/16", 24))
        self.assertEqual([r.label for r in p.rows], ["A7", "A9", "A4"])
        self.assertEqual([r.name for r in p.rows], ["kick", "snare", "hat"])

    def test_grid_hits_and_swing(self):
        (p,) = self.card.patterns
        kicks = [(h.tick, h.vel) for h in p.hits if h.pad == 9 and h.row is not None]
        # steps 0, 6 and 8 are even, so they are not swung
        self.assertEqual(kicks, [(0, 127), (144, 100), (192, 127)])
        snare = [(h.tick, h.vel, h.gate) for h in p.hits if h.pad == 11 and h.row is not None]
        # the ghost on step 15 is odd: 360 + round(8 * 24 / 50) = 364
        self.assertEqual(snare, [(96, 127, 24), (288, 127, 24), (364, 64, 24)])

    def test_notes_list(self):
        (p,) = self.card.patterns
        listed = [h for h in p.hits if h.row is None]
        by_pad = {h.pad: h for h in listed}
        ghost = by_pad[11]  # A9 at 1.4.4+6 = 288 + 72 + 6
        self.assertEqual((ghost.tick, ghost.vel, ghost.gate, ghost.semi), (366, 50, 24, None))
        keys = by_pad[3]  # A1 note C4 gate 1/8
        self.assertEqual((keys.tick, keys.vel, keys.gate, keys.semi), (0, 127, 48, 0))

    def test_no_double_hits_from_the_example(self):
        (p,) = self.card.patterns
        self.assertEqual(len({(h.pad, h.tick, h.semi) for h in p.hits}), len(p.hits))


class ReadingRules(unittest.TestCase):
    def test_everything_before_the_card_is_ignored(self):
        text = "Here you go!\n\n```\n" + spec_card() + "\n```\nHope you like it.\n"
        card = bc.parse_card(text)
        self.assertTrue(card.ok, card.problems)
        self.assertEqual(card.name, "Lazy boom bap")

    def test_reading_stops_at_a_closing_fence_or_end(self):
        for stop in ("```", "END", "end", "  End  "):
            card = bc.parse_card("ARC BEAT 1\n" + kick() + stop + "\n[A]\nthis would be an error\n")
            self.assertTrue(card.ok, (stop, card.problems))
            self.assertEqual(len(card.patterns), 1)

    def test_reading_stops_at_the_end_of_the_text(self):
        self.assertTrue(bc.parse_card("ARC BEAT 1\n" + kick().rstrip("\n")).ok)

    def test_blank_lines_and_comments(self):
        text = "# a whole-line comment\nARC BEAT 1 # trailing\n\nname Hi # not part of the name\n\n[A] # section\nA7 kick | X... .... .... .... | # row\n"
        card = bc.parse_card(text)
        self.assertTrue(card.ok, card.problems)
        self.assertEqual(card.name, "Hi")

    def test_a_sharp_in_a_note_name_is_not_a_comment(self):
        card = one("[A]\nnotes\nA1 at 1.1.1 note C#4\n")
        self.assertTrue(card.ok, card.problems)
        self.assertEqual(card.patterns[0].hits[0].semi, 1)

    def test_keywords_ignore_case(self):
        card = bc.parse_card("arc beat 1\nNAME Loud\nTEMPO 100\nSwing 60\n[A] BARS 1 STEP 1/16\nA7 | X... .... .... .... |\nNotes\nA9 AT 1.1.1 VEL 5 GATE 1/8T\n")
        self.assertTrue(card.ok, card.problems)
        self.assertEqual((card.name, card.tempo, card.swing), ("Loud", 100.0, 60))
        self.assertEqual(card.patterns[0].hits[-1].gate, 32)

    def test_pad_labels_and_hit_marks_are_case_sensitive(self):
        self.assertIn("bad-pad", codes(one("[A]\na7 | X... .... .... .... |\n")))
        self.assertIn("bad-step-char", codes(one("[A]\nA7 | X... .... .... ...O |\n")))
        self.assertIn("bad-note-name", codes(one("[A]\nnotes\nA1 at 1.1.1 note c4\n")))
        self.assertIn("bad-pad", codes(one("[B]\nnotes\nb7 at 1.1.1\n")))

    def test_all_pad_spellings(self):
        rows = "".join("A%s | X... .... .... .... |\n" % label for label in [".", "0", "E", "ENTER", "1", "2", "3", "4", "5", "6", "7", "8", "9"])
        card = one("[A]\n" + rows)
        self.assertTrue(card.ok, card.problems)
        self.assertEqual(sorted({h.pad for h in card.patterns[0].hits}), list(range(12)))
        self.assertEqual([h.pad for h in card.patterns[0].hits if h.tick == 0][:3], [0, 1, 2])

    def test_pad_offsets(self):
        card = one("[B]\nB. | X |\n".replace("X", "X... .... .... ....") + "B9 | X... .... .... .... |\n")
        self.assertEqual([r.pad for r in card.patterns[0].rows], [0, 11])

    def test_section_pattern_number_is_a_hint(self):
        card = one("[B12] bars 1\nB7 | X... .... .... .... |\n")
        self.assertTrue(card.ok, card.problems)
        self.assertEqual((card.patterns[0].letter, card.patterns[0].number), ("B", 12))

    def test_sound_name_is_free_text(self):
        card = one("[A]\nA7 808 kick (long) - v2 | X... .... .... .... |\n")
        self.assertTrue(card.ok, card.problems)
        self.assertEqual(card.patterns[0].rows[0].name, "808 kick (long) - v2")

    def test_spaces_and_extra_bars_in_steps_are_ignored(self):
        a = one("[A] bars 2\nA7 | X...|....|....|....|....|....|....|.... |\n")
        b = one("[A] bars 2\nA7 | X.......  ........ ........ ........ |\n")
        self.assertTrue(a.ok and b.ok, (a.problems, b.problems))
        self.assertEqual([h.tick for h in a.patterns[0].hits], [h.tick for h in b.patterns[0].hits])

    def test_steps_may_continue_after_the_last_bar_mark(self):
        card = one("[A]\nA7 kick |X... ....| .... ....|\n")
        self.assertTrue(card.ok, card.problems)

    def test_velocity_marks(self):
        card = one("[A]\nA7 | Xxo1 5999 .... .... |\n")
        vels = [h.vel for h in card.patterns[0].hits]
        self.assertEqual(vels, [127, 100, 64, 14, 70, 126, 126, 126])

    def test_two_rows_for_one_pad(self):
        card = one("[A]\nA9 snare | .... X... .... X... |\nA9 ghosts | ..o. .... ..o. .... |\n")
        self.assertTrue(card.ok, card.problems)
        self.assertEqual(len(card.patterns[0].hits), 4)
        self.assertEqual(card.patterns[0].pad_names()[11], "snare")


class Holds(unittest.TestCase):
    def test_a_dash_adds_a_step_to_the_gate(self):
        card = one("[A]\nA7 | X--. x-.. o... .... |\n")
        self.assertTrue(card.ok, card.problems)
        gates = [(h.tick, h.gate) for h in card.patterns[0].hits]
        self.assertEqual(gates, [(0, 72), (96, 48), (192, 24)])

    def test_a_hold_runs_across_a_bar_mark(self):
        card = one("[A] bars 2\nA7 | .... .... .... ...X | -... .... .... .... |\n")
        self.assertTrue(card.ok, card.problems)
        (hit,) = card.patterns[0].hits
        self.assertEqual((hit.tick, hit.gate), (360, 48))

    def test_holds_use_the_step_size(self):
        card = one("[A] step 1/8\nA7 | X-.. .... |\n")
        self.assertEqual(card.patterns[0].hits[0].gate, 96)

    def test_a_dash_after_a_rest_is_an_error(self):
        card = one("[A]\nA7 | X.-. .... .... .... |\n")
        self.assertEqual(codes(card, bc.ERROR), ["orphan-hold"])
        self.assertEqual(card.errors[0].line, 3)

    def test_a_dash_at_the_start_is_an_error(self):
        self.assertIn("orphan-hold", codes(one("[A]\nA7 | -... .... .... .... |\n")))


class Swing(unittest.TestCase):
    def ticks(self, swing, step, steps, group="A"):
        card = one("swing %d\n[%s] step %s\n%s7 | %s |\n" % (swing, group, step, group, steps))
        self.assertTrue(card.ok, card.problems)
        return [h.tick for h in card.patterns[0].hits]

    def test_straight_by_default(self):
        self.assertEqual(self.ticks(50, "1/16", "xxxx xxxx xxxx xxxx"), [24 * i for i in range(16)])

    def test_odd_sixteenths_play_late(self):
        t = self.ticks(66, "1/16", "xxxx xxxx xxxx xxxx")
        # round((66 - 50) * 24 / 50) = round(7.68) = 8
        self.assertEqual(t[:4], [0, 32, 48, 80])

    def test_odd_eighths_play_late(self):
        t = self.ticks(75, "1/8", "xxxx xxxx")
        self.assertEqual(t[:4], [0, 48 + 24, 96, 144 + 24])

    def test_75_is_half_a_step(self):
        t = self.ticks(75, "1/16", "xxxx xxxx xxxx xxxx")
        self.assertEqual(t[1], 24 + 12)

    def test_other_steps_never_swing(self):
        self.assertEqual(self.ticks(70, "1/32", "x" * 32)[1], 12)
        self.assertEqual(self.ticks(70, "1/8T", "x" * 12)[1], 32)
        self.assertEqual(self.ticks(70, "1/16T", "x" * 24)[1], 16)

    def test_notes_list_is_never_swung(self):
        card = one("swing 70\n[A]\nA7 | .... .... .... .... |\nnotes\nA7 at 1.1.2\n")
        self.assertEqual(card.patterns[0].hits[0].tick, 24)

    def test_the_offset_is_the_ticks_rule(self):
        for step, ticks in (("1/8", 48), ("1/16", 24)):
            for swing in range(50, 76):
                want = ((swing - 50) * ticks + 25) // 50
                self.assertEqual(bc.swing_offset(step, 1, swing), want)
                self.assertEqual(bc.swing_offset(step, 2, swing), 0)

    def test_swing_without_swung_rows_is_not_a_problem(self):
        card = one("swing 60\n[A] step 1/32\nA7 | " + "x" + "." * 31 + " |\n")
        self.assertEqual(card.problems, [])
        self.assertEqual(card.patterns[0].hits[0].tick, 0)


class NotesList(unittest.TestCase):
    def note(self, line, bars=1):
        card = one("[A] bars %d\nnotes\n%s\n" % (bars, line))
        return card, (card.patterns[0].hits[0] if card.patterns and card.patterns[0].hits else None)

    def test_defaults(self):
        card, h = self.note("A5 at 1.1.1")
        self.assertTrue(card.ok, card.problems)
        self.assertEqual((h.pad, h.tick, h.vel, h.gate, h.semi), (7, 0, 127, 24, None))

    def test_at_counts_from_one(self):
        self.assertEqual(self.note("A5 at 1.1.1")[1].tick, 0)
        self.assertEqual(self.note("A5 at 1.2.1")[1].tick, 96)
        self.assertEqual(self.note("A5 at 1.4.4")[1].tick, 360)
        self.assertEqual(self.note("A5 at 2.1.1", bars=2)[1].tick, 384)

    def test_offsets(self):
        self.assertEqual(self.note("A5 at 1.2.3+8")[1].tick, 152)
        self.assertEqual(self.note("A5 at 1.2.3-8")[1].tick, 136)

    def test_absolute_tick(self):
        self.assertEqual(self.note("A5 t 383")[1].tick, 383)

    def test_vel_and_gate_names(self):
        for name, ticks in (("1/4", 96), ("1/8", 48), ("1/16", 24), ("1/32", 12), ("1/8T", 32), ("1/16T", 16), ("100", 100)):
            card, h = self.note("A5 at 1.1.1 vel 5 gate %s" % name)
            self.assertTrue(card.ok, card.problems)
            self.assertEqual((h.vel, h.gate), (5, ticks))

    def test_any_order(self):
        card, h = self.note("A5 note E3 gate 1/8 vel 90 at 1.3.1")
        self.assertTrue(card.ok, card.problems)
        self.assertEqual((h.tick, h.vel, h.gate, h.semi), (192, 90, 48, -8))

    def test_note_names_are_midi_with_c4_at_60(self):
        for name, semi in (("C4", 0), ("C5", 12), ("C#4", 1), ("A3", -3), ("C-1", -60), ("G9", 67), ("C3", -12), ("D#2", -21)):
            card, h = self.note("A1 at 1.1.1 note %s" % name)
            self.assertTrue(card.ok, (name, card.problems))
            self.assertEqual(h.semi, semi, name)

    def test_semi(self):
        self.assertEqual(self.note("A1 at 1.1.1 semi -12")[1].semi, -12)
        self.assertEqual(self.note("A1 at 1.1.1 semi 7")[1].semi, 7)
        self.assertEqual(self.note("A1 at 1.1.1 semi +7")[1].semi, 7)

    def test_keys_note_and_pad_hit_on_one_tick_are_different(self):
        card = one("[A]\nA1 | X... .... .... .... |\nnotes\nA1 at 1.1.1 note C4\nA1 at 1.1.1 note E4\n")
        self.assertTrue(card.ok, card.problems)
        self.assertEqual(len(card.patterns[0].hits), 3)
        self.assertEqual(codes(card), [])

    def test_a_notes_only_section_is_fine(self):
        card = one("[B]\nnotes\nB7 at 1.1.1 note C2\n")
        self.assertTrue(card.ok, card.problems)


class Errors(unittest.TestCase):
    """Every error code the reader can give, with a card that gives it."""

    CASES = {
        "no-card": "just some words\nno card\n",
        "bad-version": "ARC BEAT\n",
        "newer-version": "ARC BEAT 2\n" + kick(),
        "missing-value": "ARC BEAT 1\n[A]\nnotes\nA7 at 1.1.1 vel\n",
        "bad-tempo": "ARC BEAT 1\ntempo 39\n" + kick(),
        "bad-swing": "ARC BEAT 1\nswing 76\n" + kick(),
        "bad-section": "ARC BEAT 1\n[E]\nA7 | X |\n",
        "bad-pattern-number": "ARC BEAT 1\n[A100]\n" + "A7 | X... .... .... .... |\n",
        "duplicate-group": "ARC BEAT 1\n" + kick() + kick(),
        "bad-bars": "ARC BEAT 1\n[A] bars 0\nA7 | X |\n",
        "bad-step": "ARC BEAT 1\n[A] step 1/4\nA7 | X |\n",
        "bad-pad": "ARC BEAT 1\n[A]\nA10 | X... .... .... .... |\n",
        "wrong-group": "ARC BEAT 1\n[A]\nB7 | X... .... .... .... |\n",
        "bad-step-char": "ARC BEAT 1\n[A]\nA7 | X... ?... .... .... |\n",
        "step-count": "ARC BEAT 1\n[A]\nA7 | X... .... .... ... |\n",
        "orphan-hold": "ARC BEAT 1\n[A]\nA7 | X... ..-. -... .... |\n",
        "bad-line": "ARC BEAT 1\n[A]\nA7 kick X... .... .... ....\n",
        "row-outside-section": "ARC BEAT 1\nA7 | X... .... .... .... |\n",
        "notes-outside-section": "ARC BEAT 1\nnotes\n" + kick(),
        "note-no-time": "ARC BEAT 1\n[A]\nnotes\nA7 vel 5\n",
        "note-two-times": "ARC BEAT 1\n[A]\nnotes\nA7 at 1.1.1 t 0\n",
        "bad-at": "ARC BEAT 1\n[A]\nnotes\nA7 at 1.1\n",
        "bad-tick": "ARC BEAT 1\n[A]\nnotes\nA7 t -4\n",
        "bad-vel": "ARC BEAT 1\n[A]\nnotes\nA7 at 1.1.1 vel 128\n",
        "bad-gate": "ARC BEAT 1\n[A]\nnotes\nA7 at 1.1.1 gate 1/2\n",
        "bad-note-name": "ARC BEAT 1\n[A]\nnotes\nA7 at 1.1.1 note H4\n",
        "bad-semi": "ARC BEAT 1\n[A]\nnotes\nA7 at 1.1.1 semi 128\n",
        "note-and-semi": "ARC BEAT 1\n[A]\nnotes\nA7 at 1.1.1 note C4 semi 0\n",
        "note-out-of-pattern": "ARC BEAT 1\n[A]\nnotes\nA7 t 384\n",
        "too-many-notes": "ARC BEAT 1\n[A] bars 8\nnotes\n" + "".join("A7 t %d\n" % t for t in range(0, 1025))
        + "".join("A8 t %d\n" % t for t in range(0, 1025)),
        "no-sections": "ARC BEAT 1\nname Nothing here\n",
    }

    def test_every_case_gives_its_error(self):
        for code, text in self.CASES.items():
            card = bc.parse_card(text)
            self.assertFalse(card.ok, code)
            self.assertIn(code, codes(card, bc.ERROR), (code, card.problems))

    def test_every_error_the_reader_can_give_is_covered(self):
        source = read(os.path.join(HERE, "beatcard.py"))
        used = set(re.findall(r"self\.(?:err|skipped)\([^,]+,\s*\"([a-z-]+)\"", source))
        self.assertTrue(used)
        self.assertEqual(sorted(used - set(self.CASES)), [])

    def test_problems_carry_line_numbers(self):
        card = bc.parse_card("intro\nARC BEAT 1\ntempo 500\n[A]\nA7 | X |\n")
        self.assertEqual([(p.line, p.code) for p in card.errors], [(3, "bad-tempo"), (5, "step-count")])
        self.assertEqual(str(card.errors[0]), "line 3: error: " + card.errors[0].message)

    def test_step_count_names_the_row_and_the_bar(self):
        card = one("[A] bars 2\nA7 kick | X... .... .... .... | X... .... ... |\n")
        (p,) = card.errors
        self.assertEqual(p.code, "step-count")
        self.assertIn("A7", p.message)
        self.assertIn("bar 2 has 11", p.message)
        card = one("[A] bars 2\nA7 | X... .... .... .... X... .... .... ... |\n")
        self.assertIn("A7", card.errors[0].message)
        self.assertIn("bar 2", card.errors[0].message)
        card = one("[A]\nA7 | X... .... .... .... .... |\n")
        self.assertIn("bar 1 has 20", card.errors[0].message)
        card = one("[A] bars 2\nA7 | X... .... .... .... .... .... .... .... .... |\n")
        self.assertIn("4 too many", card.errors[0].message)
        card = one("[A] bars 2\nA7 | X... .... .... .... .... .... |\n")
        self.assertIn("bar 2 is short", card.errors[0].message)

    def test_step_count_follows_the_step(self):
        self.assertTrue(one("[A] step 1/8\nA7 | X... .... |\n").ok)
        self.assertTrue(one("[A] step 1/32\nA7 | " + "X" + "." * 31 + " |\n").ok)
        self.assertTrue(one("[A] step 1/16T\nA7 | " + "X" + "." * 23 + " |\n").ok)
        self.assertTrue(one("[A] step 1/8T\nA7 | " + "X" + "." * 11 + " |\n").ok)
        self.assertIn("step-count", codes(one("[A] step 1/8\nA7 | X... .... .... .... |\n")))

    def test_the_limits_are_inclusive(self):
        self.assertTrue(one("tempo 40\n" + kick()).ok)
        self.assertTrue(one("tempo 240\n" + kick()).ok)
        self.assertTrue(one("tempo 92.5\n" + kick()).ok)
        self.assertIn("bad-tempo", codes(one("tempo 92.55\n" + kick())))
        self.assertTrue(one("swing 50\n" + kick()).ok)
        self.assertTrue(one("swing 75\n" + kick()).ok)
        self.assertIn("bad-swing", codes(one("swing 49\n" + kick())))
        self.assertTrue(one("name " + "x" * 40 + "\n" + kick()).ok)
        self.assertTrue(one("[A99] bars 99\nA7 | " + "X... .... .... ...." * 99 + " |\n").ok)
        self.assertIn("bad-bars", codes(one("[A] bars 100\nA7 | X |\n")))

    def test_exactly_2048_notes_is_fine(self):
        text = "[A] bars 8\nnotes\n" + "".join("A7 t %d\n" % t for t in range(1024)) + "".join("A8 t %d\n" % t for t in range(1024))
        self.assertTrue(one(text).ok)

    def test_a_bad_section_does_not_cascade(self):
        card = one("[Z]\nA7 | X... .... .... .... |\nnotes\nA7 at 1.1.1\n[B]\nB7 | X... .... .... .... |\n")
        self.assertEqual(codes(card, bc.ERROR), ["bad-section"])

    def test_newer_version_message(self):
        card = bc.parse_card("ARC BEAT 7\n")
        self.assertIn("made by a newer Arc", card.errors[0].message)


class Warnings(unittest.TestCase):
    def test_unknown_header_word(self):
        card = one("groove funky\n" + kick())
        self.assertTrue(card.ok)
        self.assertEqual(codes(card), ["unknown-header"])

    def test_unknown_section_option(self):
        card = one("[A] bars 1 colour red\nA7 | X... .... .... .... |\n")
        self.assertTrue(card.ok, card.problems)
        self.assertEqual(codes(card), ["unknown-option"])
        self.assertEqual(card.patterns[0].bars, 1)

    def test_unknown_option_does_not_swallow_a_known_one(self):
        card = one("[A] shine step 1/8\nA7 | X... .... |\n")
        self.assertTrue(card.ok, card.problems)
        self.assertEqual(card.patterns[0].step, "1/8")

    def test_two_hits_on_one_pad_and_tick_count_as_one_the_louder_stays(self):
        card = one("[A]\nA7 | x... .... .... .... |\nnotes\nA7 at 1.1.1 vel 120\n")
        self.assertTrue(card.ok)
        self.assertEqual(codes(card), ["duplicate-hit"])
        (hit,) = card.patterns[0].hits
        self.assertEqual(hit.vel, 120)
        card = one("[A]\nA7 | X... .... .... .... |\nnotes\nA7 t 0 vel 10\n")
        self.assertEqual(card.patterns[0].hits[0].vel, 127)

    def test_two_rows_on_one_pad_can_double_too(self):
        card = one("[A]\nA7 | X... .... .... .... |\nA7 | o... .... .... .... |\n")
        self.assertEqual(codes(card), ["duplicate-hit"])

    def test_late_header(self):
        card = one(kick() + "tempo 120\n")
        self.assertEqual(codes(card), ["late-header"])
        self.assertIsNone(card.tempo)

    def test_unknown_word_in_a_section(self):
        card = one("[A]\nfoo bar\nA7 | X... .... .... .... |\n")
        self.assertTrue(card.ok, card.problems)
        self.assertEqual([(p.line, p.code) for p in card.problems], [(3, "unknown-word")])
        self.assertEqual(len(card.patterns[0].hits), 1)

    def test_empty_name_is_ignored(self):
        card = one("name\n" + kick())
        self.assertTrue(card.ok, card.problems)
        self.assertEqual(codes(card), ["empty-name"])
        self.assertEqual(card.name, "")

    def test_long_name_is_shortened(self):
        card = one("name " + "x" * 41 + "\n" + kick())
        self.assertTrue(card.ok, card.problems)
        self.assertEqual(codes(card), ["long-name"])
        self.assertEqual(card.name, "x" * 40)
        card = one("name " + "x" * 39 + " yyy\n" + kick())
        self.assertEqual(card.name, "x" * 39)

    def test_a_long_name_is_counted_and_cut_by_characters(self):
        emoji = "\U0001F600"
        card = one("name a" + emoji * 20 + "\n" + kick())
        self.assertEqual(codes(card), [])
        self.assertEqual(card.name, "a" + emoji * 20)
        card = one("name a" + emoji * 40 + "\n" + kick())
        self.assertEqual(codes(card), ["long-name"])
        self.assertEqual(card.name, "a" + emoji * 39)

    def test_unknown_note_option_is_skipped(self):
        card = one("[A]\nnotes\nA7 at 1.1.1 velocity 5\n")
        self.assertTrue(card.ok, card.problems)
        self.assertEqual([(p.line, p.code) for p in card.problems], [(4, "unknown-note-option")])
        (hit,) = card.patterns[0].hits
        self.assertEqual(hit.vel, 127)
        card = one("[A]\nnotes\nA7 at 1.1.1 velocity 5 vel 50 loud\n")
        self.assertEqual(codes(card), ["unknown-note-option", "unknown-note-option"])
        self.assertEqual(card.patterns[0].hits[0].vel, 50)

    def test_a_repeated_note_option_keeps_the_later_value(self):
        card = one("[A]\nnotes\nA7 at 1.1.1 vel 50 vel 60\n")
        self.assertTrue(card.ok, card.problems)
        self.assertEqual(card.problems, [])
        self.assertEqual(card.patterns[0].hits[0].vel, 60)
        card = one("[A]\nnotes\nA7 at 1.1.1 at 1.2.1\n")
        self.assertEqual(card.patterns[0].hits[0].tick, 96)

    def test_a_second_notes_line_changes_nothing(self):
        card = one("[A]\nnotes\nA7 at 1.1.1\nnotes\nA7 at 1.2.1\n")
        self.assertTrue(card.ok, card.problems)
        self.assertEqual(card.problems, [])
        self.assertEqual(len(card.patterns[0].hits), 2)

    def test_the_duplicate_group_section_is_read_for_its_problems(self):
        card = one(kick() + "[A]\nA7 | X... .... .... ... |\n")
        self.assertEqual([(p.line, p.code) for p in card.errors], [(4, "duplicate-group"), (5, "step-count")])
        self.assertEqual(len(card.patterns), 1)

    def test_every_warning_is_covered(self):
        source = read(os.path.join(HERE, "beatcard.py"))
        used = set(re.findall(r"self\.warn\([^,]+,\s*\"([a-z-]+)\"", source))
        test_source = read(os.path.abspath(__file__))
        self.assertTrue(used)
        for code in used:
            self.assertIn('"%s"' % code, test_source, code)


class ReadsLikeArc(unittest.TestCase):
    """Cards Arc's reader (BeatCard.kt, beatCard.ts) reads or refuses one way, and so does the script."""

    def test_the_card_start_allows_blanks_and_any_gap(self):
        for first in ("ARC BEAT 1", "  ARC BEAT 1", "ARC  BEAT 1", "ARC\tBEAT 1", "ARC\u00a0BEAT 1", "\tarc beat 1", "ARC BEAT 1 extra"):
            card = bc.parse_card(first + "\n" + kick())
            self.assertTrue(card.ok, (first, card.problems))
        self.assertIn("no-card", codes(bc.parse_card("ARC BEAT1\n" + kick())))
        self.assertIn("bad-version", codes(bc.parse_card("ARC BEAT\n" + kick())))
        self.assertIn("bad-version", codes(bc.parse_card("ARC BEAT 1x\n" + kick())))

    def test_note_names_are_the_ones_arc_writes(self):
        for name, midi in (("C-1", 0), ("C4", 60), ("C#4", 61), ("B3", 59), ("G9", 127)):
            self.assertEqual(bc.parse_note_name(name), midi, name)
        for name in ("B#3", "E#4", "Cb4", "c4", "G#9", "C10", "H4"):
            self.assertIsNone(bc.parse_note_name(name), name)
        self.assertIn("bad-note-name", codes(one("[A]\nnotes\nA1 at 1.1.1 note B#3\n")))

    def test_the_beat_and_the_sixteenth_stop_at_four(self):
        for at in ("1.5.1", "1.1.5", "1.0.1", "0.1.1"):
            card = one("[A] bars 2\nnotes\nA7 at %s\n" % at)
            self.assertEqual(codes(card, bc.ERROR), ["bad-at"], at)
        card = one("[A] bars 2\nnotes\nA7 at 2.4.4+23\n")
        self.assertTrue(card.ok, card.problems)
        self.assertEqual(card.patterns[0].hits[0].tick, 767)

    def test_a_pattern_number_has_one_or_two_digits(self):
        self.assertTrue(one("[A07]\nA7 | X... .... .... .... |\n").ok)
        self.assertEqual(one("[A07]\nA7 | X... .... .... .... |\n").patterns[0].number, 7)
        for tag in ("[A007]", "[A00]", "[A100]"):
            self.assertFalse(one(tag + "\nA7 | X... .... .... .... |\n").ok, tag)

    def test_a_pad_line_without_a_bar_is_an_error(self):
        card = one("A7 kick\n" + kick())
        self.assertEqual([(p.line, p.code) for p in card.errors], [(2, "row-outside-section")])
        card = one("[A]\nA7 kick X... .... .... ....\n")
        self.assertEqual([(p.line, p.code) for p in card.errors], [(3, "bad-line")])

    def test_numbers_are_written_in_ascii_digits_of_sane_length(self):
        self.assertIn("bad-tempo", codes(one("tempo 0092\n" + kick())))
        self.assertIn("bad-swing", codes(one("swing 0060\n" + kick())))
        self.assertIn("bad-tempo", codes(one("tempo 92 100\n" + kick())))
        self.assertIn("bad-gate", codes(one("[A]\nnotes\nA7 at 1.1.1 gate 1234567890\n")))
        self.assertIn("bad-tick", codes(one("[A]\nnotes\nA7 t \u0661\n")))

    def test_only_cr_lf_and_crlf_end_a_line(self):
        for odd in ("\x0b", "\x0c", "\x1c", "\x1d", "\x1e", "\x85", "\u2028", "\u2029"):
            card = bc.parse_card("ARC BEAT 1\ntempo 500" + odd + "\nswing 99\r\ntempo 20\r" + kick() + "A7 | X |\n")
            self.assertEqual([p.line for p in card.errors], [2, 3, 4, 7], repr(odd))

    def test_a_card_without_a_section_is_reported_at_its_first_line(self):
        card = bc.parse_card("intro\nARC BEAT 1\nname Hi\n\n\n")
        self.assertEqual([(p.line, p.code) for p in card.errors], [(2, "no-sections")])

    def test_a_section_line_with_a_wrong_option_is_skipped(self):
        card = one("[A] bars 0\nA7 | X |\nnotes\nA7 at 1.1.1\n")
        self.assertEqual([(p.line, p.code) for p in card.errors], [(2, "bad-bars")])

    def test_a_byte_order_mark_is_ignored(self):
        self.assertTrue(bc.parse_card("\ufeffARC BEAT 1\n" + kick()).ok)


ASSUMED = """ARC BEAT 1
tempo 120
[A] bars 2
A7 | X... X... X... X... | X... X... X... X... |
A9 | .... X... .... X... | .... X... .... X... |
A4 | .o.o .o.o .o.o .o.o | .o.o .o.o .o.o .o.o |
"""


class Analyse(unittest.TestCase):
    def setUp(self):
        self.card = bc.parse_card(spec_card())
        self.report = bc.analyse_card(self.card, bc.load_recipes(os.path.join(REFS, "genres.md")))
        self.p = self.report["patterns"][0]

    def test_totals(self):
        r = self.report
        self.assertEqual((r["name"], r["tempo"], r["swing"], r["groups"]), ("Lazy boom bap", 92.0, 58, ["A"]))
        self.assertEqual((r["pad_hits"], r["keys_notes"]), (16, 1))
        self.assertEqual(r["velocity"]["min"], 50)
        self.assertEqual(r["velocity"]["max"], 127)

    def test_hits_for_each_pad(self):
        pads = self.p["pads"]
        self.assertEqual({k: v["hits"] for k, v in pads.items()}, {"A7": 3, "A9": 4, "A4": 9})
        self.assertEqual(pads["A7"]["name"], "kick")
        self.assertEqual(pads["A7"]["role"], "kick")
        self.assertFalse(pads["A7"]["name_assumed"])
        self.assertEqual(pads["A4"]["per_bar"], [9])

    def test_pads_come_in_keypad_order(self):
        self.assertEqual(list(self.p["pads"]), ["A7", "A9", "A4"])

    def test_density_per_bar(self):
        self.assertEqual(self.p["hits_per_bar"], [16])
        # 9 hat slots + kick on 0 (shared), 6, 8 + snare on 4, 12, 15 -> distinct slots
        self.assertEqual(self.p["density_pct"], 56.2)

    def test_velocity_spread(self):
        v = self.p["pads"]["A9"]["velocity"]
        self.assertEqual((v["min"], v["max"], v["distinct"]), (50, 127, 3))
        self.assertEqual((v["ghosts"], v["accents"]), (2, 2))
        h = self.p["pads"]["A4"]["velocity"]
        self.assertEqual((h["min"], h["max"], h["ghosts"]), (64, 100, 1))
        self.assertEqual(self.p["pads"]["A7"]["velocity"]["stdev"], 12.7)

    def test_swing(self):
        s = self.p["swing"]
        self.assertEqual((s["header"], s["applies"]), (58, True))
        self.assertEqual(s["measured"], 58.3)
        self.assertEqual(s["swung_hits"], 2)

    def test_slots_by_role(self):
        roles = self.p["roles"]
        self.assertEqual(roles["kick"]["slots"], "x.....x.x.......")
        self.assertEqual(roles["snare"]["slots"], "....x.......x..x")
        self.assertEqual(roles["hat"]["slots"], "x.x.x.x.x.x.x.xx")
        self.assertEqual(roles["kick"]["positions"], ["1.1.1", "1.2.3", "1.3.1"])

    def test_longest_gap(self):
        gap = self.p["pads"]["A7"]["longest_gap"]
        self.assertEqual((gap["steps"], gap["ticks"], gap["after"]), (8.0, 192, "1.3.1"))
        self.assertEqual(self.p["longest_gap"]["steps"], 2.0)

    def test_syncopation(self):
        by_pad = self.p["syncopation"]["by_pad"]
        # the kick's hits all lead into a hit or a rest no stronger than themselves
        self.assertEqual(by_pad["A7"], 0.0)
        # the ghost snare on the last sixteenth waits for the downbeat: 4 - 1
        self.assertEqual(by_pad["A9"], 3.0)
        self.assertEqual(by_pad["A4"], 0.0)  # hats are not counted in the score
        self.assertEqual(self.p["syncopation"]["counted_pads"], ["A7", "A9"])
        self.assertEqual(self.p["syncopation"]["score"], 3.0)
        self.assertEqual(self.p["syncopation"]["label"], "some syncopation")

    def test_syncopation_of_known_figures(self):
        def score(slots, bars=1):
            return bc.syncopation([set(s) for s in slots])
        self.assertEqual(score([[0, 4, 8, 12]]), 0.0)
        # offbeats: 2, 6 and 10 each wait for a beat; 14 waits for the downbeat of the bar
        self.assertEqual(score([[2, 6, 10, 14]]), 5.0)
        self.assertEqual(score([[0, 3, 6, 10, 13]]), 5.0)
        self.assertEqual(score([[0, 4, 8, 12], [0, 4, 8, 12, 14]]), 0.0)
        self.assertEqual(score([[0, 8], [0, 8]]), 0.0)

    def test_features(self):
        f = self.p["features"]
        self.assertIn("backbeat (snare or clap on 2 and 4)", f)
        self.assertIn("ghost notes", f)
        self.assertFalse(any("four on the floor" in x for x in f))
        self.assertTrue(any(x.startswith("swung") for x in f))

    def test_keys_are_reported_apart(self):
        k = self.p["keys"]["A1"]
        self.assertEqual((k["notes"], k["lowest"], k["highest"], k["distinct_pitches"]), (1, "C4", "C4", 1))

    def test_variation(self):
        self.assertTrue(self.p["variation"]["identical_bars"])
        r = bc.analyse_card(bc.parse_card(ASSUMED))["patterns"][0]
        self.assertTrue(r["variation"]["identical_bars"])
        self.assertEqual(r["variation"]["distinct_bars"], 1)
        fill = bc.parse_card(ASSUMED.replace("A9 | .... X... .... X... | .... X... .... X... |", "A9 | .... X... .... X... | .... X... X.X. XXXX |"))
        rf = bc.analyse_card(fill)["patterns"][0]
        self.assertEqual(rf["variation"]["distinct_bars"], 2)
        self.assertTrue(rf["variation"]["last_bar_busier"])

    def test_pads_without_names_use_the_assumed_kit(self):
        r = bc.analyse_card(bc.parse_card(ASSUMED))["patterns"][0]
        self.assertEqual(r["pads"]["A7"]["role"], "kick")
        self.assertTrue(r["pads"]["A7"]["name_assumed"])
        self.assertEqual(r["pads"]["A9"]["role"], "snare")
        self.assertIn("four on the floor", r["features"])

    def test_other_groups_have_no_assumed_names(self):
        card = bc.parse_card("ARC BEAT 1\n[B]\nB7 | X... .... .... .... |\n")
        r = bc.analyse_card(card)["patterns"][0]
        self.assertIsNone(r["pads"]["B7"]["role"])

    def test_closest_recipe(self):
        top = self.report["similar_to"]
        self.assertEqual(len(top), 3)
        self.assertEqual(top[0]["genre"], "Boom bap")
        self.assertGreaterEqual(top[0]["score"], 80)
        self.assertEqual(top[0]["tempo"], "tempo in range")

    def test_every_recipe_is_closest_to_itself(self):
        recipes = bc.load_recipes(os.path.join(REFS, "genres.md"))
        self.assertGreaterEqual(len(recipes), 14)
        for heading, _before, text in bc.split_cards(read(os.path.join(REFS, "genres.md"))):
            top = bc.similarity(bc.parse_card(text), recipes, 1)
            self.assertEqual((top[0]["genre"], top[0]["score"]), (heading, 100), heading)

    def test_a_half_speed_tempo_ranks_below_one_in_range(self):
        # A lo-fi beat at 80: Footwork (about 160) fits only at double speed, so lo-fi stays well ahead and the note says why.
        recipes = bc.load_recipes(os.path.join(REFS, "genres.md"))
        card = bc.parse_card("ARC BEAT 1\ntempo 80\nswing 62\n[A] bars 2\n"
                             "A7 kick | 8... ..6. ..7. .... | 8... ..6. .... .5.. |\n"
                             "A9 snare | .... 7... .... 7..3 | .... 7... ..3. 7.3. |\n"
                             "A4 closed hat | 5.3. 5.3. 5.3. 5.3. | 5.3. 5.3. 5.3. 5.4. |\n")
        top = bc.similarity(card, recipes, 16)
        self.assertEqual(top[0]["genre"], "Lo-fi")
        by = {s["genre"]: s for s in top}
        self.assertGreaterEqual(top[0]["score"] - by["Footwork"]["score"], 15)
        self.assertEqual(by["Footwork"]["tempo"], "tempo in range at double speed")

    def test_report_names_hits_by_bar_and_keys_only_groups(self):
        card = bc.parse_card("ARC BEAT 1\n[A] bars 2\nA7 kick | X... X... X... X... | X... X... X.X. X.X. |\n"
                             "[C] bars 2\nnotes\nC7 at 1.1.1 note A3 gate 384\nC7 at 2.1.1 note F3 gate 384\n")
        text = bc.render_analysis(bc.analyse_card(card))
        self.assertIn("10 pad hits (by bar: 4, 6)", text)
        self.assertIn("[C] 2 bars, step 1/16, KEYS notes only", text)
        self.assertNotIn("[C] 2 bars, step 1/16, 0 pad hits", text)
        same = bc.render_analysis(bc.analyse_card(bc.parse_card(ASSUMED)))
        self.assertRegex(same, r"pad hits \(\d+ a bar\)")

    def test_role_names(self):
        for name, role in (("kick", "kick"), ("BD 2", "kick"), ("bass drum", "kick"), ("snare", "snare"), ("SD", "snare"),
                           ("clap", "clap"), ("closed hat", "hat"), ("open hi-hat", "hat"), ("HH", "hat"), ("crash", "cymbal"),
                           ("rim", "rim"), ("tom low", "tom"), ("shaker", "perc"), ("808 bass", "bass"), ("pad", None)):
            self.assertEqual(bc.role_of(name), role, name)

    def test_json_fields_are_plain_data(self):
        import json
        text = json.dumps(self.report)
        self.assertIn('"density_pct"', text)

    def test_text_report_mentions_the_main_things(self):
        text = bc.render_analysis(self.report)
        for word in ("density", "velocity", "swing", "syncopation", "longest gap", "features", "closest genre recipes", "Boom bap"):
            self.assertIn(word, text)


class Grid(unittest.TestCase):
    def test_grid_shows_rows_in_keypad_order(self):
        text = bc.render_grid(bc.parse_card(spec_card()))
        lines = text.splitlines()
        self.assertTrue(lines[0].startswith("Lazy boom bap"))
        rows = [l for l in lines if l.startswith("A")]
        self.assertEqual([r.split()[0] for r in rows], ["A7", "A9", "A4"])
        self.assertIn("X... ..x. X... ....", text)
        self.assertIn("notes (off the grid or KEYS)", text)
        self.assertIn("KEYS C4", text)

    def test_grid_shows_holds_and_bars(self):
        text = bc.render_grid(one("[A] bars 2\nA7 | X--. .... .... .... | x... .... .... .... |\n"))
        self.assertIn("X--. .... .... .... | x... .... .... ....", text)

    def test_grid_round_trips_a_card_without_notes(self):
        card = one("[A]\nA7 kick | X.o. 5--. ..x. .... |\n")
        again = bc.render_grid(card)
        self.assertIn("X.o. 5--. ..x. ....", again)


def read_smf(data):
    """(format, ntracks, division, tracks) with each track a list of (abs tick, kind, args)."""
    assert data[:4] == b"MThd"
    length, fmt, ntrks, division = struct.unpack(">IHHH", data[4:14])
    assert length == 6
    pos, tracks = 14, []
    for _ in range(ntrks):
        assert data[pos:pos + 4] == b"MTrk"
        (size,) = struct.unpack(">I", data[pos + 4:pos + 8])
        body, pos = data[pos + 8:pos + 8 + size], pos + 8 + size
        i, tick, events = 0, 0, []
        while i < len(body):
            delta = 0
            while True:
                b = body[i]
                i += 1
                delta = (delta << 7) | (b & 0x7F)
                if not b & 0x80:
                    break
            tick += delta
            status = body[i]
            if status == 0xFF:
                kind, n = body[i + 1], body[i + 2]
                events.append((tick, "meta", (kind, body[i + 3:i + 3 + n])))
                i += 3 + n
            else:
                events.append((tick, "on" if status & 0xF0 == 0x90 else "off", (status & 0x0F, body[i + 1], body[i + 2])))
                i += 3
        tracks.append(events)
    return fmt, ntrks, division, tracks


class Midi(unittest.TestCase):
    def setUp(self):
        self.card = bc.parse_card(spec_card())
        self.data = bc.card_to_midi(self.card)

    def test_header(self):
        self.assertEqual(self.data[:4], b"MThd")
        self.assertEqual(self.data[4:8], b"\x00\x00\x00\x06")
        fmt, ntrks, division, _ = read_smf(self.data)
        self.assertEqual((fmt, division), (1, 96))
        self.assertEqual(ntrks, 3)  # tempo, A pads, A keys

    def test_tempo_and_signature(self):
        _, _, _, tracks = read_smf(self.data)
        metas = {kind: body for tick, what, (kind, body) in tracks[0] if what == "meta"}
        self.assertEqual(int.from_bytes(metas[0x51], "big"), round(60_000_000 / 92))
        self.assertEqual(metas[0x58], bytes([4, 2, 24, 8]))
        self.assertEqual(metas[0x03], b"Lazy boom bap")

    def test_pads_use_the_ep133_note_map(self):
        _, _, _, tracks = read_smf(self.data)
        ons = [(t, a) for t, what, a in tracks[1] if what == "on"]
        # A7 is offset 9 of group A: 36 + 9 = 45; A9 is offset 11: 47; A4 is offset 6: 42
        self.assertEqual({a[1] for t, a in ons}, {45, 47, 42})
        self.assertEqual({a[0] for t, a in ons}, {0})  # channel 1
        self.assertIn((0, (0, 45, 127)), ons)
        self.assertIn((144, (0, 45, 100)), ons)
        self.assertIn((364, (0, 47, 64)), ons)

    def test_keys_notes_are_on_a_track_of_their_own(self):
        _, _, _, tracks = read_smf(self.data)
        ons = [(t, a) for t, what, a in tracks[2] if what == "on"]
        self.assertEqual(ons, [(0, (0, 60, 127))])
        offs = [t for t, what, a in tracks[2] if what == "off"]
        self.assertEqual(offs, [48])

    def test_group_notes_and_channels(self):
        card = bc.parse_card("ARC BEAT 1\n[B]\nB. | X... .... .... .... |\n[D]\nDENTER | X... .... .... .... |\n")
        _, ntrks, _, tracks = read_smf(bc.card_to_midi(card))
        self.assertEqual(ntrks, 3)
        notes = [(a[0], a[1]) for tr in tracks[1:] for t, what, a in tr if what == "on"]
        self.assertEqual(notes, [(1, 48), (3, 74)])  # B. is 36 + 12; DENTER is 36 + 36 + 2
        _, _, _, forced = read_smf(bc.card_to_midi(card, channel=10))
        self.assertEqual({a[0] for tr in forced[1:] for t, what, a in tr if what == "on"}, {9})

    def test_gates_and_note_offs(self):
        card = one("tempo 120\n[A]\nA7 | X-.. .... .... .... |\n")
        _, _, _, tracks = read_smf(bc.card_to_midi(card))
        self.assertEqual([(t, what) for t, what, a in tracks[1] if what in ("on", "off")], [(0, "on"), (48, "off")])

    def test_default_tempo_and_end_of_track(self):
        card = one(kick())
        _, _, _, tracks = read_smf(bc.card_to_midi(card))
        metas = {kind: body for t, what, (kind, body) in tracks[0] if what == "meta"}
        self.assertEqual(int.from_bytes(metas[0x51], "big"), 500000)
        for tr in tracks:
            self.assertEqual(tr[-1][1:], ("meta", (0x2F, b"")))
            self.assertEqual(tr[-1][0], 384)

    def test_loops_repeat_shorter_patterns(self):
        card = one("[A] bars 1\nA7 | X... .... .... .... |\n[B] bars 2\nB7 | X... .... .... .... | .... .... .... .... |\n")
        _, _, _, tracks = read_smf(bc.card_to_midi(card, loops=2))
        a = [t for t, what, x in tracks[1] if what == "on"]
        self.assertEqual(a, [0, 384, 768, 1152])
        self.assertEqual(tracks[1][-1][0], 1536)

    def test_swing_is_in_the_ticks(self):
        card = one("swing 58\n[A]\nA7 | .x.. .... .... .... |\n")
        _, _, _, tracks = read_smf(bc.card_to_midi(card))
        self.assertEqual([t for t, what, a in tracks[1] if what == "on"], [24 + 4])


class Cli(unittest.TestCase):
    def run_cli(self, *args, stdin=None):
        return subprocess.run([sys.executable, os.path.join(HERE, "beatcard.py")] + list(args), input=stdin, capture_output=True, text=True)

    def test_check_ok_from_a_file_and_from_stdin(self):
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
            f.write(spec_card())
        try:
            r = self.run_cli("check", f.name)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertTrue(r.stdout.startswith('OK "Lazy boom bap", 92 BPM, swing 58'))
            r = self.run_cli("check", stdin=spec_card())
            self.assertEqual(r.returncode, 0)
            r = self.run_cli("check", "-", stdin=spec_card())
            self.assertEqual(r.returncode, 0)
        finally:
            os.unlink(f.name)

    def test_check_prints_line_numbers_and_exits_1(self):
        r = self.run_cli("check", stdin="ARC BEAT 1\ntempo 9\n[A]\nA7 | X |\n")
        self.assertEqual(r.returncode, 1)
        self.assertIn("line 2: error:", r.stdout)
        self.assertIn("line 4: error:", r.stdout)

    def test_warnings_alone_exit_0(self):
        r = self.run_cli("check", stdin="ARC BEAT 1\nfoo\n" + kick())
        self.assertEqual(r.returncode, 0)
        self.assertIn("line 2: warning:", r.stdout)

    def test_check_json(self):
        import json
        r = self.run_cli("check", "--json", stdin="ARC BEAT 1\ntempo 9\n" + kick())
        data = json.loads(r.stdout)
        self.assertFalse(data["ok"])
        self.assertEqual(data["problems"][0]["code"], "bad-tempo")

    def test_a_missing_file_exits_2(self):
        r = self.run_cli("check", "/no/such/card.txt")
        self.assertEqual(r.returncode, 2)

    def test_analyse_grid_and_midi_stop_on_errors(self):
        for cmd in ("analyse", "grid", "midi"):
            r = self.run_cli(cmd, stdin="ARC BEAT 1\ntempo 9\n" + kick())
            self.assertEqual(r.returncode, 1, cmd)
            self.assertIn("line 2", r.stderr)

    def test_midi_writes_a_file(self):
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, "beat.mid")
            r = self.run_cli("midi", "-o", out, stdin=spec_card())
            self.assertEqual(r.returncode, 0, r.stderr)
            with open(out, "rb") as f:
                self.assertEqual(f.read(4), b"MThd")

    def test_analyse_json_and_text(self):
        import json
        r = self.run_cli("analyse", "--json", stdin=spec_card())
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(json.loads(r.stdout)["pad_hits"], 16)
        r = self.run_cli("analyze", stdin=spec_card())
        self.assertIn("closest genre recipes", r.stdout)

    def test_main_returns_codes(self):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
                f.write(spec_card())
            try:
                self.assertEqual(bc.main(["grid", f.name]), 0)
            finally:
                os.unlink(f.name)
        self.assertIn("Lazy boom bap", out.getvalue())


# ---------------------------------------------------------------------------
# The skill's own files
# ---------------------------------------------------------------------------


def cards_in(name):
    return bc.split_cards(read(os.path.join(REFS, name)))


class SkillFiles(unittest.TestCase):
    def test_every_card_in_the_references_is_valid_and_has_no_warnings(self):
        total = 0
        files = [os.path.join(SKILL, "SKILL.md")] + [os.path.join(REFS, n) for n in sorted(os.listdir(REFS)) if n.endswith(".md")]
        for path in files:
            for heading, _before, text in bc.split_cards(read(path)):
                total += 1
                card = bc.parse_card(text)
                self.assertEqual([str(p) for p in card.problems], [], "%s: %s" % (os.path.basename(path), heading))
        self.assertGreaterEqual(total, 30)

    def test_genres_has_at_least_14_and_the_ones_asked_for(self):
        recipes = cards_in("genres.md")
        self.assertGreaterEqual(len(recipes), 14)
        names = " ".join(h.lower() for h, _, _ in recipes)
        for word in ("house", "techno", "boom bap", "lo-fi", "trap", "drill", "drum and bass", "jungle", "uk garage", "breakbeat",
                     "reggaeton", "afrobeats", "jersey club", "footwork", "hip-house"):
            self.assertIn(word, names)

    def test_each_recipe_has_bpm_swing_and_a_tempo_in_range(self):
        for heading, before, text in cards_in("genres.md"):
            bpm = re.search(r"BPM: (\d+)(?:-(\d+))?", before)
            swing = re.search(r"Swing: (\d+)(?:-(\d+))?", before)
            self.assertTrue(bpm and swing, heading)
            lo, hi = int(bpm.group(1)), int(bpm.group(2) or bpm.group(1))
            card = bc.parse_card(text)
            self.assertTrue(lo <= card.tempo <= hi, (heading, card.tempo, lo, hi))
            slo, shi = int(swing.group(1)), int(swing.group(2) or swing.group(1))
            self.assertTrue(slo <= card.swing <= shi, (heading, card.swing))

    def test_the_assumed_kit_table_matches_the_script(self):
        text = read(os.path.join(REFS, "genres.md"))
        # the table has three pad/sound pairs per row
        pairs = re.findall(r"\|\s*(A(?:[0-9.]|ENTER))\s*\|\s*([a-z0-9 ]+?)\s*(?=\|)", text)
        found = {p: s for p, s in pairs if p in bc.ASSUMED_KIT}
        self.assertEqual(found, bc.ASSUMED_KIT)

    def test_lessons(self):
        text = read(os.path.join(REFS, "lessons.md"))
        lessons = re.split(r"^## Lesson \d+: ", text, flags=re.M)[1:]
        self.assertGreaterEqual(len(lessons), 10)
        self.assertLessEqual(len(lessons), 12)
        for lesson in lessons:
            for part in ("**Goal:**", "**On the device**", "**In Arc", "**Exercise", "**Check:**"):
                self.assertIn(part, lesson, lesson.splitlines()[0])
            self.assertIn("```\nARC BEAT 1", lesson, lesson.splitlines()[0])

    def test_cited_combos_exist_in_the_guide(self):
        guide = read(os.path.join(REFS, "ep133-guide.md"))
        ids = set(re.findall(r"^### ([A-Z]+-\d+) ", guide, re.M))
        self.assertGreaterEqual(len(ids), 100)
        cited = set(re.findall(r"`((?:SND|SMP|SEQ|FX|SYS)-\d+)`", read(os.path.join(REFS, "lessons.md"))))
        self.assertGreaterEqual(len(cited), 40)
        self.assertEqual(sorted(cited - ids), [])

    def test_the_guide_is_the_generated_one(self):
        guide = read(os.path.join(REFS, "ep133-guide.md"))
        self.assertIn("Generated by web/scripts/gen-skill-guide.mjs", guide)
        self.assertIn("official EP-133 user guide for OS 2.5", guide)
        self.assertEqual(len(re.findall(r"^- \*\*Source:\*\* https://teenage.engineering/", guide, re.M)), 100)

    def test_skill_md_frontmatter_and_size(self):
        text = read(os.path.join(SKILL, "SKILL.md"))
        m = re.match(r"---\nname: arc-beats\ndescription: (.+)\n---\n", text)
        self.assertTrue(m, "frontmatter")
        description = m.group(1)
        self.assertLessEqual(len(description), 1024)
        for word in ("EP-133", "K.O. II", "KO2", "Arc", "beat card", "drum pattern", "groove", "learn"):
            self.assertIn(word.lower(), description.lower(), word)
        self.assertLess(len(text.splitlines()), 250)

    def test_skill_md_links_resolve(self):
        text = read(os.path.join(SKILL, "SKILL.md"))
        links = set(re.findall(r"\]\((references/[^)#]+)\)", text))
        self.assertGreaterEqual(len(links), 6)
        for link in links:
            self.assertTrue(os.path.exists(os.path.join(SKILL, link)), link)
        for name in os.listdir(REFS):
            self.assertIn("references/" + name, links, name + " is not linked from SKILL.md")

    def test_references_link_each_other(self):
        for name in os.listdir(REFS):
            for link in re.findall(r"\]\(([a-z0-9-]+\.md)[^)]*\)", read(os.path.join(REFS, name))):
                self.assertTrue(os.path.exists(os.path.join(REFS, link)), (name, link))

    def test_no_model_names_anywhere(self):
        bad = re.compile(r"claude-\d|claude \d|sonnet|opus|haiku|gpt|gemini|fable", re.I)
        for base, _dirs, files in os.walk(SKILL):
            if "__pycache__" in base:
                continue
            for name in files:
                if name == "test_beatcard.py":
                    continue  # it holds the pattern itself
                text = read(os.path.join(base, name))
                self.assertIsNone(bad.search(text), os.path.join(base, name))

    def test_script_is_standard_library_only(self):
        source = read(os.path.join(HERE, "beatcard.py"))
        stdlib = set(sys.stdlib_module_names) if hasattr(sys, "stdlib_module_names") else None
        for mod in re.findall(r"^(?:import|from) ([a-z_]+)", source, re.M):
            if stdlib is not None:
                self.assertIn(mod, stdlib | {"__future__"}, mod)

    def test_the_spec_example_is_the_first_card_in_the_spec(self):
        self.assertTrue(bc.parse_card(spec_card()).ok)


if __name__ == "__main__":
    unittest.main()
