import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Every export of a 'use server' module is an endpoint the browser can call with arguments of its
// choosing — not just the functions the UI happens to use. An internal helper exported from such a
// module skips whatever checks its real callers do first: processReceiptImport did, and calling it
// directly on a completed receipt import re-ran OCR and recorded the purchase a second time. So an
// action module exports only functions named `…Action` (plus types); internals live in lib/.
// Static check on the source only — no database.

const SOURCE_DIRS = ['app', 'lib', 'components']

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

const serverActionModules = SOURCE_DIRS.flatMap(sourceFiles).filter((path) => /^\s*['"]use server['"]/.test(readFileSync(path, 'utf8')))

/** Names of the module's runtime exports — type-only exports are erased and never become actions. */
function runtimeExports(source: string): string[] {
  const declared = [...source.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+(\w+)/gm)].map((match) => match[1])
  const listed = [...source.matchAll(/^export\s+\{([^}]*)\}/gm)].flatMap((match) =>
    match[1]
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part && !part.startsWith('type '))
      .map((part) => part.split(/\s+as\s+/).pop()!),
  )
  return [...declared, ...listed]
}

describe("'use server' modules export only actions", () => {
  it('finds the action modules', () => {
    expect(serverActionModules).toContain(join('app', 'actions', 'receipts.ts'))
  })

  it.each(serverActionModules)('%s', (path) => {
    const offending = runtimeExports(readFileSync(path, 'utf8')).filter((name) => !name.endsWith('Action'))
    expect(offending).toEqual([])
  })
})
