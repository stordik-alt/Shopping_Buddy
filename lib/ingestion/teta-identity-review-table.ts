// The review table of the Teta identity — what a human works through.
//
// The identity rules link a Teta product to a catalog product only when the evidence is
// unambiguous; the rest waits in a queue of thousands of products (docs/44). A JSON report is no
// way to look at that queue, so it is turned into a table: one row per product, the candidate the
// rules refused, the words the two names do not share, and the reasons the link was refused.
//
// The table is sorted so that the easiest rows come first — a product whose names differ by one
// word is looked at before a product whose names differ by five. A human who works through the
// table in order gets the most value per minute.
//
// The table is also where the decisions are made: every row has a decision, and the decisions are
// written as the file the import reads (lib/ingestion/teta-identity-decisions.ts).

import type { TetaManualDecision } from '@/lib/ingestion/teta-identity-decisions'
import type { TetaIdentityReport, TetaIdentityReportRow } from '@/lib/ingestion/teta-identity-report'

/** One candidate of a row, in the shape the table shows it. */
export type TetaReviewCandidate = {
  productId: string
  productName: string
  score: number
  /** Why this candidate cannot be the Teta product. */
  blockers: string[]
  /** The words only the Teta name states. */
  onlyTeta: string[]
  /** The words only the catalog name states. */
  onlyCatalog: string[]
}

export type TetaReviewRow = {
  /** Teta's own product code. */
  externalId: string
  /** The name the catalog stores for the product (the brand in front). */
  name: string
  /** `review` — a candidate was refused; `none` — nothing in the catalog resembles it. */
  status: 'review' | 'none'
  /** Why the decision came out this way. */
  reason: string
  /** The score of the refused candidate. */
  score?: number
  /** The candidate the human is being asked about. */
  candidate?: TetaReviewCandidate
  /** Every candidate, best first — the alternatives the human may pick instead. */
  candidates: TetaReviewCandidate[]
  /**
   * How much work the row is: the words the two names do not share, and the reasons the link was
   * refused. The table is sorted by it, the easiest first.
   */
  effort: number
}

/** The columns of the CSV, in the order they are written. */
export const TETA_REVIEW_CSV_COLUMNS = [
  'teta_id',
  'teta_name',
  'status',
  'reason',
  'decision',
  'candidate_product_id',
  'candidate_name',
  'score',
  'words_only_teta',
  'words_only_catalog',
  'blockers',
] as const

/**
 * The rows of the review table, the easiest first.
 *
 * A product nothing resembles is a row of its own: it has no candidate, and the only decision a
 * human can make about it is that it is a new product — or that the shop does sell it, under a
 * name the rules did not find.
 */
export function buildTetaReviewRows(report: TetaIdentityReport): TetaReviewRow[] {
  const rows: TetaReviewRow[] = []
  // A report written before the "review" and "unlinked" keys existed keeps its review queue under
  // "products" — the table is built from either.
  const review = report.review ?? (report as { products?: TetaIdentityReportRow[] }).products ?? []
  for (const row of review) {
    rows.push(buildRow(row, 'review'))
  }
  for (const row of report.unlinked ?? []) {
    rows.push(buildRow(row, 'none'))
  }
  return rows.sort((left, right) => {
    // The products nothing resembles come last: the human has to look for them in the catalog by
    // hand, which is more work than a row with a candidate in front of them.
    if (left.status !== right.status) return left.status === 'review' ? -1 : 1
    // The easiest first: the rows that differ least, and among those the ones that are closest.
    if (left.effort !== right.effort) return left.effort - right.effort
    const leftScore = left.score ?? 0
    const rightScore = right.score ?? 0
    if (leftScore !== rightScore) return rightScore - leftScore
    return left.name.localeCompare(right.name)
  })
}

function buildRow(row: TetaIdentityReportRow, status: 'review' | 'none'): TetaReviewRow {
  const candidates = row.candidates.map((candidate) => ({
    productId: candidate.productId,
    productName: candidate.productName,
    score: candidate.score,
    blockers: candidate.blockers ?? [],
    onlyTeta: candidate.differences?.onlyTeta ?? [],
    onlyCatalog: candidate.differences?.onlyCandidate ?? [],
  }))
  // The candidate the human is being asked about is the one the refusal is about — not simply the
  // first one, which may be a product another Teta product already owns.
  const candidate = candidates.find((entry) => entry.productId === row.refusedProduct?.productId) ?? candidates[0]
  const words = candidate ? candidate.onlyTeta.length + candidate.onlyCatalog.length : 0
  const blockers = candidate ? candidate.blockers.length : 0
  return {
    externalId: row.externalId,
    name: row.name,
    status,
    reason: row.reason,
    ...(row.score !== undefined ? { score: row.score } : {}),
    ...(candidate ? { candidate } : {}),
    candidates,
    effort: words + blockers,
  }
}

/** One CSV line. */
export function toCsvRow(values: (string | number | undefined)[]): string {
  return values
    .map((value) => {
      const text = value === undefined ? '' : String(value)
      if (/["\n,]/.test(text)) return `"${text.replace(/"/g, '""')}"`
      return text
    })
    .join(',')
}

/** Writes the rows as CSV — the table for a spreadsheet. */
export function toTetaReviewCsv(rows: TetaReviewRow[]): string {
  const lines = [TETA_REVIEW_CSV_COLUMNS.join(',')]
  for (const row of rows) {
    lines.push(toCsvRow([
      row.externalId,
      row.name,
      row.status,
      row.reason,
      '',
      row.candidate?.productId ?? '',
      row.candidate?.productName ?? '',
      row.score !== undefined ? Number(row.score.toFixed(4)) : '',
      row.candidate?.onlyTeta.join(' ') ?? '',
      row.candidate?.onlyCatalog.join(' ') ?? '',
      row.candidate?.blockers.join('; ') ?? '',
    ]))
  }
  return lines.join('\n') + '\n'
}

/**
 * Reads a CSV of the table back.
 *
 * Only the decision columns are read; everything else is what the script wrote and what the human
 * does not change.
 */
export function parseTetaReviewCsv(content: string): Map<string, TetaManualDecision> {
  const lines = content.split('\n').filter((line) => line.trim().length > 0)
  if (lines.length === 0) return new Map()
  const header = parseCsvLine(lines[0])
  const index = (name: string): number => header.indexOf(name)
  const idIndex = index('teta_id')
  const decisionIndex = index('decision')
  const productIndex = index('candidate_product_id')
  const nameIndex = index('candidate_name')
  if (idIndex < 0 || decisionIndex < 0) {
    throw new Error('The CSV of the review table has no "teta_id" or "decision" column.')
  }
  const decisions = new Map<string, TetaManualDecision>()
  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line)
    const externalId = values[idIndex]?.trim()
    const decision = values[decisionIndex]?.trim().toLowerCase()
    if (!externalId || !decision) continue
    if (decision === 'none') {
      decisions.set(externalId, { action: 'none' })
      continue
    }
    if (decision !== 'link') continue
    const productId = values[productIndex]?.trim()
    if (!productId) {
      throw new Error(`The row of '${externalId}' says "link" but names no catalog product.`)
    }
    const productName = values[nameIndex]?.trim()
    decisions.set(externalId, {
      action: 'link',
      productId,
      ...(productName ? { productName } : {}),
    })
  }
  return decisions
}

/** One CSV line, read. */
function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let value = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (quoted) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          value += '"'
          index += 1
          continue
        }
        quoted = false
        continue
      }
      value += character
      continue
    }
    if (character === '"') {
      quoted = true
      continue
    }
    if (character === ',') {
      values.push(value)
      value = ''
      continue
    }
    value += character
  }
  values.push(value)
  return values
}

/**
 * The review table as a page a human can work through.
 *
 * The page holds the whole queue in itself — it is opened from the disk, with no server and no
 * network — and it is where the decisions are made. Every row has a decision, and the decisions
 * are downloaded as the file the import reads.
 *
 * The rows are drawn a page at a time: the queue has thousands of rows, and a table of all of them
 * would take minutes to open.
 */
export function renderTetaReviewHtml(
  rows: TetaReviewRow[],
  meta: { generatedAt: string; decisions: { auto: number; review: number; none: number } },
): string {
  const data = rows.map((row) => ({
    id: row.externalId,
    name: row.name,
    status: row.status,
    reason: row.reason,
    score: row.score ?? null,
    // The candidate the human is being asked about — not simply the first one, which may be a
    // product another Teta product already owns.
    ref: row.candidate ? row.candidates.findIndex((entry) => entry.productId === row.candidate?.productId) : -1,
    c: row.candidates.map((candidate) => ({
      id: candidate.productId,
      name: candidate.productName,
      score: Number(candidate.score.toFixed(4)),
      b: candidate.blockers,
      t: candidate.onlyTeta,
      k: candidate.onlyCatalog,
    })),
  }))
  const title = 'Teta — review párování produktů'
  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; padding: 0 0 3rem; }
  header { padding: 1rem; position: sticky; top: 0; background: Canvas; z-index: 2; border-bottom: 1px solid color-mix(in srgb, CanvasText 15%, transparent); }
  h1 { font-size: 1.1rem; margin: 0 0 .25rem; }
  .meta { color: color-mix(in srgb, CanvasText 65%, transparent); font-size: .85rem; margin: 0 0 .6rem; }
  .toolbar { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
  input, select, button { font: inherit; padding: .4rem .6rem; border-radius: 6px; border: 1px solid color-mix(in srgb, CanvasText 25%, transparent); background: Canvas; color: CanvasText; }
  input[type=search] { flex: 1 1 14rem; min-width: 8rem; }
  button { cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  #status { margin: .5rem 0 0; font-size: .85rem; color: color-mix(in srgb, CanvasText 65%, transparent); }
  main { padding: 0 1rem; }
  table { width: 100%; border-collapse: collapse; font-size: .9rem; table-layout: fixed; }
  col.c-name { width: 21%; }
  col.c-cand { width: 23%; }
  col.c-words { width: 17%; }
  col.c-why { width: 23%; }
  col.c-dec { width: 16%; }
  th, td { text-align: left; vertical-align: top; padding: .45rem .5rem; border-bottom: 1px solid color-mix(in srgb, CanvasText 12%, transparent); overflow-wrap: anywhere; }
  th { position: sticky; top: 7.5rem; background: Canvas; font-size: .8rem; text-transform: uppercase; letter-spacing: .03em; color: color-mix(in srgb, CanvasText 60%, transparent); }
  td.name { font-weight: 600; }
  .id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .78rem; color: color-mix(in srgb, CanvasText 55%, transparent); }
  .words { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .8rem; }
  .words .t { color: #b3261e; }
  .words .k { color: #1a5fb4; }
  .blockers { font-size: .82rem; color: color-mix(in srgb, CanvasText 75%, transparent); }
  .pager { display: flex; gap: .5rem; align-items: center; justify-content: center; padding: 1rem 0; }
  .muted { color: color-mix(in srgb, CanvasText 55%, transparent); }
  .diff { background: color-mix(in srgb, gold 18%, transparent); border-radius: 3px; padding: 0 .2rem; }
  select { width: 100%; }
</style>
</head>
<body>
<header>
  <h1>${title}</h1>
  <p class="meta">Vygenerováno ${escapeHtml(meta.generatedAt)} · ${meta.decisions.review} v review · ${meta.decisions.none} nových produktů · ${meta.decisions.auto} spojeno automaticky</p>
  <div class="toolbar">
    <input id="search" type="search" placeholder="Hledat v názvu nebo kódu…">
    <select id="status">
      <option value="all">Vše</option>
      <option value="review">V review</option>
      <option value="none">Nové produkty</option>
      <option value="decided">Rozhodnuté</option>
      <option value="open">Nerozhodnuté</option>
    </select>
    <button id="download-csv">Stáhnout CSV</button>
    <button id="download-json">Stáhnout rozhodnutí</button>
  </div>
  <p id="status-line"></p>
</header>
<main>
  <table>
    <colgroup>
      <col class="c-name">
      <col class="c-cand">
      <col class="c-words">
      <col class="c-why">
      <col class="c-dec">
    </colgroup>
    <thead>
      <tr>
        <th>Teta</th>
        <th>Kandidát</th>
        <th>Rozdílná slova</th>
        <th>Proč nebylo spojeno</th>
        <th>Rozhodnutí</th>
      </tr>
    </thead>
    <tbody id="rows"></tbody>
  </table>
  <div class="pager">
    <button id="prev">Předchozí</button>
    <span id="page" class="muted"></span>
    <button id="next">Další</button>
  </div>
</main>
<script>
const ROWS = ${JSON.stringify(data)};
const PAGE = 100;
const decisions = Object.create(null);
let page = 0;
let filtered = ROWS;

const el = (id) => document.getElementById(id);
const text = (value) => (value === null || value === undefined ? '' : String(value));

// The reasons the rules give are written in the language of the code. The page is for a person,
// so they are translated here — the code keeps its own wording.
const REASONS = [
  [/^the package sizes differ$/, 'velikosti balení se liší'],
  [/^the package size is contradictory$/, 'velikost balení si odporuje'],
  [/^the brand is not in both names$/, 'značka není v obou názvech'],
  [/^the sizes differ$/, 'velikosti se liší'],
  [/^the model numbers differ$/, 'modelová čísla se liší'],
  [/^the names state different kinds of product$/, 'názvy uvádějí různé druhy produktu'],
  [/^variant token conflict$/, 'spor o variantu'],
  [/^product-kind token conflict$/, 'spor o druhu produktu'],
  [/^packaging token conflict$/, 'spor o balení'],
  [/^a second candidate is just as close$/, 'druhý kandidát je stejně blízko'],
  [/^another Teta product matches this catalog product better$/, 'jiný produkt Teta odpovídá tomuto katalogovému produktu lépe'],
  [/^another Teta product was linked to this catalog product by hand$/, 'k tomuto katalogovému produktu byl ručně přiřazen jiný produkt Teta'],
  [/^the similar catalog product is a group of variants, not one product$/, 'podobný katalogový produkt je skupina variant, ne jeden produkt'],
  [/^the similar catalog product is already linked to another Teta product$/, 'podobný katalogový produkt je už spojený s jiným produktem Teta'],
  [/^no catalog product is similar enough$/, 'nic v katalogu není dost podobné'],
  [/^the catalog name does not say (.*)$/, 'katalogový název neuvádí $1'],
  [/^the catalog name says (.*)$/, 'katalogový název uvádí $1'],
];

function reasonText(value) {
  // A reason may be several reasons joined — each of them is translated on its own.
  return text(value).split('; ').map((part) => {
    for (const [pattern, replacement] of REASONS) {
      if (pattern.test(part)) return part.replace(pattern, replacement);
    }
    return part;
  }).join('; ');
}

function applyFilter() {
  const needle = el('search').value.trim().toLocaleLowerCase('cs');
  const status = el('status').value;
  filtered = ROWS.filter((row) => {
    if (needle && !(row.name.toLocaleLowerCase('cs').includes(needle) || row.id.includes(needle))) return false;
    if (status === 'review' || status === 'none') return row.status === status;
    if (status === 'decided') return Boolean(decisions[row.id]);
    if (status === 'open') return !decisions[row.id];
    return true;
  });
  page = 0;
  render();
}

function render() {
  const body = el('rows');
  body.textContent = '';
  const slice = filtered.slice(page * PAGE, (page + 1) * PAGE);
  for (const row of slice) {
    const tr = document.createElement('tr');

    const name = document.createElement('td');
    name.className = 'name';
    name.textContent = row.name;
    const id = document.createElement('div');
    id.className = 'id';
    id.textContent = row.id;
    name.appendChild(id);
    tr.appendChild(name);

    const candidate = document.createElement('td');
    const best = row.ref >= 0 ? row.c[row.ref] : row.c[0];
    if (best) {
      candidate.textContent = best.name;
      const score = document.createElement('div');
      score.className = 'id';
      score.textContent = 'skóre ' + best.score;
      candidate.appendChild(score);
    } else {
      candidate.innerHTML = '<span class="muted">nic v katalogu se nepodobá</span>';
    }
    tr.appendChild(candidate);

    const words = document.createElement('td');
    words.className = 'words';
    if (best && (best.t.length || best.k.length)) {
      for (const word of best.t) {
        const span = document.createElement('span');
        span.className = 't diff';
        span.textContent = word;
        words.appendChild(span);
        words.appendChild(document.createTextNode(' '));
      }
      for (const word of best.k) {
        const span = document.createElement('span');
        span.className = 'k diff';
        span.textContent = word;
        words.appendChild(span);
        words.appendChild(document.createTextNode(' '));
      }
    } else {
      words.innerHTML = '<span class="muted">—</span>';
    }
    tr.appendChild(words);

    const blockers = document.createElement('td');
    blockers.className = 'blockers';
    const reason = row.reason || '';
    const list = best && best.b.length ? best.b.join('; ') : '';
    const parts = [];
    if (reason) parts.push(reasonText(reason));
    if (list && list !== reason) parts.push(reasonText(list));
    blockers.textContent = parts.join(' — ');
    tr.appendChild(blockers);

    const decision = document.createElement('td');
    const select = document.createElement('select');
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '— nevybráno —';
    select.appendChild(none);
    for (const item of row.c) {
      const option = document.createElement('option');
      option.value = 'link:' + item.id;
      option.textContent = 'spojit: ' + item.name;
      select.appendChild(option);
    }
    const notSame = document.createElement('option');
    notSame.value = 'none';
    notSame.textContent = 'jiný produkt (nespojovat)';
    select.appendChild(notSame);
    if (decisions[row.id]) select.value = decisions[row.id].value;
    select.addEventListener('change', () => {
      if (!select.value) delete decisions[row.id];
      else if (select.value === 'none') decisions[row.id] = { value: 'none', productId: '', productName: '' };
      else {
        const id = select.value.slice(5);
        const item = row.c.find((entry) => entry.id === id);
        decisions[row.id] = { value: 'link', productId: id, productName: item ? item.name : '' };
      }
      updateStatus();
    });
    decision.appendChild(select);
    tr.appendChild(decision);

    body.appendChild(tr);
  }
  el('page').textContent = filtered.length === 0 ? 'žádné řádky' : 'strana ' + (page + 1) + ' z ' + Math.ceil(filtered.length / PAGE) + ' (' + filtered.length + ' řádků)';
  el('prev').disabled = page === 0;
  el('next').disabled = (page + 1) * PAGE >= filtered.length;
  updateStatus();
}

function updateStatus() {
  const count = Object.keys(decisions).length;
  el('status-line').textContent = 'Rozhodnuto: ' + count + ' z ' + ROWS.length + ' produktů. Rozhodnutí se uloží do počítače až při stažení CSV nebo JSON — když stránku zavřeš, o rozhodnutí přijde.';
}

function csvCell(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  return /[",\\n]/.test(raw) ? '"' + raw.replace(/"/g, '""') + '"' : raw;
}

function buildCsv() {
  const header = ['teta_id', 'teta_name', 'status', 'reason', 'decision', 'candidate_product_id', 'candidate_name', 'score', 'words_only_teta', 'words_only_catalog', 'blockers'];
  const lines = [header.join(',')];
  for (const row of ROWS) {
    const decision = decisions[row.id];
    const best = row.ref >= 0 ? row.c[row.ref] : row.c[0];
    lines.push([
      csvCell(row.id),
      csvCell(row.name),
      csvCell(row.status),
      csvCell(row.reason),
      csvCell(decision ? (decision.value === 'none' ? 'none' : 'link') : ''),
      csvCell(decision && decision.value === 'link' ? decision.productId : (best ? best.id : '')),
      csvCell(decision && decision.value === 'link' ? decision.productName : (best ? best.name : '')),
      csvCell(best ? best.score : ''),
      csvCell(best ? best.t.join(' ') : ''),
      csvCell(best ? best.k.join(' ') : ''),
      csvCell(best ? best.b.join('; ') : ''),
    ].join(','));
  }
  return lines.join('\\n') + '\\n';
}

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

el('search').addEventListener('input', applyFilter);
el('status').addEventListener('change', applyFilter);
el('prev').addEventListener('click', () => { if (page > 0) { page -= 1; render(); } });
el('next').addEventListener('click', () => { if ((page + 1) * PAGE < filtered.length) { page += 1; render(); } });
el('download-csv').addEventListener('click', () => download('teta-identity-review.csv', buildCsv(), 'text/csv;charset=utf-8'));
el('download-json').addEventListener('click', () => {
  const decided = Object.create(null);
  for (const id of Object.keys(decisions)) {
    const decision = decisions[id];
    decided[id] = decision.value === 'none'
      ? { action: 'none' }
      : { action: 'link', productId: decision.productId, productName: decision.productName };
  }
  const file = { source: 'teta', generatedAt: new Date().toISOString(), decisions: decided };
  download('teta-identity-decisions.json', JSON.stringify(file, null, 2) + '\\n', 'application/json');
});

applyFilter();
</script>
</body>
</html>
`
}

/** Escapes the text that goes into the page. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

