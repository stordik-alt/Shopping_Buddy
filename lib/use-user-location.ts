'use client'

import { useState } from 'react'
import type { GpsCoords } from '@/lib/geo'

export type LocationState = 'idle' | 'loading' | 'granted' | 'denied'

/** Browser geolocation, opt-in only. Lives above both the store directory and the shopping-list
 *  store comparison so a location grant in one place is usable in the other, instead of each
 *  screen asking separately. */
export function useUserLocation() {
  const [state, setState] = useState<LocationState>('idle')
  const [coords, setCoords] = useState<GpsCoords | null>(null)

  function requestLocation() {
    if (!('geolocation' in navigator)) {
      setState('denied')
      return
    }
    setState('loading')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude })
        setState('granted')
      },
      () => setState('denied'),
      { timeout: 8000 },
    )
  }

  /** Switch back to manual (typed) location — there's no reverse-geocoding here, so once GPS is
   *  granted there's no place name to show; the caller should fall back to a manual text field. */
  function clearLocation() {
    setState('idle')
    setCoords(null)
  }

  return { state, coords, requestLocation, clearLocation }
}
