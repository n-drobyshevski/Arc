#!/usr/bin/env python3
"""Pick a remake's sounds by ear, not by name: the factory sound or Arc synth closest to the song's own.

For Claude Code, after remake_audio.py, on the same folder. It cuts clean hits and
notes from the song's stems (a kick with nothing else near it, a long bass note),
embeds them with CLAP (an audio model that puts like-sounding audio close), and
ranks the EP-133's factory sounds of the right kind and a grid of Arc's synth lines
by how close they sound. It also measures each pick's own pitch: a KEYS pad plays
its sound as recorded at `note C4`, and the factory sounds are recorded anywhere
from C1 to C5, so the card's notes are moved by the pick's root to sound at the
song's pitch.

    match_sounds.py DIR [--pack ep-133-factory-content.pak] [--sounds SOUNDS.txt] [--card CARD]

DIR is remake_audio.py's folder (raw.json, analysis.json, the stems). The pack is
the EP-133's factory pack (downloaded from teenage engineering when not given);
--sounds keeps to the factory sounds still in the user's sound list. It writes
DIR/sounds.json (the top picks for each part, with their similarity and root) and
DIR/card-sounds.txt: the card (DIR/card.txt, or --card) with a sound or synth line
on each pad and its notes moved to the pick's pitch. A chord sample (a pick named
"chord", or a pad or stab synth) plays one chord on its own, so a part on it keeps
only its chords' roots; on a part whose chords are both major and minor it counts
for a little less, since its one quality plays some of them wrong.

Setup: remake_audio.py's, plus `uv pip install "transformers<4.48"` (CLAP, about
800 MB on first use). The picking and the card edits use the standard library
only, so the tests run without the models.
"""

import argparse
import json
import os
import re
import sys
from typing import Dict, List, Optional, Sequence, Tuple

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import beatcard as bc  # noqa: E402

PACK_URL = "https://teenage.engineering/apps/ep-sample-tool/assets/ep-133-factory-content-DRyE_DHC.pak"
NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
CLAP_RATE = 48000

# Each part: its pad, the factory slots of its kind, whether it is played in KEYS, how long a clip
# is cut (seconds) and the synth types that may stand in for it.
PARTS = {
    "kick": ("A7", [(1, 99)], False, 0.4, ["kick"]),
    "snare": ("A9", [(100, 199), (300, 316)], False, 0.35, ["snare", "clap"]),
    "hat": ("A4", [(200, 217)], False, 0.15, ["hat"]),
    "cymbal": ("A5", [(218, 253)], False, 0.6, ["openhat"]),
    "tom": ("A2", [(320, 356)], False, 0.4, ["tom"]),
    "bass": ("B7", [(400, 499)], True, 0.6, ["sub", "bass"]),
    "keys": ("C7", [(500, 599)], True, 1.5, ["pad", "stab", "pluck", "bell"]),
    "vocal": ("D7", [(500, 599)], True, 1.0, ["lead", "pluck", "bell"]),
}

# A grid of synth lines a part may use: Arc makes them, so they are sounds every user has.
SYNTH_GRID = {
    "kick": ["note %s decay %d click %d drive %d" % (n, d, c, r) for n in ("E1", "G1", "A#1") for d in (25, 45, 70) for c in (20, 50) for r in (10, 50)],
    "snare": ["tone %d noise %d decay %d" % (t, n, d) for t in (40, 70) for n in (50, 80) for d in (20, 40)],
    "clap": ["decay %d tone %d" % (d, t) for d in (25, 45) for t in (40, 65)],
    "hat": ["decay %d tone %d" % (d, t) for d in (8, 15, 25) for t in (60, 85)],
    "openhat": ["decay %d tone %d" % (d, t) for d in (35, 60) for t in (60, 85)],
    "tom": ["note %s decay %d" % (n, d) for n in ("G2", "C3") for d in (30, 50)],
    "sub": ["note C2 decay %d drive %d" % (d, r) for d in (30, 60, 90) for r in (10, 40)],
    "bass": ["note C2 tone %d reso %d sweep %d detune %d" % (t, r, s, d) for t in (25, 45, 65) for r in (10, 40) for s in (0, 40) for d in (0, 50)],
    "pad": ["note C3 tone %d detune %d" % (t, d) for t in (30, 60) for d in (10, 40)],
    "stab": ["note C4 chord %s tone %d" % (c, t) for c in ("min", "min7") for t in (40, 70)],
    "pluck": ["note C4 tone %d" % t for t in (40, 70)],
    "lead": ["note C4 tone %d detune %d" % (t, d) for t in (40, 70) for d in (0, 30)],
    "bell": ["note C5 tone %d" % t for t in (25, 50)],
}
# The synth types that sound a chord of their own.
CHORD_SYNTHS = {"pad", "stab"}
# A sample's name that says it is a chord: "liquid chord em7", "chordy f9sus4".


# ---- picking (standard library) -------------------------------------------

def note_midi(name: str) -> int:
    m = re.fullmatch(r"([A-G]#?)(-?\d)", name)
    if not m:
        raise ValueError("not a note: %s" % name)
    return NAMES.index(m.group(1)) + 12 * (int(m.group(2)) + 1)


def note_name(midi: int) -> str:
    return "%s%d" % (NAMES[midi % 12], midi // 12 - 1)


def is_chord_sample(name: str) -> bool:
    """A sample that sounds a chord of its own: "liquid chord em7", "pling chord", "chordy f9sus4"."""
    return "chord" in name.lower()


def chord_root(name: str) -> Optional[int]:
    """The pitch class a chord sample's name gives ("liquid chord em7": E), None when it names none."""
    for word in name.lower().split():
        m = re.fullmatch(r"([a-g])(#|b)?(m|maj|min|sus|dim|aug)?\d*(sus\d)?", word)
        if m and (m.group(3) or re.search(r"\d", word)):
            if m.group(2) == "b":
                return (NAMES.index(m.group(1).upper()) - 1) % 12
            return NAMES.index(m.group(1).upper() + (m.group(2) or ""))
    return None


def mixed_chords(card: str, pad: str) -> bool:
    """Whether the card's chords on pad are both major and minor (a third of 4 and of 3 above the
    root): a chord sample, one quality on every root, would play some of them wrong."""
    stacks: Dict[Tuple[int, str], List[int]] = {}
    section = 0
    for line in card.split("\n"):
        if line.startswith("[") or line.startswith("scene"):
            section += 1
        m = NOTE_LINE.match(line)
        if m and m.group("pad") == pad:
            stacks.setdefault((section, m.group("at")), []).append(note_midi(m.group("note")))
    kinds = set()
    for notes in stacks.values():
        if len(notes) >= 3:
            root = min(notes)
            pcs = {(n - root) % 12 for n in notes}
            kinds.add("major" if 4 in pcs else "minor" if 3 in pcs else "other")
    return {"major", "minor"} <= kinds


def score(similarity: float, shift: int) -> float:
    """A pick's score: how close it sounds, less a little for each semitone it must move past an
    octave (a sample stretched far sounds thin or muddy)."""
    return similarity - 0.004 * max(0, abs(shift) - 12)


def shift_for(root: int, chord: bool) -> int:
    """Semitones the notes move so a sound recorded at root plays at the notes' pitch: KEYS plays
    the sound as recorded at C4, so a note is written at its pitch + 60 - root. A chord sound plays
    its chord at any octave, so it moves by the least."""
    shift = 60 - root
    if chord:
        while shift > 6:
            shift -= 12
        while shift < -6:
            shift += 12
    return shift


def nearest_with_class(midi: int, pc: int) -> int:
    """The pitch nearest midi that is pitch class pc (a chord sample's root from its name, at the octave pyin heard)."""
    up = (pc - midi) % 12
    return midi + up if up <= 6 else midi + up - 12


NOTE_LINE = re.compile(r"^(?P<pad>[A-D]\d+) at (?P<at>\S+) note (?P<note>[A-G]#?-?\d)(?P<rest>.*)$")


def move_notes(card: str, pad: str, shift: int, roots_only: bool) -> str:
    """The card with pad's KEYS notes moved by shift semitones; roots_only keeps the lowest note of
    each chord (notes that start together), for a sound that plays a chord on its own."""
    out = []
    lowest: Dict[Tuple[int, str], int] = {}
    lines = card.split("\n")
    section = 0
    if roots_only:
        for line in lines:
            if line.startswith("[") or line.startswith("scene"):
                section += 1
            m = NOTE_LINE.match(line)
            if m and m.group("pad") == pad:
                key = (section, m.group("at"))
                midi = note_midi(m.group("note"))
                lowest[key] = min(lowest.get(key, midi), midi)
    section = 0
    for line in lines:
        if line.startswith("[") or line.startswith("scene"):
            section += 1
        m = NOTE_LINE.match(line)
        if m and m.group("pad") == pad:
            midi = note_midi(m.group("note"))
            if roots_only and midi != lowest[(section, m.group("at"))]:
                continue
            new = midi + shift
            while new > 96:
                new -= 12
            while new < 12:
                new += 12
            line = "%s at %s note %s%s" % (pad, m.group("at"), note_name(new), m.group("rest"))
        out.append(line)
    return "\n".join(out)


def add_sound_lines(card: str, lines_by_group: Dict[str, List[str]]) -> str:
    """Put each group's sound or synth lines right after its first section line in the card."""
    out, done = [], set()
    for line in card.split("\n"):
        out.append(line)
        m = re.match(r"^\[([A-D])\]", line)
        if m and m.group(1) not in done and m.group(1) in lines_by_group:
            out.extend(lines_by_group[m.group(1)])
            done.add(m.group(1))
    return "\n".join(out)


def apply_picks(card: str, picks: Dict[str, dict]) -> str:
    """The card with each part's pick: its sound or synth line, and its notes moved to its pitch."""
    by_group: Dict[str, List[str]] = {}
    for part, pick in picks.items():
        pad = PARTS[part][0]
        by_group.setdefault(pad[0], []).append(pick["line"])
        if PARTS[part][2] and pick.get("shift") is not None:
            card = move_notes(card, pad, pick["shift"], pick.get("chord", False))
    # A synth line goes before the section's sound lines' end; both kinds are fine right after the section line.
    return add_sound_lines(card, by_group)


def target_pitch(card: str, pad: str) -> Optional[int]:
    """The median pitch the card's notes on pad play (the song's register for that part)."""
    pitches = sorted(note_midi(m.group("note")) for m in map(NOTE_LINE.match, card.split("\n")) if m and m.group("pad") == pad)
    return pitches[len(pitches) // 2] if pitches else None


def parse_sound_list(text: str) -> Dict[int, str]:
    return bc.parse_sound_list(text)


# ---- measuring (needs the models) -----------------------------------------

def _models():
    try:
        import numpy as np
        import librosa
        import torch
        from transformers import ClapModel, ClapProcessor
    except ImportError as e:
        sys.exit("match_sounds.py needs remake_audio.py's setup and transformers<4.48 (%s)." % e)
    model = ClapModel.from_pretrained("laion/larger_clap_general").eval()
    proc = ClapProcessor.from_pretrained("laion/larger_clap_general")

    def embed(clips: List["np.ndarray"]) -> "np.ndarray":
        out = []
        for i in range(0, len(clips), 16):
            inp = proc(audios=clips[i:i + 16], sampling_rate=CLAP_RATE, return_tensors="pt", padding=True)
            with torch.no_grad():
                e = model.get_audio_features(**inp)
            out.append(torch.nn.functional.normalize(e, dim=-1).numpy())
        return np.concatenate(out)
    return np, librosa, embed


def _root(np, librosa, y, sr) -> Optional[int]:
    """A sound's own pitch: the median of pyin's voiced frames, else None (a drum, noise)."""
    f0, voiced, _ = librosa.pyin(y[: int(1.5 * sr)], fmin=30, fmax=1200, sr=sr, frame_length=4096)
    f = f0[voiced] if voiced.any() else []
    return int(round(float(np.median(librosa.hz_to_midi(f))))) if len(f) > 5 else None


def factory_index(pack: str, np, librosa, embed) -> List[dict]:
    """Every factory sound: slot, name, CLAP embedding and root, cached beside the pack."""
    cache = pack + ".index.json"
    if os.path.exists(cache):
        with open(cache) as fh:
            return json.load(fh)
    import io
    import zipfile
    z = zipfile.ZipFile(pack)
    entries, clips = [], []
    for n in sorted(z.namelist()):
        if not n.lower().endswith(".wav"):
            continue
        base = os.path.basename(n)[:-4]
        slot, _, name = base.partition(" ")
        y, sr = librosa.load(io.BytesIO(z.read(n)), sr=CLAP_RATE, mono=True, duration=2.0)
        entries.append({"slot": int(slot), "name": name, "root": _root(np, librosa, y, sr)})
        clips.append(y)
    for e, v in zip(entries, embed(clips)):
        e["emb"] = [round(float(x), 5) for x in v]
    with open(cache, "w") as fh:
        json.dump(entries, fh)
    return entries


def synth_candidates(part: str, np, librosa, embed) -> List[dict]:
    """The grid's synth lines for part, made as Arc makes them, embedded."""
    pad = PARTS[part][0]
    out, clips = [], []
    for kind in PARTS[part][4]:
        for knobs in SYNTH_GRID[kind]:
            text = "synth %s %s %s name %s" % (pad, kind, knobs, ("remake_" + kind)[:13])
            card = bc.parse_card("ARC BEAT 1\n[%s] bars 1\n%s\n" % (pad[0], text))
            synth = card.patterns[0].synths[bc.parse_pad(pad)[1]]
            pcm = np.array(bc.render_synth(synth), dtype=np.float32) / 32768.0
            clips.append(librosa.resample(pcm, orig_sr=bc.SYNTH_RATE, target_sr=CLAP_RATE)[: 2 * CLAP_RATE])
            note = re.search(r"note (\S+)", knobs)
            root = note_midi(note.group(1)) if note else None
            out.append({"line": text, "kind": kind, "root": root if PARTS[part][2] else None, "chord": kind in CHORD_SYNTHS})
    for e, v in zip(out, embed(clips)):
        e["emb"] = v
    return out


def part_clips(folder: str, np, librosa) -> Dict[str, list]:
    """Clean clips of each part from the stems: drum hits with no other drum near, long notes."""
    with open(os.path.join(folder, "raw.json")) as fh:
        raw = json.load(fh)
    stem = lambda s: librosa.load(os.path.join(folder, "htdemucs", "song", s + ".wav"), sr=CLAP_RATE, mono=True)[0]
    hits = raw["drum_hits"]

    def cut(y, times, length, n=24):
        times = list(times)[:: max(1, len(times) // n)][:n]
        return [y[max(0, int((t - 0.01) * CLAP_RATE)):int((t - 0.01 + length) * CLAP_RATE)] for t in times]

    clips: Dict[str, list] = {}
    drums = stem("drums")
    for part in ("kick", "snare", "hat", "cymbal", "tom"):
        others = sorted(t for k, v in hits.items() if k != part for t in v)
        alone = []
        for t in hits.get(part, []):
            i = int(np.searchsorted(others, t))
            near = [abs(others[j] - t) for j in (i - 1, i) if 0 <= j < len(others)]
            if not near or min(near) > 0.06:
                alone.append(t)
        if len(alone) >= 3:
            clips[part] = cut(drums, alone, PARTS[part][3])
    for part, s, least in (("bass", "bass", 0.2), ("keys", "other", 0.4), ("vocal", "vocals", 0.3)):
        long = [n[0] for n in raw["notes"].get(s, []) if n[1] - n[0] > least]
        if len(long) >= 3:
            clips[part] = cut(stem(s), long, PARTS[part][3])
    return clips


def match(folder: str, pack: str, allowed: Optional[Dict[int, str]], card: str) -> Dict[str, List[dict]]:
    np, librosa, embed = _models()
    index = factory_index(pack, np, librosa, embed)
    if allowed is not None:
        index = [e for e in index if allowed.get(e["slot"]) and bc.same_name(allowed[e["slot"]], e["name"])]
    ranked: Dict[str, List[dict]] = {}
    for part, clips in part_clips(folder, np, librosa).items():
        pad, ranges, keys, _, _ = PARTS[part]
        query = embed(clips).mean(0)
        query = query / np.linalg.norm(query)
        target = target_pitch(card, pad) if keys else None
        mixed = keys and mixed_chords(card, pad)
        cands = []
        for e in index:
            if any(lo <= e["slot"] <= hi for lo, hi in ranges):
                chord = keys and is_chord_sample(e["name"])
                chord_pc = chord_root(e["name"]) if chord else None
                root = e["root"]
                if chord_pc is not None and root is not None:
                    root = nearest_with_class(root, chord_pc)
                cands.append({"line": "sound %s %d %s" % (pad, e["slot"], e["name"]), "root": root,
                              "chord": chord, "emb": e["emb"]})
        cands += synth_candidates(part, np, librosa, embed)
        for c in cands:
            c["similarity"] = round(float(np.dot(query, np.asarray(c.pop("emb")))), 3)
            c["shift"] = shift_for(c["root"], c["chord"]) if keys and c["root"] is not None else None
            # How far the sound is stretched to play the part: a chord sound only to the nearest octave.
            stretch = 0
            if c["shift"] is not None and target is not None:
                stretch = abs(target + c["shift"] - 60)
            # A chord sample has one quality: on a part that mixes major and minor chords it plays some wrong.
            c["score"] = round(score(c["similarity"], stretch) - (0.03 if mixed and c["chord"] else 0), 3)
        ranked[part] = sorted(cands, key=lambda c: -c["score"])[:5]
    return ranked


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description="Pick a remake's sounds by how close they sound to the song's own.")
    p.add_argument("folder", help="remake_audio.py's folder (raw.json, the stems)")
    p.add_argument("--pack", help="the EP-133 factory pack (.pak); downloaded from teenage engineering when not given")
    p.add_argument("--sounds", help="the user's sound list: keep to the factory sounds still in it")
    p.add_argument("--card", help="the card to give the sounds (default: FOLDER/card.txt)")
    args = p.parse_args(argv)
    card_path = args.card or os.path.join(args.folder, "card.txt")
    with open(card_path) as fh:
        card = fh.read()
    pack = args.pack or os.path.join(args.folder, "ep-133-factory-content.pak")
    if not os.path.exists(pack):
        import urllib.request
        print("downloading the factory pack from teenage engineering...", file=sys.stderr)
        urllib.request.urlretrieve(PACK_URL, pack)
    allowed = None
    if args.sounds:
        with open(args.sounds) as fh:
            allowed = parse_sound_list(fh.read())
    ranked = match(args.folder, pack, allowed, card)
    with open(os.path.join(args.folder, "sounds.json"), "w") as fh:
        json.dump(ranked, fh, indent=1)
    picks = {part: cands[0] for part, cands in ranked.items() if cands}
    # The hook on D is written later, to the vocal's pick: its pad gets the sound line now.
    out = apply_picks(card, picks)
    out_path = os.path.join(args.folder, "card-sounds.txt")
    with open(out_path, "w") as fh:
        fh.write(out)
    for part, cands in ranked.items():
        best = cands[0]
        print("%-6s %s  (similarity %.2f%s)" % (part, best["line"], best["similarity"],
              ", notes moved %+d" % best["shift"] if best.get("shift") else ""), file=sys.stderr)
    problems = [x for x in bc.parse_card(out).problems if x.level == "error"]
    for x in problems:
        print("check: %s" % x, file=sys.stderr)
    print(out_path, file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
