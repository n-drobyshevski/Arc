import { Session } from './protocol/session.js'
import { CancelledError } from './protocol/fs.js'
import { getStorage, listProjects, listSounds } from './protocol/device.js'
import { backupDevice, describePak, openPak, restorePak } from './backup.js'
import { openMidi, webMidiSupported } from './webmidi.js'
import * as lib from './library.js'

const $ = (id) => document.getElementById(id)

const state = {
  session: null,
  device: null, // { info, storage, sounds, projects }
  backups: [],
  current: null,
  busy: false,
  freshId: null,
}

// ---------- formatting ----------

const fmtDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const fmtDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
function fmtBytes(b) {
  if (b >= 1048576) return `${(b / 1048576).toFixed(b >= 10485760 ? 0 : 1)} MB`
  if (b >= 1024) return `${Math.round(b / 1024)} KB`
  return `${b} B`
}
function el(tag, props = {}, ...children) {
  const n = Object.assign(document.createElement(tag), props)
  for (const c of children) if (c != null) n.append(c)
  return n
}

// ---------- toast ----------

let toastTimer
function toast(message, { error = false } = {}) {
  const t = $('toast')
  t.textContent = message
  t.classList.toggle('error', error)
  t.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (t.hidden = true), error ? 7000 : 3200)
}

// ---------- meters ----------

function renderMeter(node, fraction, { segments = 24, hotAbove = 0.9, tipHot = false } = {}) {
  if (node.children.length !== segments) {
    node.replaceChildren(...Array.from({ length: segments }, () => el('span')))
  }
  const f = Math.max(0, Math.min(1, fraction))
  const lit = f > 0 ? Math.max(1, Math.round(f * segments)) : 0
  ;[...node.children].forEach((s, i) => {
    const on = i < lit
    s.className = on ? (tipHot ? (i === lit - 1 ? 'hot' : 'on') : fraction >= hotAbove ? 'hot' : 'on') : ''
  })
}

// ---------- device display ----------

function renderDisplay() {
  const connectBtn = $('connect')
  const backupBtn = $('backup')
  const stats = $('d-stats')
  const d = state.device
  if (!webMidiSupported()) {
    $('d-title').textContent = 'No MIDI in this browser'
    $('d-sub').textContent = ''
    stats.replaceChildren(
      el('p', { className: 'display-hint', textContent: 'Open arc in Chrome on Android or on a computer to connect your EP-133. Your saved backups still work here.' }),
    )
    renderMeter($('meter'), 0)
    connectBtn.disabled = true
    backupBtn.disabled = true
    return
  }
  connectBtn.disabled = state.busy
  connectBtn.textContent = state.session ? 'Disconnect' : 'Connect'
  backupBtn.disabled = !d || state.busy
  if (!d) {
    $('d-title').textContent = state.session ? 'Reading device' : 'No device'
    $('d-sub').textContent = ''
    stats.replaceChildren(
      el('p', {
        className: 'display-hint',
        textContent: state.session ? 'One moment.' : 'Plug in the EP-133 with a USB-C cable and turn it on, then tap Connect.',
      }),
    )
    renderMeter($('meter'), 0)
    return
  }
  const { info, storage } = d
  $('d-title').textContent = info.product || 'EP-133'
  $('d-sub').textContent = info.osVersion ? `OS ${info.osVersion}` : ''
  const used = storage.total ? storage.used / storage.total : 0
  renderMeter($('meter'), used)
  $('meter').title = storage.total ? `${fmtBytes(storage.used)} of ${fmtBytes(storage.total)} used` : ''
  stats.replaceChildren(
    el('div', {}, el('span', { className: 'stat-num', textContent: d.sounds }), el('span', { className: 'stat-label', textContent: d.sounds === 1 ? 'sound' : 'sounds' })),
    el('div', {}, el('span', { className: 'stat-num', textContent: d.projects }), el('span', { className: 'stat-label', textContent: d.projects === 1 ? 'project' : 'projects' })),
    storage.total
      ? el(
          'div',
          { className: 'stat-free' },
          el('span', { className: 'stat-num', textContent: fmtBytes(storage.free) }),
          el('span', { className: 'stat-label', textContent: 'free' }),
        )
      : null,
  )
}

async function refreshDevice() {
  const s = state.session
  if (!s) return
  const [storage, sounds, projects] = [await getStorage(s), await listSounds(s), await listProjects(s)]
  state.device = { info: s.info, storage, sounds: sounds.length, projects: projects.length }
  renderDisplay()
}

function dropSession(message) {
  state.session?.close()
  state.session = null
  state.device = null
  renderDisplay()
  if (message) toast(message, { error: true })
}

async function connect() {
  if (state.session) return dropSession()
  state.busy = true
  renderDisplay()
  try {
    const { transport } = await openMidi({
      onDisconnect: () => {
        abortCurrent?.abort()
        dropSession('The EP-133 was disconnected.')
      },
    })
    state.session = new Session(transport)
    renderDisplay()
    await state.session.handshake()
    await refreshDevice()
  } catch (err) {
    dropSession(err.message)
  } finally {
    state.busy = false
    renderDisplay()
  }
}

// ---------- long-running tasks ----------

let abortCurrent = null

async function runTask(title, fn) {
  if (state.busy) return
  state.busy = true
  renderDisplay()
  const sheet = $('progress-sheet')
  $('progress-title').textContent = title
  $('progress-label').textContent = ''
  renderMeter($('progress-meter'), 0, { tipHot: true })
  $('progress-cancel').disabled = false
  sheet.showModal()
  const ac = new AbortController()
  abortCurrent = ac
  let wake = null
  try {
    wake = await navigator.wakeLock?.request('screen')
  } catch {}
  const onProgress = ({ fraction, label }) => {
    renderMeter($('progress-meter'), fraction, { tipHot: true })
    $('progress-meter').setAttribute('aria-valuenow', String(Math.round(fraction * 100)))
    if (label) $('progress-label').textContent = label
  }
  try {
    return await fn({ onProgress, signal: ac.signal })
  } catch (err) {
    if (err instanceof CancelledError) toast('Cancelled. Nothing after that point was changed.')
    else toast(err.message || String(err), { error: true })
    return undefined
  } finally {
    abortCurrent = null
    wake?.release?.().catch(() => {})
    sheet.close()
    state.busy = false
    renderDisplay()
  }
}

$('progress-cancel').addEventListener('click', () => {
  abortCurrent?.abort()
  $('progress-cancel').disabled = true
  $('progress-label').textContent = 'Stopping after the current item'
})
$('progress-sheet').addEventListener('cancel', (e) => e.preventDefault())

// ---------- backup ----------

async function summarize(blob) {
  const pak = await openPak(new Uint8Array(await blob.arrayBuffer()))
  return describePak(pak)
}

async function doBackup() {
  const saved = await runTask('Backing up', async ({ onProgress, signal }) => {
    const { blob, summary } = await backupDevice(state.session, { onProgress, signal })
    const d = await summarize(blob)
    return lib.saveBackup(
      {
        title: `Backup ${fmtDate.format(summary.createdAt)}`,
        notes: '',
        createdAt: summary.createdAt,
        source: 'device',
        device: summary.device,
        ...pickSummary(d),
      },
      blob,
    )
  })
  if (saved) {
    state.freshId = saved.id
    toast(`Saved ${plural(saved.soundCount, 'sound')} and ${plural(saved.projectCount, 'project')}.`)
    await loadLibrary()
  }
  refreshDevice().catch(() => {})
}

function pickSummary(d) {
  return {
    soundCount: d.soundCount,
    projectCount: d.projectCount,
    projects: d.projects,
    slots: d.slots,
    projectSlots: d.projectSlots,
  }
}

// ---------- library ----------

async function loadLibrary() {
  state.backups = await lib.listBackups()
  renderLibrary()
  const est = await lib.storageEstimate()
  const total = state.backups.reduce((n, b) => n + (b.size || 0), 0)
  $('storage-note').textContent = state.backups.length
    ? `${plural(state.backups.length, 'backup')}, ${fmtBytes(total)} stored on this phone${est?.quota ? ` (${fmtBytes(Math.max(0, est.quota - est.usage))} space left)` : ''}.`
    : ''
}

function renderLibrary() {
  const ul = $('backups')
  ul.replaceChildren(
    ...state.backups.map((b) => {
      const btn = el(
        'button',
        { className: 'backup-row', type: 'button' },
        el('span', { className: 'backup-title', textContent: b.title }),
        el('span', { className: 'backup-when', textContent: fmtDay.format(b.createdAt) }),
        el('span', {
          className: 'backup-meta',
          textContent: `${plural(b.soundCount, 'sound')}, ${plural(b.projectCount, 'project')}, ${fmtBytes(b.size)}`,
        }),
      )
      btn.addEventListener('click', () => openDetail(b.id))
      return el('li', { className: b.id === state.freshId ? 'backup-new' : '' }, btn)
    }),
  )
  $('empty').hidden = state.backups.length > 0
}

function fact(dt, dd) {
  return dd ? [el('dt', { textContent: dt }), el('dd', { textContent: dd })] : []
}

function openDetail(id) {
  const b = state.backups.find((x) => x.id === id)
  if (!b) return
  state.current = b
  $('detail-title').value = b.title
  $('detail-notes').value = b.notes || ''
  const dev = b.device || {}
  $('detail-facts').replaceChildren(
    ...fact('Made', fmtDate.format(b.createdAt)),
    ...fact('From', b.source === 'import' ? `Imported file${b.fileName ? `, ${b.fileName}` : ''}` : [dev.product, dev.serial].filter(Boolean).join(', ')),
    ...fact('OS', dev.osVersion),
    ...fact('Contents', `${plural(b.soundCount, 'sound')}, ${plural(b.projectCount, 'project')}`),
    ...fact('Size', fmtBytes(b.size)),
  )
  $('detail-projects').replaceChildren(
    ...(b.projects || []).map((n) => {
      const used = b.projectSlots?.[n]?.length ?? 0
      return el(
        'div',
        { className: 'project-line' },
        el('strong', { textContent: `Project ${n}` }),
        el('span', { className: 'muted', textContent: used ? plural(used, 'sound') : '' }),
      )
    }),
  )
  $('detail-restore').disabled = !state.device || state.busy
  $('detail-restore').textContent = state.device ? 'Restore to device' : 'Connect a device to restore'
  $('detail-sheet').showModal()
}

async function saveDetailEdits() {
  const b = state.current
  if (!b) return
  const title = $('detail-title').value.trim() || b.title
  const notes = $('detail-notes').value
  if (title === b.title && notes === (b.notes || '')) return
  Object.assign(b, await lib.updateBackup(b.id, { title, notes }))
  renderLibrary()
}

$('detail-sheet').addEventListener('close', saveDetailEdits)

function fileNameFor(b) {
  const base = b.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'ep133-backup'
  return `${base}.pak`
}

async function downloadCurrent() {
  const b = state.current
  const blob = await lib.getBlob(b.id)
  const url = URL.createObjectURL(blob)
  const a = el('a', { href: url, download: fileNameFor(b) })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

async function shareCurrent() {
  const b = state.current
  const blob = await lib.getBlob(b.id)
  const file = new File([blob], fileNameFor(b), { type: 'application/zip' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: b.title, text: `EP-133 backup: ${b.title}` })
    } catch (err) {
      if (err.name !== 'AbortError') toast('Sharing failed. Use Save .pak file instead.', { error: true })
    }
  } else {
    await downloadCurrent()
    toast("This browser can't share files directly, so the .pak was saved instead.")
  }
}

async function deleteCurrent() {
  const b = state.current
  if (!confirm(`Delete "${b.title}" from this phone? This can't be undone.`)) return
  await lib.deleteBackup(b.id)
  state.current = null
  $('detail-sheet').close()
  toast('Backup deleted.')
  await loadLibrary()
}

$('detail-download').addEventListener('click', () => downloadCurrent().catch((e) => toast(e.message, { error: true })))
$('detail-share').addEventListener('click', () => shareCurrent().catch((e) => toast(e.message, { error: true })))
$('detail-delete').addEventListener('click', () => deleteCurrent().catch((e) => toast(e.message, { error: true })))
$('detail-restore').addEventListener('click', () => {
  $('detail-sheet').close()
  openRestore()
})

// ---------- restore ----------

function restoreSelection() {
  const b = state.current
  const all = $('restore-form').scope.value === 'all'
  if (all) return { slots: b.slots ?? [], projects: b.projects ?? [] }
  const projects = [...document.querySelectorAll('#restore-projects input:checked')].map((i) => Number(i.value))
  const slots = new Set()
  for (const p of projects) for (const s of b.projectSlots?.[p] ?? []) slots.add(s)
  if ($('restore-other').checked) {
    const usedByAny = new Set(Object.values(b.projectSlots ?? {}).flat())
    for (const s of b.slots ?? []) if (!usedByAny.has(s)) slots.add(s)
  }
  return { slots: [...slots].sort((a, b) => a - b), projects }
}

function updateRestoreSummary() {
  const { slots, projects } = restoreSelection()
  const pick = $('restore-form').scope.value === 'pick'
  $('restore-pick').disabled = !pick
  const parts = []
  if (slots.length) parts.push(plural(slots.length, 'sound'))
  if (projects.length) parts.push(plural(projects.length, 'project'))
  const go = $('restore-go')
  go.disabled = !parts.length
  go.textContent = parts.length ? `Restore ${parts.join(' and ')}` : 'Pick something to restore'
  const list = new Intl.ListFormat('en', { type: 'conjunction' })
  const what = []
  if (projects.length) what.push(`${projects.length === 1 ? 'project' : 'projects'} ${list.format(projects.map(String))}`)
  if (slots.length) what.push(plural(slots.length, 'sample slot'))
  $('restore-warning').textContent = parts.length
    ? `This overwrites ${what.join(' and ')} on your EP-133. Everything else on the device stays as it is.`
    : ''
}

function openRestore() {
  const b = state.current
  $('restore-form').scope.value = 'all'
  $('restore-other').checked = false
  $('restore-projects').replaceChildren(
    ...(b.projects ?? []).map((n) =>
      el(
        'label',
        { className: 'check' },
        el('input', { type: 'checkbox', value: String(n), checked: true }),
        el('span', { textContent: `Project ${n}` }),
        el('small', { textContent: plural(b.projectSlots?.[n]?.length ?? 0, 'sound') }),
      ),
    ),
  )
  updateRestoreSummary()
  $('restore-sheet').showModal()
}

$('restore-form').addEventListener('change', updateRestoreSummary)

$('restore-go').addEventListener('click', async () => {
  const b = state.current
  const sel = restoreSelection()
  $('restore-sheet').close()
  const done = await runTask('Restoring', async ({ onProgress, signal }) => {
    const blob = await lib.getBlob(b.id)
    const pak = await openPak(new Uint8Array(await blob.arrayBuffer()))
    return restorePak(state.session, pak, { ...sel, onProgress, signal })
  })
  if (done) toast(`Restored ${plural(done.sounds, 'sound')} and ${plural(done.projects, 'project')}.`)
  refreshDevice().catch(() => {})
})

// ---------- import ----------

$('import-file').addEventListener('change', (e) => {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (file) importFile(file)
})

// Opening a .pak with the installed app (Android "Open with").
if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async (params) => {
    for (const handle of params.files ?? []) importFile(await handle.getFile())
  })
}

async function importFile(file) {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const pak = await openPak(bytes)
    const d = describePak(pak)
    const saved = await lib.saveBackup(
      {
        title: file.name.replace(/\.(pak|zip)$/i, '') || 'Imported backup',
        notes: '',
        createdAt: d.generatedAt || file.lastModified || Date.now(),
        source: 'import',
        fileName: file.name,
        device: d.device,
        ...pickSummary(d),
      },
      new Blob([bytes], { type: 'application/zip' }),
    )
    state.freshId = saved.id
    toast(`Imported ${plural(saved.soundCount, 'sound')} and ${plural(saved.projectCount, 'project')}.`)
    await loadLibrary()
  } catch (err) {
    toast(`Couldn't import ${file.name}: ${err.message}`, { error: true })
  }
}

// ---------- boot ----------

$('connect').addEventListener('click', connect)
$('backup').addEventListener('click', doBackup)

renderDisplay()
lib.requestPersistence()
loadLibrary().catch((e) => toast(`Couldn't open saved backups: ${e.message}`, { error: true }))

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {})
}
