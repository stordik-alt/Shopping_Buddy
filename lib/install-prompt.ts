// Installing the app to the phone's home screen (a PWA; the manifest is app/manifest.ts).
//
// Chrome and other Chromium browsers announce that the app can be installed with a
// `beforeinstallprompt` event, and keeping that event is the only way to open the browser's own
// install dialog later from a button. It can fire as soon as the page loads — before the account
// menu is ever opened — so it is caught here at module load and kept in a tiny store the menu reads
// with useSyncExternalStore. Chrome's own install banner is left alone (no preventDefault), so the
// menu item is an extra way to install, not a replacement.
//
// Safari (iPhone/iPad) and Firefox have no such event: there the menu shows how to add the app by
// hand instead (see installPlatform()).

/** The non-standard event Chromium fires when the app is installable (not in the DOM typings). */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallState = {
  /** The browser offered an install dialog that the app can open (Chromium). */
  canPrompt: boolean
  /** Running as the installed app, or installed in this session: nothing left to offer. */
  installed: boolean
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
let state: InstallState = { canPrompt: false, installed: false }
const listeners = new Set<() => void>()

function setState(next: InstallState) {
  state = next
  for (const listener of listeners) listener()
}

function isStandalone(): boolean {
  // `navigator.standalone` is Safari's own flag for a home-screen app.
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

if (typeof window !== 'undefined') {
  state = { canPrompt: false, installed: isStandalone() }
  window.addEventListener('beforeinstallprompt', (event) => {
    deferredPrompt = event as BeforeInstallPromptEvent
    setState({ ...state, canPrompt: true })
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    setState({ canPrompt: false, installed: true })
  })
}

export function subscribeInstallState(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getInstallState(): InstallState {
  return state
}

const SERVER_STATE: InstallState = { canPrompt: false, installed: false }
export function getServerInstallState(): InstallState {
  return SERVER_STATE
}

/** Opens the browser's install dialog. Resolves to whether the user installed the app; `false`
 *  also when there is no dialog to open. The event can be used only once, so it is dropped either
 *  way (Chromium fires a new one if the app is still installable). */
export async function promptInstall(): Promise<boolean> {
  const prompt = deferredPrompt
  if (!prompt) return false
  deferredPrompt = null
  setState({ ...state, canPrompt: false })
  await prompt.prompt()
  const { outcome } = await prompt.userChoice
  if (outcome === 'accepted') setState({ canPrompt: false, installed: true })
  return outcome === 'accepted'
}

export type InstallPlatform = 'ios' | 'android' | 'desktop'

/** Which manual instructions fit this device when the browser offers no install dialog. iPadOS
 *  reports itself as a Mac, so a "Macintosh" with a touch screen counts as iOS. Pure/testable. */
export function installPlatform(userAgent: string, maxTouchPoints: number): InstallPlatform {
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(userAgent)) return 'android'
  return 'desktop'
}
