'use strict';
// Kleine nagemaakte mkb-website om de scanner mee te testen.
const http = require('http');

const page = (title, body, extra = '') => `<!doctype html><html lang="nl"><head><meta charset="utf-8">
<title>${title}</title><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Bakkerij De Gouden Korst in Rotterdam: ambachtelijk brood, taarten en bestellingen op maat. Bestel online of kom langs in Delfshaven.">
<style>body{font-family:'Lato',sans-serif;color:#222}@media (max-width:600px){nav ul{display:none}}.menu-toggle{display:none}</style>${extra}</head><body>
<header><a href="/"><img class="logo" src="/logo.png" alt="De Gouden Korst logo"></a>
<button class="menu-toggle" aria-label="Menu">☰</button>
<nav><ul><li><a href="/">Home</a></li><li><a href="/aanbod">Aanbod</a></li><li><a href="/over-ons">Over ons</a></li><li><a href="/contact">Contact</a></li></ul></nav>
<a href="tel:0101234567">010 123 45 67</a></header>
<main>${body}</main>
<footer><p>Bakkerij De Gouden Korst · Delfshaven 12 · 3011 AB Rotterdam · KvK 12345678</p>
<p><a href="mailto:info@goudenkorst.nl">info@goudenkorst.nl</a> · <a href="/privacy">Privacyverklaring</a> · <a href="/voorwaarden">Algemene voorwaarden</a></p>
<p><a href="https://www.facebook.com/goudenkorst">Facebook</a> <a href="https://www.instagram.com/goudenkorst">Instagram</a></p>
<p>© ${new Date().getFullYear()} De Gouden Korst</p></footer></body></html>`;

const routes = {
  '/': page('De Gouden Korst – Ambachtelijke bakkerij in Rotterdam', `
<h1>Ambachtelijk brood, elke ochtend vers uit Delfshaven</h1>
<p>Wij bakken sinds 1987 brood, broodjes en taarten met meel van lokale molens. Ons team staat elke dag om 4 uur 's nachts voor je klaar.</p>
<a class="btn" href="/contact">Bestel een taart</a> <a href="/aanbod">Bekijk ons aanbod</a>
<h2>Waarom De Gouden Korst?</h2><p>Jarenlange ervaring, erkend leerbedrijf en lid van de ambachtelijke bakkersvereniging. Vraag naar onze vrijblijvende offerte voor bruiloften.</p>
<h2>Veelgestelde vragen?</h2><p>Openingstijden: ma-za 07:00 - 17:00. Taarten vanaf € 24,50.</p>
<h2>Wat klanten zeggen</h2><p>Lees onze reviews op Google. Beoordeling 4,8.</p>
<img src="/brood.jpg" alt="Vers brood"><img src="/taart.jpg"><a href="/kapot-pagina">Oude actie</a><div id="cookie-notice">Cookies</div>
<script src="https://www.googletagmanager.com/gtag/js?id=G-TEST"></script>`,
    '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Bakery","name":"De Gouden Korst","address":{"@type":"PostalAddress","postalCode":"3011 AB"},"openingHours":"Mo-Sa 07:00-17:00"}</script>'),
  '/aanbod': page('Aanbod', '<h1>Ons aanbod</h1><p>Brood vanaf € 3,95. Taarten vanaf € 24,50.</p>'),
  '/over-ons': page('Over ons', '<h1>Ons verhaal</h1><p>Wij zijn familiebedrijf sinds 1987. Ik ben Piet, en samen met ons team bakken we...</p>'),
  '/contact': page('Contact', '<h1>Contact</h1><form action="/send" method="post"><label for="m">Bericht</label><textarea id="m" name="m"></textarea><input type="email" placeholder="e-mail"><button>Verstuur</button></form>'),
  '/privacy': page('Privacy', '<h1>Privacy</h1>'),
  '/voorwaarden': page('Voorwaarden', '<h1>Algemene voorwaarden</h1>'),
  '/robots.txt': 'User-agent: *\nAllow: /\nUser-agent: GPTBot\nDisallow: /\nSitemap: http://localhost:4000/sitemap.xml\n',
  '/sitemap.xml': '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>http://localhost:4000/</loc></url></urlset>',
  '/logo.png': 'x', '/brood.jpg': 'x', '/taart.jpg': 'x',
};

function start(port = 4000) {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      const body = routes[req.url.split('?')[0]];
      if (body === undefined) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('niet gevonden'); }
      const type = req.url.endsWith('.txt') ? 'text/plain' : req.url.endsWith('.xml') ? 'application/xml' : /\.(png|jpg)$/.test(req.url) ? 'image/png' : 'text/html; charset=utf-8';
      res.writeHead(200, { 'content-type': type }); res.end(body);
    }).listen(port, '127.0.0.1', () => resolve(s));
  });
}
module.exports = { start };
if (require.main === module) start().then(() => console.log('Fixture op http://localhost:4000'));