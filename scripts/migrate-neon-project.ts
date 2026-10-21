// Přesune data z jednoho Neon projektu do druhého (změna regionu nebo účtu).
//
// Zdroj:  DATABASE_URL_UNPOOLED z .env.local
// Cíl:    Neon projekt zadaný --project-id; connection string si skript obstará sám přes neonctl,
//         takže se žádný credential neobjeví v příkazové řádce ani v logu.
//
// Dump obsahuje účty, session tokeny a JWKS privátní klíče. Proto se drží v dočasném adresáři se
// soukromými právy a po obnově se maže; trvalejší zálohu dělá `pnpm db:backup` (šifrovaná).
//
// neon_auth.project_config se z dumpu vyřazuje: tenhle řádek popisuje konkrétní endpoint a
// důvěryhodné domény Neon Authu, takže se přenosem nesmí přepsat na endpoint zdrojového projektu.
// Zároveň ale `pg_restore --clean` celé schéma neon_auth zahazuje, takže by tabulka zůstala
// chybět. Proto se její obsah uloží před obnovou a po obnově se vrátí — z cílového projektu,
// tedy s endpointem a doménami, které patří jemu.
//
// Použití:
//   pnpm exec dotenv -e .env.local -- tsx scripts/migrate-neon-project.ts --project-id <ID>

import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from 'pg'
import { describeError } from '@/lib/errors'

function fail(message: string): never {
  throw new Error(message)
}

/** Connection string cílového projektu. neonctl ho vypíše, ale my ho tady necháme v paměti. */
function targetConnectionString(projectId: string): string {
  const result = spawnSync('neonctl', ['connection-string', 'main', '--project-id', projectId], {
    encoding: 'utf8',
  })
  if (result.error) fail(`Could not run neonctl: ${describeError(result.error)}`)
  if (result.status !== 0) fail(`neonctl connection-string failed:\n${result.stderr}`)
  const match = /postgresql:\/\/\S+/.exec(result.stdout)
  if (!match) fail('neonctl did not return a PostgreSQL connection string.')
  return match[0]
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: ['ignore', 'inherit', 'inherit'] })
  if (result.error) fail(`Could not run ${command}: ${describeError(result.error)}`)
  if (result.status !== 0) fail(`${command} finished with exit code ${result.status}.`)
}

/** Obsah neon_auth.project_config z cílové databáze: konfigurace Neon Authu pro tenhle endpoint. */
async function readProjectConfig(url: string): Promise<Record<string, unknown> | null> {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const result = await client.query('select * from neon_auth.project_config limit 1')
    return (result.rows[0] as Record<string, unknown> | undefined) ?? null
  } finally {
    await client.end()
  }
}

/** Vrátí uloženou konfiguraci Neon Authu do cílové databáze. */
async function writeProjectConfig(url: string, row: Record<string, unknown>): Promise<void> {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const columns = Object.keys(row)
    const values = columns.map((column) => row[column])
    const placeholders = columns.map((_, index) => `$${index + 1}`)
    await client.query(
      `insert into neon_auth.project_config (${columns.join(', ')}) values (${placeholders.join(', ')})
       on conflict (id) do update set ${columns.map((c) => `${c} = excluded.${c}`).join(', ')}`,
      values,
    )
  } finally {
    await client.end()
  }
}

/**
 * Odstraní tabulku neon_auth.project_config, aby `pg_restore --clean` mohl zahodit celé schéma
 * neon_auth. Bez toho restore skončí chybou "cannot drop schema neon_auth because other objects
 * depend on it" — tabulka na schématu visí. Obsah je uložený zvlášť a po obnově se vrátí.
 */
async function dropProjectConfigTable(url: string): Promise<void> {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    await client.query('drop table if exists neon_auth.project_config cascade')
  } finally {
    await client.end()
  }
}

/**
 * Vrátí tabulky v neon_auth pod vlastnictví role neon_auth.
 *
 * Dump se obnovuje s --no-owner, takže vlastník přejde na roli, pod kterou restore běží
 * (neondb_owner). Neon Auth se ale připojuje jako role neon_auth, která musí být vlastníkem
 * schématu i jeho tabulek — jinak nemůže spravovat sessions, JWKS ani project_config.
 * Bez této opravy by přihlášení po obnově skončilo chybou oprávnění.
 */
async function restoreNeonAuthOwnership(url: string): Promise<void> {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const result = await client.query(`
      do $$
      declare
        table_name text;
      begin
        for table_name in
          select c.relname
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'neon_auth'
            and c.relkind = 'r'
            and c.relowner <> (select oid from pg_roles where rolname = 'neon_auth')
        loop
          execute format('alter table neon_auth.%I owner to neon_auth', table_name);
        end loop;
      end $$;
    `)
    if (result.rowCount === 0) {
      // do-blok vrací jeden řádek i bez změn, takže prázdné rowCount znamená jen chybějící roli.
      const role = await client.query(`select 1 from pg_roles where rolname = 'neon_auth'`)
      if (role.rowCount === 0) fail('The target database has no "neon_auth" role; enable Neon Auth there first.')
    }
  } finally {
    await client.end()
  }
}

/**
 * Řádek klíče podepisování, jak ho Neon Auth zapisuje.
 *
 * `alg` a `crv` vyplňuje až služba sama při generování klíče. Řádek, který přijde z dumpu
 * staršího projektu, je má prázdné — a právě na něm novější služba selhává.
 */
export type SigningKeyRow = { alg: string | null; crv: string | null }

/**
 * Je přenesený klíč podepisování použitelný, nebo se musí zahodit?
 *
 * Klíč bez vyplněných alg a crv přečte jen starší verze služby Neon Auth. Novější služba na
 * něm skončí HTTP 500 na /get-session, takže se musí nechat vygenerovat nový. Čistá funkce,
 * testovatelná bez databáze.
 */
export function needsSigningKeyReset(keys: SigningKeyRow[]): boolean {
  return keys.some((key) => !key.alg || !key.crv)
}

/**
 * Zahodí klíč podepisování (JWKS) Neon Authu v cílové databázi, aby si ho služba vygenerovala
 * sama.
 *
 * Proč: řádek neon_auth.jwks se přenáší z dumpu, kde má prázdné sloupce alg a crv. Takový řádek
 * umí přečíst jen starší verze služby Neon Auth. Novější služba (ta, která vznikne v novém
 * projektu) na něm spadne a /get-session odpovídá HTTP 500 — přihlášení pak skončí přesně
 * chybou "[mintSessionDataCookie] Failed to mint session_data cookie", ačkoli je všechno jiné
 * v pořádku: přihlášení se zapisuje, session vzniká, schema souhlasí.
 *
 * Po zahození řádku si služba klíč vygeneruje sama (při prvním /get-session) a zapíše ho
 * s vyplněnými alg='EdDSA' a crv='Ed25519'. Ztrácí se tím podpisování existujících session
 * tokenů: přihlášení je potřeba obnovit, což je při přesunu databáze chtěné (ostatní účty mají
 * hesla, ale nový klíč staré tokeny nepodepíše). Klíč se nesmí přenášet, protože formát
 * privátního klíče se mezi generacemi služby liší.
 */
async function resetNeonAuthSigningKey(url: string): Promise<void> {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const existing = await client.query<SigningKeyRow>('select alg, crv from neon_auth.jwks')
    if (!needsSigningKeyReset(existing.rows)) {
      console.log('The Neon Auth signing key is already in the format the target service reads.')
      return
    }
    const result = await client.query('delete from neon_auth.jwks')
    if (result.rowCount && result.rowCount > 0) {
      console.log(`Removed ${result.rowCount} signing key(s); the auth service will generate its own.`)
    }
  } finally {
    await client.end()
  }
}

/**
 * Počet řádků každé tabulky ve schématu public.
 *
 * Po obnově se to porovná se zdrojem: stejný počet tabulek i stejné počty řádků znamená, že se
 * nic neztratilo. Vyšší počet v cíli by znamenal, že do cílové databáze něco přibylo během
 * přenosu (nebo že cíl nebyl čistý) — to je chyba, která se musí hlásit, ne přehlížet.
 */
async function tableRowCounts(url: string): Promise<Map<string, number>> {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const result = await client.query<{ table_name: string; n: string }>(`
      select c.relname as table_name,
             (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')))[1]::text::bigint as n
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname
    `)
    return new Map(result.rows.map((row) => [row.table_name, Number(row.n)]))
  } finally {
    await client.end()
  }
}

/** Co se liší mezi zdrojem a cílem: chybějící tabulky a tabulky s jiným počtem řádků. Čistá
 *  funkce, testovatelná bez databáze. */
export function compareRowCounts(
  source: Map<string, number>,
  target: Map<string, number>,
): { missing: string[]; differing: string[] } {
  const missing = [...source.keys()].filter((table) => !target.has(table))
  const differing = [...source.entries()]
    .filter(([table, n]) => target.has(table) && target.get(table) !== n)
    .map(([table, n]) => `${table}: source ${n}, target ${target.get(table)}`)
  return { missing, differing }
}

/** Porovná počty řádků ve zdroji a cíli a vyhodí chybu, když se liší. */
async function verifyRowCounts(sourceUrl: string, targetUrl: string): Promise<void> {
  const source = await tableRowCounts(sourceUrl)
  const target = await tableRowCounts(targetUrl)

  const { missing, differing } = compareRowCounts(source, target)

  if (missing.length > 0) fail(`The target is missing these tables: ${missing.join(', ')}.`)
  if (differing.length > 0) fail(`Row counts differ between source and target:\n${differing.join('\n')}`)

  const total = [...source.values()].reduce((sum, n) => sum + n, 0)
  console.log(`Verified ${source.size} tables and ${total} rows in the target.`)
}

const projectIdIndex = process.argv.indexOf('--project-id')
const projectId = projectIdIndex === -1 ? '' : (process.argv[projectIdIndex + 1] ?? '')

async function main() {
  if (!projectId) fail('Usage: tsx scripts/migrate-neon-project.ts --project-id <neon-project-id>')

  const sourceUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
  if (!sourceUrl) fail('DATABASE_URL_UNPOOLED is not set (run it through dotenv -e .env.local).')

  const targetUrl = targetConnectionString(projectId)

  const projectConfig = await readProjectConfig(targetUrl)
  if (!projectConfig) {
    console.warn('The target database has no neon_auth.project_config row; Neon Auth will create one.')
  } else {
    console.log('Saved the target Neon Auth configuration (project_config).')
  }

  const directory = mkdtempSync(join(tmpdir(), 'sb-migrate-'))
  const dumpPath = join(directory, 'source.dump')
  try {
    console.log('Dumping the source database…')
    run('pg_dump', [
      '--format=custom',
      '--no-owner',
      '--no-acl',
      '--exclude-table=neon_auth.project_config',
      '--file', dumpPath,
      sourceUrl,
    ])
    chmodSync(dumpPath, 0o600)
    console.log(`Dump written (${statSync(dumpPath).size} bytes).`)

    // project_config visí na schématu neon_auth, takže by pg_restore --clean nemohl schéma zahodit.
    console.log('Clearing the Neon Auth configuration in the target…')
    await dropProjectConfigTable(targetUrl)

    console.log('Restoring into the target database…')
    run('pg_restore', [
      '--no-owner',
      '--no-acl',
      '--clean',
      '--if-exists',
      '--dbname', targetUrl,
      dumpPath,
    ])

    if (projectConfig) {
      console.log('Restoring the Neon Auth configuration…')
      await writeProjectConfig(targetUrl, projectConfig)
    }

    console.log('Restoring the Neon Auth table ownership…')
    await restoreNeonAuthOwnership(targetUrl)

    // Klíč podepisování se musí nechat vygenerovat novou službou; přenesený z dumpu ji láme.
    console.log('Resetting the Neon Auth signing key…')
    await resetNeonAuthSigningKey(targetUrl)

    console.log('Verifying the restored data…')
    await verifyRowCounts(sourceUrl, targetUrl)

    console.log('Restore finished.')
  } finally {
    rmSync(directory, { recursive: true, force: true })
    if (!existsSync(directory)) console.log('Temporary files removed.')
  }
}

// Spuští se jen při přímém volání skriptu, ne při importu v testu.
if (require.main === module) {
  main().catch((error) => {
    console.error(describeError(error))
    process.exit(1)
  })
}
