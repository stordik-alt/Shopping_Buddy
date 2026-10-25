import { useCallback } from 'react'
import type { RefCallback } from 'react'

export type NativeGuideFrame = { x: number; y: number; width: number; height: number }

type MeasurableNativeView = {
  measureInWindow(callback: (x: number, y: number, width: number, height: number) => void): void
}

const targets = new Map<string, MeasurableNativeView>()

export function useNativeGuideTarget(id: string): RefCallback<MeasurableNativeView> {
  return useCallback((target) => {
    if (target) targets.set(id, target)
    else targets.delete(id)
  }, [id])
}

export function measureNativeGuideTarget(id: string): Promise<NativeGuideFrame | null> {
  const target = targets.get(id)
  if (!target) return Promise.resolve(null)
  return new Promise((resolve) => {
    target.measureInWindow((x, y, width, height) => {
      resolve(width > 0 && height > 0 ? { x, y, width, height } : null)
    })
  })
}

export async function measureFirstNativeGuideTarget(ids: (string | undefined)[]): Promise<NativeGuideFrame | null> {
  for (const id of ids) {
    if (!id) continue
    const frame = await measureNativeGuideTarget(id)
    if (frame) return frame
  }
  return null
}
