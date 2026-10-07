'use strict';

const dns = require('dns').promises;
const net = require('net');
const cheerio = require('cheerio');

// HTTP request configuration
const USER_AGENT = 'Mozilla/5.0 (compatible; DWR-Website-APK/1.0; stagiairs-tool, alleen publieke pagina-analyse)';
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];

const ERROR_MESSAGES = {
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

const PAGE_HINTS = [
  ['contact', /contact|bereik|route|kom langs/i],
  ['over', /over[-\s]?(ons|mij|ons-bedrijf)|about|wie[-\s]?zijn|team|het[-\s]?verhaal|ons[-\s]?verhaal/i],
  ['aanbod', /diensten|producten|aanbod|werkwijze|services|behandelingen|assortiment|webshop|shop|projecten/i],
  ['nieuws', /blog|nieuws|actueel|artikelen/i],
  ['reviews', /reviews|ervaringen|beoordelingen|referenties|klanten/i],
  ['voorwaarden', /voorwaarden|privacy|cookie|disclaimer/i],
];

const SOCIAL_HOSTS = /(facebook|instagram|linkedin|twitter|x|youtube|tiktok|pinterest|wa)\.(com|me)$/i;
const STATIC_FILE_PATHS = /\.(pdf|jpe?g|png|gif|webp|zip|docx?|xlsx?)$/i;
const PRIVATE_CRAWL_PATHS = /\/(wp-admin|wp-login|cdn-cgi)\//;

// Network security
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127);
  }

  const normalizedIp = ip.toLowerCase();
  return normalizedIp === '::1' || normalizedIp === '::' ||
    normalizedIp.startsWith('fc') || normalizedIp.startsWith('fd') ||
    normalizedIp.startsWith('fe80') || normalizedIp.startsWith('::ffff:127.') ||
    normalizedIp.startsWith('::ffff:10.') || normalizedIp.startsWith('::ffff:192.168.');
}

async function assertPublic(url) {
  if (!/^https?:$/.test(url.protocol)) {
    throw Object.assign(new Error('Alleen http(s)-adressen zijn toegestaan.'), {
      code: 'BAD_PROTOCOL',
    });
  }

  if (process.env.ALLOW_PRIVATE === '1') return;

  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host)
    ? [{ address: host }]
    : await dns.lookup(host, { all: true });

  if (addresses.some(({ address }) => isPrivateIp(address))) {
    throw Object.assign(new Error('Dit adres is niet openbaar bereikbaar en wordt niet gescand.'), {
      code: 'PRIVATE_ADDRESS',
    });
  }
}

function describeError(error) {
  const code = (error && (error.cause?.code || error.code || error.name)) || 'ONBEKEND';
  return {
    code,
    message: ERROR_MESSAGES[code] || error.message || String(error),
    isCert: /CERT|TLS|SIGNATURE/.test(code),
  };
}

function decodeBody(buffer, contentType) {
  const contentTypeCharset = /charset=([\w-]+)/i.exec(contentType || '');
  const htmlCharset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(
    buffer.subarray(0, 2048).toString('latin1'),
  );
  const charset = (contentTypeCharset || htmlCharset)?.[1]?.toLowerCase() || 'utf-8';

  try {
    const encoding = /iso-8859-1|latin1|windows-1252/.test(charset)
      ? 'windows-1252'
      : 'utf-8';
    return new TextDecoder(encoding).decode(buffer);
  } catch {
    return buffer.toString('utf8');
  }
}

function requestHeaders(headers) {
  return {
    'user-agent': USER_AGENT,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'nl-NL,nl;q=0.9,en;q=0.5',
    ...headers,
  };
}

function failedResponse(startUrl, finalUrl, chain, error, startedAt) {
  return {
    ok: false,
    url: startUrl,
    finalUrl,
    chain,
    error: describeError(error),
    timing: { total: performance.now() - startedAt },
  };
}

/** Fetch one URL, following redirects manually so the redirect chain is retained. */
async function safeFetch(startUrl, options = {}) {
  const {
    method = 'GET',
    timeout = 15000,
    maxBytes = 3_000_000,
    maxRedirects = 6,
    headers = {},
  } = options;
  const startedAt = performance.now();
  const chain = [];
  let url = startUrl;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
      await assertPublic(parsedUrl);
    } catch (error) {
      return failedResponse(startUrl, url, chain, error, startedAt);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(parsedUrl, {
        method,
        redirect: 'manual',
        signal: controller.signal,
        headers: requestHeaders(headers),
      });
      const ttfb = performance.now() - startedAt;
      const location = response.headers.get('location');

      if (REDIRECT_STATUSES.includes(response.status) && location) {
        chain.push({ url, status: response.status });
        url = new URL(location, parsedUrl).href;
        try {
          await response.body?.cancel();
        } catch {
          // The redirect response body is not needed.
        }
        clearTimeout(timer);
        continue;
      }

      let body = '';
      let bytes = 0;
      if (method !== 'HEAD' && response.body) {
        const reader = response.body.getReader();
        const chunks = [];

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          bytes += value.length;
          chunks.push(value);
          if (bytes > maxBytes) {
            await reader.cancel();
            break;
          }
        }

        body = decodeBody(Buffer.concat(chunks), response.headers.get('content-type'));
      }

      clearTimeout(timer);
      return {
        ok: response.status < 400,
        status: response.status,
        url: startUrl,
        finalUrl: url,
        chain,
        headers: Object.fromEntries(response.headers),
        body,
        bytes,
        timing: { ttfb, total: performance.now() - startedAt },
      };
    } catch (error) {
      clearTimeout(timer);
      return failedResponse(startUrl, url, chain, error, startedAt);
    }
  }

  return {
    ok: false,
    url: startUrl,
    finalUrl: url,
    chain,
    error: {
      code: 'TOO_MANY_REDIRECTS',
      message: 'Te veel doorverwijzingen achter elkaar.',
    },
    timing: { total: performance.now() - startedAt },
  };
}

// Bounded concurrency
async function pool(items, limit, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await callback(items[index], index);
    }
  }));

  return results;
}

// Page parsing and link collection
function buildPage(response) {
  const $ = cheerio.load(response.body);
  const textDocument = cheerio.load(response.body);
  textDocument('script,style,noscript,svg,template,iframe').remove();
  const text = textDocument('body').text().replace(/\s+/g, ' ').trim();

  return {
    url: response.finalUrl,
    status: response.status,
    headers: response.headers || {},
    html: response.body,
    $,
    text,
    words: text ? text.split(' ').length : 0,
    timing: response.timing,
    bytes: response.bytes || 0,
    chain: response.chain || [],
  };
}

function collectLinks(page) {
  const links = [];

  page.$('a[href]').each((index, element) => {
    const $link = page.$(element);
    const href = ($link.attr('href') || '').trim();
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return;

    let absoluteUrl;
    try {
      absoluteUrl = new URL(href, page.url);
    } catch {
      return;
    }

    links.push({
      href: absoluteUrl.href,
      protocol: absoluteUrl.protocol,
      host: absoluteUrl.hostname.replace(/^www\./, ''),
      path: absoluteUrl.pathname,
      idx: index,
      text: ($link.text() || $link.attr('aria-label') || $link.attr('title') || '')
        .replace(/\s+/g, ' ')
        .trim(),
      inNav: $link.closest('nav,[role=navigation],header,[role=banner]').length > 0,
      inHeader: $link.closest('header,[role=banner]').length > 0,
      inFooter: $link.closest('footer,[role=contentinfo]').length > 0,
    });
  });

  return links;
}

// Crawl preparation
function normalizeInput(raw) {
  let value = String(raw || '').trim();
  if (!value) throw new Error('Vul een website-adres (URL) in.');
  if (!/^https?:\/\//i.test(value)) value = 'https://' + value;

  const url = new URL(value);
  if (!url.hostname.includes('.') && process.env.ALLOW_PRIVATE !== '1') {
    throw new Error('Dit lijkt geen geldig website-adres.');
  }

  return url;
}

async function fetchHomepage(url, hadScheme, log) {
  log('Homepage ophalen…');
  let response = await safeFetch(url.href);

  if (!response.ok && response.error && !hadScheme && !response.error.isCert) {
    log('HTTPS lukt niet, ik probeer http://…');
    const fallback = await safeFetch(`http://${url.host}${url.pathname}${url.search}`);
    if (fallback.ok) response = fallback;
  }

  if (!response.ok && !response.body) {
    const reason = response.error
      ? response.error.message
      : `De website gaf foutcode ${response.status}.`;
    const error = new Error('De homepage kon niet worden opgehaald. ' + reason);
    error.details = response;
    throw error;
  }

  const warnings = [];
  if (!response.ok) {
    warnings.push(`De homepage gaf statuscode ${response.status}; de analyse kan daardoor onvolledig zijn.`);
  }

  return { response, warnings };
}

async function inspectHttps(home, host, response) {
  const httpProbe = await safeFetch(`http://${host}/`, { method: 'HEAD', timeout: 8000 });
  return {
    finalIsHttps: home.url.startsWith('https://'),
    httpRedirectsToHttps: !!(httpProbe.finalUrl && httpProbe.finalUrl.startsWith('https://')),
    httpReachable: httpProbe.ok || !!httpProbe.status,
    hsts: !!home.headers['strict-transport-security'],
    certError: response.error?.isCert ? response.error : null,
  };
}

function findPageTargets(homeLinks, host, homeUrl) {
  const picked = new Map();

  for (const link of homeLinks) {
    if (link.host !== host.replace(/^www\./, '') || !/^https?:$/.test(link.protocol)) continue;
    if (STATIC_FILE_PATHS.test(link.path)) continue;

    for (const [kind, hint] of PAGE_HINTS) {
      if (!picked.has(kind) && (hint.test(link.path) || hint.test(link.text))) {
        picked.set(kind, link.href.split('#')[0]);
        break;
      }
    }
  }

  const targets = [...new Set(picked.values())]
    .filter((target) => target.replace(/\/$/, '') !== homeUrl.replace(/\/$/, ''))
    .slice(0, 5);
  return { picked, targets };
}

async function fetchSubPages(targets, picked) {
  const responses = await pool(targets, 3, (target) =>
    safeFetch(target, { timeout: 12000 }));

  return responses
    .map((response, index) => {
      if (!response.ok || !/html/i.test(response.headers?.['content-type'] || 'html')) {
        return null;
      }

      const kind = [...picked.entries()].find(([, url]) => url === targets[index])?.[0];
      return { ...buildPage(response), kind };
    })
    .filter(Boolean);
}

async function fetchSiteResources(home, origin) {
  const cssUrls = [];
  home.$('link[rel~="stylesheet"][href]').each((_, element) => {
    try {
      cssUrls.push(new URL(home.$(element).attr('href'), home.url).href);
    } catch {
      // Ignore invalid stylesheet URLs.
    }
  });

  const [cssResponses, robots, sitemap, llms] = await Promise.all([
    pool(cssUrls.slice(0, 4), 4, (url) =>
      safeFetch(url, { timeout: 8000, maxBytes: 600_000 })),
    safeFetch(origin + '/robots.txt', { timeout: 8000, maxBytes: 200_000 }),
    safeFetch(origin + '/sitemap.xml', { timeout: 8000, maxBytes: 300_000 }),
    safeFetch(origin + '/llms.txt', { timeout: 8000, maxBytes: 100_000 }),
  ]);

  const inlineCss = home.$('style').map((_, element) => home.$(element).text()).get().join('\n');
  const css = inlineCss + '\n' + cssResponses
    .filter((response) => response.ok)
    .map((response) => response.body)
    .join('\n');

  const isText = (response) =>
    response.ok && !/^\s*<!doctype html|<html/i.test(response.body || '');
  const robotsOk = isText(robots);
  const robotsText = robotsOk ? robots.body : '';
  const sitemapInRobots = /^\s*sitemap:\s*\S+/im.test(robotsText);
  const sitemapOk = (sitemap.ok && /<urlset|<sitemapindex/i.test(sitemap.body || '')) ||
    sitemapInRobots;

  return {
    css,
    robots: { ok: robotsOk, text: robotsText },
    sitemap: { ok: sitemapOk },
    llms: { ok: isText(llms) && (llms.body || '').trim().length > 10 },
  };
}

function buildLinkSample(home, subPages, homeLinks) {
  const seen = new Set();
  const linksToCheck = [];

  for (const link of [...homeLinks, ...subPages.flatMap((page) => collectLinks(page))]) {
    const key = link.href.split('#')[0];
    if (seen.has(key) || !/^https?:$/.test(link.protocol) || SOCIAL_HOSTS.test(link.host)) continue;
    if (PRIVATE_CRAWL_PATHS.test(link.path)) continue;

    seen.add(key);
    linksToCheck.push(key);
  }

  const imageUrls = home.$('img[src]')
    .map((_, element) => {
      try {
        return new URL(home.$(element).attr('src'), home.url).href;
      } catch {
        return null;
      }
    })
    .get()
    .filter((url) => url && /^https?:/.test(url))
    .slice(0, 8);
  const sample = [...linksToCheck.slice(0, 25), ...imageUrls.filter((url) => !seen.has(url))];

  return sample;
}

async function checkLinks(home, subPages, homeLinks) {
  const sample = buildLinkSample(home, subPages, homeLinks);
  const checks = await pool(sample, 5, async (href) => {
    let response = await safeFetch(href, {
      method: 'HEAD',
      timeout: 8000,
      maxRedirects: 4,
    });

    if (response.status === 405 || response.status === 501 ||
      (!response.status && !response.error?.isCert)) {
      response = await safeFetch(href, {
        method: 'GET',
        timeout: 8000,
        maxBytes: 50_000,
        maxRedirects: 4,
      });
    }

    return { href, status: response.status || 0, error: response.error?.message };
  });

  const broken = checks.filter((check) =>
    (check.status >= 400 && ![401, 403, 429, 999].includes(check.status)) ||
    (!check.status && check.error));

  return { checked: checks.length, broken };
}

// Main crawl orchestration
async function crawl(input, log = () => {}) {
  const url = normalizeInput(input.url);
  const hadScheme = /^https?:\/\//i.test(String(input.url).trim());
  const { response, warnings } = await fetchHomepage(url, hadScheme, log);

  const home = buildPage(response);
  const homeUrl = new URL(home.url);
  const origin = homeUrl.origin;
  const host = homeUrl.hostname;
  const homeLinks = collectLinks(home);

  log('Beveiliging (HTTPS) controleren…');
  const https = await inspectHttps(home, host, response);

  log("Andere pagina's zoeken (contact, over ons, aanbod…)");
  const { picked, targets } = findPageTargets(homeLinks, host, home.url);
  const subPages = await fetchSubPages(targets, picked);
  log(`${1 + subPages.length} pagina('s) ingelezen.`);

  log('Stijlbestanden en bestanden voor Google/AI ophalen…');
  const resources = await fetchSiteResources(home, origin);

  log('Links controleren (steekproef)…');
  const linkCheck = await checkLinks(home, subPages, homeLinks);

  return {
    input,
    home,
    subPages,
    pages: [home, ...subPages],
    homeLinks,
    ...resources,
    https,
    linkCheck,
    warnings,
    origin,
  };
}

module.exports = { crawl, safeFetch, collectLinks, buildPage, normalizeInput };
