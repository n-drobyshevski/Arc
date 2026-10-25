// The arc-beats skill's references/ep133-guide.md, from src/core/text/guideData.ts
//
// The arc-beats Claude skill (a synced claude.ai skill, not in this repo) cites
// Arc's 100 guide entries by id (SND-1, SMP-1, SEQ-1, FX-1, SYS-1). This writes
// that reference file from the same data the Guide screen shows, so the skill
// and the app never drift apart. guideData.ts is itself generated from
// GuideText.kt (npm run gen:guide), one `key: "string",` per line, so it is read
// as text here; anything else stops the script with an error. The Steps and Or
// lines spell out each entry's combo (guideCombo notation) as numbered words.
//
//   node scripts/gen-skill-guide.mjs            write dist-skill/ep133-guide.md
//   node scripts/gen-skill-guide.mjs --stdout   print it instead (used by the test)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DATA_PATH = 'web/src/core/text/guideData.ts'
const dataFile = fileURLToPath(new URL('../src/core/text/guideData.ts', import.meta.url))
const outDir = fileURLToPath(new URL('../dist-skill/', import.meta.url))
const outFile = outDir + 'ep133-guide.md'

/**
 * Id prefix for each section title, in the guide's order. The same as GUIDE_IDS
 * in src/core/text/guideText.ts, which the app and the MCP server use; this
 * script can't import that TypeScript file, so test/core/text/skillGuide.test.ts
 * checks the two agree.
 */
export const PREFIX = {
  Sounds: 'SND',
  Sampling: 'SMP',
  Sequencer: 'SEQ',
  'Effects and performance': 'FX',
  'Projects and system': 'SYS',
}

const FIELDS = ['action', 'keys', 'source', 'note', 'combo']

export function parseData(source) {
  const sections = []
  let section = null
  let entry = null
  source.split(/\r?\n/).forEach((raw, i) => {
    const m = /^\s*(title|action|keys|source|note|combo): (null|".*"),$/.exec(raw)
    if (!m) return
    const fail = (why) => {
      throw new Error(`guideData.ts:${i + 1}: ${why}`)
    }
    const [, field, literal] = m
    const value = JSON.parse(literal)
    if (field === 'title') {
      if (value === null || !(value in PREFIX)) fail(`unknown section title ${literal}`)
      section = { title: value, entries: [] }
      sections.push(section)
      return
    }
    if (section === null) fail(`${field} before any section title`)
    if (field === 'action') {
      entry = {}
      section.entries.push(entry)
    } else if (entry === null || Object.keys(entry).length !== FIELDS.indexOf(field)) fail(`${field} out of order`)
    entry[field] = value
  })
  for (const s of sections)
    for (const e of s.entries)
      if (Object.keys(e).length !== FIELDS.length) throw new Error(`guideData.ts: incomplete entry "${e.action}"`)
  if (sections.length === 0) throw new Error('guideData.ts: no sections found')
  return sections
}

/** A key in guideCombo notation as words: `pad` is "a pad", `dial:0-9` is "a number on the pads". */
function phrase(token) {
  const colon = token.indexOf(':')
  const action = colon > 0 ? token.slice(0, colon) : null
  const name = colon > 0 ? token.slice(colon + 1) : token
  let words
  switch (name) {
    case 'pad':
      words = 'a pad'
      break
    case 'A-D':
      words = 'a group key (A to D)'
      break
    case '-/+':
      words = '- or +'
      break
    case '0-9':
      words = 'a number on the pads'
      break
    case '1-9':
      words = 'the number pads (1 to 9)'
      break
    default:
      words = name
  }
  if (action === 'x2') words += ' twice'
  return { action, words }
}

function verb(keys) {
  const actions = keys.map((k) => k.action)
  if (actions.includes('turn')) return 'turn'
  if (actions.includes('move')) return 'move'
  if (actions.includes('dial')) return 'type'
  return 'press'
}

/**
 * One combo option (`step > step`) as numbered steps. Held keys become their own
 * "hold" step before the keys pressed with them, and a key already held earlier
 * in the option is not held again.
 */
function steps(option) {
  const out = []
  const held = new Set()
  for (const step of option.split(' > ').map((s) => s.trim())) {
    if (step.includes(' / ')) {
      const keys = step.split(' / ').map((t) => phrase(t.trim()))
      out.push(`${verb(keys.slice(0, 1))} ${keys.map((k) => k.words).join(' or ')}`)
      continue
    }
    const keys = step.split(' + ').map((t) => phrase(t.trim()))
    const holds = keys.filter((k) => k.action === 'hold' && !held.has(k.words))
    const rest = keys.filter((k) => k.action !== 'hold')
    if (holds.length > 0) out.push(`hold ${holds.map((k) => k.words).join(' and ')}`)
    for (const k of holds) held.add(k.words)
    if (rest.length > 0) out.push(`${verb(rest)} ${rest.map((k) => k.words).join(' and ')}`)
  }
  return out.map((s, i) => `${i + 1}. ${s}`).join(', ')
}

/** The Steps and Or lines for a combo; none when the entry has no combo. */
export function comboLines(combo) {
  if (combo === null) return []
  let rest = combo.trim()
  let context = ''
  if (rest.startsWith('[')) {
    const close = rest.indexOf(']')
    if (close < 0) throw new Error(`unclosed context in "${combo}"`)
    context = rest.slice(1, close).trim() + ': '
    rest = rest.slice(close + 1).trim()
  }
  return rest.split(' | ').map((option, i) => `- **${i === 0 ? 'Steps' : 'Or'}:** ${context}${steps(option)}`)
}

const anchor = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-')

export function render(sections) {
  const total = sections.reduce((n, s) => n + s.entries.length, 0)
  const out = [
    '# EP-133 K.O. II key combinations (OS 2.5)',
    '',
    '<!-- Generated by web/scripts/gen-skill-guide.mjs (npm run gen:skill) from core/src/main/kotlin/dev/arc/ep133/text/GuideText.kt. Do not edit by hand. -->',
    '',
    `${total} key combinations from teenage engineering's official EP-133 user guide for OS 2.5, in Arc's own words. Every entry names the guide section it comes from. Combinations the guide does not document are not here, so if something is missing, say it is not in the official guide instead of guessing a combo. Combinations can change between OS versions: tell the user to check them on their device.`,
    '',
    'How to read an entry:',
    '- The id (`SEQ-3`) is for citing it in lessons and answers.',
    '- **Keys** is the guide\'s wording. **Steps** is the same thing numbered: "hold" means keep it down while doing the next step. A line starting "In SOUND mode" says the mode you must be in first.',
    '- **Or** lines are separate ways to do the same thing.',
    '- GROUP A-D are the group keys A, B, C and D. A "pad" is one of the 12 keypad pads (7 8 9 / 4 5 6 / 1 2 3 / . 0 ENTER).',
    '',
    '## Contents',
    '',
  ]
  for (const s of sections) {
    const p = PREFIX[s.title]
    out.push(`- [${s.title}](#${anchor(s.title)}), ${p}-1 to ${p}-${s.entries.length}`)
  }
  for (const s of sections) {
    out.push('', `## ${s.title}`)
    s.entries.forEach((e, i) => {
      out.push('', `### ${PREFIX[s.title]}-${i + 1} ${e.action}`, '', `- **Keys:** ${e.keys}`, ...comboLines(e.combo))
      if (e.note !== null) out.push(`- **Note:** ${e.note}`)
      out.push(`- **Source:** ${e.source}`)
    })
  }
  out.push('')
  return out.join('\n')
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const md = render(parseData(readFileSync(dataFile, 'utf8')))
  if (process.argv.includes('--stdout')) process.stdout.write(md)
  else {
    mkdirSync(outDir, { recursive: true })
    writeFileSync(outFile, md)
    console.log(`wrote ${outFile} from ${DATA_PATH}`)
  }
}
