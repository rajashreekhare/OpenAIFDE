import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  attemptsFor, day, loadBatch, number, percent, previousRates, rankedRoutes, ratio,
  selectWindow, time, windowLabel,
} from './route-data.js';
import './styles.css';

function Controls({ data, loading, starts, start, onBatch, onWindow, onRefresh }) {
  return <div className="controls">
    <label>Processed batch
      <select value={data?.batch ?? ''} disabled={loading || !data?.batches.length}
        onChange={(event) => onBatch(event.target.value)}>
        {data?.batches.length ? data.batches.map((name) => <option key={name}>{name}</option>)
          : <option value="">No batch</option>}
      </select>
    </label>
    <label>15-minute window
      <select value={start ?? ''} disabled={loading || !starts.length}
        onChange={(event) => onWindow(event.target.value)}>
        {starts.length ? starts.map((stamp) =>
          <option key={stamp} value={stamp}>{day(stamp)} · {windowLabel(stamp)}</option>)
          : <option value="">No window</option>}
      </select>
    </label>
    <button type="button" className="refresh" disabled={loading} onClick={onRefresh}>Refresh</button>
  </div>;
}

function Metrics({ rows }) {
  const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
  const total = sum('attempts');
  return <section className="metrics" aria-label="Selected window totals">
    <div><span>Unique attempts</span><strong>{number(total)}</strong>
      <small>{number(rows.length)} active {rows.length === 1 ? 'route' : 'routes'}</small></div>
    <div className="connected"><span>Connected</span><strong>{number(sum('connected'))}</strong>
      <small>{percent(ratio(sum('connected'), total))} of attempts</small></div>
    <div><span>Busy <b>486</b></span><strong>{number(sum('busy'))}</strong>
      <small>{percent(ratio(sum('busy'), total))} of attempts</small></div>
    <div className="unavailable"><span>Unavailable <b>503</b></span><strong>{number(sum('unavailable'))}</strong>
      <small>{percent(ratio(sum('unavailable'), total))} of attempts</small></div>
  </section>;
}

function RouteTable({ rows, selected, prior, onRoute }) {
  return <section className="panel" aria-labelledby="ranking">
    <div className="section-head"><div><h2 id="ranking">Route ranking</h2>
      <p>Highest SIP 503 rate first. Select a route to inspect its attempts.</p></div>
      <span className="section-count">{number(rows.length)} routes</span>
    </div>
    <div className="scroll"><table className="ranking">
      <thead><tr><th scope="col">Route</th><th scope="col">Region / carrier</th>
        <th scope="col" className="num">Attempts</th><th scope="col" className="num">Busy 486</th>
        <th scope="col" className="num">Unavailable 503</th><th scope="col" className="rate">503 rate ↓</th>
        <th scope="col" className="num">Prior 15 min</th></tr></thead>
      <tbody>{rows.map((row) => {
        const rate = ratio(row.unavailable, row.attempts);
        return <tr key={row.routeId} className={row.routeId === selected ? 'selected' : ''}
          onClick={() => onRoute(row.routeId)}>
          <th scope="row"><button type="button" className="route-button"
            aria-pressed={row.routeId === selected}>{row.routeName}</button><small>{row.routeId}</small></th>
          <td>{row.region}<small>{row.carrier}</small></td>
          <td className="num">{number(row.attempts)}</td><td className="num">{number(row.busy)}</td>
          <td className="num">{number(row.unavailable)}</td>
          <td className="rate"><strong>{percent(rate)}</strong><span className="rate-track" aria-hidden="true">
            <i style={{ width: `${rate * 100}%` }} /></span></td>
          <td className="num prior">{prior.has(row.routeId) ? percent(prior.get(row.routeId)) : 'No data'}</td>
        </tr>;
      })}</tbody>
    </table></div>
  </section>;
}

const pageSize = 10;
const filters = [{ value: 'all', label: 'All attempts' }, { value: '503', label: 'Unavailable · 503' },
  { value: '486', label: 'Busy · 486' }];

function AttemptDetail({ route, attempts, start }) {
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);
  const matching = attemptsFor(attempts, route.routeId, start).filter((row) =>
    filter === 'all' || String(row.sip) === filter);
  const pages = Math.max(1, Math.ceil(matching.length / pageSize));
  const current = Math.min(page, pages - 1);
  const offset = current * pageSize;
  return <section className="panel" aria-labelledby="attempt-title">
    <div className="section-head"><div><h2 id="attempt-title">Attempt detail</h2>
      <p><strong>{route.routeName}</strong> <span className="separator">/</span> {windowLabel(start)}</p></div>
      <label className="filter">SIP filter
        <select value={filter} onChange={(event) => { setFilter(event.target.value); setPage(0); }}>
          {filters.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
    </div>
    <div className="scroll"><table className="detail">
      <thead><tr><th scope="col">Time (UTC)</th><th scope="col">Attempt ID</th><th scope="col">Call reference</th>
        <th scope="col">Switch</th><th scope="col">SIP</th><th scope="col">Outcome</th></tr></thead>
      <tbody>{matching.slice(offset, offset + pageSize).map((row) =>
        <tr key={row.id}><td>{time(row.time)}</td><td className="mono">{row.id}</td>
          <td className="mono">{row.callId}</td><td>{row.switchId}</td>
          <td><span className={'code code-' + row.sip}>{row.sip}</span></td><td>{row.outcome}</td></tr>)}</tbody>
    </table></div>
    {!matching.length && <p className="empty">No attempts match this filter.</p>}
    <div className="pager"><span aria-live="polite">{matching.length ?
      `${number(offset + 1)}–${number(Math.min(offset + pageSize, matching.length))} of ${number(matching.length)} attempts`
      : '0 attempts'}</span>
      <div><button disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button>
        <button disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Next</button></div>
    </div>
  </section>;
}

function App() {
  const [batch, setBatch] = useState(null);
  const [revision, setRevision] = useState(0);
  const [requestedWindow, setRequestedWindow] = useState(null);
  const [requestedRoute, setRequestedRoute] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    loadBatch(batch, controller.signal).then((snapshot) => {
      if (!controller.signal.aborted) setData(snapshot);
    }).catch((failure) => {
      if (!controller.signal.aborted) { setData(null); setError(failure.message); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [batch, revision]);
  const summary = data?.summary;
  const windows = summary?.windows ?? [];
  const starts = [...new Set(windows.map((row) => row.start))].sort((a, b) => Date.parse(a) - Date.parse(b));
  const start = selectWindow(starts, requestedWindow);
  const rows = rankedRoutes(windows, start);
  const route = rows.find((row) => row.routeId === requestedRoute) ?? rows[0];
  const prior = previousRates(windows, start);
  return <>
    <header className="mast"><div className="width topbar">
      <div className="brand"><img src="/assets/openai-blossom-white.svg" width="52" height="52" alt="" />Blossom Com</div>
      <span className="network">Voice operations</span>
    </div><div className="width hero"><div><h1>Route Health</h1>
      <p>Voice route performance by 15-minute UTC window.</p></div>
      <Controls data={data} loading={loading} starts={starts} start={start}
        onRefresh={() => setRevision((value) => value + 1)}
        onBatch={(value) => { setBatch(value); setRequestedWindow(null); setRequestedRoute(null); }}
        onWindow={(value) => { setRequestedWindow(value); setRequestedRoute(null); }} />
    </div></header>
    <main className="width" aria-busy={loading}>
      {loading ? <p role="status" className="notice">Loading processed batches…</p>
      : error ? <p role="alert" className="notice">{error} Use Refresh to try again.</p>
      : !summary ? <p role="status" className="notice">No processed batches yet. Process a batch and refresh.</p>
      : <>{start ? <><Metrics rows={rows} />
        <RouteTable rows={rows} selected={route.routeId} prior={prior} onRoute={setRequestedRoute} />
        <AttemptDetail key={JSON.stringify([data.batch, start, route.routeId])}
          route={route} attempts={data.attempts} start={start} /></> :
        <p className="notice">This batch has no route windows.</p>}
        <footer>Batch <strong>{data.batch}</strong><span>·</span>{number(summary.rows)} input rows
          <span>·</span>{number(summary.attempts)} unique attempts<span>·</span>
          {number(summary.duplicates)} duplicate {summary.duplicates === 1 ? 'row' : 'rows'} removed</footer>
      </>}
    </main>
  </>;
}
createRoot(document.getElementById('root')).render(<App />);
