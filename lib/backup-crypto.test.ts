import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { decryptFile, encryptFile, parseBackupKey } from '@/lib/backup-crypto'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'backup-crypto-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const key = randomBytes(32)

function roundTrip(data: Buffer) {
  const plain = join(dir, 'in')
  const enc = join(dir, 'enc')
  const out = join(dir, 'out')
  writeFileSync(plain, data)
  encryptFile(plain, enc, key)
  decryptFile(enc, out, key)
  return { enc, out }
}

describe('backup encryption', () => {
  it.each([0, 1, 1024 * 1024 - 1, 1024 * 1024, 3 * 1024 * 1024 + 7])('round-trips %i bytes', (size) => {
    const data = randomBytes(size)
    const { enc, out } = roundTrip(data)
    expect(readFileSync(out).equals(data)).toBe(true)
    if (size > 64) expect(readFileSync(enc).includes(data.subarray(0, 64))).toBe(false)
  })

  it('rejects a wrong key', () => {
    const { enc } = roundTrip(randomBytes(100))
    expect(() => decryptFile(enc, join(dir, 'out2'), randomBytes(32))).toThrow(/Decryption failed/)
  })

  it('rejects a flipped bit, a truncated file and appended data', () => {
    const { enc } = roundTrip(randomBytes(2 * 1024 * 1024 + 5))
    const bytes = readFileSync(enc)

    const flipped = Buffer.from(bytes)
    flipped[flipped.length - 40] ^= 1
    writeFileSync(join(dir, 'flipped'), flipped)
    expect(() => decryptFile(join(dir, 'flipped'), join(dir, 'o1'), key)).toThrow()

    // Cutting at a chunk boundary must not read as a complete (shorter) backup.
    const cut = bytes.subarray(0, 14 + 5 + 1024 * 1024 + 16)
    writeFileSync(join(dir, 'cut'), cut)
    expect(() => decryptFile(join(dir, 'cut'), join(dir, 'o2'), key)).toThrow()

    writeFileSync(join(dir, 'extra'), Buffer.concat([bytes, Buffer.from([1])]))
    expect(() => decryptFile(join(dir, 'extra'), join(dir, 'o3'), key)).toThrow(/unexpected data/)
  })

  it('rejects a file that is not an encrypted backup', () => {
    writeFileSync(join(dir, 'plain'), 'PGDMP not encrypted')
    expect(() => decryptFile(join(dir, 'plain'), join(dir, 'o'), key)).toThrow(/Not an encrypted backup/)
  })

  it('validates the key format', () => {
    expect(() => parseBackupKey(undefined)).toThrow(/not set/)
    expect(() => parseBackupKey('short')).toThrow(/32 random bytes/)
    expect(parseBackupKey(key.toString('base64'))).toHaveLength(32)
  })
})
