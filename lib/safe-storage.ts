/** `window.localStorage`, or undefined on the server and where merely accessing it throws (some
 *  browsers' private mode). Callers treat undefined as "nothing remembered on this device". */
export function safeLocalStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}
