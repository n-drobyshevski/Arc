// Builds the Claude skill "arc-beats" (skill/arc-beats/) for sharing
//
// Two outputs, both generated, never edited by hand:
//   1. skill/arc-beats/references/ep133-guide.md, the 100-odd EP-133 key
//      combinations of core/.../text/GuideText.kt as Markdown for Claude to
//      read (sections, combos, numbered steps, notes, sources). It reuses the
//      parser of gen-guide-data.mjs, so the guide is still read from one place.
//   2. web/public/arc-beats-skill.zip, the skill folder (arc-beats/ at the
//      zip's root, SKILL.md inside) for Settings -> Capabilities -> Skills in
//      the Claude app. A small store-only zip writer is enough here: the files
//      are text, a store-only zip is byte for byte the same on every machine
//      and Node version, and a test can compare it with the committed one.
//
//   node scripts/gen-skill-guide.mjs            write the guide and the zip
//   node scripts/gen-skill-guide.mjs --stdout   print the guide instead (used by the test)
//   node scripts/gen-skill-guide.mjs --no-zip   write the guide only
//   node scripts/gen-skill-guide.mjs --check    write nothing; exit 1 if either file is stale (used by the test)

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseGuide } from './gen-guide-data.mjs'

const KT_PATH = 'core/src/main/kotlin/dev/arc/ep133/text/GuideText.kt'
const repo = fileURLToPath(new URL('../../', import.meta.url))
const ktFile = join(repo, KT_PATH)
const skillDir = join(repo, 'skill', 'arc-beats')
const guideFile = join(skillDir, 'references', 'ep133-guide.md')
const zipFile = join(repo, 'web', 'public', 'arc-beats-skill.zip')

/** Left out of the zip: the repo's install notes, the tests (they read README.md and the repo, which the zip lacks) and anything Python or the OS leaves behind. */
const SKIP = (name) => name === 'README.md' || name === '.DS_Store' || name === '__pycache__' || name.endsWith('.pyc') || name.startsWith('test_')

// ---------------------------------------------------------------------------
// The guide
// ---------------------------------------------------------------------------

/** Short prefixes for the entry ids ("SEQ-3"), so lessons and cards can cite a combo. */
const PREFIX = {
  Sounds: 'SND',
  Sampling: 'SMP',
  Sequencer: 'SEQ',
  'Effects and performance': 'FX',
  'Projects and system': 'SYS',
}

/** One key of a combo: `hold:SOUND` is { action: 'hold', name: 'SOUND' }. */
function parseKey(token) {
  const colon = token.indexOf(':')
  return colon > 0 ? { action: token.slice(0, colon), name: token.slice(colon + 1) } : { action: null, name: token }
}

/** GuideCombo's notation: `[context] option | option`, option `step > step`, step keys joined by ` + ` or ` / `. */
export function parseCombo(text) {
  let rest = text.trim()
  let context = null
  if (rest.startsWith('[')) {
    const close = rest.indexOf(']')
    context = rest.slice(1, close).trim()
    rest = rest.slice(close + 1).trim()
  }
  const options = rest.split(' | ').map((option) =>
    option.split(' > ').map((step) => {
      const either = step.includes(' / ')
      const keys = step.split(either ? ' / ' : ' + ').map((k) => parseKey(k.trim()))
      return { keys, either }
    }),
  )
  return { context, options }
}

/** How a key name reads in a sentence. */
function keyWords(name) {
  switch (name) {
    case 'pad':
      return 'a pad'
    case 'A-D':
      return 'a group key (A to D)'
    case '0-9':
      return 'the number pads (0 to 9)'
    case '1-9':
      return 'the number pads (1 to 9)'
    case '-/+':
      return '- or +'
    default:
      return name
  }
}

function joinKeys(keys, either) {
  const words = keys.map((k) => keyWords(k.name))
  return words.join(either ? ' or ' : ' and ')
}

/**
 * One way of a combo as numbered steps, the way the app's guide numbers them
 * (PanelKeymap.steps in core): keys held while others are pressed become a
 * "hold" step of their own first, and a hold that goes on is not repeated.
 */
function stepsOf(option) {
  const out = []
  let holding = ''
  for (const step of option) {
    const held = step.keys.filter((k) => k.action === 'hold')
    const rest = step.keys.filter((k) => k.action !== 'hold')
    const heldText = joinKeys(held, step.either)
    const pieces = []
    if (rest.length === 0) pieces.push(`hold ${heldText}`)
    else {
      if (held.length > 0) pieces.push(`hold ${heldText}`)
      const actions = new Set(rest.map((k) => k.action))
      const text = joinKeys(rest, step.either)
      if (actions.has('turn')) pieces.push(`turn ${text}`)
      else if (actions.has('move')) pieces.push(`move ${text}`)
      else if (actions.has('dial')) pieces.push('type a number on the pads')
      else if (actions.has('x2')) pieces.push(`press ${text} twice`)
      else pieces.push(`press ${text}`)
    }
    for (const piece of pieces) {
      const isHold = piece.startsWith('hold ')
      // A hold that goes on from the step before is not said again.
      if (isHold && piece === holding && out.length > 0) continue
      out.push(piece)
    }
    holding = held.length > 0 ? `hold ${heldText}` : ''
  }
  return out
}

export function renderGuide(sections) {
  const total = sections.reduce((n, s) => n + s.entries.length, 0)
  const out = [
    '# EP-133 K.O. II key combinations (OS 2.5)',
    '',
    `<!-- Generated by web/scripts/gen-skill-guide.mjs (npm run gen:skill) from ${KT_PATH}. Do not edit by hand. -->`,
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
    out.push(`- [${s.title}](#${slug(s.title)}), ${p}-1 to ${p}-${s.entries.length}`)
  }
  out.push('')
  for (const s of sections) {
    const prefix = PREFIX[s.title]
    if (prefix === undefined) throw new Error(`gen-skill-guide: no id prefix for the guide section "${s.title}"`)
    out.push(`## ${s.title}`, '')
    s.entries.forEach((e, i) => {
      out.push(`### ${prefix}-${i + 1} ${e.action}`, '', `- **Keys:** ${e.keys}`)
      if (e.combo !== null) {
        const combo = parseCombo(e.combo)
        const prefixText = combo.context !== null ? `${combo.context}: ` : ''
        combo.options.forEach((option, n) => {
          const steps = stepsOf(option)
            .map((step, k) => `${k + 1}. ${step}`)
            .join(', ')
          const label = combo.options.length > 1 ? (n === 0 ? '- **Steps:** ' : '- **Or:** ') : '- **Steps:** '
          out.push(`${label}${prefixText}${steps}`)
        })
      }
      if (e.note !== null) out.push(`- **Note:** ${e.note}`)
      out.push(`- **Source:** ${e.source}`, '')
    })
  }
  return out.join('\n')
}

/** The heading anchor GitHub and Claude's viewers make from a title. */
function slug(title) {
  return title.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ /g, '-')
}

// ---------------------------------------------------------------------------
// The zip
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Every file under [dir] (skipping [SKIP]) as { path (posix, relative to dir), data }, sorted so SKILL.md is first. */
function collect(dir) {
  const files = []
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      if (SKIP(name)) continue
      const full = join(d, name)
      if (statSync(full).isDirectory()) walk(full)
      else files.push({ path: relative(dir, full).split(sep).join('/'), data: new Uint8Array(readFileSync(full)) })
    }
  }
  walk(dir)
  const rank = (p) => (p === 'SKILL.md' ? 0 : p.includes('/') ? 2 : 1)
  return files.sort((a, b) => rank(a.path) - rank(b.path) || (a.path < b.path ? -1 : 1))
}

/**
 * A store-only zip of [entries] ({ path, data, mode? }), paths as given. A fixed
 * timestamp (1 Jan 1980) and Unix permissions keep the bytes the same on every
 * machine. Directory entries (a path ending in "/") have no data.
 */
export function zipStore(entries) {
  const enc = new TextEncoder()
  const chunks = []
  const central = []
  let offset = 0
  const push = (bytes) => {
    chunks.push(bytes)
    offset += bytes.length
  }
  for (const e of entries) {
    const name = enc.encode(e.path)
    const data = e.data ?? new Uint8Array(0)
    const crc = crc32(data)
    const isDir = e.path.endsWith('/')
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true) // version needed
    local.setUint16(6, 0x0800, true) // UTF-8 names
    local.setUint16(8, 0, true) // store
    local.setUint16(10, 0, true) // time 00:00
    local.setUint16(12, 0x21, true) // date 1980-01-01
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, name.length, true)
    local.setUint16(28, 0, true)
    const start = offset
    push(new Uint8Array(local.buffer))
    push(name)
    push(data)

    const mode = e.mode ?? (isDir ? 0o755 : 0o644)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true)
    c.setUint16(4, (3 << 8) | 20, true) // made by Unix, version 2.0
    c.setUint16(6, 20, true)
    c.setUint16(8, 0x0800, true)
    c.setUint16(10, 0, true)
    c.setUint16(12, 0, true)
    c.setUint16(14, 0x21, true)
    c.setUint32(16, crc, true)
    c.setUint32(20, data.length, true)
    c.setUint32(24, data.length, true)
    c.setUint16(28, name.length, true)
    c.setUint16(30, 0, true)
    c.setUint16(32, 0, true)
    c.setUint16(34, 0, true)
    c.setUint16(36, 0, true)
    c.setUint32(38, ((isDir ? 0o040000 : 0o100000) | mode) * 0x10000 + (isDir ? 0x10 : 0), true)
    c.setUint32(42, start, true)
    central.push(new Uint8Array(c.buffer), name)
  }
  const centralStart = offset
  for (const part of central) push(part)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, offset - centralStart, true)
  end.setUint32(16, centralStart, true)
  push(new Uint8Array(end.buffer))
  const out = new Uint8Array(offset)
  let at = 0
  for (const part of chunks) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** The skill folder as a zip with arc-beats/ at its root. [guide] stands in for the guide file on disk. */
export function buildSkillZip(guide) {
  const files = collect(skillDir).map((f) =>
    f.path === 'references/ep133-guide.md' ? { ...f, data: new TextEncoder().encode(guide) } : f,
  )
  if (!files.some((f) => f.path === 'SKILL.md')) throw new Error('gen-skill-guide: skill/arc-beats/SKILL.md is missing')
  const entries = [{ path: 'arc-beats/' }]
  const dirs = new Set()
  for (const f of files) {
    const parts = f.path.split('/')
    for (let i = 1; i < parts.length; i++) {
      const d = `arc-beats/${parts.slice(0, i).join('/')}/`
      if (!dirs.has(d)) {
        dirs.add(d)
        entries.push({ path: d })
      }
    }
    entries.push({ path: `arc-beats/${f.path}`, data: f.data, mode: f.path.startsWith('scripts/') && f.path.endsWith('.py') ? 0o755 : 0o644 })
  }
  return zipStore(entries)
}

// ---------------------------------------------------------------------------

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const guide = renderGuide(parseGuide(readFileSync(ktFile, 'utf8')))
  const same = (file, bytes) => existsSync(file) && Buffer.compare(readFileSync(file), Buffer.from(bytes)) === 0
  if (process.argv.includes('--stdout')) process.stdout.write(guide)
  else if (process.argv.includes('--check')) {
    const stale = []
    if (!same(guideFile, guide)) stale.push(relative(repo, guideFile))
    if (!same(zipFile, buildSkillZip(guide))) stale.push(relative(repo, zipFile))
    if (stale.length > 0) {
      console.error(`Stale, run "npm run gen:skill" in web/: ${stale.join(', ')}`)
      process.exit(1)
    }
  } else {
    mkdirSync(dirname(guideFile), { recursive: true })
    writeFileSync(guideFile, guide)
    if (!process.argv.includes('--no-zip')) {
      if (!existsSync(join(skillDir, 'SKILL.md'))) throw new Error('gen-skill-guide: skill/arc-beats/SKILL.md is missing')
      writeFileSync(zipFile, buildSkillZip(guide))
    }
  }
}
