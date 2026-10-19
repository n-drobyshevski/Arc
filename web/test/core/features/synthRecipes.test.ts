// The skill's synth recipes (skill/arc-beats/references/synth-sounds.md), as core/src/test/kotlin/dev/arc/ep133/features/SynthRecipesTest.kt
// checks them: every card reads with no problems and writes back as itself, and its synth lines are the recipes of the golden file.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BeatCards, SYNTH_TYPES, allSections, synthText, type CardRead } from '../../../src/core/features/beatCard'
import { PlayMode } from '../../../src/core/features/padSettings'
import { SynthVoice } from '../../../src/core/features/synthVoice'

const recipes = readFileSync(new URL('../../../../skill/arc-beats/references/synth-sounds.md', import.meta.url), 'utf8')
const cards = [...recipes.matchAll(/```\n(ARC BEAT 1\n[\s\S]*?)\n```/g)].map((m) => m[1]!)

// The golden file's cases (body, frames, CRC, device name), in its order: the 17 types, then the 23 recipes, then the extremes.
const golden = readFileSync(new URL('../../../../skill/arc-beats/scripts/test_synth_golden.txt', import.meta.url), 'utf8')
  .split(/\r?\n/)
  .filter((l) => l.trim() !== '' && !l.startsWith('#'))
  .map((l) => l.split(' | '))
// Each body's device name, the golden file's last column.
const names = new Map(golden.map((c) => [c[0]!, c[3]!]))

const problems = (r: CardRead): string[] => r.problems.map((p) => `${p.line} ${p.error ? 'error' : 'warning'} ${p.message}`)

describe('synth recipes in the skill', () => {
  it('every recipe card reads with no problems and writes back as itself', () => {
    expect(cards.length).toBe(4)
    for (const t of cards) {
      const r = BeatCards.read(t)
      expect(problems(r), t.split('\n')[1]).toEqual([])
      const card = r.card!
      expect(card.name).not.toBeNull()
      expect(card.tempo).not.toBeNull()
      expect(allSections(card).every((s) => (s.synths?.size ?? 0) > 0)).toBe(true)
      expect(BeatCards.read(BeatCards.write(card)).card).toEqual(card)
    }
    // One card a part: drums, bass, keys, then a lead with FX.
    expect(cards.map((t) => BeatCards.read(t).card!.sections.map((s) => s.group))).toEqual([[0], [1], [2], [3]])
  })

  it('the synth lines are the recipes, each once, as Arc writes them', () => {
    const lines = cards.flatMap((t) => t.split('\n').filter((l) => l.startsWith('synth ')))
    // The body is the line without "synth <pad> ".
    const bodies = lines.map((l) => l.split(' ').slice(2).join(' '))
    const recipeBodies = golden.slice(SYNTH_TYPES.length, SYNTH_TYPES.length + 23).map((c) => c[0]!)
    expect([...bodies].sort()).toEqual([...recipeBodies].sort())
    for (const t of cards) {
      const text = t.split('\n')
      for (const s of allSections(BeatCards.read(t).card!)) {
        for (const [offset, synth] of s.synths ?? new Map()) expect(text).toContain(synthText(s.group, offset, synth))
      }
    }
  })

  it('each recipe makes the device name the golden file has, and melodic ones play in KEYS', () => {
    const melodic = new Set(['sub', 'bass', 'pluck', 'stab', 'bell', 'lead', 'pad'])
    for (const t of cards) {
      for (const line of t.split('\n').filter((l) => l.startsWith('synth '))) {
        const body = line.split(' ').slice(2).join(' ')
        const synth = BeatCards.read(`ARC BEAT 1\n[A]\nsynth A1 ${body}\n`).card!.sections[0]!.synths!.get(3)!
        expect(SynthVoice.deviceName(synth), body).toBe(names.get(body))
      }
      for (const s of allSections(BeatCards.read(t).card!)) {
        for (const [offset, synth] of s.synths ?? new Map()) {
          if (melodic.has(synth.type)) expect(s.pads.get(offset)?.mode, `${s.group} ${offset} ${synth.type}`).toBe(PlayMode.KEY)
        }
      }
    }
  })
})
