#!/usr/bin/env python3
"""Remake a song from its audio: measure it, then draft an ARC BEAT card of scenes.

For Claude Code, on a computer, with the song as an audio file the user has (a
recording, a purchase, an export). The Claude apps can't run it: they take no
audio. references/remake.md says when to use it and what to do with the draft.

    remake_audio.py SONG.(wav|mp3|flac|m4a) [--out DIR] [--start SEC] [--end SEC] [--loop-bars 1-4]
    remake_audio.py --from-json DIR/analysis.json [--loop-bars 1-4]

What it measures, each with a model made for the job:
  bars and tempo   Beat This! (beats and downbeats)
  stems            Demucs htdemucs (drums, bass, other, vocals)
  drums            ADTOF on the drum stem (kick, snare, tom, hat, cymbal); without
                   it, onsets in three bands of the drum stem (kick, snare, hat)
  bass and chords  Basic Pitch on the bass and other stems; the chords are matched
                   per bar, and the key from all their notes
  sections         where the bars' texture changes (which stems play, how busy
                   the drums are, the chord), grouped into parts that repeat

It writes DIR/analysis.json (every measurement, so --from-json redraws the card
without the models) and DIR/card.txt, prints the card, and checks it with
beatcard.py. The draft has no sound, synth or FX lines and an empty group D:
the sounds and the hook are Claude's to add (remake.md). The vocal and lead
lines are never transcribed, only their register.

Setup, once (Python 3.11, ffmpeg on the PATH; about 3 GB with the models):

    uv venv -p 3.11 .remake && . .remake/bin/activate
    uv pip install --index-strategy unsafe-best-match \\
        --extra-index-url https://download.pytorch.org/whl/cpu \\
        torch==2.5.1+cpu torchaudio==2.5.1+cpu demucs "numpy<2" soundfile librosa \\
        "basic-pitch[onnx]" "setuptools<70" pretty_midi \\
        "beat-this @ git+https://github.com/CPJKU/beat_this"
    # optional, better drums (CC BY-NC-SA 4.0: not for commercial use)
    uv pip install "adtof-pytorch @ git+https://github.com/xavriley/ADTOF-pytorch"

A 4-minute song takes a few minutes on a laptop CPU. The functions after the
analysis (grids, chords, key, sections, the card) use the standard library
only, so the tests run without the models.
"""

import argparse
import json
import os
import subprocess
import sys
from collections import Counter
from typing import Dict, List, Optional, Sequence, Tuple

HERE = os.path.dirname(os.path.abspath(__file__))

STEPS = 16
TICKS_PER_STEP = 24
TICKS_PER_BAR = STEPS * TICKS_PER_STEP
NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# The drum classes, their pads (the assumed kit in genres.md) and row labels.
DRUMS = [
    ("kick", "A7", "kick"),
    ("snare", "A9", "snare"),
    ("hat", "A4", "closed hat"),
    ("cymbal", "A5", "open hat"),
    ("tom", "A2", "tom"),
]
# ADTOF's General MIDI notes.
ADTOF_CLASSES = {35: "kick", 38: "snare", 47: "tom", 42: "hat", 49: "cymbal"}

# Krumhansl-Kessler key profiles, C first.
MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

# Chord shapes as intervals from the root, and how they are written.
CHORDS = [
    ("", (0, 4, 7)),
    ("m", (0, 3, 7)),
    ("7", (0, 4, 7, 10)),
    ("m7", (0, 3, 7, 10)),
    ("maj7", (0, 4, 7, 11)),
    ("m7b5", (0, 3, 6, 10)),
    ("sus2", (0, 2, 7)),
    ("sus4", (0, 5, 7)),
    ("5", (0, 7)),
]


# ---- grids and timing -------------------------------------------------------

def bars_from(downbeats: Sequence[float], beats: Sequence[float], end: float) -> List[Tuple[float, float]]:
    """Each bar's start and length in seconds, from the downbeats; the last bar takes the median length."""
    starts = sorted(downbeats)
    if len(starts) < 2:
        if len(beats) < 2:
            raise ValueError("too few beats to find bars")
        step = median([b - a for a, b in zip(beats, beats[1:])]) * 4
        starts = [beats[0] + i * step for i in range(int((end - beats[0]) / step) + 1)]
    lengths = [b - a for a, b in zip(starts, starts[1:])]
    typical = median(lengths)
    lengths.append(typical)
    return list(zip(starts, lengths))


def median(xs: Sequence[float]) -> float:
    s = sorted(xs)
    n = len(s)
    if n == 0:
        raise ValueError("median of nothing")
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def tempo_of(bars: Sequence[Tuple[float, float]]) -> float:
    """The tempo from a straight line through the bar starts, finer than any one bar (the beat
    tracker marks times on a 20 ms grid); a bar's length alone with one bar."""
    if len(bars) < 3:
        return 240.0 / median([length for _, length in bars])
    xs = range(len(bars))
    ys = [start for start, _ in bars]
    mx, my = sum(xs) / len(bars), sum(ys) / len(bars)
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    return 240.0 / slope


def place(t: float, bars: Sequence[Tuple[float, float]]) -> Optional[Tuple[int, int, float]]:
    """The bar (0-based), the nearest sixteenth (0-15) and how late the time is, in sixteenths (-0.5..0.5)."""
    if not bars or t < bars[0][0] - bars[0][1] / 32:
        return None
    lo, hi = 0, len(bars) - 1
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if bars[mid][0] <= t + bars[mid][1] / 32:
            lo = mid
        else:
            hi = mid - 1
    start, length = bars[lo]
    pos = (t - start) / length * STEPS
    step = int(round(pos))
    late = pos - step
    b = lo
    if step >= STEPS:
        if b + 1 >= len(bars):
            return None
        b, step = b + 1, step - STEPS
    return b, max(step, 0), late


def drum_grid(hits: Dict[str, Sequence[float]], bars: Sequence[Tuple[float, float]]) -> Dict[str, List[str]]:
    """Each drum class's hits as one 16-step string a bar ('x' hit, '.' rest)."""
    out = {}
    for name, times in hits.items():
        rows = [["."] * STEPS for _ in bars]
        for t in times:
            p = place(t, bars)
            if p:
                rows[p[0]][p[1]] = "x"
        out[name] = ["".join(r) for r in rows]
    return out


def swing_of(times: Sequence[float], bars: Sequence[Tuple[float, float]]) -> int:
    """The card's swing (50-75) from how late the off-sixteenths land against the on ones."""
    on, off = [], []
    for t in times:
        p = place(t, bars)
        if p:
            (off if p[1] % 2 else on).append(p[2])
    if len(off) < 8:
        return 50
    delay = median(off) - (median(on) if on else 0.0)
    return int(min(75, max(50, round(50 + delay * 50))))


def swing_ticks(swing: int) -> int:
    """The ticks an off-sixteenth moves at this swing, as Arc plays the grid (SKILL.md, BUILD step 3)."""
    return ((swing - 50) * 24 + 25) // 50


# ---- harmony ----------------------------------------------------------------

def pitch_weights(notes: Sequence[Tuple[float, float, int, float]], t0: float = float("-inf"), t1: float = float("inf")) -> List[float]:
    """How much each pitch class sounds between t0 and t1: overlap times loudness."""
    w = [0.0] * 12
    for start, end, pitch, amp in notes:
        overlap = min(end, t1) - max(start, t0)
        if overlap > 0:
            w[pitch % 12] += overlap * amp
    return w


def _corr(a: Sequence[float], b: Sequence[float]) -> float:
    ma, mb = sum(a) / len(a), sum(b) / len(b)
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    da = sum((x - ma) ** 2 for x in a) ** 0.5
    db = sum((y - mb) ** 2 for y in b) ** 0.5
    return num / (da * db) if da and db else 0.0


def key_of(weights: Sequence[float]) -> Tuple[str, float]:
    """The best-fitting key ("D# minor") and how well it fits (a correlation, 0-1)."""
    best = ("C major", -2.0)
    for root in range(12):
        for name, profile in (("major", MAJOR), ("minor", MINOR)):
            rotated = profile[-root:] + profile[:-root] if root else profile
            r = _corr(weights, rotated)
            if r > best[1]:
                best = ("%s %s" % (NAMES[root], name), r)
    return best[0], round(best[1], 3)


def scale_of(key: str) -> set:
    """The pitch classes of a key's scale ("D# minor": the natural minor)."""
    root, mode = key.split()
    r = NAMES.index(root)
    steps = (0, 2, 4, 5, 7, 9, 11) if mode == "major" else (0, 2, 3, 5, 7, 8, 10)
    return {(r + s) % 12 for s in steps}


def chord_of(weights: Sequence[float], bass: Optional[int] = None, scale: Optional[set] = None) -> Optional[Tuple[str, int, Tuple[int, ...]]]:
    """The chord that best covers the weights: its name, root and intervals. The bass note's root counts
    extra, and so does a chord whose notes are all in the key's scale."""
    total = sum(weights)
    if total <= 0:
        return None
    best = None
    for root in range(12):
        for suffix, shape in CHORDS:
            tones = {(root + i) % 12 for i in shape}
            inside = sum(weights[p] for p in tones)
            outside = total - inside
            score = inside / total - 0.6 * outside / total - 0.04 * len(shape)
            if bass is not None and bass % 12 == root:
                score += 0.15
            if scale and tones <= scale:
                score += 0.1
            if best is None or score > best[0]:
                best = (score, NAMES[root] + suffix, root, shape)
    return best[1], best[2], best[3]


def voicing(root: int, shape: Sequence[int]) -> List[int]:
    """MIDI notes for a chord around C4 (the sample's own pitch): the root at or above G3."""
    base = 55 + (root - 55) % 12
    return sorted(base + i for i in shape)


# ---- sections ---------------------------------------------------------------

def bar_features(grid: Dict[str, List[str]], levels: Dict[str, List[float]], chords: List[Optional[str]]) -> List[List[float]]:
    """A vector a bar: drum density per class, each stem's level (0-1) and the chord's root."""
    n = len(chords)
    feats = []
    for b in range(n):
        f = [grid[name][b].count("x") / STEPS for name in sorted(grid)]
        f += [levels[s][b] for s in sorted(levels)]
        feats.append(f)
    return feats


def _dist(a: Sequence[float], b: Sequence[float]) -> float:
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


def _mean(rows: Sequence[Sequence[float]]) -> List[float]:
    return [sum(c) / len(rows) for c in zip(*rows)]


def sections_of(features: Sequence[Sequence[float]], chords: Sequence[Optional[str]], threshold: float = 0.35) -> List[Tuple[int, int]]:
    """Cut the bars where the texture changes most: (first bar, bars) for each section, 2 bars or more."""
    n = len(features)
    if n <= 2:
        return [(0, n)]
    # How much the two bars from b differ from the two before it; a cut goes on a peak of that.
    change = [0.0] * n
    for b in range(1, n):
        change[b] = _dist(_mean(features[max(0, b - 2):b]), _mean(features[b:b + 2]))
    cuts = [0]
    for b in range(2, n - 1):
        peak = change[b] >= change[b - 1] and change[b] >= change[b + 1]
        if peak and change[b] > threshold and b - cuts[-1] >= 2:
            cuts.append(b)
    out = []
    for i, c in enumerate(cuts):
        end = cuts[i + 1] if i + 1 < len(cuts) else n
        out.append((c, end - c))
    return out


def group_sections(sections: Sequence[Tuple[int, int]], features: Sequence[Sequence[float]], chords: Sequence[Optional[str]], threshold: float = 0.3) -> List[int]:
    """Which part each section is (0, 1, 2 ...): one that sounds like an earlier one, with the same chords, is that part."""
    parts: List[Tuple[List[float], Tuple]] = []
    labels = []
    for start, length in sections:
        mean = _mean(features[start:start + length])
        loop = tuple(c for c in chords[start:start + min(length, 4)])
        found = None
        for i, (m, l) in enumerate(parts):
            if _dist(mean, m) <= threshold and (l == loop or not any(loop) or not any(l)):
                found = i
                break
        if found is None:
            parts.append((mean, loop))
            found = len(parts) - 1
        labels.append(found)
    return labels


def common_loop(rows: Sequence[str], size: int) -> str:
    """The most frequent run of `size` bars in a section's drum rows, joined (the first on a tie)."""
    runs = ["".join(rows[i:i + size]) for i in range(0, len(rows) - size + 1, size)] or ["".join(rows[:size])]
    return Counter(runs).most_common(1)[0][0]


# ---- the card ---------------------------------------------------------------

def note_name(midi: int) -> str:
    return "%s%d" % (NAMES[midi % 12], midi // 12 - 1)


def at(bar: int, step: int, swing: int) -> str:
    """A note's position, `bar.beat.16th`, with the swing's ticks on an off-sixteenth."""
    text = "%d.%d.%d" % (bar + 1, step // 4 + 1, step % 4 + 1)
    shift = swing_ticks(swing) if step % 2 else 0
    return text + ("+%d" % shift if shift else "")


def bass_notes(notes: Sequence[Tuple[float, float, int, float]], bars: Sequence[Tuple[float, float]], first: int, size: int, swing: int) -> List[str]:
    """The bass in bars first..first+size-1 as notes lines on B7, at its real pitch."""
    lines, seen = [], set()
    for start, end, pitch, amp in sorted(notes):
        p = place(start, bars)
        if not p or not first <= p[0] < first + size:
            continue
        key = (p[0], p[1])
        if key in seen:
            continue
        seen.add(key)
        length = bars[p[0]][1]
        gate = max(TICKS_PER_STEP // 2, int(round((end - start) / length * TICKS_PER_BAR)))
        vel = int(min(127, max(60, 60 + amp * 67)))
        lines.append("B7 at %s note %s gate %d vel %d" % (at(p[0] - first, p[1], swing), note_name(pitch), gate, vel))
    return lines


def chord_notes(chords: Sequence[Optional[dict]], first: int, size: int) -> List[str]:
    """One held chord a bar on C7 (a chord that goes on is held through)."""
    lines = []
    b = first
    while b < first + size:
        c = chords[b] if b < len(chords) else None
        run = 1
        while b + run < first + size and b + run < len(chords) and chords[b + run] and c and chords[b + run]["name"] == c["name"]:
            run += 1
        if c:
            for midi in voicing(c["root"], c["shape"]):
                lines.append("C7 at %d.1.1 note %s gate %d vel 85" % (b - first + 1, note_name(midi), run * TICKS_PER_BAR))
        b += run
    return lines


def draft_card(a: dict, loop_bars: int = 4) -> str:
    """The card from an analysis: a scene for each part, its first loop_bars bars as the loop, and the chain."""
    bars = [tuple(x) for x in a["bars"]]
    swing = a["swing"]
    grid = a["drums"]
    chords = a["chords"]
    sections = [tuple(s) for s in a["sections"]]
    parts = a["parts"]
    tempo = int(round(a["tempo"]))
    out = ["ARC BEAT 1"]
    out.append("# %s, measured from the audio by remake_audio.py, not by ear" % a.get("title", "song"))
    out.append("# tempo %.1f (Beat This! downbeats), swing %d (measured on the hats)" % (a["tempo"], swing))
    out.append("# key %s (Basic Pitch notes of the bass and other stems, fit %.2f)" % (a["key"], a["key_fit"]))
    out.append("# drums: %s; bass and chords: Basic Pitch, chords matched a bar" % a["drum_source"])
    out.append("# sections: where the texture changes; the scene names are placeholders")
    out.append("# draft: add the sounds, FX and a hook of your own on D (remake.md)")
    out.append("name %s" % a.get("title", "Remake")[:40])
    out.append("tempo %d" % tempo)
    out.append("swing %d" % swing)

    # Each part's loop: its first section's opening bars.
    first_of = {}
    for (start, length), part in zip(sections, parts):
        first_of.setdefault(part, (start, length))
    order = sorted(first_of, key=lambda p: first_of[p][0])
    scene_no = {p: i + 1 for i, p in enumerate(order[:16])}
    steps = []
    for (start, length), part in zip(sections, parts):
        if part not in scene_no:
            continue
        size = min(loop_bars, first_of[part][1])
        passes = max(1, int(round(length / size)))
        while passes > 0:
            n = min(8, passes)
            steps.append("%d%s" % (scene_no[part], "x%d" % n if n > 1 else ""))
            passes -= n
    out.append("chain " + " ".join(steps[:64]))

    for part in order[:16]:
        start, length = first_of[part]
        size = min(loop_bars, length)
        out.append("")
        out.append("scene Part %s (bars %d-%d)" % (chr(65 + scene_no[part] - 1), start + 1, start + length))
        drum_size = 1
        for name, _, _ in DRUMS:
            rows = grid.get(name, [])[start:start + size]
            if size >= 2 and len(rows) >= 2 and common_loop(rows, 2)[:STEPS] != common_loop(rows, 2)[STEPS:]:
                drum_size = 2
        active = []
        for name, pad, label in DRUMS:
            rows = grid.get(name, [])[start:start + length]
            loop = common_loop(rows, drum_size) if rows else ""
            if "x" in loop:
                active.append((pad, label, loop))
        out.append("[A] bars %d step 1/16" % drum_size)
        for pad, label, loop in active:
            cells = " | ".join(" ".join(loop[b * STEPS + q * 4:b * STEPS + q * 4 + 4] for q in range(4)) for b in range(drum_size))
            out.append("%-3s%-12s| %s |" % (pad, label, cells))
        out.append("")
        out.append("[B] bars %d" % size)
        bass = bass_notes(a["bass_notes"], bars, start, size, swing)
        if bass:
            out.append("pad B7 mode key release 20")
            out.append("notes")
            out.extend(bass)
        out.append("")
        out.append("[C] bars %d" % size)
        held = chord_notes(chords, start, size)
        if held:
            out.append("pad C7 mode key release 40")
            out.append("notes")
            out.extend(held)
        out.append("")
        out.append("[D] bars %d" % size)
    return "\n".join(out) + "\n"


# ---- the analysis (needs the models) ---------------------------------------

def _run(cmd: List[str]) -> None:
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def analyse(path: str, out: str, start: Optional[float], end: Optional[float]) -> dict:
    try:
        import numpy as np
        import librosa
        from basic_pitch.inference import predict
        from beat_this.inference import File2Beats
    except ImportError as e:
        sys.exit("remake_audio.py needs the audio models (%s). See the setup in this script's docstring." % e)

    os.makedirs(out, exist_ok=True)
    wav = os.path.join(out, "song.wav")
    cmd = ["ffmpeg", "-y", "-loglevel", "error"]
    if start is not None:
        cmd += ["-ss", str(start)]
    cmd += ["-i", path]
    if end is not None:
        cmd += ["-t", str(end - (start or 0))]
    _run(cmd + ["-ac", "2", "-ar", "44100", wav])
    duration = librosa.get_duration(path=wav)

    print("bars and tempo (Beat This!)...", file=sys.stderr)
    beats, downbeats = File2Beats(checkpoint_path="final0", device="cpu", dbn=False)(wav)
    bars = bars_from(list(map(float, downbeats)), list(map(float, beats)), duration)

    print("stems (Demucs)...", file=sys.stderr)
    _run([sys.executable, "-m", "demucs", "-n", "htdemucs", "-o", out, wav])
    stems = {s: os.path.join(out, "htdemucs", "song", s + ".wav") for s in ("drums", "bass", "other", "vocals")}

    print("drums...", file=sys.stderr)
    hits, source = _drum_hits(stems["drums"])
    grid = drum_grid(hits, bars)

    print("notes (Basic Pitch)...", file=sys.stderr)
    def notes_of(stem: str, lo: int, hi: int) -> List[Tuple[float, float, int, float]]:
        _, _, events = predict(stems[stem], onset_threshold=0.5, frame_threshold=0.3, minimum_note_length=80)
        return sorted((float(s), float(e), int(p), float(amp)) for s, e, p, amp, _ in events if lo <= p <= hi)
    bass = notes_of("bass", 24, 60)
    other = notes_of("other", 40, 96)
    vocals = notes_of("vocals", 40, 96)

    key, fit = key_of([x + y for x, y in zip(pitch_weights(bass), pitch_weights(other))])
    chords = []
    for s, length in bars:
        w = [x + 0.5 * y for x, y in zip(pitch_weights(other, s, s + length), pitch_weights(bass, s, s + length))]
        bw = pitch_weights(bass, s, s + length)
        root = max(range(12), key=lambda i: bw[i]) if sum(bw) > 0 else None
        c = chord_of(w, root, scale_of(key)) if sum(w) > 0.05 * length else None
        chords.append({"name": c[0], "root": c[1], "shape": list(c[2])} if c else None)

    levels = {}
    for s, f in stems.items():
        y, sr = librosa.load(f, sr=11025, mono=True)
        rms = []
        for b0, length in bars:
            seg = y[int(b0 * sr):int((b0 + length) * sr)]
            rms.append(float(np.sqrt(np.mean(seg ** 2))) if len(seg) else 0.0)
        top = max(rms) or 1.0
        levels[s] = [r / top for r in rms]

    names = [c["name"] if c else None for c in chords]
    feats = bar_features(grid, levels, names)
    sections = sections_of(feats, names)
    parts = group_sections(sections, feats, names)
    hat_times = list(hits.get("hat", [])) or [t for v in hits.values() for t in v]
    return {
        "title": os.path.splitext(os.path.basename(path))[0][:40],
        "source": os.path.abspath(path),
        "start": start, "end": end, "seconds": round(duration, 2),
        "tempo": round(tempo_of(bars), 2),
        "bars": [[round(s, 4), round(l, 4)] for s, l in bars],
        "swing": swing_of(hat_times, bars),
        "key": key, "key_fit": fit,
        "drum_source": source,
        "drums": grid,
        "bass_notes": bass,
        "chords": chords,
        "levels": levels,
        "sections": sections,
        "parts": parts,
        "vocal_range": [note_name(min(p for _, _, p, _ in vocals)), note_name(max(p for _, _, p, _ in vocals))] if vocals else None,
    }


def _drum_hits(path: str) -> Tuple[Dict[str, List[float]], str]:
    """Drum hit times by class: ADTOF when it is installed, else onsets in three bands."""
    try:
        import torch
        from adtof_pytorch import (FRAME_RNN_THRESHOLDS, LABELS_5, PeakPicker, calculate_n_bins,
                                   create_frame_rnn_model, get_default_weights_path, load_audio_for_model,
                                   load_pytorch_weights)
        model = create_frame_rnn_model(calculate_n_bins())
        model = load_pytorch_weights(model, get_default_weights_path(), strict=False)
        model.eval()
        with torch.no_grad():
            pred = model(load_audio_for_model(path)).numpy()
        peaks = PeakPicker(thresholds=FRAME_RNN_THRESHOLDS, fps=100).pick(pred, labels=LABELS_5, label_offset=0)[0]
        hits = {name: [] for name in ADTOF_CLASSES.values()}
        for note, times in peaks.items():
            if note in ADTOF_CLASSES:
                hits[ADTOF_CLASSES[note]] = [float(t) for t in times]
        return hits, "ADTOF on the Demucs drum stem"
    except ImportError:
        pass
    import numpy as np
    import librosa
    y, sr = librosa.load(path, sr=22050, mono=True)
    hits = {}
    for name, lo, hi in (("kick", 30, 120), ("snare", 1000, 5000), ("hat", 7000, 11000)):
        S = np.abs(librosa.stft(y, n_fft=1024, hop_length=256))
        f = librosa.fft_frequencies(sr=sr, n_fft=1024)
        env = np.log1p(50 * S[(f >= lo) & (f < hi)].sum(0))
        flux = np.maximum(0, np.diff(env, prepend=env[0]))
        frames = librosa.onset.onset_detect(onset_envelope=flux, sr=sr, hop_length=256, units="frames")
        hits[name] = [float(t) for t in librosa.frames_to_time(frames, sr=sr, hop_length=256)]
    return hits, "band onsets of the Demucs drum stem (install adtof-pytorch for better drums)"


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description="Measure a song's audio and draft an ARC BEAT card of scenes.")
    p.add_argument("audio", nargs="?", help="the song: wav, mp3, flac or m4a")
    p.add_argument("--out", help="where the stems, analysis.json and card.txt go (default: SONG.remake)")
    p.add_argument("--start", type=float, help="analyse from this second")
    p.add_argument("--end", type=float, help="analyse up to this second")
    p.add_argument("--from-json", help="redraw the card from an earlier analysis.json, without the models")
    p.add_argument("--loop-bars", type=int, default=4, choices=[1, 2, 3, 4], help="bars a scene loops (default 4)")
    args = p.parse_args(argv)
    if args.from_json:
        with open(args.from_json) as fh:
            a = json.load(fh)
        out = os.path.dirname(os.path.abspath(args.from_json))
    elif args.audio:
        out = args.out or os.path.splitext(args.audio)[0] + ".remake"
        a = analyse(args.audio, out, args.start, args.end)
        with open(os.path.join(out, "analysis.json"), "w") as fh:
            json.dump(a, fh, indent=1)
    else:
        p.error("give an audio file or --from-json")
    card = draft_card(a, args.loop_bars)
    with open(os.path.join(out, "card.txt"), "w") as fh:
        fh.write(card)
    sys.stdout.write(card)
    sys.path.insert(0, HERE)
    import beatcard
    problems = beatcard.parse_card(card).problems
    for pr in problems:
        print("check: %s" % pr, file=sys.stderr)
    print("tempo %.1f, key %s, %d bars, %d sections in %d parts; %s" % (
        a["tempo"], a["key"], len(a["bars"]), len(a["sections"]), len(set(a["parts"])), os.path.join(out, "card.txt")), file=sys.stderr)
    return 1 if any(getattr(x, "level", "") == "error" for x in problems) else 0


if __name__ == "__main__":
    sys.exit(main())
