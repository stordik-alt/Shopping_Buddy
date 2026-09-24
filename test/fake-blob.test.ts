import { describe, expect, it } from 'vitest'
import { del, fakeBlobCount, get, list, put } from '@/test/fake-blob'

describe('fake Blob store', () => {
  it('stores bytes and streams the same bytes back with the content type', async () => {
    const blob = await put('receipts/a.png', Buffer.from('hello'), { access: 'private', contentType: 'image/png' })
    const result = await get(blob.url, { access: 'private' })

    expect(result?.statusCode).toBe(200)
    expect(result?.blob.contentType).toBe('image/png')
    expect(Buffer.from(await new Response(result!.stream).arrayBuffer()).toString()).toBe('hello')
  })

  it('gives every put its own URL, even for the same path', async () => {
    const first = await put('same.txt', 'one', { access: 'private' })
    const second = await put('same.txt', 'two', { access: 'private' })

    expect(first.url).not.toBe(second.url)
    expect(Buffer.from(await new Response((await get(second.url, { access: 'private' }))!.stream).arrayBuffer()).toString()).toBe('two')
  })

  it('returns null for something that was never stored or was deleted', async () => {
    expect(await get('https://fake-blob.invalid/nothing', { access: 'private' })).toBeNull()

    const blob = await put('gone.txt', 'x', { access: 'private' })
    await del(blob.url)
    expect(await get(blob.url, { access: 'private' })).toBeNull()
  })

  it('deletes several objects at once and ignores unknown ones', async () => {
    const before = fakeBlobCount()
    const a = await put('m/a.txt', 'a', { access: 'private' })
    const b = await put('m/b.txt', 'b', { access: 'private' })
    await del([a.url, b.url, 'https://fake-blob.invalid/unknown'])

    expect(fakeBlobCount()).toBe(before)
  })

  it('lists by prefix', async () => {
    const blob = await put('prefixed/only-here.txt', 'x', { access: 'private' })
    const { blobs } = await list({ prefix: 'prefixed/' })

    expect(blobs.map((entry) => entry.url)).toContain(blob.url)
    await del(blob.url)
  })

  it('does not let a caller mutate what is stored', async () => {
    const bytes = Buffer.from('abc')
    const blob = await put('immutable.txt', bytes, { access: 'private' })
    bytes[0] = 0x7a // change the caller's buffer after the put

    expect(Buffer.from(await new Response((await get(blob.url, { access: 'private' }))!.stream).arrayBuffer()).toString()).toBe('abc')
  })
})
