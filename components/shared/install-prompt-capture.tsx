'use client'

// Loads lib/install-prompt.ts on every page, so the browser's one-off "can be installed" event is
// caught even when it fires on the intro or sign-in page, before the account menu exists.
import '@/lib/install-prompt'

export function InstallPromptCapture() {
  return null
}
