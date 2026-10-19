// Port of core/src/test/kotlin/dev/arc/ep133/features/NoteTouchesTest.kt
import { describe, expect, it } from 'vitest'
import { NoteTouches, Press, Release } from '../../../src/core/features/noteTouches'

describe('NoteTouchesTest', () => {
  it('a slide lets go of each note and plays the next', () => {
    const t = new NoteTouches()
    expect(t.down(1, 60)).toEqual([Press(60)])
    expect(t.move(1, 60)).toEqual([])
    expect(t.move(1, 62)).toEqual([Release(60), Press(62)])
    expect(t.move(1, 64)).toEqual([Release(62), Press(64)])
    expect(t.held).toEqual(new Set([64]))
    // Off the plate lets go; back on plays again.
    expect(t.move(1, null)).toEqual([Release(64)])
    expect(t.move(1, null)).toEqual([])
    expect(t.move(1, 65)).toEqual([Press(65)])
    expect(t.up(1)).toEqual([Release(65)])
    expect(t.held.size).toBe(0)
    expect(t.up(1)).toEqual([])
  })

  it('two fingers on one note, it sounds until the last lifts', () => {
    const t = new NoteTouches()
    t.down(1, 60)
    // The second finger strikes it again.
    expect(t.down(2, 60)).toEqual([Press(60)])
    expect(t.up(1)).toEqual([])
    expect(t.held).toEqual(new Set([60]))
    expect(t.up(2)).toEqual([Release(60)])
    expect(t.held.size).toBe(0)
  })

  it('a slide onto a held note strikes it again, and leaving keeps it for the other finger', () => {
    const t = new NoteTouches()
    t.down(1, 60)
    t.down(2, 64)
    expect(t.move(2, 62)).toEqual([Release(64), Press(62)])
    expect(t.move(2, 60)).toEqual([Release(62), Press(60)])
    // Finger 2 slides on: 60 stays, held by finger 1.
    expect(t.move(2, 59)).toEqual([Press(59)])
    expect(t.held).toEqual(new Set([60, 59]))
    // A finger landing again without its lift: its old note goes first.
    expect(t.down(2, 59)).toEqual([Release(59), Press(59)])
  })

  it('every finger lifting at once lets go of every note', () => {
    const t = new NoteTouches()
    t.down(1, 60)
    t.down(2, 64)
    t.down(3, 67)
    t.down(4, 64)
    // A cancelled gesture reports every pointer up together.
    const events = [1, 2, 3, 4].flatMap((id) => t.up(id))
    expect(events).toEqual([Release(60), Release(67), Release(64)])
    expect(t.held.size).toBe(0)
  })

  it('releaseAll lets go of each held note once', () => {
    const t = new NoteTouches()
    t.down(1, 60)
    t.down(2, 60)
    t.down(3, 67)
    expect(t.releaseAll()).toEqual([Release(60), Release(67)])
    expect(t.held.size).toBe(0)
    expect(t.releaseAll()).toEqual([])
    // Fingers from before don't hold anything any more.
    expect(t.up(1)).toEqual([])
    expect(t.down(1, 72)).toEqual([Press(72)])
  })
})
