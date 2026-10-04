// Offline cache for the app shell. Bump VERSION on every release.
const VERSION = 'arc-0.1.0'
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'src/app.js',
  'src/backup.js',
  'src/library.js',
  'src/webmidi.js',
  'src/protocol/packed7.js',
  'src/protocol/frame.js',
  'src/protocol/session.js',
  'src/protocol/fs.js',
  'src/protocol/device.js',
  'src/formats/crc32.js',
  'src/formats/wav.js',
  'src/formats/zip.js',
  'src/formats/tar.js',
]

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin === location.origin) {
    // Network first so updates land quickly, cache when offline.
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(VERSION).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => caches.match(req, { ignoreSearch: true })),
    )
  } else if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone()
            caches.open(VERSION).then((c) => c.put(req, copy))
            return res
          }),
      ),
    )
  }
})
