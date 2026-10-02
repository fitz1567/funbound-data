// Turns Travelpayouts' flight data (Aviasales, official partner API) into the small files FunBound downloads, two per
// home airport:
//   flights/<AIRPORT>.json    the fares to and from Orlando for every day (per airline, nonstop or not) and the cheapest
//                             round trip to each curated destination;
//   calendars/<AIRPORT>.json  each destination's price calendar: the cheapest round trip found for each departure day
//                             (with its return day), from /v1/prices/calendar. That endpoint returns every day it has
//                             for the route in one request, whatever month is asked for, so it's one request a route.
// The API token stays here (in .env or a GitHub Actions secret); the app never sees it.
//   node fares.mjs [JFK LGA …]      -> site/data/flights/, site/data/calendars/ and site/data/index.json
// Each night the funbound-data repo's GitHub Action runs this (see hosting/), with FUNBOUND_OUT and FUNBOUND_DESTINATIONS
// pointing at its own folders. An airport that fails keeps the file already there, so the app keeps yesterday's fares.
// Prices are the cheapest found in recent searches (Travelpayouts caches them for about 48 hours), so they're a guide.
import fs from 'node:fs';
import path from 'node:path';

const HERE = import.meta.dirname, OUT = process.env.FUNBOUND_OUT || path.join(HERE, '../site/data');
const DESTINATIONS = process.env.FUNBOUND_DESTINATIONS || path.join(HERE, '../Packages/TripKit/Sources/TripKit/Resources/destinations.json');
// The nightly budget, for the 42 airports and 51 destinations: per airport 27 requests for Orlando and the deals, plus one
// calendar request per destination (same-city routes are skipped), so about 42 × 77 ≈ 3,200 requests a night. They go one
// at a time with a pause after each, which keeps them under 100 a minute; Travelpayouts allows 300 a minute for the
// calendar and 600 for the others. The run takes about 50 minutes.
const PAUSE_MS = Number(process.env.FUNBOUND_PAUSE_MS ?? 600);
const API = 'https://api.travelpayouts.com';
// The busiest U.S. airports, plus a few Disney-heavy ones. Others fall back to estimates in the app.
export const ORIGINS = ['ATL', 'BOS', 'BWI', 'CLE', 'CLT', 'CMH', 'CVG', 'DCA', 'DEN', 'DFW', 'DTW', 'EWR', 'HOU', 'IAD', 'IAH', 'IND', 'JFK', 'LAS', 'LAX',
  'LGA', 'MCI', 'MDW', 'MSP', 'MSY', 'ORD', 'PDX', 'PHL', 'PHX', 'PIT', 'RDU', 'SAN', 'SAT', 'SEA', 'SFO', 'SLC', 'STL', 'AUS', 'BNA', 'BDL', 'PVD', 'ALB', 'BUF'];

export function env(name) {
  if (process.env[name]) return process.env[name];
  const file = path.join(HERE, '../../.env');
  const m = fs.existsSync(file) && fs.readFileSync(file, 'utf8').match(new RegExp(`^\\s*${name}\\s*=\\s*"?([^"\\n]*)"?`, 'm'));
  return m ? m[1].trim() : '';
}

/** Offers from /aviasales/v3/prices_for_dates → { "2026-11-12": [{ airline, price, stops }] }, keeping the cheapest
 *  per airline and per nonstop-or-not each day, so the app can filter by airline and stops. The offers' booking links
 *  are left out (they're for one adult, one way); the planner links to a round-trip search for the whole party. */
export function byDay(offers) {
  const best = new Map();
  for (const o of offers) {
    const day = String(o.departure_at || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !(o.price > 0) || !o.airline) continue;
    const stops = Number(o.transfers) || 0, key = `${day}|${o.airline}|${stops ? 1 : 0}`;
    if (!best.has(key) || best.get(key).price > o.price) best.set(key, { airline: o.airline, price: Math.round(o.price), stops });
  }
  const out = {};
  for (const [key, fare] of [...best].sort()) (out[key.slice(0, 10)] ||= []).push(fare);
  for (const list of Object.values(out)) list.sort((a, b) => a.price - b.price);
  return out;
}

/** /v1/prices/cheap?destination=- → the cheapest round trip to each curated destination. */
export function deals(cheap, destinations) {
  const out = [];
  for (const d of destinations) {
    const byStops = cheap?.[d.fareCode];
    if (!byStops) continue;
    const best = Object.entries(byStops).map(([stops, t]) => ({ stops: Number(stops), ...t })).filter(t => t.price > 0).sort((a, b) => a.price - b.price)[0];
    if (!best) continue;
    out.push({ destination: d.fareCode, city: d.name, country: d.country, advisory: d.advisory ?? null, price: Math.round(best.price),
      depart: String(best.departure_at).slice(0, 10), return: best.return_at ? String(best.return_at).slice(0, 10) : null, airline: best.airline, stops: best.stops, link: null });
  }
  return out.sort((a, b) => a.price - b.price);
}

// Airports that share a city with a destination code, so the route to it is skipped (JFK to New York, say).
export const METRO = { NYC: ['JFK', 'LGA', 'EWR'], CHI: ['ORD', 'MDW'], WAS: ['DCA', 'IAD', 'BWI'], HOU: ['IAH', 'HOU'], DFW: ['DFW', 'DAL'] };
export const sameCity = (origin, code) => origin === code || (METRO[code] || []).includes(origin);

/** /v1/prices/calendar?calendar_type=departure_date → { "2026-11-12": [price, airline, stops, return day or null] }, the
 *  cheapest round trip found leaving each day. (The day is the key, so it isn't repeated.) */
export function calendarDays(data) {
  const out = {};
  for (const t of Object.values(data || {})) {
    const day = String(t?.departure_at || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !(t.price > 0) || !t.airline) continue;
    const back = t.return_at ? String(t.return_at).slice(0, 10) : null;
    if (!out[day] || out[day][0] > t.price) out[day] = [Math.round(t.price), t.airline, Number(t.transfers) || 0, back];
  }
  return Object.fromEntries(Object.entries(out).sort());
}

const sleep = ms => new Promise(res => setTimeout(res, ms));
// The token goes in a header, so it never appears in a URL or a log.
async function get(pathAndQuery, token) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`${API}${pathAndQuery}`, { headers: { 'X-Access-Token': token, 'Accept-Encoding': 'gzip' }, signal: AbortSignal.timeout(30000) });
    if (r.status === 429) { await sleep(15000 * (attempt + 1)); continue; }
    if (!r.ok) throw new Error(`${pathAndQuery.split('?')[0]} → ${r.status}`);
    const body = await r.json();
    await sleep(PAUSE_MS);
    return body;
  }
  throw new Error('rate limited');
}
const months = (from, count) => Array.from({ length: count }, (_, i) => { const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1)); return d.toISOString().slice(0, 7); });

async function main() {
  const token = env('TRAVELPAYOUTS_TOKEN');
  if (!token) { console.error('Add TRAVELPAYOUTS_TOKEN to ClaudeApps/.env (Travelpayouts > Profile > API token).'); process.exit(2); }
  const destinations = JSON.parse(fs.readFileSync(DESTINATIONS, 'utf8'));
  const origins = process.argv.slice(2).length ? process.argv.slice(2).map(s => s.toUpperCase()) : ORIGINS;
  const monthList = months(new Date(), 13), q = p => new URLSearchParams(p).toString();
  const flights = path.join(OUT, 'flights'), calendars = path.join(OUT, 'calendars');
  fs.mkdirSync(flights, { recursive: true });
  fs.mkdirSync(calendars, { recursive: true });
  const failed = [], failedCalendars = [];
  for (const origin of origins) {
    try {
      const to = [], from = [];
      for (const month of monthList) {
        const common = { one_way: 'true', unique: 'false', sorting: 'price', limit: '1000', currency: 'usd', departure_at: month };
        to.push(...((await get(`/aviasales/v3/prices_for_dates?${q({ ...common, origin, destination: 'MCO' })}`, token)).data || []));
        from.push(...((await get(`/aviasales/v3/prices_for_dates?${q({ ...common, origin: 'MCO', destination: origin })}`, token)).data || []));
      }
      const cheap = (await get(`/v1/prices/cheap?${q({ origin, destination: '-', currency: 'usd' })}`, token)).data;
      const book = { origin, updated: new Date().toISOString().slice(0, 10), toOrlando: byDay(to), fromOrlando: byDay(from), deals: deals(cheap, destinations) };
      fs.writeFileSync(path.join(flights, `${origin}.json`), JSON.stringify(book));
      console.log(`${origin}: ${Object.keys(book.toOrlando).length} days to Orlando, ${Object.keys(book.fromOrlando).length} back, ${book.deals.length} deals`);
    } catch (e) {
      failed.push(origin);
      console.error(`${origin}: ${e.message} (keeping its last file, if any)`);
    }
    try {
      const routes = {}, codes = [...new Set(destinations.map(d => d.fareCode))].filter(c => !sameCity(origin, c));
      let misses = 0;
      for (const code of codes) {
        try {
          const days = calendarDays((await get(`/v1/prices/calendar?${q({ origin, destination: code, currency: 'usd', depart_date: monthList[0], calendar_type: 'departure_date' })}`, token)).data);
          if (Object.keys(days).length) routes[code] = days;
        } catch (e) { misses++; console.error(`${origin}→${code}: ${e.message}`); }
      }
      if (misses === codes.length) throw new Error('every route failed');
      fs.writeFileSync(path.join(calendars, `${origin}.json`), JSON.stringify({ origin, updated: new Date().toISOString().slice(0, 10), routes }));
      console.log(`${origin}: calendars for ${Object.keys(routes).length} destinations`);
    } catch (e) {
      failedCalendars.push(origin);
      console.error(`${origin} calendars: ${e.message} (keeping its last file, if any)`);
    }
  }
  const list = dir => fs.readdirSync(dir).filter(f => /^[A-Z]{3}\.json$/.test(f)).map(f => f.slice(0, 3)).sort();
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ updated: new Date().toISOString(), origins: list(flights), calendars: list(calendars), failed, failedCalendars }, null, 1));
  if (failed.length === origins.length) { console.error('Every airport failed.'); process.exit(1); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) await main();
