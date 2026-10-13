import { neon } from '@neondatabase/serverless'
import { Pool } from 'pg'
import { poolMax, usesPgDriver } from '@/lib/db/local'

// Minimal raw-SQL handle for the migration runner: a tagged template for parameterised statements
// and .query() for a statement text. Backed by Neon's HTTP driver, or by pg for a local database.
export type RawSql = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, unknown>[]>
  query(text: string): Promise<unknown>
  /** All statements in one transaction: either every one is applied or none. */
  transaction(statements: string[]): Promise<void>
  end(): Promise<void>
}

export function createRawSql(url: string): RawSql {
  if (!usesPgDriver(url)) {
    const sql = neon(url)
    return Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => sql(strings, ...values) as Promise<Record<string, unknown>[]>, {
      query: (text: string) => sql.query(text),
      // Neon's HTTP driver cannot hold an interactive transaction, but it applies a list of statements
      // submitted together atomically.
      transaction: async (statements: string[]) => {
        await sql.transaction(statements.map((statement) => sql.query(statement)))
      },
      end: async () => {},
    })
  }
  const pool = new Pool({ connectionString: url, max: poolMax() })
  const run = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    // Turn the tagged template into $1, $2, … placeholders.
    const text = strings.reduce((acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ''), '')
    return (await pool.query(text, values as unknown[])).rows as Record<string, unknown>[]
  }
  const transaction = async (statements: string[]) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const statement of statements) await client.query(statement)
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
  return Object.assign(run, { query: (text: string) => pool.query(text), transaction, end: () => pool.end() })
}
