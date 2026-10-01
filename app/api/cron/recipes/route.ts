import { NextResponse } from 'next/server'
import { importRecipeBatch } from '@/lib/recipes/importer'
import { RECIPE_SOURCE_ADAPTERS } from '@/lib/recipes/sources'

export const maxDuration = 300

const DAILY_QUERIES = [
  'kuře',
  'maso',
  'těstoviny',
  'rýže',
  'brambory',
  'zelenina',
  'polévka',
  'omáčka',
  'salát',
  'ryba',
  'dezert',
  'buchta',
  'snídaně',
  'večeře',
  'pizza',
  'bezmasé',
]

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  return Math.floor((date.getTime() - start) / 86_400_000)
}

function queryForSource(sourceIndex: number): string {
  return DAILY_QUERIES[(dayOfYear(new Date()) + sourceIndex) % DAILY_QUERIES.length]
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (process.env.RECIPE_IMPORT_IMAGE_COPY_ALLOWED !== 'true') {
    return NextResponse.json({ error: 'RECIPE_IMPORT_IMAGE_COPY_ALLOWED=true is required' }, { status: 500 })
  }
  if (process.env.RECIPE_IMPORT_SOURCE_TERMS_ACK !== 'true') {
    return NextResponse.json({ error: 'RECIPE_IMPORT_SOURCE_TERMS_ACK=true is required' }, { status: 500 })
  }

  const startedAt = Date.now()
  const results: Record<string, unknown> = {}

  for (const [index, adapter] of RECIPE_SOURCE_ADAPTERS.entries()) {
    const query = queryForSource(index)
    try {
      results[adapter.id] = await importRecipeBatch({
        sourceId: adapter.id,
        queries: [query],
        limit: 6,
        delayMs: 300,
        importImages: true,
        acknowledgeSourceTerms: process.env.RECIPE_IMPORT_SOURCE_TERMS_ACK === 'true',
      })
    } catch (error) {
      results[adapter.id] = {
        query,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  const failed = Object.values(results).filter((result) => typeof result === 'object' && result !== null && 'error' in result).length

  return NextResponse.json({
    ok: failed < RECIPE_SOURCE_ADAPTERS.length,
    durationMs: Date.now() - startedAt,
    results,
  }, { status: failed === RECIPE_SOURCE_ADAPTERS.length ? 502 : 200 })
}
