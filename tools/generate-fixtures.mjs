// Deterministic, entirely synthetic workshop data. Run with Node.js 18 or newer.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const routeHeader = ['route_id', 'route_name', 'region', 'carrier'];
const routes = [
  ['CHI-E', 'Chicago East', 'Midwest', 'Prairie Transit'],
  ['CHI-W', 'Chicago West', 'Midwest', 'Lakefront Voice'],
  ['DFW-N', 'Dallas North', 'South', 'Mesa Relay'],
  ['DFW-S', 'Dallas South', 'South', 'Prairie Transit'],
  ['SEA-N', 'Seattle North', 'West', 'Rainline Voice'],
  ['SEA-S', 'Seattle South', 'West', 'Summit Relay'],
  ['PHX-E', 'Phoenix East', 'West', 'Mesa Relay'],
  ['PHX-W', 'Phoenix West', 'West', 'Summit Relay'],
  ['ATL-N', 'Atlanta North', 'South', 'Piedmont Voice'],
  ['ATL-S', 'Atlanta South', 'South', 'Grove Transit'],
  ['BOS-E', 'Boston East', 'Northeast', 'Harbor Relay'],
  ['BOS-W', 'Boston West', 'Northeast', 'Grove Transit'],
];
const header = ['attempt_id', 'call_id', 'started_at', 'switch_id', 'route_id', 'sip_code'];
const utc = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
const csv = (columns, rows) => [columns, ...rows].map((row) => row.join(',')).join('\n') + '\n';
const json = (value) => JSON.stringify(value, null, 2) + '\n';

function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
function shuffle(values, random) {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

// The totals and diagnostic windows in the answer key come from this model,
// before it assigns individual event IDs, times or SIP codes to physical rows.
function design({ day, seed, incidentRoute, slot, spike, busyRoute }) {
  const random = generator(seed);
  const dayStart = Date.parse(`${day}T12:00:00Z`);
  const windows = [];
  for (let t = 0; t < 32; t++) {
    for (const [r, [routeId]] of routes.entries()) {
      const incident = r === incidentRoute && t === slot;
      const previous = r === incidentRoute && t === slot - 1;
      const busyContrast = r === busyRoute && t === slot;
      windows.push({ routeId, r, t, start: utc(dayStart + t * 900000), incident, previous, busyContrast,
        attempts: incident || previous || busyContrast ? 400 : 0, weight: 85 + Math.floor(random() * 70) });
    }
  }
  const unassigned = windows.filter((w) => !w.attempts);
  const totalWeight = unassigned.reduce((sum, w) => sum + w.weight, 0);
  const remainder = 49500 - 1200;
  for (const w of unassigned) w.attempts = Math.floor(remainder * w.weight / totalWeight);
  let left = 49500 - windows.reduce((sum, w) => sum + w.attempts, 0);
  for (let i = 0; i < left; i++) unassigned[i].attempts++;

  const totals = { connected: 0, busy: 0, unavailable: 0, other: 0 };
  for (const [i, w] of windows.entries()) {
    w.unavailable = w.incident ? spike : (w.previous || w.busyContrast ? 2 : (random() < 0.86 ? 1 : 0));
    w.busy = w.busyContrast ? 144 : Math.round(w.attempts * (0.04 + 0.055 * random()));
    w.other = Math.round(w.attempts * (0.01 + 0.025 * random()));
    w.connected = w.attempts - w.busy - w.unavailable - w.other;
    w.hasRetry = i < 300;
    for (const key of Object.keys(totals)) totals[key] += w[key];
  }
  function keyWindow(w) {
    return { routeId: w.routeId, start: w.start, attempts: w.attempts, connected: w.connected,
      busy: w.busy, unavailable: w.unavailable, other: w.other };
  }
  const answer = { rows: 50000, attempts: 49500, duplicates: 500, calls: 49200, retryCalls: 300,
    windowCount: 384, totals, incident: keyWindow(windows.find((w) => w.incident)),
    previous: keyWindow(windows.find((w) => w.previous)), busyContrast: keyWindow(windows.find((w) => w.busyContrast)) };
  return { windows, answer, random };
}

function synthesize(batch, spec) {
  const { windows, answer, random } = design(spec);
  const events = [];
  const dayId = spec.day.replaceAll('-', '');
  for (const w of windows) {
    const { hasRetry } = w;
    const pool = [...Array(w.connected - Number(hasRetry)).fill(200), ...Array(w.busy - Number(hasRetry)).fill(486),
      ...Array(w.unavailable).fill(503), ...Array.from({ length: w.other }, (_, i) => [480, 404, 487][i % 3])];
    shuffle(pool, random);
    // A second attempt follows a busy response. It shares the call ID only.
    const codes = hasRetry ? [486, 200, ...pool] : pool;
    let previousCall;
    const start = Date.parse(w.start);
    for (const [i, sip] of codes.entries()) {
      const id = String(events.length + 1).padStart(5, '0');
      const call = hasRetry && i === 1 ? previousCall : `C-${dayId}-${id}`;
      const time = utc(start + 1000 * Math.floor((i + random()) * 900 / w.attempts));
      const sw = `SW-${String((w.r % 4) + 1).padStart(2, '0')}`;
      events.push([`A-${dayId}-${id}`, call, time, sw, w.routeId, sip]);
      previousCall = call;
    }
  }
  const compare = (a, b) => a < b ? -1 : (a > b ? 1 : 0);
  events.sort((a, b) => compare(a[2], b[2]) || compare(a[0], b[0]));
  // Re-export every 99th event with the same ID and all the original fields.
  const rows = events.flatMap((event, i) => i % 99 === 0 ? [event, event] : [event]);
  return { batch, rows, answer: { batch, ...answer } };
}

function walkthrough() {
  const row = (id, call, clock, route, sip) => [`A-W${id}`, `C-W${call}`, `2026-03-10T${clock}Z`, 'SW-01', route, sip];
  const firstFail = row('02', '02', '14:00:00', 'CHI-E', 503);
  const rows = [row('01', '01', '13:59:58', 'CHI-E', 200), firstFail, [...firstFail],
    row('03', '02', '14:00:08', 'CHI-E', 200), row('04', '03', '14:01:10', 'CHI-E', 200),
    row('05', '04', '14:02:10', 'CHI-W', 486), row('06', '05', '14:02:30', 'CHI-W', 486),
    row('07', '06', '14:07:40', 'CHI-E', 480), row('08', '07', '14:11:55', 'CHI-W', 200),
    row('09', '08', '14:14:59', 'CHI-E', 503), row('10', '09', '14:15:00', 'CHI-E', 200),
    row('11', '10', '14:17:10', 'DFW-S', 200)];
  return { batch: 'walkthrough', rows, answer: { batch: 'walkthrough', rows: 12, attempts: 11, duplicates: 1,
    calls: 10, retryCalls: 1, windowCount: 5, totals: { connected: 6, busy: 2, unavailable: 2, other: 1 },
    example: { routeId: 'CHI-E', start: '2026-03-10T14:00:00Z', attempts: 5, connected: 2, busy: 0, unavailable: 2, other: 1 } } };
}

for (const directory of ['reference', 'fixtures', 'expected']) await mkdir(join(root, directory), { recursive: true });
await writeFile(join(root, 'reference', 'routes.csv'), csv(routeHeader, routes));
const batches = [walkthrough(),
  synthesize('daily', { day: '2026-03-10', seed: 20260310, incidentRoute: 0, slot: 8, spike: 24, busyRoute: 1 }),
  synthesize('next-day', { day: '2026-03-11', seed: 20260311, incidentRoute: 3, slot: 18, spike: 36, busyRoute: 4 })];
for (const { batch, rows, answer } of batches) {
  await writeFile(join(root, 'fixtures', `${batch}.csv`), csv(header, rows));
  await writeFile(join(root, 'expected', `${batch}.json`), json(answer));
  console.log(`${batch}: ${rows.length} physical rows; ${answer.attempts} unique attempts`);
}
