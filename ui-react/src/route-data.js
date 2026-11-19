const DAY = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric',
});
const CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const CLOCK_SECONDS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
export const intervalMs = 15 * 60 * 1000;
export const number = (value) => value.toLocaleString('en-US');
export const percent = (value) => `${(value * 100).toFixed(1)}%`;
export const ratio = (count, total) => total ? count / total : 0;
export const time = (value) => CLOCK_SECONDS.format(new Date(value));
export const day = (value) => DAY.format(new Date(value));

export function windowLabel(start) {
  const instant = new Date(start);
  const end = new Date(instant.getTime() + intervalMs);
  return `${CLOCK.format(instant)}–${CLOCK.format(end)} UTC`;
}

export function selectWindow(windows, requested) {
  if (windows.includes(requested)) return requested;
  return windows.find((value) => CLOCK.format(new Date(value)) === '14:00') ?? windows[0];
}

export function rankedRoutes(windows, start) {
  return windows.filter((row) => row.start === start).sort((a, b) =>
    ratio(b.unavailable, b.attempts) - ratio(a.unavailable, a.attempts)
    || a.routeId.localeCompare(b.routeId, 'en'));
}

export function previousRates(windows, start) {
  const previous = Date.parse(start) - intervalMs;
  return new Map(windows.filter((row) => Date.parse(row.start) === previous)
    .map((row) => [row.routeId, ratio(row.unavailable, row.attempts)]));
}

export function attemptsFor(attempts, routeId, start) {
  const from = Date.parse(start);
  return attempts.filter((row) => {
    const at = Date.parse(row.time);
    return row.routeId === routeId && at >= from && at < from + intervalMs;
  }).sort((a, b) => Date.parse(a.time) - Date.parse(b.time) || String(a.id).localeCompare(String(b.id), 'en'));
}

async function readJson(path, signal) {
  const response = await fetch(path, { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status}).`);
  return response.json();
}

export async function loadBatch(requested, signal) {
  const batches = await readJson('/data/batches.json', signal);
  if (!Array.isArray(batches)) throw new Error('The batch index must contain a list of batch names.');
  const batch = batches.includes(requested) ? requested : batches.includes('daily') ? 'daily' : batches[0];
  if (!batch) return { batches, batch: '', summary: null, attempts: [] };
  const path = `/data/${encodeURIComponent(batch)}`;
  const [summary, attempts] = await Promise.all([
    readJson(`${path}/summary.json`, signal), readJson(`${path}/attempts.json`, signal),
  ]);
  return { batches, batch, summary, attempts };
}
