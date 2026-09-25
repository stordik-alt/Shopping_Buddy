import { describe, expect, it } from 'vitest'
import { installPlatform } from '@/lib/install-prompt'

describe('installPlatform', () => {
  it('recognises iPhone and iPad, including iPadOS posing as a Mac', () => {
    expect(installPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1', 5)).toBe('ios')
    expect(installPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 5)).toBe('ios')
  })

  it('treats a Mac without a touch screen as a desktop', () => {
    expect(installPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 0)).toBe('desktop')
  })

  it('recognises Android', () => {
    expect(installPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36', 5)).toBe('android')
  })

  it('falls back to desktop for anything else', () => {
    expect(installPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36', 0)).toBe('desktop')
  })
})
