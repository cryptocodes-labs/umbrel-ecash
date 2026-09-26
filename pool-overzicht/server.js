'use strict';
//
// Pool-overzicht: één pagina met alle pools op de Umbrel.
//
// Leest alleen (read-only mounts en GET-verzoeken), verandert niets aan de pools.
//   http://<umbrel>:22570/          de pagina, ververst elke 30 s
//   http://<umbrel>:22570/api       dezelfde cijfers als JSON (basis voor de website)
//
// Bronnen:
//   ckpool (Bassin, btc-rental):   <logdir>/pool/pool.status en <logdir>/users/<adres>
//   asicseer (LoneStrike, bch-rental): de laatste "Pool:" en "User" regels in de log,
//                                   of pool/pool.status als die er is
//   umbrel-dogecoin (privé, publiek, publiek-rental): GET /api/status op de container
//
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 3000);

const POOLS = [
  { id: 'btc', naam: 'BTC', poort: '3333', voor: 'eigen miners', type: 'ckpool', dir: '/src/bassin' },
  { id: 'btc-rental', naam: 'BTC rental', poort: '3338', voor: 'huur', type: 'ckpool', dir: '/src/btc-rental' },
  { id: 'bch', naam: 'BCH', poort: '3334', voor: 'eigen miners', type: 'asicseer', dir: '/src/bch' },
  { id: 'bch-rental', naam: 'BCH rental', poort: '3337', voor: 'huur', type: 'asicseer', dir: '/src/bch-rental' },
  { id: 'doge-public', naam: 'LTC+DOGE', poort: '3335', voor: 'eigen miners', type: 'doge', url: 'http://doge-public:3000/api/status' },
  { id: 'doge-rental', naam: 'LTC+DOGE rental', poort: '3339', voor: 'huur', type: 'doge', url: 'http://doge-public-rental:3000/api/status' },
  { id: 'doge-private', naam: 'LTC+DOGE privé', poort: '3336 / thuis 22557', voor: 'alleen eigen', type: 'doge', url: process.env.DOGE_PRIVATE_URL || 'http://dogecoin-solo_app_1:3000/api/status' },
];

// Zoekt <root>/**/pool/pool.status (max 4 diep) en geeft de logmap terug.
function findLogDir(root, depth = 0) {
  if (fs.existsSync(path.join(root, 'pool', 'pool.status'))) return root;
  if (depth >= 4) return null;
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) {
    if (!e.isDirectory() || e.name === 'node_modules') continue;
    const hit = findLogDir(path.join(root, e.name), depth + 1);
    if (hit) return hit;
  }
  return null;
}
function findLogs(root, depth = 0, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const f = path.join(root, e.name);
    if (e.isDirectory() && depth < 4) findLogs(f, depth + 1, out);
    else if (e.isFile() && e.name.endsWith('.log')) out.push({ f, t: fs.statSync(f).mtimeMs });
  }
  return out;
}

const UNIT = { '': 1, K: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18 };
function hr(v) {
  if (typeof v === 'number') return v;
  const m = /^([\d.]+)\s*([KMGTPE]?)/i.exec(String(v || '0'));
  return m ? Number(m[1]) * (UNIT[m[2].toUpperCase()] || 1) : 0;
}

function readJsonLines(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { Object.assign(out, JSON.parse(line)); } catch { /* skip */ }
  }
  return out;
}

function tail(file, bytes = 262144) {
  const st = fs.statSync(file);
  const fd = fs.openSync(file, 'r');
  const len = Math.min(bytes, st.size);
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, st.size - len);
  fs.closeSync(fd);
  return buf.toString('latin1');
}

function shortAddr(a) {
  a = String(a || '');
  const s = a.replace(/^bitcoincash:/, '');
  return s.length > 16 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;
}

function ckpool(p) {
  const dir = findLogDir(p.dir);
  if (!dir) throw new Error('geen pool.status gevonden');
  const status = readJsonLines(path.join(dir, 'pool', 'pool.status'));
  const workers = [];
  const udir = path.join(dir, 'users');
  for (const f of fs.existsSync(udir) ? fs.readdirSync(udir) : []) {
    let u;
    try { u = JSON.parse(fs.readFileSync(path.join(udir, f), 'utf8')); } catch { continue; }
    for (const w of u.worker || []) {
      workers.push({
        naam: String(w.workername || f).split('.').slice(1).join('.') || '-',
        adres: shortAddr(f),
        vol: f,
        hashrate: hr(w.hashrate5m),
        besteShare: w.bestever ?? w.bestshare ?? null,
        laatsteShare: w.lastshare ? w.lastshare * 1000 : null,
      });
    }
  }
  const active = workers.filter((w) => w.hashrate > 0);
  return {
    alle: workers,
    hashrate: hr(status.hashrate5m),
    workers: status.Workers ?? active.length,
    bijgewerkt: status.lastupdate ? status.lastupdate * 1000 : null,
    besteShare: status.bestshare ?? null,
    lijst: active.sort((a, b) => b.hashrate - a.hashrate),
  };
}

function asicseer(p) {
  if (findLogDir(p.dir)) return ckpool(p);
  const logs = findLogs(p.dir).sort((a, b) => b.t - a.t);
  if (!logs.length) throw new Error('geen pool.status of log gevonden');
  const text = tail(logs[0].f);
  const lines = text.split('\n');
  const pool = {};
  let stamp = null;
  const users = new Map();
  for (const line of lines) {
    const m = /^\[([\d-]+ [\d:.]+)\] (Pool|User) (?:(\S+?):)?(\{.*\})\s*$/.exec(line) ||
      /^\[([\d-]+ [\d:.]+)\] (Pool):(\{.*\})\s*$/.exec(line);
    if (!m) continue;
    let json;
    try { json = JSON.parse(m[m.length - 1]); } catch { continue; }
    if (m[2] === 'Pool') { Object.assign(pool, json); stamp = m[1]; }
    else users.set(m[3], json);
  }
  const lijst = [...users.entries()]
    .map(([addr, u]) => ({ naam: `${u.workers || 1} worker(s)`, adres: shortAddr(addr), vol: addr, hashrate: hr(u.hashrate5m), besteShare: u.bestever ?? u.bestshare ?? null, laatsteShare: u.lastshare ? u.lastshare * 1000 : null }));
  const alle = lijst.slice();
  lijst.splice(0, lijst.length, ...alle.filter((w) => w.hashrate > 0).sort((a, b) => b.hashrate - a.hashrate));
  return {
    alle,
    hashrate: hr(pool.hashrate5m),
    workers: pool.Workers ?? lijst.length,
    bijgewerkt: stamp ? Date.parse(stamp.replace(' ', 'T') + 'Z') : null,
    besteShare: pool.bestshare ?? null,
    lijst,
  };
}

async function doge(p) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 4000);
  try {
    const r = await fetch(p.url, { signal: ctl.signal });
    const s = await r.json();
    const lijst = (s.workers || []).map((w) => {
      const [naam, adres] = String(w.worker || '').includes('@') ? String(w.worker).split('@') : [w.worker, w.payoutAddress];
      const soort = w.entry === 'rented' ? ' (huur)' : '';
      return { naam: (naam || '-') + soort, adres: shortAddr(adres || w.payoutAddress), vol: w.payoutAddress || adres, hashrate: w.hashrate || 0, besteShare: w.bestShareDiff ?? null, laatsteShare: w.lastShareAt || null };
    }).sort((a, b) => b.hashrate - a.hashrate);
    return {
      alle: lijst,
      netwerkDiff: s.networkDifficulty ?? null,
      hoogte: s.height ?? null,
      hashrate: s.totalHashrate || 0,
      workers: lijst.length,
      bijgewerkt: Date.now(),
      besteShare: s.bestShareDiff ?? null,
      blokken: s.blocksFound ?? 0,
      lijst,
    };
  } finally { clearTimeout(t); }
}

async function collect() {
  const now = Date.now();
  const out = [];
  for (const p of POOLS) {
    const base = { id: p.id, naam: p.naam, poort: p.poort, voor: p.voor };
    try {
      const d = p.type === 'ckpool' ? ckpool(p) : p.type === 'asicseer' ? asicseer(p) : await doge(p);
      const oud = d.bijgewerkt && now - d.bijgewerkt > 5 * 60 * 1000;
      out.push({ ...base, ...d, status: oud ? 'geen update' : 'actief' });
    } catch (err) {
      out.push({ ...base, status: 'onbereikbaar', fout: err.message, hashrate: 0, workers: 0, lijst: [] });
    }
  }
  return { tijd: now, pools: out };
}

function fmtHr(h) {
  const u = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s'];
  let i = 0;
  while (h >= 1000 && i < u.length - 1) { h /= 1000; i++; }
  return `${h.toFixed(h >= 100 ? 0 : h >= 10 ? 1 : 2)} ${u[i]}`;
}
function ago(ms) {
  if (!ms) return '-';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 60 ? `${s}s geleden` : s < 3600 ? `${Math.round(s / 60)}m geleden` : `${Math.round(s / 3600)}u geleden`;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function page(d) {
  const rows = d.pools.map((p) => {
    const color = p.status === 'actief' ? '#4ade80' : p.status === 'geen update' ? '#facc15' : '#f87171';
    const miners = p.lijst.length
      ? p.lijst.map((w) => `<tr class="w"><td></td><td colspan="2">${esc(w.naam)} <span class="m">${esc(w.adres)}</span></td><td class="r">${fmtHr(w.hashrate)}</td><td class="m">${ago(w.laatsteShare)}</td></tr>`).join('')
      : '';
    return `<tr><td><span class="dot" style="background:${color}"></span></td><td><b>${esc(p.naam)}</b><div class="m">${esc(p.voor)}</div></td><td class="m">${esc(p.poort)}</td><td class="r"><b>${fmtHr(p.hashrate)}</b></td><td>${p.workers} worker(s)${p.fout ? `<div class="m">${esc(p.fout)}</div>` : ''}</td></tr>${miners}`;
  }).join('');
  const total = (id) => d.pools.filter((p) => p.id.startsWith(id)).reduce((s, p) => s + p.hashrate, 0);
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="30"><title>Pool-overzicht</title>
<style>body{margin:0;background:#111;color:#eee;font:15px/1.45 -apple-system,system-ui,sans-serif}main{max-width:900px;margin:0 auto;padding:24px 16px}
h1{font-size:20px;margin:0 0 4px}.m{color:#999;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:16px}td{padding:8px 6px;border-top:1px solid #2a2a2a;vertical-align:top}
tr.w td{border-top:none;padding:2px 6px;font-size:13px;color:#ccc}.r{text-align:right;white-space:nowrap}.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-top:6px}
.tot{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px}.tot div{background:#1c1c1c;border-radius:10px;padding:10px 14px}</style></head>
<body><main><h1>Pool-overzicht</h1><div class="m">pool.cryptocodes.eu · ververst elke 30 seconden · ${new Date(d.tijd).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' })}</div>
<div class="tot"><div>SHA-256 BTC<br><b>${fmtHr(total('btc'))}</b></div><div>SHA-256 BCH<br><b>${fmtHr(total('bch'))}</b></div><div>Scrypt LTC+DOGE<br><b>${fmtHr(total('doge'))}</b></div></div>
<table>${rows}</table><p class="m">Groen = actief, geel = geen update in 5 minuten, rood = niet bereikbaar. JSON: <a style="color:#999" href="/api">/api</a></p></main></body></html>`;
}

// ---------------------------------------------------------------------------
// Publiek (via de VPS op https://pool.cryptocodes.eu/public/...)
//
// Alleen totalen, en één adres tegelijk op verzoek. Nooit een lijst van alle
// adressen, nooit IP's, nooit de privé pool. Eén verzameling per 30 s, hoeveel
// bezoekers er ook zijn.
// ---------------------------------------------------------------------------
const PUBLIC_IDS = ['btc', 'btc-rental', 'bch', 'bch-rental', 'doge-public', 'doge-rental'];
const CHAIN_OF = { btc: 'BTC', 'btc-rental': 'BTC', bch: 'BCH', 'bch-rental': 'BCH', 'doge-public': 'LTC+DOGE', 'doge-rental': 'LTC+DOGE' };

let cache = null;
let cacheAt = 0;
let pending = null;
function cached() {
  if (cache && Date.now() - cacheAt < 30000) return Promise.resolve(cache);
  if (!pending) {
    pending = collect().then((d) => { cache = d; cacheAt = Date.now(); pending = null; return d; })
      .catch((e) => { pending = null; throw e; });
  }
  return pending;
}

const norm = (a) => String(a || '').trim().replace(/^bitcoincash:/i, '').toLowerCase();

function publicSummary(d) {
  return {
    tijd: d.tijd,
    pools: d.pools.filter((p) => PUBLIC_IDS.includes(p.id)).map((p) => ({
      id: p.id,
      chain: CHAIN_OF[p.id],
      poort: Number(p.poort),
      soort: p.id.endsWith('rental') ? 'rental' : 'home',
      online: p.status !== 'onbereikbaar',
      hashrate: p.hashrate || 0,
      workers: p.workers || 0,
      besteShare: p.besteShare ?? null,
      blokken: p.blokken ?? null,
    })),
  };
}

function publicMiner(d, addr) {
  const n = norm(addr);
  const workers = [];
  for (const p of d.pools) {
    if (!PUBLIC_IDS.includes(p.id)) continue;
    for (const w of p.alle || []) {
      if (norm(w.vol) !== n) continue;
      workers.push({
        pool: p.id,
        chain: CHAIN_OF[p.id],
        poort: Number(p.poort),
        naam: /worker\(s\)$/.test(w.naam) || w.naam === '-' ? '' : String(w.naam).replace(/ \(huur\)$/, '').replace(/@.*$/, '').slice(0, 32),
        hashrate: w.hashrate || 0,
        besteShare: w.besteShare ?? null,
        laatsteShare: w.laatsteShare ?? null,
      });
    }
  }
  return { tijd: d.tijd, adres: String(addr).trim(), gevonden: workers.length > 0, workers };
}

// Simpele limiet per bezoeker: 30 verzoeken per minuut.
const hits = new Map();
function limited(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  const h = hits.get(ip) || { n: 0, t: now };
  if (now - h.t > 60000) { h.n = 0; h.t = now; }
  h.n++;
  hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.n > 30;
}

function send(res, code, body, extra = {}) {
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=30', ...extra });
  res.end(JSON.stringify(body));
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/public/')) {
      if (req.method === 'OPTIONS') return send(res, 204, {});
      if (limited(req)) return send(res, 429, { fout: 'te veel verzoeken' });
      const d = await cached();
      if (url.pathname === '/public/summary') return send(res, 200, publicSummary(d));
      const m = /^\/public\/miner\/([A-Za-z0-9:]{20,100})$/.exec(url.pathname);
      if (m) return send(res, 200, publicMiner(d, m[1]));
      return send(res, 404, { fout: 'onbekend' });
    }
    const d = await cached();
    if (url.pathname.startsWith('/api')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(d, (k, v) => (k === 'alle' || k === 'vol' ? undefined : v)));
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page(d));
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(err.message);
  }
}).listen(PORT, '0.0.0.0', () => console.log(`pool-overzicht op :${PORT}`));
