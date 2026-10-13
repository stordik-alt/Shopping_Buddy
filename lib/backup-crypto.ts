import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { closeSync, openSync, readSync, writeSync } from 'node:fs'

// File encryption for database dumps (scripts/backup-db.ts, scripts/restore-db.ts). A dump holds
// accounts, session tokens and household data, so it must never sit on a disk in the clear
// (docs/35_SECURITY_AUDIT.md S3). AES-256-GCM with the key from BACKUP_ENCRYPTION_KEY, using only
// Node's own crypto: no new dependency and nothing to install next to pg_dump.
//
// Format: "SBBK1\n" | 8-byte random nonce prefix | chunks. Each chunk is
//   [1 byte final flag][4 byte ciphertext length][ciphertext][16 byte tag].
// The GCM IV is the nonce prefix + a 4-byte chunk counter; the associated data is the counter and the
// final flag. So a flipped bit, a reordered or dropped chunk and a file cut short all fail to decrypt
// instead of silently restoring a partial database.

const MAGIC = Buffer.from('SBBK1\n')
const NONCE_BYTES = 8
const TAG_BYTES = 16
const CHUNK_BYTES = 1024 * 1024

/** Parses BACKUP_ENCRYPTION_KEY: 32 random bytes, base64 (`openssl rand -base64 32`). */
export function parseBackupKey(value: string | undefined): Buffer {
  if (!value) throw new Error('BACKUP_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and keep a copy in your password manager.')
  const key = Buffer.from(value.trim(), 'base64')
  if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must be 32 random bytes in base64 (`openssl rand -base64 32`).')
  return key
}

function ivFor(nonce: Buffer, counter: number): Buffer {
  const counterBytes = Buffer.alloc(4)
  counterBytes.writeUInt32BE(counter)
  return Buffer.concat([nonce, counterBytes])
}

function aadFor(counter: number, final: boolean): Buffer {
  const aad = Buffer.alloc(5)
  aad.writeUInt32BE(counter)
  aad.writeUInt8(final ? 1 : 0, 4)
  return aad
}

function readFully(fd: number, size: number): Buffer {
  const buffer = Buffer.alloc(size)
  let offset = 0
  while (offset < size) {
    const read = readSync(fd, buffer, offset, size - offset, null)
    if (read === 0) break
    offset += read
  }
  return buffer.subarray(0, offset)
}

export function encryptFile(inputPath: string, outputPath: string, key: Buffer): void {
  const input = openSync(inputPath, 'r')
  const output = openSync(outputPath, 'wx', 0o600)
  try {
    const nonce = randomBytes(NONCE_BYTES)
    writeSync(output, MAGIC)
    writeSync(output, nonce)
    let counter = 0
    // Read one chunk ahead, so the last chunk (possibly the only, possibly empty) is known when written.
    let current = readFully(input, CHUNK_BYTES)
    for (;;) {
      const next = current.length === CHUNK_BYTES ? readFully(input, CHUNK_BYTES) : Buffer.alloc(0)
      const final = next.length === 0
      const cipher = createCipheriv('aes-256-gcm', key, ivFor(nonce, counter))
      cipher.setAAD(aadFor(counter, final))
      const encrypted = Buffer.concat([cipher.update(current), cipher.final()])
      const header = Buffer.alloc(5)
      header.writeUInt8(final ? 1 : 0, 0)
      header.writeUInt32BE(encrypted.length, 1)
      writeSync(output, Buffer.concat([header, encrypted, cipher.getAuthTag()]))
      if (final) break
      current = next
      counter += 1
    }
  } finally {
    closeSync(input)
    closeSync(output)
  }
}

export function decryptFile(inputPath: string, outputPath: string, key: Buffer): void {
  const input = openSync(inputPath, 'r')
  const output = openSync(outputPath, 'wx', 0o600)
  try {
    const magic = readFully(input, MAGIC.length)
    if (!magic.equals(MAGIC)) throw new Error('Not an encrypted backup (unknown file header).')
    const nonce = readFully(input, NONCE_BYTES)
    if (nonce.length !== NONCE_BYTES) throw new Error('Encrypted backup is truncated.')
    let counter = 0
    for (;;) {
      const header = readFully(input, 5)
      if (header.length !== 5) throw new Error('Encrypted backup is truncated.')
      const final = header.readUInt8(0) === 1
      const length = header.readUInt32BE(1)
      if (length > CHUNK_BYTES) throw new Error('Encrypted backup is corrupt (chunk too large).')
      const body = readFully(input, length + TAG_BYTES)
      if (body.length !== length + TAG_BYTES) throw new Error('Encrypted backup is truncated.')
      const decipher = createDecipheriv('aes-256-gcm', key, ivFor(nonce, counter))
      decipher.setAAD(aadFor(counter, final))
      decipher.setAuthTag(body.subarray(length))
      let plain: Buffer
      try {
        plain = Buffer.concat([decipher.update(body.subarray(0, length)), decipher.final()])
      } catch {
        throw new Error('Decryption failed: wrong BACKUP_ENCRYPTION_KEY, or the file was modified or damaged.')
      }
      writeSync(output, plain)
      if (final) break
      counter += 1
    }
    // Anything after the final chunk was not written by us.
    if (readFully(input, 1).length !== 0) throw new Error('Encrypted backup has unexpected data after the last chunk.')
  } finally {
    closeSync(input)
    closeSync(output)
  }
}
