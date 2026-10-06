'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* Kleine .env-lezer (geen extra pakket nodig) */
try {
  for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && m[2] && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch { /* geen .env: prima */ }

const { runScan } = require('./scanner');
const ai = require('./ai');
const { toMarkdown } = require('./markdown');

const PORT = +process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, '..', 'public');
const SAVE_DIR = path.join(__dirname, '..', 'opgeslagen');
const MAX_JOBS_RUNNING = 3;
const jobs = new Map(); // id -> { status, log, result, error, started }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

const send = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
};

function readBody(req, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('Bericht te groot.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('Ongeldige gegevens.')); } });
    req.on('error', reject);
  });
}

const slug = (s) => String(s || 'website').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'website';
const str = (v, n = 300) => String(v ?? '').trim().slice(0, n);

/* Oude scans opruimen (na 2 uur) */
setInterval(() => { for (const [id, j] of jobs) if (Date.now() - j.started > 2 * 3600_000) jobs.delete(id); }, 10 * 60_000).unref();

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/status') return send(res, 200, { ai: ai.isEnabled(), model: ai.MODEL });

  if (req.method === 'POST' && url.pathname === '/api/scan') {
    const b = await readBody(req);
    const input = {
      url: str(b.url, 500), name: str(b.name, 120), place: str(b.place, 80), usePsi: b.usePsi !== false,
      expectations: {
        verw_3klikken: str(b.expectations?.verw_3klikken, 1000),
        verw_homepage: str(b.expectations?.verw_homepage, 1000),
        pos_eerste_indruk: str(b.expectations?.pos_eerste_indruk, 1000),
      },
    };
    if (!input.url || !input.name || !input.place) return send(res, 400, { error: 'Vul website-adres, bedrijfsnaam en vestigingsplaats in.' });
    if ([...jobs.values()].filter((j) => j.status === 'bezig').length >= MAX_JOBS_RUNNING) return send(res, 429, { error: 'Er lopen al een paar scans. Probeer het over een minuutje opnieuw.' });

    const id = crypto.randomBytes(8).toString('hex');
    const job = { status: 'bezig', log: [], result: null, error: null, started: Date.now() };
    jobs.set(id, job);
    runScan(input, (m) => job.log.push(m))
      .then((r) => { job.result = r; job.status = 'klaar'; })
      .catch((e) => { job.error = e.message || 'De scan is mislukt.'; job.status = 'fout'; });
    return send(res, 202, { id });
  }

  const m = /^\/api\/scan\/([a-f0-9]+)$/.exec(url.pathname);
  if (req.method === 'GET' && m) {
    const j = jobs.get(m[1]);
    if (!j) return send(res, 404, { error: 'Scan niet gevonden (de server is misschien herstart).' });
    return send(res, 200, { status: j.status, log: j.log, error: j.error, result: j.status === 'klaar' ? j.result : undefined });
  }

  if (req.method === 'POST' && url.pathname === '/api/save') {
    const payload = await readBody(req, 5_000_000);
    if (!payload.sections || !payload.meta) return send(res, 400, { error: 'Geen analyse om te bewaren.' });
    await fs.promises.mkdir(SAVE_DIR, { recursive: true });
    const base = `apk-${slug(payload.meta.input?.name)}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}${payload.status === 'gecontroleerd' ? '' : '-concept'}`;
    const markdown = toMarkdown(payload);
    await fs.promises.writeFile(path.join(SAVE_DIR, base + '.json'), JSON.stringify(payload, null, 2));
    await fs.promises.writeFile(path.join(SAVE_DIR, base + '.md'), markdown);
    return send(res, 200, { saved: [`opgeslagen/${base}.json`, `opgeslagen/${base}.md`], markdown });
  }

  return send(res, 404, { error: 'Onbekend adres.' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.resolve(PUBLIC, rel);
    if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('Niet toegestaan'); }
    const data = await fs.promises.readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    if (e.code === 'ENOENT') { res.writeHead(404); return res.end('Niet gevonden'); }
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: e.message || 'Er ging iets mis.' }); else res.end();
  }
});

// Alleen op deze computer bereikbaar (zet HOST=0.0.0.0 om hem op het netwerk te delen)
server.listen(PORT, process.env.HOST || '127.0.0.1', () => {
  console.log(`Website APK-scanner draait op http://localhost:${PORT}`);
  console.log(ai.isEnabled() ? `AI-concepten aan (${ai.MODEL})` : 'AI-concepten uit (geen ANTHROPIC_API_KEY)');
});