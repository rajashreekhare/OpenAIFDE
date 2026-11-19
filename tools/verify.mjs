// Independent acceptance check for workshop batches. Requires only Node.js.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceColumns = ['attempt_id', 'call_id', 'started_at', 'switch_id', 'route_id', 'sip_code'];
const routeColumns = ['route_id', 'route_name', 'region', 'carrier'];
const enrichedColumns = [...sourceColumns, 'route_name', 'region', 'carrier', 'window_start', 'outcome', 'duplicate'];
const codebook = new Map([['200', 'CONNECTED'], ['486', 'BUSY'], ['503', 'UNAVAILABLE']]);

function check(condition, message) {
  if (!condition) throw new Error(message);
}
function equal(actual, expected, where) {
  check(actual === expected, `${where}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}
function fields(actual, expected, where) {
  check(actual != null && typeof actual === 'object', `${where}: record missing`);
  for (const [key, value] of Object.entries(expected)) equal(actual[key], value, `${where}.${key}`);
}
function windowKey(record) { return `${record.start}/${record.routeId}`; }
function uniqueIndex(records, keyOf, where) {
  check(Array.isArray(records), `${where}: expected an array`);
  const result = new Map();
  for (const record of records) {
    const key = keyOf(record);
    check(!result.has(key), `${where}: repeated key ${key}`);
    result.set(key, record);
  }
  return result;
}
// Workshop fields are single-line. Accept LF, CRLF and CSV-quoted fields.
function readCsv(text, columns, label) {
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  function parse(line) {
    if (!line.includes('"')) return line.split(',');
    const values = [];
    const token = /(?:"((?:[^"]|"")*)"|([^",]*))(,|$)/y;
    let part;
    do {
      part = token.exec(line);
      check(part, `${label}: malformed quoted CSV field`);
      values.push(part[1] !== undefined ? part[1].replaceAll('""', '"') : part[2]);
    } while (part[3] === ',');
    return values;
  }
  const header = parse(lines.shift() ?? '');
  equal(JSON.stringify(header), JSON.stringify(columns), `${label} header`);
  return lines.map((line, i) => {
    const values = parse(line);
    equal(values.length, columns.length, `${label} line ${i + 2} column count`);
    return values;
  });
}

async function verify(batch, directory) {
  const out = resolve(directory);
  const [source, directoryText, keyText, summaryText, attemptsText, enrichedText] = await Promise.all([
    readFile(join(root, 'fixtures', `${batch}.csv`)), readFile(join(root, 'reference/routes.csv'), 'utf8'),
    readFile(join(root, 'expected', `${batch}.json`), 'utf8'), readFile(join(out, 'summary.json'), 'utf8'),
    readFile(join(out, 'attempts.json'), 'utf8'), readFile(join(out, 'enriched.csv'), 'utf8')]);
  const answer = JSON.parse(keyText);
  const summary = JSON.parse(summaryText);
  const attempts = uniqueIndex(JSON.parse(attemptsText), (a) => a.id, 'attempts.json');
  const exportedWindows = uniqueIndex(summary.windows, windowKey, 'summary.windows');
  const routes = uniqueIndex(readCsv(directoryText, routeColumns, 'routes'), (r) => r[0], 'routes');
  const inputRows = readCsv(source.toString('utf8'), sourceColumns, 'input');
  const enriched = readCsv(enrichedText, enrichedColumns, 'enriched');
  equal(enriched.length, inputRows.length, 'enriched row count');
  equal(summary.sourceSha256?.toLowerCase(), createHash('sha256').update(source).digest('hex'), 'summary.sourceSha256');
  const seen = new Set();
  const callCounts = new Map();
  const windows = new Map();
  const totals = { connected: 0, busy: 0, unavailable: 0, other: 0 };
  for (const [i, row] of inputRows.entries()) {
    const [id, callId, time, switchId, routeId, code] = row;
    const route = routes.get(routeId);
    check(route, `unmapped input route ${routeId}`);
    const [, routeName, region, carrier] = route;
    const outcome = codebook.get(code) ?? 'OTHER';
    // Round the minute field of the canonical UTC input, independent of Java time arithmetic.
    const minute = Math.floor(Number(time.slice(14, 16)) / 15) * 15;
    const start = `${time.slice(0, 14)}${String(minute).padStart(2, '0')}:00Z`;
    const duplicate = seen.has(id);
    const expectedRow = [...row, routeName, region, carrier, start, outcome, String(duplicate)];
    for (let j = 0; j < expectedRow.length; j++) equal(enriched[i][j], expectedRow[j], `enriched line ${i + 2} ${enrichedColumns[j]}`);
    if (duplicate) continue;
    seen.add(id);
    callCounts.set(callId, (callCounts.get(callId) ?? 0) + 1);
    fields(attempts.get(id), { id, callId, time, switchId, routeId, sip: Number(code), outcome }, `attempt ${id}`);
    const key = windowKey({ start, routeId });
    if (!windows.has(key)) windows.set(key, { start, routeId, routeName, region, carrier,
      attempts: 0, connected: 0, busy: 0, unavailable: 0, other: 0 });
    const current = windows.get(key);
    current.attempts++;
    current[outcome.toLowerCase()]++;
    totals[outcome.toLowerCase()]++;
  }
  const counts = { batch, rows: inputRows.length, attempts: seen.size, duplicates: inputRows.length - seen.size };
  fields(summary, counts, 'summary');
  equal(attempts.size, seen.size, 'attempts.json unique records');
  equal(exportedWindows.size, windows.size, 'exported window count');
  for (const [key, window] of windows) fields(exportedWindows.get(key), window, `window ${key}`);
  const retryCalls = [...callCounts.values()].filter((n) => n > 1).length;
  fields(answer, { ...counts, calls: callCounts.size, retryCalls, windowCount: windows.size }, 'answer key');
  fields(totals, answer.totals, 'outcome counts');
  for (const label of ['incident', 'previous', 'busyContrast', 'example']) {
    if (answer[label]) fields(windows.get(windowKey(answer[label])), answer[label], `answer key ${label}`);
  }
  if (answer.incident) {
    const spike = answer.incident;
    for (const w of windows.values()) {
      if (windowKey(w) === windowKey(spike)) continue;
      check(w.unavailable * spike.attempts < spike.unavailable * w.attempts, `incident outranked or tied at ${windowKey(w)}`);
    }
  }
  console.log(`PASS ${batch}: ${counts.rows} source and enriched rows, ${seen.size} attempts, ${counts.duplicates} duplicates, ${windows.size} route windows. SHA-256 matches.`);
}

try {
  const [batch, out] = process.argv.slice(2);
  check(process.argv.length === 4 && ['walkthrough', 'daily', 'next-day'].includes(batch),
    'Usage: node tools/verify.mjs <walkthrough|daily|next-day> <processed-batch-dir>');
  await verify(batch, out);
} catch (error) {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
}
