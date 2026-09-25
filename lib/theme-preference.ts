// The dark-mode choice, remembered per device. Before, it lived only in React state: a reload or
// the app's own refresh reset it to light, and the phone's system setting was ignored.
//
// An explicit choice (the header toggle) is stored and wins. Without one, the system setting
// (`prefers-color-scheme`) decides and is followed live. Storage can be missing or throw (private
// mode, blocked site data), so every access is guarded and the app simply falls back to the system.

export const THEME_STORAGE_KEY = 'shopping-buddy:theme'

export type ThemeChoice = 'dark' | 'light'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export function readThemeChoice(storage: StorageLike | undefined): ThemeChoice | null {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY)
    return value === 'dark' || value === 'light' ? value : null
  } catch {
    // Unreadable storage is not an error for the user: the system setting applies instead.
    return null
  }
}

export function saveThemeChoice(storage: StorageLike | undefined, choice: ThemeChoice): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, choice)
  } catch {
    // Not remembered on this device (e.g. private mode); the toggle still works for this visit.
  }
}

/** Whether to show the dark theme: the stored choice if there is one, else the system setting. */
export function resolveDark(choice: ThemeChoice | null, systemPrefersDark: boolean): boolean {
  return choice ? choice === 'dark' : systemPrefersDark
}
