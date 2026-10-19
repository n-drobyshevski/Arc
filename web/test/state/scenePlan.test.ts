// Port of app/src/test/kotlin/dev/arc/ep133/controller/ScenePlanTest.kt: scenes as the controller keeps them
// (the picks and their queue, the tick each mode gives, the CLIP row and its PAD flow, and what Live shows).
// Web deltas: SceneDesk.open(g) is openOn(g) (open is the getter); SwitchTime.cycled() is cycledSwitch(t);
// the test's `with` helper is withP (`with` is reserved in JS); the names map is keyed by group and offset.
import { beforeEach, describe, expect, it } from "vitest";
import { NoteNames } from "../../src/core/features/keys";
import {
  physicalPad,
  type PhysicalPad,
} from "../../src/core/features/padNotes";
import {
  ProjectPatterns,
  ProjectSeq,
  Seq,
  pattern,
  patternNote,
  projectSeq,
  scene,
  type PatternNote,
} from "../../src/core/features/pattern";
import { PatternRecorder } from "../../src/core/features/patternRecorder";
import {
  SWITCH_TIMES,
  SceneErase,
  SceneOps,
  SwitchTime,
} from "../../src/core/features/scenes";
import { PhaseAnchors } from "../../src/core/features/sequencer";
import { MirrorText } from "../../src/core/text/mirrorText";
import {
  ClipMode,
  LIGHTS,
  NO_LIGHTS,
  PadStage,
  SceneDesk,
  closedAt,
  cycledSwitch,
  filledPatterns,
  queueTick,
  stepLights,
  wrapPattern,
  type QueuedPick,
} from "../../src/state/scenePlan";
import { stepWord } from "../../src/state/stepPlan";

const kick = physicalPad(0, 9);
const snare = physicalPad(1, 11);
const padName = (p: PhysicalPad): string => `${p.group}:${p.offset}`;
const names = new Map<string, string>([
  [padName(kick), "kick"],
  [padName(snare), "snare"],
]);
const bar = Seq.TICKS_PER_BAR;
const idle = ProjectSeq.DEFAULT;

let recorder: PatternRecorder;
let desk: SceneDesk;
beforeEach(() => {
  recorder = new PatternRecorder();
  desk = new SceneDesk((p) =>
    stepWord(
      { pad: p, semitones: null },
      names.get(padName(p)) ?? null,
      NoteNames.LETTERS,
    ),
  );
});

const note = (tick: number, pad: PhysicalPad = kick): PatternNote =>
  patternNote(tick, pad.offset, 24);

// [seq] with [group]'s pattern [n] holding [notes], [bars] long.
const withP = (
  seq: ProjectSeq,
  group: number,
  n: number,
  bars: number,
  ...notes: PatternNote[]
): ProjectSeq => ProjectSeq.withPattern(seq, group, n, pattern(bars, notes));

// Two scenes, the first playing: [1,1,1,1] and [2,2,2,2].
const twoScenes = (): ProjectSeq =>
  SceneOps.selectScene(SceneOps.newScene(idle), 0);

// 99 scenes, the last playing.
const fullScenes = (): ProjectSeq => {
  let s = idle;
  for (let i = 0; i < Seq.MAX_SCENES - 1; i++) s = SceneOps.newScene(s);
  return s;
};

// Kotlin's targets(seq).mapValues { it.value.to }.
const tos = (m: Map<number, QueuedPick>): Map<number, number> =>
  new Map([...m].map(([g, q]) => [g, q.to]));
const ats = (m: Map<number, QueuedPick>): Set<number> =>
  new Set([...m.values()].map((q) => q.at));

describe("ScenePlanTest", () => {
  it("stopped, a pick plays at once, and the grid it was made on closes", () => {
    desk.openOn(0);
    desk.grid(1);
    const out = desk.pickPattern(idle, 1, 5, null, SwitchTime.BAR);
    expect(ProjectSeq.selected(out, 1)).toBe(5);
    expect(desk.waiting).toBe(0);
    expect(desk.gridGroup).toBeNull();
    expect(desk.said).toBe("Group B, pattern 5, 1 bar");
    // Held to 1..99.
    expect(
      ProjectSeq.selected(
        desk.pickPattern(idle, 0, 250, null, SwitchTime.BAR),
        0,
      ),
    ).toBe(99);
    expect(
      ProjectSeq.selected(
        desk.pickPattern(idle, 0, -3, null, SwitchTime.BAR),
        0,
      ),
    ).toBe(1);
    // A new scene, or the scene picked, plays at once too.
    expect(desk.pickScene(twoScenes(), 1, null, SwitchTime.PATTERN).scene).toBe(
      1,
    );
    expect(desk.pickScene(twoScenes(), 2, null, SwitchTime.PATTERN).scene).toBe(
      2,
    );
    expect(desk.waiting).toBe(0);
  });

  it("playing, a pick waits for its tick, the sequencer as it was, and Live shows it queued", () => {
    const seq = withP(idle, 1, 1, 2);
    const out = desk.pickPattern(seq, 1, 5, 100.0, SwitchTime.PATTERN);
    expect(out).toBe(seq);
    expect(desk.targets(seq)).toEqual(
      new Map([[1, { to: 5, at: 2 * bar, time: SwitchTime.PATTERN }]]),
    );
    const ui = desk.ui(seq, SwitchTime.PATTERN);
    expect(ui.groups[1]!.number).toBe(1);
    expect(ui.groups[1]!.queued).toBe(5);
    expect(ui.groups[0]!.queued).toBeNull();
    expect(ui.status).toBe("B → 05 at pattern end");
    expect(ui.said).toBe("Group B, pattern 5, at pattern end");
    // Immediate: queued for the next whole tick, and no word for it.
    const now = new SceneDesk(() => "");
    now.pickPattern(seq, 0, 3, 100.2, SwitchTime.IMMEDIATE);
    expect(now.targets(seq)).toEqual(
      new Map([[0, { to: 3, at: 101, time: SwitchTime.IMMEDIATE }]]),
    );
    expect(now.ui(seq, SwitchTime.IMMEDIATE).status).toBeNull();
    expect(now.said).toBe("Group A, pattern 3, 1 bar");
  });

  it("the tick of a pick is the setting's, now, the bar line or the pattern's end, and a press on a line switches there", () => {
    expect(
      [100.2, 100.0].map((t) => queueTick(SwitchTime.IMMEDIATE, t, bar)),
    ).toEqual([101, 100]);
    expect(
      [100.0, 384.0, 384.5].map((t) => queueTick(SwitchTime.BAR, t, 2 * bar)),
    ).toEqual([384, 384, 768]);
    expect(
      [100.0, 768.0, 768.5].map((t) =>
        queueTick(SwitchTime.PATTERN, t, 2 * bar),
      ),
    ).toEqual([768, 768, 1536]);
    // Counting in, no sooner than bar 1.
    expect(SWITCH_TIMES.map((t) => queueTick(t, -1000.0, bar))).toEqual([
      0, 0, 0,
    ]);
  });

  it("a group's pick takes its own pattern's length under PATTERN, a scene's the longest, and BAR is one line for all", () => {
    // Group A 1 bar, B 2, C 4, D 1.
    const seq = withP(withP(withP(twoScenes(), 1, 1, 2), 2, 1, 4), 3, 1, 1);
    for (const [g, end] of [
      [0, 384],
      [1, 768],
      [2, 1536],
    ] as const) {
      const d = new SceneDesk(() => "");
      d.pickPattern(seq, g, 7, 100.0, SwitchTime.PATTERN);
      expect(d.targets(seq).get(g)!.at).toBe(end);
    }
    const patternEnd = new SceneDesk(() => "");
    patternEnd.pickScene(seq, 1, 100.0, SwitchTime.PATTERN);
    // All four groups at the end of the longest, A's pattern 1 playing 1 bar notwithstanding.
    expect(ats(patternEnd.targets(seq))).toEqual(new Set([1536]));
    expect(new Set(patternEnd.targets(seq).keys())).toEqual(
      new Set([0, 1, 2, 3]),
    );
    const barEnd = new SceneDesk(() => "");
    barEnd.pickScene(seq, 1, 100.0, SwitchTime.BAR);
    expect(ats(barEnd.targets(seq))).toEqual(new Set([384]));
    expect(barEnd.ui(seq, SwitchTime.BAR).status).toBe("→ S02 at bar end");
    expect(barEnd.ui(seq, SwitchTime.BAR).sceneQueued).toBe(2);
    expect(barEnd.ui(seq, SwitchTime.BAR).groups[0]!.queued).toBe(2);
  });

  it("a later pick of the group replaces its queue, one of what plays cancels it, and other groups keep theirs", () => {
    const seq = idle;
    desk.pickPattern(seq, 1, 5, 100.0, SwitchTime.BAR);
    desk.pickPattern(seq, 2, 3, 100.0, SwitchTime.BAR);
    desk.pickPattern(seq, 1, 7, 200.0, SwitchTime.BAR);
    expect(tos(desk.targets(seq))).toEqual(
      new Map([
        [1, 7],
        [2, 3],
      ]),
    );
    expect(desk.ui(seq, SwitchTime.BAR).status).toBe(
      "B → 07, C → 03 at bar end",
    );
    desk.pickPattern(seq, 1, 1, 200.0, SwitchTime.BAR);
    expect(tos(desk.targets(seq))).toEqual(new Map([[2, 3]]));
    expect(desk.waiting).toBe(1);
  });

  it("a scene change cancels the groups' picks, and a group's pick cancels the scene's", () => {
    const seq = twoScenes();
    desk.pickPattern(seq, 0, 9, 100.0, SwitchTime.BAR);
    desk.pickScene(seq, 1, 100.0, SwitchTime.BAR);
    expect(desk.waiting).toBe(1);
    expect(new Set(desk.targets(seq).keys())).toEqual(new Set([0, 1, 2, 3]));
    expect([...desk.targets(seq).values()].map((q) => q.to)).toEqual([
      2, 2, 2, 2,
    ]);
    desk.pickPattern(seq, 0, 9, 100.0, SwitchTime.BAR);
    expect(tos(desk.targets(seq))).toEqual(new Map([[0, 9]]));
    expect(desk.ui(seq, SwitchTime.BAR).sceneQueued).toBeNull();
    // The scene playing picked is no change: it cancels the scene's queue.
    desk.pickScene(seq, 1, 100.0, SwitchTime.BAR);
    desk.pickScene(seq, 0, 100.0, SwitchTime.BAR);
    expect(desk.waiting).toBe(0);
    expect(desk.targets(seq).size).toBe(0);
  });

  it("a scene queued for a scene sharing a group's pattern leaves that group playing it", () => {
    const seq = projectSeq([], [scene([1, 1, 1, 1]), scene([1, 3, 1, 4])]);
    desk.pickScene(seq, 1, 100.0, SwitchTime.BAR);
    expect(tos(desk.targets(seq))).toEqual(
      new Map([
        [1, 3],
        [3, 4],
      ]),
    );
    const ui = desk.ui(seq, SwitchTime.BAR);
    expect(ui.groups.map((g) => g.queued)).toEqual([null, 3, null, 4]);
  });

  it("- and + step from the number shown, the queued one, wrapping round 1 to 99", () => {
    const seq = idle;
    desk.stepPattern(seq, 0, 1, 100.0, SwitchTime.BAR);
    desk.stepPattern(seq, 0, 1, 100.0, SwitchTime.BAR);
    expect(desk.targets(seq).get(0)!.to).toBe(3);
    // Back to the one playing: no queue.
    desk.stepPattern(seq, 0, -1, 100.0, SwitchTime.BAR);
    desk.stepPattern(seq, 0, -1, 100.0, SwitchTime.BAR);
    expect(desk.waiting).toBe(0);
    expect(
      ProjectSeq.selected(
        desk.stepPattern(seq, 0, -1, null, SwitchTime.BAR),
        0,
      ),
    ).toBe(99);
    expect(
      ProjectSeq.selected(
        desk.stepPattern(
          SceneOps.selectPattern(seq, 0, 99),
          0,
          1,
          null,
          SwitchTime.BAR,
        ),
        0,
      ),
    ).toBe(1);
    expect([
      wrapPattern(1, -1),
      wrapPattern(99, 1),
      wrapPattern(1, 1),
      wrapPattern(99, -1),
    ]).toEqual([99, 1, 2, 98]);
  });

  it("the scene's + past the last is a new scene, queued like the rest, and - stays on the first", () => {
    const seq = twoScenes();
    desk.stepScene(seq, 1, 100.0, SwitchTime.BAR);
    expect(desk.ui(seq, SwitchTime.BAR).sceneQueued).toBe(2);
    desk.stepScene(seq, 1, 100.0, SwitchTime.BAR);
    // The third: the scene to come.
    expect(desk.ui(seq, SwitchTime.BAR).sceneQueued).toBe(3);
    desk.stepScene(seq, 1, 100.0, SwitchTime.BAR);
    expect(desk.ui(seq, SwitchTime.BAR).sceneQueued).toBe(3);
    // The new scene's patterns are the groups' next free ones.
    expect([...desk.targets(seq).values()].map((q) => q.to)).toEqual([
      2, 2, 2, 2,
    ]);
    const out = desk.due(seq, 384.0);
    expect(out.scenes.length).toBe(3);
    expect(out.scene).toBe(2);
    expect(desk.said).toBe("Scene 3 of 3, patterns A 2, B 2, C 2, D 2");
    // - from the first scene is no change.
    const first = new SceneDesk(() => "");
    expect(first.stepScene(seq, -1, null, SwitchTime.BAR).scene).toBe(0);
    first.stepScene(seq, -1, 100.0, SwitchTime.BAR);
    expect(first.waiting).toBe(0);
    // At 99 scenes + past the last has nowhere to go.
    const full = fullScenes();
    const last = new SceneDesk(() => "");
    last.stepScene(full, 1, 100.0, SwitchTime.BAR);
    expect(last.waiting).toBe(0);
    expect(last.stepScene(full, 1, null, SwitchTime.BAR)).toBe(full);
  });

  it("NEXT FREE picks the first pattern with no notes after the number shown", () => {
    let seq = idle;
    for (let n = 1; n <= 3; n++) seq = withP(seq, 0, n, 1, note(0));
    expect(
      ProjectSeq.selected(desk.pickNextFree(seq, 0, null, SwitchTime.BAR), 0),
    ).toBe(4);
    // Playing, queued; asked again, it goes on from the queued number.
    desk.pickNextFree(seq, 0, 100.0, SwitchTime.BAR);
    expect(desk.targets(seq).get(0)!.to).toBe(4);
    seq = withP(seq, 0, 4, 1, note(0));
    desk.pickNextFree(seq, 0, 100.0, SwitchTime.BAR);
    expect(desk.targets(seq).get(0)!.to).toBe(5);
  });

  it("the picks take over as the playhead passes their ticks, each in its turn", () => {
    // A 1 bar, B 2: BAR and PATTERN give their own ticks.
    const seq = withP(idle, 1, 1, 2);
    desk.pickPattern(seq, 0, 5, 100.0, SwitchTime.PATTERN);
    desk.pickPattern(seq, 1, 6, 100.0, SwitchTime.PATTERN);
    expect(desk.due(seq, 383.5)).toBe(seq);
    expect(desk.waiting).toBe(2);
    const a = desk.due(seq, 384.0);
    expect([ProjectSeq.selected(a, 0), ProjectSeq.selected(a, 1)]).toEqual([
      5, 1,
    ]);
    expect(desk.waiting).toBe(1);
    expect(desk.said).toBe("Group A, pattern 5, 1 bar");
    expect(desk.status).toBeNull();
    const b = desk.due(a, 900.0);
    expect([ProjectSeq.selected(b, 0), ProjectSeq.selected(b, 1)]).toEqual([
      5, 6,
    ]);
    expect(desk.waiting).toBe(0);
    expect(desk.dueTick()).toBeNull();
    // The ticks the controller wakes for.
    desk.pickPattern(b, 2, 7, 1000.0, SwitchTime.BAR);
    desk.pickPattern(b, 3, 8, 1000.0, SwitchTime.PATTERN);
    expect(desk.dueTick()).toBe(1152);
  });

  it("a scene change takes over every group at its tick, and a new scene is made then", () => {
    const seq = twoScenes();
    desk.pickScene(seq, 1, 100.0, SwitchTime.BAR);
    expect(desk.due(seq, 300.0)).toBe(seq);
    const out = desk.due(seq, 384.0);
    expect(out.scene).toBe(1);
    expect(desk.waiting).toBe(0);
    expect(desk.said).toBe("Scene 2 of 2, patterns A 2, B 2, C 2, D 2");
  });

  it("a pattern taking over starts at its bar 1 on that tick, and only the groups it changes", () => {
    const seq = projectSeq([], [scene([1, 1, 1, 1]), scene([1, 3, 1, 4])]);
    expect(desk.phase).toEqual(PhaseAnchors.ZERO);
    // A scene change: the groups that change start at the scene's tick, the others go on.
    desk.pickScene(seq, 1, 100.0, SwitchTime.BAR);
    desk.due(seq, 384.0);
    expect([0, 1, 2, 3].map((g) => PhaseAnchors.of(desk.phase, g))).toEqual([
      0, 384, 0, 384,
    ]);
    // A pick of a group: now, the next whole tick.
    const out = SceneOps.selectScene(seq, 1);
    desk.pickPattern(out, 2, 5, 500.2, SwitchTime.IMMEDIATE);
    expect(PhaseAnchors.of(desk.phase, 1)).toBe(384);
    const after = desk.due(out, 501.0);
    expect(ProjectSeq.selected(after, 2)).toBe(5);
    expect([0, 1, 2, 3].map((g) => PhaseAnchors.of(desk.phase, g))).toEqual([
      0, 384, 501, 384,
    ]);
    // The transport starting afresh, or another project, puts them back to bar 1.
    desk.restart();
    expect(desk.phase).toEqual(PhaseAnchors.ZERO);
    desk.pickPattern(after, 0, 7, 10.0, SwitchTime.IMMEDIATE);
    desk.due(after, 11.0);
    expect(PhaseAnchors.of(desk.phase, 0)).toBe(10);
    desk.reset();
    expect(desk.phase).toEqual(PhaseAnchors.ZERO);
  });

  it("STOP leaves where the patterns started alone, the next PLAY putting them back", () => {
    const seq = twoScenes();
    desk.pickPattern(seq, 0, 9, 100.0, SwitchTime.BAR);
    const out = desk.flush(seq);
    expect(ProjectSeq.selected(out, 0)).toBe(9);
    expect(desk.phase).toEqual(PhaseAnchors.ZERO);
  });

  it("Bar end and Pattern end for a group's pick are its own pattern's lines from where it started", () => {
    // Group A's 2-bar pattern 2 started at tick 100 (an immediate pick).
    const seq = withP(withP(idle, 0, 1, 2), 0, 2, 2);
    desk.pickPattern(seq, 0, 2, 100.0, SwitchTime.IMMEDIATE);
    const on = desk.due(seq, 100.0);
    expect(PhaseAnchors.of(desk.phase, 0)).toBe(100);
    const queuedAt = (at: number, time: SwitchTime): number => {
      desk.pickPattern(on, 0, 7, at, time);
      return desk.targets(on).get(0)!.at;
    };
    expect(queuedAt(300.0, SwitchTime.BAR)).toBe(484);
    expect(queuedAt(300.0, SwitchTime.PATTERN)).toBe(868);
    // A line the press is on switches there.
    expect(queuedAt(868.0, SwitchTime.PATTERN)).toBe(868);
    expect(queuedAt(868.5, SwitchTime.PATTERN)).toBe(1636);
    // Another group goes by the transport's lines.
    desk.pickPattern(on, 1, 7, 300.0, SwitchTime.BAR);
    expect(desk.targets(on).get(1)!.at).toBe(384);
  });

  it("a scene's Bar end is the transport's line, its Pattern end the earliest end of the longest patterns from where they started", () => {
    // Groups A and B on 4-bar patterns 3, started at ticks 100 and 300.
    const seq = withP(withP(twoScenes(), 0, 3, 4), 1, 3, 4);
    desk.pickPattern(seq, 0, 3, 100.0, SwitchTime.IMMEDIATE);
    const a = desk.due(seq, 100.0);
    desk.pickPattern(a, 1, 3, 300.0, SwitchTime.IMMEDIATE);
    const on = desk.due(a, 300.0);
    expect([0, 1, 2, 3].map((g) => PhaseAnchors.of(desk.phase, g))).toEqual([
      100, 300, 0, 0,
    ]);
    desk.pickScene(on, 1, 500.0, SwitchTime.PATTERN);
    expect(ats(desk.targets(on))).toEqual(new Set([1636]));
    desk.pickScene(on, 1, 500.0, SwitchTime.BAR);
    expect(ats(desk.targets(on))).toEqual(new Set([768]));
  });

  it("an open pattern left closes by its own bars", () => {
    const open = pattern(2, [patternNote(10, 0, 24)], true);
    // Started at tick 384: at global 384 + 700 it is in its bar 2.
    expect(closedAt(open, 384.0 + 700, 384).bars).toBe(2);
    expect(closedAt(open, 384.0 + 1000, 384).bars).toBe(4);
    expect(closedAt(open, 384.0 * 3 - 1, 0).bars).toBe(4);
  });

  it("STOP applies every pick waiting at once", () => {
    const seq = withP(twoScenes(), 0, 1, 2, note(0));
    desk.pickScene(seq, 1, 100.0, SwitchTime.PATTERN);
    const out = desk.flush(seq);
    expect(out.scene).toBe(1);
    expect(desk.waiting).toBe(0);
    desk.pickPattern(out, 2, 9, 100.0, SwitchTime.PATTERN);
    desk.pickPattern(out, 3, 8, 100.0, SwitchTime.BAR);
    const both = desk.flush(out);
    expect([
      ProjectSeq.selected(both, 2),
      ProjectSeq.selected(both, 3),
    ]).toEqual([9, 8]);
    // Nothing waiting, nothing changes.
    expect(desk.flush(both)).toBe(both);
  });

  it("a pattern left while it is open is closed as punch-out closes it, so it loops when picked again", () => {
    const notes = [note(10), note(500)];
    const open = pattern(1, notes, true);
    // 800 ticks gone: 3 bars, rounded up to 4.
    expect(closedAt(open, 800.0)).toEqual(pattern(4, notes));
    expect(closedAt(open, 100.0)).toEqual(pattern(2, notes));
    expect(closedAt(open, 5000.0)).toEqual(pattern(8, notes));
    expect(closedAt(pattern(4, [], true), 800.0)).toEqual(pattern(1));
    const closed = pattern(2, notes);
    expect(closedAt(closed, 800.0)).toBe(closed);
    const seq = ProjectSeq.withPattern(idle, 0, 1, open);
    desk.pickPattern(seq, 0, 2, 799.5, SwitchTime.IMMEDIATE);
    const out = desk.due(seq, 800.0);
    expect(ProjectSeq.selected(out, 0)).toBe(2);
    expect(ProjectSeq.pattern(out, 0, 1)).toEqual(pattern(4, notes));
    // A scene change closes those of the groups it changes only.
    const shared = ProjectSeq.withPattern(
      ProjectSeq.withPattern(
        projectSeq([], [scene([1, 1, 1, 1]), scene([1, 2, 1, 1])]),
        0,
        1,
        open,
      ),
      1,
      1,
      open,
    );
    desk.pickScene(shared, 1, 799.5, SwitchTime.IMMEDIATE);
    const moved = desk.due(shared, 800.0);
    expect(ProjectSeq.pattern(moved, 0, 1).open).toBe(true);
    expect(ProjectSeq.pattern(moved, 1, 1).open).toBe(false);
  });

  it("a pattern left while it is open is closed at the pick's tick, not where the playhead was found past it", () => {
    const notes = [note(10), note(500)];
    const seq = ProjectSeq.withPattern(idle, 0, 1, pattern(1, notes, true));
    // Left at the line of bar 3 (tick 768), found a little after it: 2 bars gone, not 3 (rounded up to 4).
    desk.pickPattern(seq, 0, 2, 700.0, SwitchTime.BAR);
    const out = desk.due(seq, 770.0);
    expect(ProjectSeq.selected(out, 0)).toBe(2);
    expect(ProjectSeq.pattern(out, 0, 1)).toEqual(pattern(2, notes));
  });

  it("COMMIT and the CLR hold are one UNDO step each, at once, and drop the picks waiting", () => {
    const seq = withP(twoScenes(), 0, 1, 1, note(0));
    recorder.seq = seq;
    desk.pickPattern(seq, 1, 5, 100.0, SwitchTime.BAR);
    const committed = desk.commit(seq, recorder);
    expect(committed.scenes.length).toBe(3);
    expect(committed.scene).toBe(1);
    expect(desk.waiting).toBe(0);
    expect(desk.status).toBe("S02 committed");
    expect(desk.said).toBe("Scene 2 committed");
    expect(recorder.undo(committed)).toEqual(seq);
    // The scene's notes: CLR, which the line reads from canDelete.
    expect(desk.ui(seq, SwitchTime.BAR).canDelete).toBe(false);
    desk.pickPattern(seq, 1, 5, 100.0, SwitchTime.BAR);
    const cleared = desk.erase(seq, recorder)!;
    expect(cleared.erase).toBe(SceneErase.CLEARED);
    expect(ProjectPatterns.isEmpty(ProjectSeq.playing(cleared.seq))).toBe(true);
    expect(cleared.seq.scenes.length).toBe(2);
    expect(desk.waiting).toBe(0);
    expect(desk.status).toBe("S01 cleared");
    expect(desk.said).toBe(MirrorText.CLEARED_SCENE);
    expect(recorder.undo(cleared.seq)).toEqual(seq);
  });

  it("an empty scene that isn't the only one is deleted, any other is cleared, and the only empty one does nothing", () => {
    const two = SceneOps.newScene(idle);
    recorder.seq = two;
    const ui = desk.ui(two, SwitchTime.BAR);
    expect(ui.canDelete).toBe(true);
    const deleted = desk.erase(two, recorder)!;
    expect(deleted.erase).toBe(SceneErase.DELETED);
    expect(deleted.seq.scenes.length).toBe(1);
    expect(desk.status).toBe("S02 deleted");
    expect(desk.said).toBe(MirrorText.DELETED_SCENE);
    expect(recorder.undo(deleted.seq)).toEqual(two);
    // The only scene, empty: nothing to clear, and nothing to delete.
    expect(desk.ui(idle, SwitchTime.BAR).canDelete).toBe(false);
    expect(desk.erase(idle, new PatternRecorder())).toBeNull();
    expect(new PatternRecorder().canUndo).toBe(false);
    // With notes the scene can't be deleted, only cleared.
    const noted = withP(two, 1, 2, 1, note(0));
    expect(desk.ui(noted, SwitchTime.BAR).canDelete).toBe(false);
    expect(desk.erase(noted, new PatternRecorder())!.erase).toBe(
      SceneErase.CLEARED,
    );
  });

  it("COMMIT at 99 scenes does nothing but say so", () => {
    const full = fullScenes();
    const r = new PatternRecorder();
    expect(desk.commit(full, r)).toBe(full);
    expect(desk.status).toBe(MirrorText.SCENES_FULL);
    expect(r.canUndo).toBe(false);
  });

  it("PTN copies the focused group's pattern, PASTE replaces the one the focus is on, and UNDO takes it back", () => {
    const seq = withP(idle, 0, 1, 2, note(0), note(400, snare));
    recorder.seq = seq;
    desk.openOn(0);
    desk.copy(seq);
    expect(desk.ui(seq, SwitchTime.BAR).clip).toEqual({
      mode: ClipMode.PTN,
      what: "A01",
    });
    expect(desk.status).toBe("A01 copied");
    expect(desk.said).toBe("P01 copied.");
    desk.focus(2);
    const out = desk.paste(seq, recorder);
    expect(ProjectSeq.pattern(out, 2, 1)).toEqual(
      pattern(
        2,
        ProjectSeq.pattern(seq, 0, 1).notes.map((n) => ({ ...n, id: 0 })),
      ),
    );
    expect(desk.status).toBe("C01 pasted");
    expect(desk.said).toBe("Pasted into P01.");
    expect(recorder.undo(out)).toEqual(seq);
    // The clipboard stays for another paste.
    expect(desk.ui(seq, SwitchTime.BAR).clip).toEqual({
      mode: ClipMode.PTN,
      what: "A01",
    });
  });

  it("BAR copies the bar page of the focused group and pastes into the page held to the group it lands in", () => {
    const seq = withP(idle, 0, 1, 2, note(10), note(400), note(500, snare));
    recorder.seq = seq;
    desk.mode(ClipMode.BAR);
    desk.page(1);
    desk.copy(seq);
    expect(desk.ui(seq, SwitchTime.BAR).clip).toEqual({
      mode: ClipMode.BAR,
      what: "bar 2",
    });
    expect(desk.status).toBe("A bar 2 copied");
    expect(desk.said).toBe("Bar 2 copied.");
    // Group B has one bar: the page shows, and pastes into, its bar 1.
    desk.focus(1);
    expect(desk.ui(seq, SwitchTime.BAR).bar).toBe(0);
    const out = desk.paste(seq, recorder);
    expect(ProjectSeq.pattern(out, 1, 1).notes.map((n) => n.tick)).toEqual([
      16, 116,
    ]);
    expect(desk.status).toBe("B bar 1 pasted");
    expect(desk.said).toBe("Pasted into bar 1.");
    expect(recorder.undo(out)).toEqual(seq);
    // The page itself is kept, held on the way out.
    desk.focus(0);
    expect(desk.ui(seq, SwitchTime.BAR).bar).toBe(1);
    desk.page(500);
    expect(desk.ui(seq, SwitchTime.BAR).bar).toBe(1);
  });

  it("PASTE with nothing of the mode's kind copied says so and changes nothing", () => {
    const seq = withP(idle, 0, 1, 1, note(0));
    const r = new PatternRecorder();
    r.seq = seq;
    // Nothing copied at all.
    for (const [mode, word] of [
      [ClipMode.PTN, MirrorText.NO_PATTERN_COPIED],
      [ClipMode.BAR, MirrorText.NO_BAR_COPIED],
      [ClipMode.PAD, MirrorText.NO_PAD_COPIED],
    ] as const) {
      desk.mode(mode);
      expect(desk.paste(seq, r)).toBe(seq);
      expect(desk.status).toBe(word);
      expect(desk.padStage).toBe(PadStage.NONE);
    }
    // A pattern copied, a bar asked for.
    desk.mode(ClipMode.PTN);
    desk.copy(seq);
    desk.mode(ClipMode.BAR);
    expect(desk.paste(seq, r)).toBe(seq);
    expect(desk.status).toBe(MirrorText.NO_BAR_COPIED);
    expect(r.canUndo).toBe(false);
  });

  it("PAD asks for a tap to copy, then a tap to paste, in any group, and the pads taken play nothing", () => {
    // The kick has notes at 0 and 400 of a 2-bar pattern; group B's pattern is a bar long.
    const seq = ProjectSeq.withPattern(
      withP(idle, 0, 1, 2, note(0), note(400), note(8, physicalPad(0, 3))),
      1,
      1,
      pattern(1, [note(5, snare), note(7, physicalPad(1, 4))]),
    );
    recorder.seq = seq;
    desk.openOn(0);
    desk.mode(ClipMode.PAD);
    // COPY waits for a pad; COPY again drops it.
    desk.copy(seq);
    expect(desk.padStage).toBe(PadStage.SOURCE);
    expect(desk.ui(seq, SwitchTime.BAR).status).toBe("Tap a pad");
    desk.copy(seq);
    expect(desk.padStage).toBe(PadStage.NONE);
    desk.copy(seq);
    expect(desk.padTap(kick, seq, recorder)).toBe(seq);
    expect(desk.padStage).toBe(PadStage.NONE);
    expect(desk.ui(seq, SwitchTime.BAR).clip).toEqual({
      mode: ClipMode.PAD,
      what: "KICK",
    });
    expect(desk.status).toBe("KICK copied");
    expect(desk.said).toBe("KICK copied.");
    // PASTE waits for the target, and says which pad is on the clipboard.
    desk.paste(seq, recorder);
    expect(desk.padStage).toBe(PadStage.TARGET);
    expect(desk.ui(seq, SwitchTime.BAR).status).toBe("KICK → tap target");
    const out = desk.padTap(snare, seq, recorder);
    expect(desk.padStage).toBe(PadStage.NONE);
    // The snare's notes are the kick's, those past group B's one bar left out; its other pads stay.
    expect(
      ProjectSeq.pattern(out, 1, 1)
        .notes.filter((n) => n.offset === snare.offset)
        .map((n) => n.tick),
    ).toEqual([0]);
    expect(
      ProjectSeq.pattern(out, 1, 1)
        .notes.filter((n) => n.offset === 4)
        .map((n) => n.tick),
    ).toEqual([7]);
    expect(desk.status).toBe("SNARE pasted");
    expect(desk.said).toBe("Pasted onto SNARE.");
    expect(recorder.undo(out)).toEqual(seq);
    // A tap when none waits is nobody's.
    expect(desk.padTap(kick, seq, recorder)).toBe(seq);
    expect(desk.ui(seq, SwitchTime.BAR).clip).toEqual({
      mode: ClipMode.PAD,
      what: "KICK",
    });
  });

  it("the PAD flow ends with another mode, the grid, closing the panel, or ERASE", () => {
    const seq = withP(idle, 0, 1, 1, note(0));
    desk.openOn(0);
    desk.mode(ClipMode.PAD);
    desk.copy(seq);
    desk.mode(ClipMode.PTN);
    expect(desk.padStage).toBe(PadStage.NONE);
    desk.mode(ClipMode.PAD);
    desk.copy(seq);
    desk.grid(1);
    expect(desk.padStage).toBe(PadStage.NONE);
    desk.copy(seq);
    desk.close();
    expect(desk.padStage).toBe(PadStage.NONE);
    desk.openOn(0);
    desk.copy(seq);
    desk.endStage();
    expect(desk.padStage).toBe(PadStage.NONE);
    expect(desk.status).toBeNull();
  });

  it("the status shows what was done, else the PAD flow, else the grid, else the queue", () => {
    const seq = idle;
    desk.openOn(0);
    desk.pickPattern(seq, 1, 5, 100.0, SwitchTime.BAR);
    expect(desk.ui(seq, SwitchTime.BAR).status).toBe("B → 05 at bar end");
    desk.grid(2);
    expect(desk.ui(seq, SwitchTime.BAR).status).toBe("C · pick 01–99");
    expect(desk.ui(seq, SwitchTime.BAR).gridGroup).toBe(2);
    desk.grid(null);
    desk.mode(ClipMode.PAD);
    desk.copy(seq);
    expect(desk.ui(seq, SwitchTime.BAR).status).toBe("Tap a pad");
    desk.endStage();
    expect(desk.ui(seq, SwitchTime.BAR).status).toBe("B → 05 at bar end");
    desk.mode(ClipMode.PTN);
    desk.copy(seq);
    expect(desk.ui(seq, SwitchTime.BAR).status).toBe("A01 copied");
    // The next thing done clears it.
    desk.focus(1);
    expect(desk.ui(seq, SwitchTime.BAR).status).toBe("B → 05 at bar end");
  });

  it("Live shows the scene, each column's number, filled patterns, next free one and length", () => {
    let seq = twoScenes();
    for (const n of [1, 2, 3, 5]) seq = withP(seq, 1, n, 1, note(0));
    seq = withP(SceneOps.selectPattern(seq, 1, 3), 1, 3, 4, note(0));
    const ui = desk.ui(seq, SwitchTime.PATTERN);
    expect(ui.open).toBe(false);
    expect(ui.index).toBe(0);
    expect(ui.count).toBe(2);
    expect(ui.label).toBe("S01");
    expect(ui.switchTime).toBe(SwitchTime.PATTERN);
    const b = ui.groups[1]!;
    expect(b.number).toBe(3);
    expect(b.filled).toEqual(new Set([1, 2, 3, 5]));
    expect(b.nextFree).toBe(4);
    expect(b.bars).toBe(4);
    expect(ui.groups[0]!.filled.size).toBe(0);
    expect(ui.groups[0]!.nextFree).toBe(2);
    // The next free one is from the number shown: the queued one, once there is one.
    desk.pickPattern(seq, 1, 5, 100.0, SwitchTime.BAR);
    expect(desk.ui(seq, SwitchTime.BAR).groups[1]!.nextFree).toBe(6);
    // A pattern with notes makes the scene one that can't be deleted.
    expect(ui.canDelete).toBe(false);
    expect(ui.clip).toBeNull();
    expect(ui.status).toBeNull();
    expect(ui.said).toBeNull();
  });

  it("closing keeps the picks waiting and the clipboard, another project drops the picks and keeps the clipboard", () => {
    const seq = withP(idle, 0, 1, 1, note(0));
    desk.openOn(2);
    expect(desk.group).toBe(2);
    desk.copy(seq);
    desk.pickPattern(seq, 1, 5, 100.0, SwitchTime.BAR);
    desk.grid(1);
    desk.close();
    expect(desk.open).toBe(false);
    expect(desk.gridGroup).toBeNull();
    expect(desk.said).toBeNull();
    expect(desk.waiting).toBe(1);
    expect(desk.ui(seq, SwitchTime.BAR).clip?.mode).toBe(ClipMode.PTN);
    desk.reset();
    expect(desk.waiting).toBe(0);
    expect(desk.dueTick()).toBeNull();
    // The clipboard is the device's too: it stays for the other project.
    expect(desk.ui(seq, SwitchTime.BAR).clip).toEqual({
      mode: ClipMode.PTN,
      what: "C01",
    });
  });

  it("a pattern copied in one project pastes in another", () => {
    const rec = new PatternRecorder();
    const a = withP(idle, 0, 1, 1, note(0));
    desk.openOn(0);
    desk.copy(a);
    desk.reset();
    const b = idle;
    rec.seq = b;
    const out = desk.paste(b, rec);
    expect(
      ProjectSeq.pattern(out, 0, 1).notes.map((n) => ({ ...n, id: 0 })),
    ).toEqual([note(0)]);
    expect(desk.clipMode).toBe(ClipMode.PTN);
  });

  it("CHANGE cycles Immediate, Bar end, Pattern end", () => {
    expect(SWITCH_TIMES.map(cycledSwitch)).toEqual([
      SwitchTime.BAR,
      SwitchTime.PATTERN,
      SwitchTime.IMMEDIATE,
    ]);
  });

  it("the grid's filled numbers are those with notes", () => {
    const seq = withP(withP(idle, 0, 4, 2, note(0)), 0, 9, 1);
    expect(filledPatterns(seq, 0)).toEqual(new Set([4]));
    expect(filledPatterns(seq, 1).size).toBe(0);
  });

  it("a pattern's first bar as sixteen step lights, the hardest hit in each", () => {
    const step = Seq.TICKS_PER_BAR / LIGHTS;
    const p = pattern(2, [
      patternNote(0, 9, 10, null, 120),
      patternNote(0, 4, 10, null, 60),
      // A little early for step 5: to the nearest.
      patternNote(4 * step - 3, 11, 10, null, 100),
      patternNote(8 * step, 2, 10, null, 40),
      // Late in the bar's last half step: round to the first.
      patternNote(Seq.TICKS_PER_BAR - 2, 2, 10, null, 127),
      // The second bar isn't drawn.
      patternNote(Seq.TICKS_PER_BAR + step, 2, 10),
    ]);
    const lights = stepLights(p);
    expect(lights).toHaveLength(LIGHTS);
    expect(lights[0]).toBe("ACCENT");
    expect(lights[4]).toBe("NORMAL");
    expect(lights[8]).toBe("GHOST");
    expect(lights.filter((it) => it !== null)).toHaveLength(3);
    expect(stepLights(pattern())).toEqual(NO_LIGHTS);
  });
});
