// Port of core/src/test/kotlin/dev/arc/ep133/features/ClaudePromptTest.kt
//
// Web delta: a lesson's prompt says the Arc web app (WebText.LEARN_PROMPT,
// WebText.learn) where the Kotlin says Android.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ClaudePrompt,
  FEELS,
  Feel,
  GENRE_FAMILIES,
  Genres,
  PROMPT_TASKS,
  PlayLevel,
  PlayWay,
  PromptGoal,
  PromptPart,
  PromptSlot,
  PromptTask,
  SavedPrompt,
  SharePick,
  claudePrompt,
  savedPrompt,
} from '../../../src/core/features/claudePrompt'
import { FactoryKit } from '../../../src/core/features/factorySounds'
import { ClaudeText } from '../../../src/core/text/claudeText'
import { PromptText } from '../../../src/core/text/promptText'
import { WebText } from '../../../src/core/text/webText'

const reference = (name: string): string =>
  readFileSync(new URL(`../../../../skill/arc-beats/references/${name}`, import.meta.url), 'utf8')

const said = (pieces: readonly { text: string }[]): string => pieces.map((p) => p.text).join(' ')

describe('ClaudePrompt', () => {
  it("every genre is a recipe of the skill, with its BPM range and its card's tempo", () => {
    const text = reference('genres.md')
    // "## Dub techno", its "- BPM: 118-126" line, and its card's "tempo 122".
    const recipes = new Map<string, [number, number, number]>()
    for (const m of text.matchAll(/^## ([^\n]+)\n- BPM: (\d+)-(\d+)[\s\S]*?^tempo (\d+)$/gm)) {
      recipes.set(m[1]!.replace(/ \(EP-40\)$/, ''), [Number(m[2]), Number(m[3]), Number(m[4])])
    }
    for (const g of Genres.ALL) {
      const r = recipes.get(g.name)
      expect(r, `no recipe ${g.name}`).toBeDefined()
      const [lo, hi, bpm] = r!
      expect(g.tempo, g.name).toEqual({ first: lo, last: hi })
      expect(g.bpm, g.name).toBe(bpm)
    }
    // Every recipe but the arrangement is offered, the EP-40's as the riddim family.
    expect(new Set(Genres.ALL.map((g) => g.name))).toEqual(new Set([...recipes.keys()].filter((k) => k !== 'Breakcore arrangement')))
    expect(new Set(Genres.ALL.filter((g) => g.ep40).map((g) => g.name))).toEqual(
      new Set(['One drop', 'Rockers', 'Steppers', 'Dub', 'Digital riddim', 'Dancehall', 'UK dub']),
    )
    for (const m of text.matchAll(/^## (.+) \(EP-40\)$/gm)) expect(Genres.ALL.find((g) => g.name === m[1])!.ep40).toBe(true)
    expect(new Set(Genres.ALL.map((g) => g.id)).size).toBe(Genres.ALL.length)
    // Every family has its genres; each fits the answer keys, three rows of four at most.
    expect(new Set(Genres.ALL.map((g) => g.family))).toEqual(new Set(GENRE_FAMILIES))
    for (const f of GENRE_FAMILIES) {
      const n = Genres.inFamily(f).length
      expect(n >= 1 && n <= 12, f).toBe(true)
    }
  })

  it("the lessons are the skill's, in order", () => {
    const titles = [...reference('lessons.md').matchAll(/^## Lesson (\d+): (.+)$/gm)].map((m) => m[2])
    expect(titles).toEqual(ClaudePrompt.LESSONS)
  })

  it('a prompt keeps through its text, its own words escaped', () => {
    const p = claudePrompt({
      task: PromptTask.BEAT,
      bars: 8,
      genre: 'dub-techno',
      tempo: 121,
      kit: FactoryKit.EP40,
      parts: new Set([PromptPart.FX, PromptPart.BASS]),
      goal: PromptGoal.SWING,
      edits: 5,
      length: 64,
      fromPick: true,
      lesson: 7,
      way: PlayWay.PERFORM,
      level: PlayLevel.SURE,
      speed: 75,
      text: 'Line one; a\\b\nline=two',
    })
    expect(ClaudePrompt.decode(ClaudePrompt.encode(p))).toEqual(p)
    expect(ClaudePrompt.equals(ClaudePrompt.decode(ClaudePrompt.encode(p)), p)).toBe(true)
    expect(ClaudePrompt.decode(ClaudePrompt.encode(claudePrompt()))).toEqual(claudePrompt())
    expect(ClaudePrompt.encode(p)).not.toContain('\n')
    // Nothing, or what isn't one, is the default's.
    expect(ClaudePrompt.decode('')).toEqual(claudePrompt())
    expect(
      ClaudePrompt.decode('task=NOPE;bars=3;genre=polka;tempo=999;kit=ep9;goal=X;edits=2;length=12;pick=maybe;lesson=13;text='),
    ).toEqual(claudePrompt())
    expect(ClaudePrompt.decode('parts=').parts).toEqual(new Set())
  })

  it('saved prompts keep their names and prompts, one a line', () => {
    const list = [
      savedPrompt('Dub; \\ techno', claudePrompt({ task: PromptTask.BEAT, genre: 'dub-techno', tempo: 122 })),
      savedPrompt('Mine ✎', claudePrompt({ text: 'a\nb' })),
    ]
    expect(SavedPrompt.decodeAll(SavedPrompt.encodeAll(list))).toEqual(list)
    expect(SavedPrompt.encodeAll(list).split('\n').length).toBe(2)
    expect(SavedPrompt.decodeAll('')).toEqual([])
    expect(SavedPrompt.decodeAll('garbage\nname=;task=BEAT')).toEqual([])
  })

  it('a genre brings its tempo, another task drops the hand-edited words', () => {
    const p = ClaudePrompt.withGenre(claudePrompt({ task: PromptTask.BEAT, tempo: 90 }), Genres.of('steppers'))
    expect(p.genre).toBe('steppers')
    expect(p.tempo).toBe(78)
    expect(ClaudePrompt.withGenre(p, null).tempo).toBe(78)
    expect(ClaudePrompt.withGenre(p, null).genre).toBeNull()
    const edited = { ...p, text: 'mine' }
    expect(ClaudePrompt.withTask(edited, PromptTask.BEAT)).toEqual(edited)
    expect(ClaudePrompt.withTask(edited, PromptTask.TRACK).text).toBeNull()
    expect(ClaudePrompt.withCard(claudePrompt({ task: PromptTask.IMPROVE }))).toBe(true)
    expect(ClaudePrompt.withCard(claudePrompt({ task: PromptTask.TRACK }))).toBe(false)
    expect(ClaudePrompt.withCard(claudePrompt({ task: PromptTask.TRACK, fromPick: true }))).toBe(true)
    expect(ClaudePrompt.withCard(claudePrompt({ task: PromptTask.BEAT, fromPick: true }))).toBe(false)
  })

  it('an improve as it starts asks what the plain share does', () => {
    expect(PromptText.prompt(claudePrompt(), SharePick.SCENE, true)).toBe(ClaudeText.SHARE_PROMPT)
    expect(PromptText.prompt(claudePrompt(), SharePick.PATTERN, false)).toBe(ClaudeText.SHARE_PROMPT)
    expect(PromptText.prompt(claudePrompt(), SharePick.CHAIN, true)).toBe(ClaudeText.SHARE_CHAIN_PROMPT)
    expect(PromptText.prompt(claudePrompt({ goal: PromptGoal.BUSIER, genre: 'dub-techno', edits: 1 }), SharePick.SCENE, true)).toBe(
      "Use the arc-beats skill to improve this EP-133 beat from Arc. I'll paste your new card back into Arc next to mine, so give it a short new name.\n" +
        '- First: analyse it, its groove, its energy and what makes it work\n' +
        '- Ask: make it busier\n' +
        '- Direction: toward dub techno\n' +
        '- Edits: one, as one new card\n' +
        'Keep its sound, FX and pad lines unless an edit needs to change them, or choose sounds from my sound list if one follows the card. The card:',
    )
    expect(PromptText.prompt(claudePrompt({ goal: PromptGoal.FILL, edits: 5 }), SharePick.CHAIN, true)).toContain(
      '\n- Ask: add a fill\n- Edits: 4-5, as one new card of scenes with a chain line\n',
    )
  })

  it('a new beat, a track and a lesson say what was picked, as a list', () => {
    const beat = claudePrompt({
      task: PromptTask.BEAT,
      genre: 'dub-techno',
      tempo: 122,
      parts: new Set([PromptPart.FX, PromptPart.BASS, PromptPart.CHORDS]),
    })
    expect(PromptText.prompt(beat, SharePick.SCENE, true)).toBe(
      "Use the arc-beats skill to write a new beat for my EP-133. I'll paste your card into the Arc app and play it, so give one complete ARC BEAT card that passes the skill's check.\n" +
        "- Style: dub techno (start from the skill's recipe)\n" +
        '- Tempo: 122 BPM\n' +
        '- Length: 4 bars\n' +
        '- Parts: drums, a bassline, chords and FX that suit it\n' +
        'Reply with the card in one code block, then 2-4 lines on the feel and one thing to try changing.\n' +
        'Choose the sounds from my sound list, which follows:',
    )
    const plain = PromptText.prompt(claudePrompt({ task: PromptTask.BEAT, bars: 1, parts: new Set() }), SharePick.SCENE, false)
    expect(plain).toContain('\n- Style: any style you like\n- Length: 1 bar\n- Parts: drums only\n')
    expect(plain.includes('Tempo') || plain.includes('sound list')).toBe(false)
    const track = PromptText.prompt(ClaudePrompt.withGenre(claudePrompt({ task: PromptTask.TRACK }), Genres.of('steppers')), SharePick.SCENE, false)
    expect(track.startsWith('Use the arc-beats skill to write a track idea for my EP-133: a card of scenes with a chain line')).toBe(true)
    expect(track).toContain("\n- Style: steppers (start from the skill's recipe)\n- Tempo: 78 BPM\n- Length: about 32 bars\n- Shape: an intro, a drop")
    expect(track.endsWith('then a line for each scene saying what changes.')).toBe(true)
    const more = PromptText.prompt(claudePrompt({ task: PromptTask.TRACK, length: 64, fromPick: true }), SharePick.CHAIN, true)
    expect(more.startsWith('Use the arc-beats skill to continue this EP-133 arrangement from Arc into a track idea')).toBe(true)
    expect(more.includes('\n- Start: this arrangement as its first scenes, ') && more.endsWith('The card:')).toBe(true)
    expect(PromptText.prompt(claudePrompt({ task: PromptTask.LEARN }), SharePick.SCENE, true)).toBe(WebText.LEARN_PROMPT)
    expect(PromptText.prompt(claudePrompt({ task: PromptTask.LEARN, lesson: 5 }), SharePick.SCENE, true)).toBe(
      'Use the arc-beats skill to teach me the EP-133 K.O. II, starting at lesson 5 (Swing and timing). I use the Arc web app. ' +
        'Go one step at a time: explain the step, give me something to try on the device, and wait for me before the next one.',
    )
    // Words of one's own go as they are.
    expect(PromptText.prompt({ ...beat, text: 'Just vibes' }, SharePick.CHAIN, true)).toBe('Just vibes')
  })

  it('up to two feel words go before the genre, the first leading, and into the prompt as a list', () => {
    let p = ClaudePrompt.withGenre(claudePrompt({ task: PromptTask.BEAT }), Genres.of('lo-fi'))
    p = ClaudePrompt.withFeel(p, Feel.DREAMY)
    expect(said(PromptText.sentence(p, FactoryKit.EP133))).toBe('Write a 4-bar beat in dreamy lo-fi at 76 BPM for the EP-133 kit with bass')
    p = ClaudePrompt.withFeel(ClaudePrompt.withFeel(p, Feel.DARK), Feel.HYPNOTIC)
    expect(p.feels).toEqual([Feel.DARK, Feel.HYPNOTIC])
    expect(ClaudePrompt.decode(ClaudePrompt.encode(p))).toEqual(p)
    expect(ClaudePrompt.withFeel(p, Feel.DARK).feels).toEqual([Feel.HYPNOTIC])
    expect(PromptText.prompt(p, SharePick.SCENE, false)).toContain(
      "\n- Style: lo-fi (start from the skill's recipe)\n- Feel: dark and hypnotic (the skill's feel words: change the recipe the way they say)\n- Tempo: 76 BPM\n",
    )
    expect(PromptText.prompt({ ...p, feels: [] }, SharePick.SCENE, false)).not.toContain('Feel')
    expect(PromptText.name(p)).toBe('Dark lo-fi 76')
    expect(ClaudePrompt.decode('feels=DREAMY,DREAMY,NOPE').feels).toEqual([Feel.DREAMY])
    // A track has them too; an improve doesn't.
    expect(ClaudePrompt.slots(claudePrompt({ task: PromptTask.TRACK }))).toContain(PromptSlot.FEEL)
    expect(ClaudePrompt.slots(claudePrompt({ task: PromptTask.IMPROVE }))).not.toContain(PromptSlot.FEEL)
  })

  it("the skill's genres md describes every feel word", () => {
    const text = reference('genres.md')
    const table = text.substring(text.indexOf('## Feel words'), text.indexOf('## House'))
    for (const f of FEELS) {
      const w = PromptText.feel(f)
      expect(table, f).toContain('| ' + w.charAt(0).toUpperCase() + w.slice(1) + ' |')
    }
  })

  it('a play asks to be taught the card, the way, the level and the start as a list', () => {
    const p = claudePrompt({ task: PromptTask.PLAY, way: PlayWay.STEPS, level: PlayLevel.SOME, speed: 75 })
    expect(ClaudePrompt.withCard(p)).toBe(true)
    expect(PromptText.prompt(p, SharePick.PATTERN, true)).toBe(
      'Use the arc-beats skill to teach me to play this EP-133 beat from Arc myself, on the device, not just import it.\n' +
        "- Way: step entry on the EP-133's sequencer, with the key combos of the official guide\n" +
        "- Me: I've had some practice\n" +
        '- Start: at 75% of its tempo, then work up to it\n' +
        'Go one step at a time: explain the step, give me something to play, and wait for me before the next one. The card:',
    )
    expect(PromptText.prompt({ ...p, speed: 100 }, SharePick.CHAIN, true)).toContain('this EP-133 arrangement')
    expect(PromptText.prompt({ ...p, speed: 100 }, SharePick.CHAIN, true)).toContain('- Start: at its own tempo\n')
    expect(said(PromptText.sentence(p, FactoryKit.EP133)).toLowerCase()).toBe(
      'Teach me to play it by step entry as an improver starting at three-quarter tempo'.toLowerCase(),
    )
    expect(PromptText.prompt(p, SharePick.PATTERN, true)).not.toContain('lesson lines')
    expect(PromptText.prompt({ ...p, way: PlayWay.FINGERS }, SharePick.PATTERN, true)).toContain(
      "- Start: at 75% of its tempo, then work up to it\n- Arc: also give me the card with lesson lines for your steps, so Arc's PRACTICE runs them on its pads\n",
    )
    expect(PromptText.name(p)).toBe('Play · Steps 75%')
    expect(PromptText.tab(PromptTask.BEAT)).toBe('New')
  })

  it("the glass's sentence has a slot for each choice", () => {
    const p = claudePrompt({ task: PromptTask.BEAT, genre: 'uk-garage', tempo: 132, parts: new Set([PromptPart.LEAD, PromptPart.BASS]) })
    expect(said(PromptText.sentence(p, FactoryKit.EP40))).toBe('Write a 4-bar beat in plain UK garage at 132 BPM for the EP-40 kit with bass · lead')
    for (const t of PROMPT_TASKS) {
      const q = { ...p, task: t }
      expect(PromptText.sentence(q, FactoryKit.EP133).flatMap((piece) => piece.slot ?? [])).toEqual(ClaudePrompt.slots(q))
    }
    expect(said(PromptText.sentence(claudePrompt(), FactoryKit.EP133))).toBe('Improve it: make it better in its own style in 2-3 edits on the EP-133 kit')
    expect(PromptText.value(claudePrompt({ genre: 'one-drop' }), PromptSlot.GENRE, FactoryKit.EP40)).toBe('toward one drop')
    expect(PromptText.value(claudePrompt({ task: PromptTask.TRACK }), PromptSlot.TEMPO, FactoryKit.EP40)).toBe('any tempo')
    expect(PromptText.value(claudePrompt({ lesson: 9 }), PromptSlot.LESSON, FactoryKit.EP40)).toBe('lesson 9: bass and melody in keys')
  })

  it('saving names a prompt once and keeps at most twelve', () => {
    const a = claudePrompt({ task: PromptTask.BEAT, genre: 'dub-techno', tempo: 122 })
    expect(PromptText.name(a)).toBe('Dub techno 122')
    expect(PromptText.name(claudePrompt({ task: PromptTask.BEAT }))).toBe('New beat')
    expect(PromptText.name(claudePrompt({ goal: PromptGoal.BUSIER }))).toBe('Improve · Busier')
    expect(PromptText.name(claudePrompt({ task: PromptTask.TRACK }))).toBe('Track · 32 bars')
    expect(PromptText.name(claudePrompt({ task: PromptTask.LEARN, lesson: 3, text: 'x' }))).toBe('Lesson 3 ✎')
    let list = PromptText.withSaved([], a)
    expect(PromptText.withSaved(list, a)).toEqual(list)
    list = PromptText.withSaved(list, { ...a, bars: 8 })
    expect(list.map((s) => s.name)).toEqual(['Dub techno 122', 'Dub techno 122 2'])
    for (let i = 0; i < 20; i++) list = PromptText.withSaved(list, { ...a, tempo: 60 + i })
    expect(list.length).toBe(SavedPrompt.MAX)
  })
})
