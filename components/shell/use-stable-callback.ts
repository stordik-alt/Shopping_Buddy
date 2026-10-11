'use client'

import { useCallback, useLayoutEffect, useRef } from 'react'

/** A function with a permanent identity that always calls the latest version of `callback`.
 *
 *  The app shell's handlers close over its state (`items`, `pins`…), so they get a new identity on every
 *  render and defeat `React.memo` on the sections they are passed to. Wrapping them here keeps the
 *  props stable without a dependency list to maintain, and a call still sees the current state.
 *  Only use it for handlers called from events or effects, never during render. */
export function useStableCallback<Args extends unknown[], Result>(callback: (...args: Args) => Result): (...args: Args) => Result {
  const latest = useRef(callback)
  // Layout effect: the ref is up to date before any event handler or effect of this commit can run.
  useLayoutEffect(() => {
    latest.current = callback
  })
  return useCallback((...args: Args) => latest.current(...args), [])
}
