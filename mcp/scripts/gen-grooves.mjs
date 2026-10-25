// Generates mcp/src/grooves.ts, browse_grooves' gallery, from the arc-beats
// skill's references/genres.md, so the 36 genre recipes are never retyped by
// hand. The skill is a synced claude.ai skill, not in this repo: pass the path
// of genres.md (or of the skill's folder), or set ARC_BEATS_SKILL to either.
//
// genres.md is regular: each recipe is a `## Name` heading, the lines
// `- BPM: …`, `- Swing: …` and `- Feel: …`, one fenced ARC BEAT card, and
// sometimes a paragraph under the card (what its FX lines or hand-written
// swing do), kept as the groove's note. A `##` section without a BPM line (The
// assumed kit) is not a recipe and is skipped. Recipes marked (EP-40) are for
// the EP-40 Riddim kit: the mark leaves the name and sets ep40. Markdown links
// keep only their text; code spans keep their backticks (the view draws them).
// A BPM line with words after the range ("130-150 (a half-time feel: …)")
// keeps the range, and the words go to the end of the feel as a sentence.
//
// Each recipe gets a family from FAMILIES below, by name. A recipe the map
// doesn't name, a family with no recipe, a name twice, or a recipe that isn't
// that shape stops the script with an error. mcp/test/grooves.test.ts checks
// the cards against web/test/core/formats/beatCardFixtures.ts (copied from
// the same file) and the parser.
//
//   node scripts/gen-grooves.mjs [path]            write src/grooves.ts
//   node scripts/gen-grooves.mjs [path] --stdout   print it instead
//   npm run gen:grooves -- [path]

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const outFile = fileURLToPath(new URL('../src/grooves.ts', import.meta.url))

/** The gallery's families, in the order the view's chips show them, with every recipe name (no EP-40 mark) in each. */
export const FAMILIES = {
  Techno: [
    'Techno',
    'Detroit techno',
    'Minimal techno',
    'Dub techno',
    'Acid techno',
    'Hypnotic techno',
    'Peak-time techno',
    'Melodic techno',
    'Industrial techno',
    'Hard techno',
    'Schranz',
    'Hard groove',
  ],
  'House and club': ['House', 'Hip-house', 'UK garage', 'Jersey club', 'Footwork'],
  'Hip-hop and trap': ['Boom bap', 'Lo-fi', 'Trap', 'Drill'],
  'Drum and bass and breaks': ['Drum and bass', 'Jungle', 'Breakcore', 'Breakcore arrangement', 'Breakbeat'],
  'Latin and African': ['Reggaeton and dembow', 'Afrobeats'],
  'Pop and rock': ['Pop and rock backbeat'],
  'Reggae and dub (EP-40)': ['One drop', 'Rockers', 'Steppers', 'Dub', 'Digital riddim', 'Dancehall', 'UK dub'],
}

const EP40 = ' (EP-40)'

/** genres.md from the argument or ARC_BEATS_SKILL: the file itself, or the skill's folder. */
function sourcePath(arg) {
  const given = arg ?? process.env.ARC_BEATS_SKILL
  if (!given) {
    throw new Error(
      'gen-grooves: no genres.md. Pass its path (or the arc-beats skill folder) as an argument, ' +
        'or set ARC_BEATS_SKILL, e.g. ARC_BEATS_SKILL=~/.claude/skills/arc-beats npm run gen:grooves',
    )
  }
  const path = existsSync(given) && statSync(given).isDirectory() ? join(given, 'references', 'genres.md') : given
  if (!existsSync(path)) throw new Error(`gen-grooves: ${path} not found`)
  return path
}

/** Markdown links as their text: "see [ep40-kit.md](ep40-kit.md)" → "see ep40-kit.md". */
function plain(text) {
  return text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
}

/** "House and club" → "house-and-club"; "Lo-fi" → "lo-fi". */
function slug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function parseGenres(source) {
  const lines = source.split(/\r?\n/)
  const familyOf = new Map()
  for (const [family, names] of Object.entries(FAMILIES)) {
    for (const n of names) {
      if (familyOf.has(n)) throw new Error(`gen-grooves: "${n}" is in two families`)
      familyOf.set(n, family)
    }
  }

  // Sections: each `## ` heading with its lines up to the next.
  const sections = []
  lines.forEach((line, i) => {
    if (line.startsWith('## ')) sections.push({ heading: line.slice(3).trim(), at: i + 1, body: [] })
    else if (sections.length > 0) sections.at(-1).body.push({ line, no: i + 1 })
  })

  const grooves = []
  for (const s of sections) {
    const fail = (why, no = s.at) => {
      throw new Error(`genres.md:${no}: ${s.heading}: ${why}`)
    }
    const field = (key) => {
      const hit = s.body.find((l) => l.line.startsWith(`- ${key}: `))
      return hit ? hit.line.slice(key.length + 4).trim() : null
    }
    const bpmLine = field('BPM')
    if (bpmLine === null) continue // not a recipe (The assumed kit)
    const swing = field('Swing')
    let feel = field('Feel')
    if (swing === null) fail('no "- Swing:" line')
    if (feel === null) fail('no "- Feel:" line')

    const bpm = /^(\d+(?:-\d+)?)(?:\s+\((.+)\))?$/.exec(bpmLine)
    if (!bpm) fail(`unexpected BPM line "${bpmLine}"`)
    if (bpm[2]) feel = `${feel} ${bpm[2][0].toUpperCase()}${bpm[2].slice(1)}.`
    if (!/^\d+(?:-\d+)?$/.test(swing)) fail(`unexpected Swing line "${swing}"`)

    const fences = s.body.filter((l) => l.line.startsWith('```')).map((l) => s.body.indexOf(l))
    if (fences.length !== 2) fail(`expected one fenced card, found ${fences.length} fence lines`)
    const [open, close] = fences
    const card = s.body
      .slice(open + 1, close)
      .map((l) => l.line)
      .join('\n')
    if (!card.startsWith('ARC BEAT 1\n')) fail('the card does not start with "ARC BEAT 1"', s.body[open + 1]?.no)
    const after = s.body
      .slice(close + 1)
      .map((l) => l.line.trim())
      .filter((l) => l !== '')
    const note = after.length > 0 ? plain(after.join(' ')) : null

    const ep40 = s.heading.endsWith(EP40)
    const name = ep40 ? s.heading.slice(0, -EP40.length) : s.heading
    const family = familyOf.get(name)
    if (family === undefined) fail(`no family for "${name}": add it to FAMILIES in scripts/gen-grooves.mjs`)
    if (ep40 !== family.endsWith(EP40)) fail(`"${name}" is ${ep40 ? '' : 'not '}an EP-40 recipe but its family is ${family}`)
    grooves.push({ id: slug(name), name, family, bpm: bpm[1], swing, feel: plain(feel), note, ep40, card })
  }

  const ids = new Set()
  for (const g of grooves) {
    if (ids.has(g.id)) throw new Error(`gen-grooves: two recipes have the id ${g.id}`)
    ids.add(g.id)
  }
  for (const [family, names] of Object.entries(FAMILIES)) {
    for (const n of names) {
      if (!grooves.some((g) => g.name === n)) throw new Error(`gen-grooves: FAMILIES names "${n}" (${family}), not in genres.md`)
    }
  }
  if (grooves.length === 0) throw new Error('gen-grooves: no recipes found')
  return grooves
}

/** A card as a template literal: backslashes, backticks and `${` escaped. */
function template(text) {
  return '`' + text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`'
}

export function render(grooves) {
  const out = [
    "// browse_grooves' gallery: the arc-beats skill's 36 genre recipes (references/genres.md)",
    '// Generated by mcp/scripts/gen-grooves.mjs (npm run gen:grooves). Do not edit by hand.',
    '',
    "import type { Groove } from './groovesText'",
    '',
    "/** The gallery's families, in the order the view's chips show them. */",
    'export const FAMILIES = [',
    ...Object.keys(FAMILIES).map((f) => `  ${JSON.stringify(f)},`),
    '] as const',
    '',
    'export const GROOVES: readonly Groove[] = [',
  ]
  for (const g of grooves) {
    out.push(
      '  {',
      `    id: ${JSON.stringify(g.id)},`,
      `    name: ${JSON.stringify(g.name)},`,
      `    family: ${JSON.stringify(g.family)},`,
      `    bpm: ${JSON.stringify(g.bpm)},`,
      `    swing: ${JSON.stringify(g.swing)},`,
      `    feel: ${JSON.stringify(g.feel)},`,
      `    note: ${JSON.stringify(g.note)},`,
      `    ep40: ${g.ep40},`,
      `    card: ${template(g.card)},`,
      '  },',
    )
  }
  out.push(']', '')
  return out.join('\n')
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const args = process.argv.slice(2)
  const stdout = args.includes('--stdout')
  const path = sourcePath(args.find((a) => a !== '--stdout'))
  const text = render(parseGenres(readFileSync(path, 'utf8')))
  if (stdout) process.stdout.write(text)
  else {
    writeFileSync(outFile, text)
    console.log(`wrote ${outFile}`)
  }
}
