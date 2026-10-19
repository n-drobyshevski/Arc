// Port of core/src/test/kotlin/dev/arc/ep133/features/BeatCardLessonTest.kt (the same cases, in the same order).
import { describe, expect, it } from 'vitest'
import { BeatCards, type CardRead } from '../../../src/core/features/beatCard'

const body = ['[A] bars 1', 'A7 kick  | X... .... X... .... |', 'A9 snare | .... X... .... X... |', 'A4 hat   | x.x. x.x. x.x. x.x. |'].join('\n')

function read(lessons: string): CardRead {
  return BeatCards.read(`ARC BEAT 1\nname Lesson beat\ntempo 92\n${lessons}\n${body}\n`)
}

describe('a card lesson', () => {
  it('lesson lines are the steps in order, with their pads, speed and tip', () => {
    const r = read('lesson Kick alone | A7 | 50 | Count 1 e and a out loud\nlesson Add the snare | A7 A9 | 50%\nlesson The whole groove | A')
    expect(r.problems).toEqual([])
    const steps = r.card!.lesson
    expect(steps).toEqual([
      { title: 'Kick alone', group: 0, pads: [9], speed: 50, tip: 'Count 1 e and a out loud' },
      { title: 'Add the snare', group: 0, pads: [9, 11], speed: 50, tip: null },
      { title: 'The whole groove', group: 0, pads: null, speed: 100, tip: null },
    ])
    const text = BeatCards.write(r.card!)
    expect(text).toContain('\nlesson Kick alone | A7 | 50 | Count 1 e and a out loud\nlesson Add the snare | A7 A9 | 50\nlesson The whole groove | A\n')
    expect(BeatCards.read(text).card!.lesson).toEqual(steps)
  })

  it('a lesson line may come after the sections too, and a card without one has none', () => {
    expect(BeatCards.read(`ARC BEAT 1\n${body}\nlesson Hats | A4 | 75\n`).card!.lesson).toHaveLength(1)
    expect(BeatCards.read(`ARC BEAT 1\n${body}\n`).card!.lesson ?? []).toEqual([])
  })

  it('a step with no title, pads of two groups, a pad with no hits or a speed out of range is an error', () => {
    const err = (line: string): string => {
      const r = read(line)
      expect(r.card).toBeNull()
      return r.problems.find((p) => p.error)!.message
    }
    expect(err('lesson | A7')).toContain('title')
    expect(err('lesson Two groups | A7 B7')).toContain('one group')
    expect(err('lesson Clap | A6')).toContain('A6 has no hits')
    expect(err('lesson Bass | B')).toContain('no pad hits in group B')
    expect(err('lesson Slow | A7 | 10')).toContain('25 to 100')
    expect(err('lesson Odd | A7 Q9')).toContain("'Q9'")
    expect(err(Array.from({ length: 13 }, (_, i) => `lesson Step ${i + 1} | A7`).join('\n'))).toContain('more than 12')
  })
})
