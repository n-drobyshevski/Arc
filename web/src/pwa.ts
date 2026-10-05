// The service worker (PWA; no Android counterpart: Play Store updates replace the app).
//
// vite-plugin-pwa builds sw.js (generateSW, registerType 'prompt', injectRegister
// null, see vite.config.ts); this module registers it. A new version never takes
// over by itself: the worker waits until the user taps Reload on the update
// prompt (ui/components/UpdatePrompt), and even then arc reloads only when no
// transfer is running. A reload in the middle of a restore would leave the
// EP-133 half written, so every reload here goes through [whenIdle].
//
// In `vite dev` the virtual module is a no-op (devOptions are off), so nothing
// registers and the signals stay false.
import { signal, type ReadonlySignal } from '@preact/signals'
import { registerSW } from 'virtual:pwa-register'

/** How often a long-open tab asks for a new sw.js (the browser also checks on navigation). */
const UPDATE_CHECK_MS = 60 * 60 * 1000

export interface PwaOptions {
  /** Runs [run] now when no transfer is running, otherwise as soon as the last one ends. */
  whenIdle(run: () => void): void
}

const needRefreshSignal = signal(false)
const offlineReadySignal = signal(false)

/** A new version is installed and waiting for the user's Reload. */
export const needRefresh: ReadonlySignal<boolean> = needRefreshSignal
/** The first install finished: the app now opens offline. */
export const offlineReady: ReadonlySignal<boolean> = offlineReadySignal

let update: ((reloadPage?: boolean) => Promise<void>) | null = null
let options: PwaOptions | null = null
let applying = false

/** Registers the service worker once (later calls only swap the options). */
export function registerPwa(opts: PwaOptions): void {
  options = opts
  if (update) return
  update = registerSW({
    immediate: true,
    onNeedRefresh: () => {
      needRefreshSignal.value = true
    },
    onOfflineReady: () => {
      offlineReadySignal.value = true
    },
    // The new worker took control (this tab's Reload, or another tab's): reload
    // onto the new files, but not mid-transfer.
    onNeedReload: () => idle(() => location.reload()),
    onRegisteredSW: (_url, registration) => {
      if (!registration) return
      window.setInterval(() => {
        if (document.visibilityState !== 'visible' || !navigator.onLine) return
        registration.update().catch(() => {
          // Offline or the server is away: try again next time.
        })
      }, UPDATE_CHECK_MS)
    },
    onRegisterError: (e: unknown) => {
      // No service worker (private window, blocked storage): arc still works online.
      console.warn('arc: service worker not registered', e)
    },
  })
}

/** The update prompt's Reload: activates the waiting worker once no transfer runs. */
export function applyUpdate(): void {
  if (applying || !update) return
  applying = true
  const run = update
  idle(() => {
    run(true).catch((e: unknown) => {
      applying = false
      console.warn('arc: update failed', e)
    })
  })
}

/** The offline-ready message has been shown. */
export function clearOfflineReady(): void {
  offlineReadySignal.value = false
}

function idle(run: () => void): void {
  if (options) options.whenIdle(run)
  else run()
}
