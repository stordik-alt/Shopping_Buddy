import { neon } from '@neondatabase/serverless'
import { Pool } from 'pg'
import { isLocalDatabaseUrl } from '@/lib/db/local'

// Minimal raw-SQL handle for the migration runner: a tagged template for parameterised statements
// and .query() for a statement text. Backed by Neon's HTTP driver, or by pg for a local database.
export type RawSql = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, unknown>[]>
  query(text: string): Promise<unknown>
  end(): Promise<void>
}

export function createRawSql(url: string): RawSql {
  if (!isLocalDatabaseUrl(url)) {
    const sql = neon(url)
    return Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => sql(strings, ...values) as Promise<Record<string, unknown>[]>, {
      query: (text: string) => sql.query(text),
      end: async () => {},
    })
  }
  const pool = new Pool({ connectionString: url })
  const run = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    // Turn the tagged template into $1, $2, … placeholders.
    const text = strings.reduce((acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ''), '')
    return (await pool.query(text, values as unknown[])).rows as Record<string, unknown>[]
  }
  return Object.assign(run, { query: (text: string) => pool.query(text), end: () => pool.end() })
}
