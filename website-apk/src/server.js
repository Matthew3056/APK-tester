'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load optional environment values without requiring an extra dependency.
try {
  const envFile = path.join(__dirname, '..', '.env');
  const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const match = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && !line.trim().startsWith('#') && match[2] && !(match[1] in process.env)) {
      process.env[match[1]] = match[2];
    }
  }
} catch {
  // A local .env file is optional.
}

const { runScan } = require('./scanner');
const ai = require('./ai');
const { toMarkdown } = require('./markdown');

// Configuration
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SAVE_DIR = path.join(__dirname, '..', 'opgeslagen');
const MAX_RUNNING_JOBS = 3;
const JOB_EXPIRY_MS = 2 * 60 * 60 * 1000;
const MAX_REQUEST_BODY_BYTES = 2_000_000;
const MAX_SAVE_BODY_BYTES = 5_000_000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
};

// In-memory scan state: id -> { status, log, result, error, started }
const jobs = new Map();

// HTTP helpers
function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req, limit = MAX_REQUEST_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      size += chunk.length;

      if (size > limit) {
        reject(new Error('Bericht te groot.'));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8') || '{}';
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Ongeldige gegevens.'));
      }
    });

    req.on('error', reject);
  });
}

function slugify(value) {
  return String(value || 'website')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'website';
}

function cleanString(value, maxLength = 300) {
  return String(value ?? '').trim().slice(0, maxLength);
}

// Remove completed and stale jobs periodically.
setInterval(() => {
  for (const [id, job] of jobs) {
    if (Date.now() - job.started > JOB_EXPIRY_MS) {
      jobs.delete(id);
    }
  }
}, 10 * 60 * 1000).unref();

// API handlers
async function createScan(req, res) {
  const body = await readJsonBody(req);
  const input = {
    url: cleanString(body.url, 500),
    name: cleanString(body.name, 120),
    place: cleanString(body.place, 80),
    usePsi: body.usePsi !== false,
    expectations: {
      verw_3klikken: cleanString(body.expectations?.verw_3klikken, 1000),
      verw_homepage: cleanString(body.expectations?.verw_homepage, 1000),
      pos_eerste_indruk: cleanString(body.expectations?.pos_eerste_indruk, 1000),
    },
  };

  if (!input.url || !input.name || !input.place) {
    return sendJson(res, 400, {
      error: 'Vul website-adres, bedrijfsnaam en vestigingsplaats in.',
    });
  }

  const runningJobs = [...jobs.values()].filter((job) => job.status === 'bezig').length;
  if (runningJobs >= MAX_RUNNING_JOBS) {
    return sendJson(res, 429, {
      error: 'Er lopen al een paar scans. Probeer het over een minuutje opnieuw.',
    });
  }

  const id = crypto.randomBytes(8).toString('hex');
  const job = {
    status: 'bezig',
    log: [],
    result: null,
    error: null,
    started: Date.now(),
  };
  jobs.set(id, job);

  runScan(input, (message) => job.log.push(message))
    .then((result) => {
      job.result = result;
      job.status = 'klaar';
    })
    .catch((error) => {
      job.error = error.message || 'De scan is mislukt.';
      job.status = 'fout';
    });

  return sendJson(res, 202, { id });
}

function getScanStatus(res, id) {
  const job = jobs.get(id);
  if (!job) {
    return sendJson(res, 404, {
      error: 'Scan niet gevonden (de server is misschien herstart).',
    });
  }

  return sendJson(res, 200, {
    status: job.status,
    log: job.log,
    error: job.error,
    result: job.status === 'klaar' ? job.result : undefined,
  });
}

async function saveScan(req, res) {
  const payload = await readJsonBody(req, MAX_SAVE_BODY_BYTES);
  if (!payload.sections || !payload.meta) {
    return sendJson(res, 400, { error: 'Geen analyse om te bewaren.' });
  }

  await fs.promises.mkdir(SAVE_DIR, { recursive: true });

  const timestamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '');
  const draftSuffix = payload.status === 'gecontroleerd' ? '' : '-concept';
  const filename = `apk-${slugify(payload.meta.input?.name)}-${timestamp}${draftSuffix}`;
  const markdown = toMarkdown(payload);

  await fs.promises.writeFile(
    path.join(SAVE_DIR, `${filename}.json`),
    JSON.stringify(payload, null, 2),
  );
  await fs.promises.writeFile(path.join(SAVE_DIR, `${filename}.md`), markdown);

  return sendJson(res, 200, {
    saved: [`opgeslagen/${filename}.json`, `opgeslagen/${filename}.md`],
    markdown,
  });
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/status') {
    return sendJson(res, 200, { ai: ai.isEnabled(), model: ai.MODEL });
  }

  if (req.method === 'POST' && url.pathname === '/api/scan') {
    return createScan(req, res);
  }

  const scanMatch = /^\/api\/scan\/([a-f0-9]+)$/.exec(url.pathname);
  if (req.method === 'GET' && scanMatch) {
    return getScanStatus(res, scanMatch[1]);
  }

  if (req.method === 'POST' && url.pathname === '/api/save') {
    return saveScan(req, res);
  }

  return sendJson(res, 404, { error: 'Onbekend adres.' });
}

// Static-file handler
async function serveStaticFile(req, res, pathname) {
  if (req.method !== 'GET') {
    res.writeHead(405);
    return res.end();
  }

  const relativePath = pathname === '/'
    ? 'index.html'
    : decodeURIComponent(pathname).replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_DIR, relativePath);

  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end('Niet toegestaan');
  }

  const data = await fs.promises.readFile(filePath);
  res.writeHead(200, {
    'content-type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
  });
  return res.end(data);
}

// Server lifecycle
async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      return await handleApi(req, res, url);
    }

    return await serveStaticFile(req, res, url.pathname);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404);
      return res.end('Niet gevonden');
    }

    console.error(error);
    if (!res.headersSent) {
      return sendJson(res, 500, { error: error.message || 'Er ging iets mis.' });
    }

    return res.end();
  }
}

const server = http.createServer(handleRequest);

server.listen(PORT, HOST, () => {
  console.log(`Website APK-scanner draait op http://localhost:${PORT}`);
  console.log(
    ai.isEnabled()
      ? `AI-concepten aan (${ai.MODEL})`
      : 'AI-concepten uit (geen ANTHROPIC_API_KEY)',
  );
});
