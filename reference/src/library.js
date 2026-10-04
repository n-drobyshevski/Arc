// Local backup library in IndexedDB. Backup records and their .pak blobs
// live in separate stores so listing never touches the large files.

const DB_NAME = 'arc'
const DB_VERSION = 1

let dbPromise = null

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const d = req.result
        if (!d.objectStoreNames.contains('backups')) d.createObjectStore('backups', { keyPath: 'id' })
        if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

async function tx(stores, mode, fn) {
  const d = await db()
  return new Promise((resolve, reject) => {
    const t = d.transaction(stores, mode)
    const result = fn(t)
    t.oncomplete = () => resolve(result?.result ?? result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error ?? new Error('Storage transaction aborted'))
  })
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist()
  } catch {}
}

export async function storageEstimate() {
  try {
    return await navigator.storage.estimate()
  } catch {
    return null
  }
}

export async function listBackups() {
  const rows = await tx(['backups'], 'readonly', (t) => t.objectStore('backups').getAll())
  return rows.sort((a, b) => b.createdAt - a.createdAt)
}

export function newId() {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export async function saveBackup(record, blob) {
  const row = { ...record, id: record.id ?? newId(), size: blob.size }
  await tx(['backups', 'files'], 'readwrite', (t) => {
    t.objectStore('files').put({ id: row.id, blob })
    t.objectStore('backups').put(row)
  })
  return row
}

export async function updateBackup(id, patch) {
  const d = await db()
  return new Promise((resolve, reject) => {
    const t = d.transaction(['backups'], 'readwrite')
    const store = t.objectStore('backups')
    const get = store.get(id)
    let row
    get.onsuccess = () => {
      row = { ...get.result, ...patch, id }
      store.put(row)
    }
    t.oncomplete = () => resolve(row)
    t.onerror = () => reject(t.error)
  })
}

export async function getBlob(id) {
  const rec = await tx(['files'], 'readonly', (t) => t.objectStore('files').get(id))
  if (!rec) throw new Error('The backup file is missing from this device')
  return rec.blob
}

export async function deleteBackup(id) {
  await tx(['backups', 'files'], 'readwrite', (t) => {
    t.objectStore('backups').delete(id)
    t.objectStore('files').delete(id)
  })
}
