'use strict';
const dns = require('dns').promises;
const net = require('net');
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (compatible; DWR-Website-APK/1.0; stagiairs-tool, alleen publieke pagina-analyse)';

/* ---------- Beveiliging: alleen publieke websites ---------- */
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const l = ip.toLowerCase();
  return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') ||
    l.startsWith('::ffff:127.') || l.startsWith('::ffff:10.') || l.startsWith('::ffff:192.168.');
}

async function assertPublic(u) {
  if (!/^https?:$/.test(u.protocol)) throw Object.assign(new Error('Alleen http(s)-adressen zijn toegestaan.'), { code: 'BAD_PROTOCOL' });
  if (process.env.ALLOW_PRIVATE === '1') return; // alleen voor testen
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (addrs.some((a) => isPrivateIp(a.address))) {
    throw Object.assign(new Error('Dit adres is niet openbaar bereikbaar en wordt niet gescand.'), { code: 'PRIVATE_ADDRESS' });
  }
}

const ERR_TEXT = {
  ENOTFOUND: 'Het domein bestaat niet of is niet bereikbaar.',
  ECONNREFUSED: 'De server weigert de verbinding.',
  ECONNRESET: 'De verbinding werd verbroken.',
  AbortError: 'De website reageerde niet binnen de tijdslimiet.',
  TimeoutError: 'De website reageerde niet binnen de tijdslimiet.',
  CERT_HAS_EXPIRED: 'Het beveiligingscertificaat (HTTPS) is verlopen.',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'Het beveiligingscertificaat is niet vertrouwd (zelf ondertekend).',
  SELF_SIGNED_CERT_IN_CHAIN: 'Het beveiligingscertificaat is niet vertrouwd.',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'Het beveiligingscertificaat kon niet worden gecontroleerd.',
  ERR_TLS_CERT_ALTNAME_INVALID: 'Het beveiligingscertificaat hoort niet bij dit domein.',
};
function describeError(e) {
  const code = (e && (e.cause?.code || e.code || e.name)) || 'ONBEKEND';
  return { code, message: ERR_TEXT[code] || e.message || String(e), isCert: /CERT|TLS|SIGNATURE/.test(code) };
}

function decode(buf, contentType) {
  const m = /charset=([\w-]+)/i.exec(contentType || '') || /<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 2048).toString('latin1'));
  const cs = (m && m[1] || 'utf-8').toLowerCase();
  try { return new TextDecoder(/iso-8859-1|latin1|windows-1252/.test(cs) ? 'windows-1252' : 'utf-8').decode(buf); }
  catch { return buf.toString('utf8'); }
}

/** Haalt één URL op en volgt redirects handmatig (zodat we de keten kunnen zien). */
async function safeFetch(startUrl, opts = {}) {
  const { method = 'GET', timeout = 15000, maxBytes = 3_000_000, maxRedirects = 6, headers = {} } = opts;
  const t0 = performance.now();
  const chain = [];
  let url = startUrl;
  for (let i = 0; i <= maxRedirects; i++) {
    let u;
    try { u = new URL(url); await assertPublic(u); }
    catch (e) { return { ok: false, url: startUrl, finalUrl: url, chain, error: describeError(e), timing: { total: performance.now() - t0 } }; }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(u, {
        method, redirect: 'manual', signal: ctrl.signal,
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'nl-NL,nl;q=0.9,en;q=0.5', ...headers },
      });
      const ttfb = performance.now() - t0;
      const loc = res.headers.get('location');
      if ([301, 302, 303, 307, 308].includes(res.status) && loc) {
        chain.push({ url, status: res.status });
        url = new URL(loc, u).href;
        try { await res.body?.cancel(); } catch { /* negeren */ }
        clearTimeout(timer);
        continue;
      }
      let body = '', bytes = 0;
      if (method !== 'HEAD' && res.body) {
        const reader = res.body.getReader();
        const chunks = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.length; chunks.push(value);
          if (bytes > maxBytes) { await reader.cancel(); break; }
        }
        body = decode(Buffer.concat(chunks), res.headers.get('content-type'));
      }
      clearTimeout(timer);
      return {
        ok: res.status < 400, status: res.status, url: startUrl, finalUrl: url, chain,
        headers: Object.fromEntries(res.headers), body, bytes,
        timing: { ttfb, total: performance.now() - t0 },
      };
    } catch (e) {
      clearTimeout(timer);
      return { ok: false, url: startUrl, finalUrl: url, chain, error: describeError(e), timing: { total: performance.now() - t0 } };
    }
  }
  return { ok: false, url: startUrl, finalUrl: url, chain, error: { code: 'TOO_MANY_REDIRECTS', message: 'Te veel doorverwijzingen achter elkaar.' }, timing: { total: performance.now() - t0 } };
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

/* ---------- Pagina-object ---------- */
function buildPage(resp) {
  const $ = cheerio.load(resp.body);
  const $t = cheerio.load(resp.body);
  $t('script,style,noscript,svg,template,iframe').remove();
  const text = $t('body').text().replace(/\s+/g, ' ').trim();
  return {
    url: resp.finalUrl, status: resp.status, headers: resp.headers || {}, html: resp.body, $, text,
    words: text ? text.split(' ').length : 0, timing: resp.timing, bytes: resp.bytes || 0, chain: resp.chain || [],
  };
}

function collectLinks(page) {
  const out = [];
  page.$('a[href]').each((idx, el) => {
    const $el = page.$(el);
    const href = ($el.attr('href') || '').trim();
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return;
    let abs;
    try { abs = new URL(href, page.url); } catch { return; }
    out.push({
      href: abs.href, protocol: abs.protocol, host: abs.hostname.replace(/^www\./, ''), path: abs.pathname, idx,
      text: ($el.text() || $el.attr('aria-label') || $el.attr('title') || '').replace(/\s+/g, ' ').trim(),
      inNav: $el.closest('nav,[role=navigation],header,[role=banner]').length > 0,
      inHeader: $el.closest('header,[role=banner]').length > 0,
      inFooter: $el.closest('footer,[role=contentinfo]').length > 0,
    });
  });
  return out;
}

const PAGE_HINTS = [
  ['contact', /contact|bereik|route|kom langs/i],
  ['over', /over[-\s]?(ons|mij|ons-bedrijf)|about|wie[-\s]?zijn|team|het[-\s]?verhaal|ons[-\s]?verhaal/i],
  ['aanbod', /diensten|producten|aanbod|werkwijze|services|behandelingen|assortiment|webshop|shop|projecten/i],
  ['nieuws', /blog|nieuws|actueel|artikelen/i],
  ['reviews', /reviews|ervaringen|beoordelingen|referenties|klanten/i],
  ['voorwaarden', /voorwaarden|privacy|cookie|disclaimer/i],
];

/* ---------- Hoofdroutine ---------- */
function normalizeInput(raw) {
  let s = String(raw || '').trim();
  if (!s) throw new Error('Vul een website-adres (URL) in.');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  const u = new URL(s);
  if (!u.hostname.includes('.') && process.env.ALLOW_PRIVATE !== '1') throw new Error('Dit lijkt geen geldig website-adres.');
  return u;
}

async function crawl(input, log = () => {}) {
  const u = normalizeInput(input.url);
  const hadScheme = /^https?:\/\//i.test(String(input.url).trim());
  const warnings = [];

  log('Homepage ophalen…');
  let resp = await safeFetch(u.href);
  if (!resp.ok && resp.error && !hadScheme && !resp.error.isCert) {
    log('HTTPS lukt niet, ik probeer http://…');
    const alt = await safeFetch('http://' + u.host + u.pathname + u.search);
    if (alt.ok) resp = alt;
  }
  if (!resp.ok && !resp.body) {
    const why = resp.error ? resp.error.message : `De website gaf foutcode ${resp.status}.`;
    const err = new Error('De homepage kon niet worden opgehaald. ' + why);
    err.details = resp;
    throw err;
  }
  if (!resp.ok) warnings.push(`De homepage gaf statuscode ${resp.status}; de analyse kan daardoor onvolledig zijn.`);

  const home = buildPage(resp);
  const origin = new URL(home.url).origin;
  const host = new URL(home.url).hostname;
  const homeLinks = collectLinks(home);

  log('Beveiliging (HTTPS) controleren…');
  const httpProbe = await safeFetch('http://' + host + '/', { method: 'HEAD', timeout: 8000 });
  const https = {
    finalIsHttps: home.url.startsWith('https://'),
    httpRedirectsToHttps: !!(httpProbe.finalUrl && httpProbe.finalUrl.startsWith('https://')),
    httpReachable: httpProbe.ok || !!httpProbe.status,
    hsts: !!home.headers['strict-transport-security'],
    certError: resp.error?.isCert ? resp.error : null,
  };

  log("Andere pagina's zoeken (contact, over ons, aanbod…)");
  const picked = new Map();
  for (const l of homeLinks) {
    if (l.host !== host.replace(/^www\./, '') || !/^https?:$/.test(l.protocol)) continue;
    if (/\.(pdf|jpe?g|png|gif|webp|zip|docx?|xlsx?)$/i.test(l.path)) continue;
    for (const [key, re] of PAGE_HINTS) {
      if (!picked.has(key) && (re.test(l.path) || re.test(l.text))) { picked.set(key, l.href.split('#')[0]); break; }
    }
  }
  const targets = [...new Set(picked.values())].filter((x) => x.replace(/\/$/, '') !== home.url.replace(/\/$/, '')).slice(0, 5);
  const subResps = await pool(targets, 3, (t) => safeFetch(t, { timeout: 12000 }));
  const subPages = subResps.map((r, i) => (r.ok && /html/i.test(r.headers?.['content-type'] || 'html') ? { ...buildPage(r), kind: [...picked.entries()].find(([, v]) => v === targets[i])?.[0] } : null)).filter(Boolean);
  log(`${1 + subPages.length} pagina('s) ingelezen.`);

  log('Stijlbestanden en bestanden voor Google/AI ophalen…');
  const cssUrls = [];
  home.$('link[rel~="stylesheet"][href]').each((_, el) => { try { cssUrls.push(new URL(home.$(el).attr('href'), home.url).href); } catch { /* negeren */ } });
  const [cssResps, robots, sitemap, llms] = await Promise.all([
    pool(cssUrls.slice(0, 4), 4, (c) => safeFetch(c, { timeout: 8000, maxBytes: 600_000 })),
    safeFetch(origin + '/robots.txt', { timeout: 8000, maxBytes: 200_000 }),
    safeFetch(origin + '/sitemap.xml', { timeout: 8000, maxBytes: 300_000 }),
    safeFetch(origin + '/llms.txt', { timeout: 8000, maxBytes: 100_000 }),
  ]);
  const inlineCss = home.$('style').map((_, el) => home.$(el).text()).get().join('\n');
  const css = inlineCss + '\n' + cssResps.filter((r) => r.ok).map((r) => r.body).join('\n');

  const isText = (r) => r.ok && !/^\s*<!doctype html|<html/i.test(r.body || '');
  const robotsOk = isText(robots);
  const robotsTxt = robotsOk ? robots.body : '';
  const sitemapInRobots = /^\s*sitemap:\s*\S+/im.test(robotsTxt);
  const sitemapOk = (sitemap.ok && /<urlset|<sitemapindex/i.test(sitemap.body || '')) || sitemapInRobots;

  log('Links controleren (steekproef)…');
  const seen = new Set();
  const toCheck = [];
  const SOCIAL = /(facebook|instagram|linkedin|twitter|x|youtube|tiktok|pinterest|wa)\.(com|me)$/i;
  for (const l of [...homeLinks, ...subPages.flatMap((p) => collectLinks(p))]) {
    const key = l.href.split('#')[0];
    if (seen.has(key) || !/^https?:$/.test(l.protocol) || SOCIAL.test(l.host)) continue;
    if (/\/(wp-admin|wp-login|cdn-cgi)\//.test(l.path)) continue;
    seen.add(key); toCheck.push(key);
  }
  const imgSrcs = [...home.$('img[src]').map((_, el) => { try { return new URL(home.$(el).attr('src'), home.url).href; } catch { return null; } }).get().filter((s) => s && /^https?:/.test(s))].slice(0, 8);
  const sample = [...toCheck.slice(0, 25), ...imgSrcs.filter((i) => !seen.has(i))];
  const checks = await pool(sample, 5, async (href) => {
    let r = await safeFetch(href, { method: 'HEAD', timeout: 8000, maxRedirects: 4 });
    if (r.status === 405 || r.status === 501 || (!r.status && !r.error?.isCert)) r = await safeFetch(href, { method: 'GET', timeout: 8000, maxBytes: 50_000, maxRedirects: 4 });
    return { href, status: r.status || 0, error: r.error?.message };
  });
  const broken = checks.filter((c) => (c.status >= 400 && ![401, 403, 429, 999].includes(c.status)) || (!c.status && c.error));
  const linkCheck = { checked: checks.length, broken };

  return { input, home, subPages, pages: [home, ...subPages], homeLinks, css, https, robots: { ok: robotsOk, text: robotsTxt }, sitemap: { ok: sitemapOk }, llms: { ok: isText(llms) && (llms.body || '').trim().length > 10 }, linkCheck, warnings, origin };
}

module.exports = { crawl, safeFetch, collectLinks, buildPage, normalizeInput };