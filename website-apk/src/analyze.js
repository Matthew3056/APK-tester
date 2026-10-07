'use strict';
/**
 * Beantwoordt de APK-vragen op basis van wat de crawler heeft gevonden.
 *
 * Elk antwoord heeft:
 *   answer      het voorstel (of null als de stagiair het zelf moet invullen)
 *   confidence  'zeker' (gemeten) | 'waarschijnlijk' | 'onzeker' | 'handmatig'
 *   evidence    waarop het voorstel gebaseerd is (zodat de stagiair het kan nalopen)
 *   s / w       0..1 score-bijdrage en gewicht, voor het voorstel-cijfer per onderdeel
 *   strength / improve   zin in gewone taal, voor de lijst sterke punten / verbeterpunten
 */
const { collectLinks } = require('./fetcher');

const A = (answer, confidence, evidence, o = {}) => ({
  answer,
  confidence,
  evidence,
  ...o,
});
const manual = (hint) =>
  A(null, 'handmatig', hint || 'Dit beoordeel je zelf: de scanner kan dit niet betrouwbaar zien.');
const uniq = (a) => [...new Set(a)];
const clip = (s, n = 150) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
const tri = (v) => ({ ja: 1, gedeeltelijk: 0.5, nee: 0, geen: 1, enkele: 0.5, meerdere: 0 })[v];
const list = (a, n = 6) => a.slice(0, n).join(', ') + (a.length > n ? ` (+${a.length - n})` : '');

// Herkenningspatronen per analysecategorie
const SOCIAL_NETS = [
  ['Facebook', /(^|\.)facebook\.com$|(^|\.)fb\.com$/],
  ['Instagram', /(^|\.)instagram\.com$/],
  ['LinkedIn', /(^|\.)linkedin\.com$/],
  ['X/Twitter', /(^|\.)(twitter|x)\.com$/],
  ['YouTube', /(^|\.)youtube\.com$|(^|\.)youtu\.be$/],
  ['TikTok', /(^|\.)tiktok\.com$/],
  ['Pinterest', /(^|\.)pinterest\.[a-z.]+$/],
];
const CONSENT_RE = new RegExp(
  [
    String.raw`cookiebot|onetrust|cookieyes|complianz|borlabs|iubenda|termly|osano|usercentrics|`,
    String.raw`cookie-script|cookiefirst|civic(?:uk|cookie)|moove_gdpr|cookie[-_ ]?`,
    String.raw`(?:law|notice|consent|banner|bar|melding)|cmplz|gdpr-cookie`,
  ].join(''),
  'i',
);
const TRACKER_RE = new RegExp(
  [
    String.raw`googletagmanager\.com|google-analytics\.com|gtag\(|fbq\(|`,
    String.raw`connect\.facebook\.net|static\.hotjar|clarity\.ms|snap\.licdn\.com|`,
    String.raw`analytics\.tiktok`,
  ].join(''),
  'i',
);
const CHAT_RE = new RegExp(
  [
    String.raw`tawk\.to|intercom|js\.driftt|crisp\.chat|tidio|livechat|zopim|`,
    String.raw`zendesk|olark|freshchat|userlike|smartsupp|chatra|`,
    String.raw`hs-scripts.*conversations|botpress|landbot`,
  ].join(''),
  'i',
);
const CTA_RE = new RegExp(
  [
    String.raw`offerte|contact|\bbel\b|bel ons|bel direct|bestel|afspraak|reserveer|\bboek|`,
    String.raw`aanvragen|aanmelden|inschrijven|plan (?:een|je|uw)|in winkelwagen|in winkelmand|`,
    String.raw`\bkoop\b|vraag .*aan|gratis|probeer|\bstart\b|demo|mail ons|app ons|whatsapp|`,
    String.raw`neem contact|schrijf je in|vrijblijvend`,
  ].join(''),
  'i',
);
const REVIEW_RE = new RegExp(
  [
    String.raw`\breviews?\b|beoordelingen|ervaringen|testimonial|klantverhalen|`,
    String.raw`wat (?:onze )?klanten|trustpilot|kiyoh|webwinkelkeur|google reviews|keurmerk|`,
    String.raw`thuiswinkel|\biso[\s-]?\d{4,5}|\bvca\b|gecertificeerd|erkend|gecertificeerde`,
  ].join(''),
  'i',
);
const SHOP_RE =
  /winkelwagen|winkelmand|add[-_ ]to[-_ ]cart|woocommerce|shopify|afrekenen|checkout|in je winkelmand/i;
const NL_PHONE = /(?:\+31|0031|\b0)[\s-]?(?:\(0\)[\s-]?)?[1-9](?:[\s-]?\d){8}\b/;
const HOURS_RE = new RegExp(
  [
    String.raw`openingstijden|geopend|\bgesloten\b|bereikbaar (?:van|op|tussen)|`,
    String.raw`telefonisch bereikbaar|spreekuur|\bma(?:andag)?\.?\s*(?:t\/m|tot|-|–)\s*`,
    String.raw`vr(?:ijdag)?|\d{1,2}[:.]\d{2}\s*(?:-|–|tot)\s*\d{1,2}[:.]\d{2}`,
  ].join(''),
  'i',
);

/* ---------- Hulpfuncties ---------- */
function parseSchema(pages) {
  const items = [];
  const flat = (x) =>
    Array.isArray(x) ? x.flatMap(flat) : x && x['@graph'] ? flat(x['@graph']) : x ? [x] : [];
  for (const p of pages) {
    p.$('script[type="application/ld+json"]').each((_, el) => {
      try {
        items.push(...flat(JSON.parse(p.$(el).html())));
      } catch {
        /* kapotte JSON-LD negeren */
      }
    });
  }
  const types = new Set();
  items.forEach((i) => [].concat((i && i['@type']) || []).forEach((t) => types.add(String(t))));
  return { items, types, json: JSON.stringify(items) };
}

function fontsFrom(html, css) {
  const fams = [];
  for (const m of (html + css).matchAll(/fonts\.googleapis\.com\/css2?\?[^"')]*family=([^"')&]+)/g))
    fams.push(decodeURIComponent(m[1]).split(':')[0].replace(/\+/g, ' '));
  for (const m of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    const first = m[1]
      .split(',')[0]
      .replace(/['"!important]/g, '')
      .trim();
    if (
      first &&
      !/^(inherit|initial|sans-serif|serif|monospace|system-ui|-apple-system|var\(.*)$/i.test(
        first,
      ) &&
      first.length < 40
    )
      fams.push(first);
  }
  return uniq(fams.filter(Boolean));
}

function topColors(css) {
  const c = {};
  for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const k = '#' + m[1].toLowerCase();
    c[k] = (c[k] || 0) + 1;
  }
  return Object.entries(c)
    .sort((a, b) => b[1] - a[1])
    .map((e) => e[0]);
}

function menuItems(home) {
  const $ = home.$;
  const nav = $(
    'header nav, [role=banner] nav, nav[aria-label*=hoofd i], nav[aria-label*=main i], nav, [role=navigation]',
  ).first();
  if (!nav.length) return [];
  const ul = nav.find('ul').first();
  const els = ul.length
    ? ul
        .children('li')
        .map((_, li) => $(li).children('a').first().text() || $(li).find('a').first().text())
        .get()
    : nav
        .find('a')
        .map((_, a) => $(a).text())
        .get();
  return els.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function detectCms(html) {
  return (
    (/wp-content|wp-includes/.test(html) && 'WordPress') ||
    (/wixstatic|wix\.com/.test(html) && 'Wix') ||
    (/squarespace/.test(html) && 'Squarespace') ||
    (/cdn\.shopify|shopify/i.test(html) && 'Shopify') ||
    (/jimdo/.test(html) && 'Jimdo') ||
    (/webflow/.test(html) && 'Webflow') ||
    (/Joomla/i.test(html) && 'Joomla') ||
    (/drupal/i.test(html) && 'Drupal') ||
    null
  );
}

/** Leest robots.txt per groep (User-agent-blok) en zegt of een bot de hele site mag lezen. */
function parseRobots(text) {
  const groups = [];
  let cur = null,
    lastWasAgent = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const k = m[1].toLowerCase(),
      v = m[2].trim();
    if (k === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(v.toLowerCase());
      lastWasAgent = true;
    } else if ((k === 'disallow' || k === 'allow') && cur) {
      cur.rules.push({ k, v });
      lastWasAgent = false;
    } else lastWasAgent = false;
  }
  const blockedAll = (g) =>
    !!g &&
    g.rules.some((r) => r.k === 'disallow' && r.v === '/') &&
    !g.rules.some((r) => r.k === 'allow' && r.v === '/');
  return {
    isBlocked(agent) {
      const specific = groups.find((g) => g.agents.includes(agent.toLowerCase()));
      return specific
        ? blockedAll(specific)
        : blockedAll(groups.find((g) => g.agents.includes('*')));
    },
    hasSpecificGroup: (agent) => groups.some((g) => g.agents.includes(agent.toLowerCase())),
  };
}

function collectSignals(ctx) {
  const { home, pages, css, https, robots, sitemap, llms, linkCheck, input, psi } = ctx;
  const $ = home.$;
  const allLinks = [...ctx.homeLinks, ...ctx.subPages.flatMap((p) => collectLinks(p))];
  const allText = pages.map((p) => p.text).join(' ');
  const allHtml = pages.map((p) => p.html).join('\n');
  const name = (input.name || '').trim();
  const place = (input.place || '').trim();
  const schema = parseSchema(pages);
  const title = $('head title').first().text().replace(/\s+/g, ' ').trim();
  const metaDesc = ($('meta[name="description"]').attr('content') || '').trim();
  const h1s = $('h1')
    .map((_, e) => $(e).text().replace(/\s+/g, ' ').trim())
    .get()
    .filter(Boolean);
  const imgs = $('img')
    .toArray()
    .filter((e) => !($(e).attr('width') === '1' && $(e).attr('height') === '1'));
  const imgsNoAlt = imgs.filter((e) => $(e).attr('alt') === undefined);
  const scripts = $('script[src]').length;
  const tel = allLinks.filter((l) => l.protocol === 'tel:');
  const mail = allLinks.filter((l) => l.protocol === 'mailto:');
  const hasFormProvider = new RegExp(
    [
      String.raw`typeform\.com|jotform|hsforms|hubspot.*forms|wpcf7|gravityforms|forminator|`,
      String.raw`ninja-forms|contact-form-7|formspree|tally\.so|forms\.gle|`,
      String.raw`docs\.google\.com\/forms|calendly`,
    ].join(''),
    'i',
  );
  const hasForm =
    pages.some((page) =>
      page
        .$('form')
        .toArray()
        .some((form) => {
          const $form = page.$(form);
          if ($form.find('textarea').length) return true;
          return (
            $form.find('input[type=email]').length &&
            !/nieuwsbrief|newsletter|search|zoek|login|inlog/i.test(
              $form.attr('class') +
                ' ' +
                $form.attr('id') +
                ' ' +
                $form.attr('action') +
                ' ' +
                $form.text(),
            )
          );
        }),
    ) || hasFormProvider.test(allHtml);
  const isShop = SHOP_RE.test(allHtml);
  const social = [];
  for (const link of allLinks) {
    for (const [network, pattern] of SOCIAL_NETS) {
      if (
        pattern.test(link.host) &&
        !/sharer|share\?|intent\/tweet|\/share/i.test(link.href) &&
        !social.find((item) => item.net === network)
      ) {
        social.push({ net: network, url: link.href });
      }
    }
  }
  const menu = menuItems(home);
  const aboutPage = ctx.subPages.find((p) => p.kind === 'over');
  const meta = {
    cms: detectCms(allHtml),
    fonts: fontsFrom(home.html, css),
    colors: topColors(css).slice(0, 6),
  };

  return {
    ...ctx,
    $,
    allLinks,
    allText,
    allHtml,
    name,
    place,
    schema,
    title,
    metaDesc,
    h1s,
    imgs,
    imgsNoAlt,
    scripts,
    tel,
    mail,
    hasForm,
    isShop,
    social,
    menu,
    aboutPage,
    meta,
  };
}

// ---------- Hoofdanalyse ----------
function analyze(ctx) {
  const {
    home,
    pages,
    css,
    https,
    robots,
    sitemap,
    llms,
    linkCheck,
    input,
    psi,
    $,
    allLinks,
    allText,
    allHtml,
    name,
    place,
    schema,
    title,
    metaDesc,
    h1s,
    imgs,
    imgsNoAlt,
    scripts,
    tel,
    mail,
    hasForm,
    isShop,
    social,
    menu,
    aboutPage,
    meta,
  } = collectSignals(ctx);
  const currentYear = new Date().getFullYear();
  const A_ = {}; // antwoorden
  const extras = []; // extra meetpunten zonder eigen vraag

  /* =========================================================
   * 1. Verwachtingen: door de stagiair zelf, vóór de scan
   * ========================================================= */

  /* =========================================================
   * 2. Eerste indruk & positionering
   * ========================================================= */
  A_.pos_eerste_indruk = manual(
    'Je eigen eerste indruk blijft eigen werk: vul die in vóór je de rest van de scan bekijkt.',
  );
  A_.pos_taak_3_klikken = manual(
    'Probeer zelf je taak (uit onderdeel 1) uit te voeren en tel de klikken.',
  );

  const first = h1s[0] || '';
  A_.pos_doelgroep = manual(
    `Aanwijzingen: hoofdkop "${clip(first, 80)}"; omschrijving "${clip(metaDesc, 120)}". Bedenk wie dit aanspreekt.`,
  );
  A_.pos_omschrijving = manual(
    `Aanwijzingen: paginatitel "${clip(title, 100)}"; hoofdkop "${clip(first, 80)}".`,
  );
  A_.pos_type_klant = manual(
    'Particulier of zakelijk? Kijk naar taalgebruik, prijzen en voorbeelden op de site.',
  );

  const years = [];
  for (const p of pages) {
    p.$('time[datetime]').each((_, el) => {
      const m = /(\d{4})/.exec(p.$(el).attr('datetime'));
      if (m) years.push(+m[1]);
    });
    p.$(
      'meta[property="article:published_time"],meta[property="article:modified_time"],meta[property="og:updated_time"]',
    ).each((_, el) => {
      const m = /(\d{4})/.exec(p.$(el).attr('content'));
      if (m) years.push(+m[1]);
    });
  }
  for (const m of schema.json.matchAll(/"date(?:Published|Modified)":"(\d{4})/g)) years.push(+m[1]);
  const lm = home.headers['last-modified'] && new Date(home.headers['last-modified']).getFullYear();
  const copy = /(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/i.exec(home.text);
  const dateSignals = [
    ...years.map((y) => ({ y, src: 'datum bij een bericht' })),
    ...(lm ? [{ y: lm, src: 'Last-Modified header' }] : []),
    ...(copy ? [{ y: +copy[1], src: '©-jaartal in de footer' }] : []),
  ].filter((d) => d.y >= 1995 && d.y <= currentYear + 1);
  if (dateSignals.length) {
    const newest = dateSignals.reduce((a, b) => (b.y > a.y ? b : a));
    const v =
      newest.y >= currentYear ? 'ja' : newest.y === currentYear - 1 ? 'gedeeltelijk' : 'nee';
    A_.pos_content_actueel = A(
      v,
      'onzeker',
      `Meest recente jaartal: ${newest.y} (${newest.src}). ` +
        'Een ©-jaartal zegt weinig: kijk zelf of nieuws, aanbod en prijzen kloppen.',
      {
        s: tri(v),
        w: 1,
        strength:
          'De website ziet er actueel uit: er zijn recente jaartallen of berichten te vinden.',
        improve:
          `De website lijkt al een tijd niet bijgewerkt (laatste jaartal dat we vonden is ${newest.y}); ` +
          'verouderde informatie kost vertrouwen.',
      },
    );
  } else {
    A_.pos_content_actueel = manual(
      'Geen datums of jaartallen gevonden. Kijk zelf naar nieuws, blog, aanbod en prijzen: is alles nog actueel?',
    );
  }

  const nameInTitle = name && title.toLowerCase().includes(name.toLowerCase());
  extras.push({
    section: 'pos',
    id: 'x_h1',
    label: 'Duidelijke hoofdkop op de homepage',
    s: h1s.length === 1 && first.length >= 8 && first.length <= 100 ? 1 : h1s.length ? 0.5 : 0,
    w: 1.5,
    evidence: h1s.length
      ? `H1: "${clip(first, 100)}"${h1s.length > 1 ? ` (+${h1s.length - 1} andere H1)` : ''}`
      : 'Geen H1 gevonden.',
    strength: 'De homepage heeft een duidelijke hoofdkop die meteen vertelt waar de bezoeker is.',
    improve:
      'De homepage heeft geen duidelijke hoofdkop, waardoor bezoekers niet direct zien waar het bedrijf voor staat.',
  });
  extras.push({
    section: 'pos',
    id: 'x_naam',
    label: 'Bedrijfsnaam in de paginatitel',
    s: nameInTitle ? 1 : title ? 0.3 : 0,
    w: 0.7,
    evidence: `Titel: "${clip(title, 100)}"${name ? ` · gezocht naar "${name}"` : ''}`,
    strength: null,
    improve:
      'De bedrijfsnaam staat niet in de paginatitel, terwijl dat de eerste regel is die mensen in Google zien.',
  });
  extras.push({
    section: 'pos',
    id: 'x_meta',
    label: 'Korte omschrijving voor Google aanwezig',
    s: metaDesc.length >= 70 ? 1 : metaDesc ? 0.5 : 0,
    w: 0.7,
    evidence: metaDesc ? `"${clip(metaDesc, 140)}"` : 'Geen meta description.',
    strength: null,
    improve:
      'Er is geen goede korte omschrijving voor Google; die bepaalt mede of iemand doorklikt.',
  });

  /* =========================================================
   * 3. Uitstraling & huisstijl
   * ========================================================= */
  A_.ui_design = manual(
    'Visuele indruk: beoordeel zelf in je browser (laptop én telefoon). Een scanner ziet geen design.',
  );
  A_.ui_huisstijl = manual(
    `Beoordeel zelf. Hulpmiddel: ${
      meta.colors.length
        ? `meest gebruikte kleuren in de CSS: ${meta.colors.join(' ')}`
        : 'geen kleuren uit de CSS gelezen'
    }${meta.fonts.length ? `; lettertypes: ${list(meta.fonts, 5)}` : ''}.`,
  );

  const logoEl = $('img, svg, a, div, span')
    .filter((_, e) =>
      /logo/i.test(
        ($(e).attr('class') || '') +
          ' ' +
          ($(e).attr('id') || '') +
          ' ' +
          ($(e).attr('alt') || '') +
          ' ' +
          ($(e).attr('src') || ''),
      ),
    )
    .first();
  const homeLinkImg = $(
    'header a[href="/"] img, header a[href="/"] svg, header a:first-child img, [role=banner] a img',
  ).first();
  if (logoEl.length || homeLinkImg.length) {
    A_.ui_logo = A(
      'ja',
      'waarschijnlijk',
      `Logo-element gevonden (${clip(
        logoEl.attr('src') || logoEl.attr('class') || homeLinkImg.attr('src') || 'in de header',
        80,
      )}). Kijk even of het ook echt goed zichtbaar is.`,
      {
        s: 1,
        w: 1,
        strength: 'Het logo is zichtbaar aanwezig, waardoor de website direct herkenbaar is.',
      },
    );
  } else {
    A_.ui_logo = A(
      'nee',
      'onzeker',
      'Geen logo-element gevonden in de HTML. Het kan een achtergrondafbeelding zijn: kijk zelf.',
      {
        s: 0,
        w: 1,
        improve:
          'Er is geen duidelijk logo te vinden; een herkenbaar logo bovenaan geeft meteen vertrouwen.',
      },
    );
  }

  A_.ui_lettertype = manual(
    `Beoordeel de leesbaarheid zelf. Gevonden lettertypes: ${
      meta.fonts.length ? list(meta.fonts, 6) : 'onbekend'
    }${meta.fonts.length > 3 ? ' (veel verschillende lettertypes kan onrustig ogen)' : ''}.`,
  );
  A_.ui_beeld = manual(
    'Wat voor beeld krijg je van het bedrijf (modern, betrouwbaar, lokaal, goedkoop…)? Beschrijf het in eigen woorden.',
  );

  const w = home.words,
    ic = imgs.length;
  let balans, balansEv;
  if (ic === 0) {
    balans = 'nee';
    balansEv = 'Geen afbeeldingen gevonden: alleen tekst.';
  } else if (w < 50) {
    balans = 'nee';
    balansEv = `Bijna geen tekst (${w} woorden) bij ${ic} afbeeldingen.`;
  } else {
    const r = w / ic;
    balans = r >= 25 && r <= 400 ? 'ja' : 'gedeeltelijk';
    balansEv = `${w} woorden en ${ic} afbeeldingen (gemiddeld ${Math.round(r)} woorden per afbeelding).`;
  }
  A_.ui_balans = A(
    balans,
    'onzeker',
    balansEv + ' Dit is een cijfermatige schatting: kijk zelf of het prettig oogt.',
    {
      s: tri(balans),
      w: 1,
      strength: 'Er is een goede mix van tekst en beeld.',
      improve:
        'De verhouding tussen tekst en beeld klopt niet helemaal (te weinig tekst of te weinig beeld).',
    },
  );

  let ov = 4;
  const ovWhy = [];
  if (ctx.homeLinks.length > 120) {
    ov--;
    ovWhy.push(`${ctx.homeLinks.length} links op de homepage`);
  }
  if (w > 1800) {
    ov--;
    ovWhy.push(`${w} woorden op de homepage`);
  }
  if ($('h2,h3').length < 2 && w > 400) {
    ov--;
    ovWhy.push('weinig tussenkopjes bij veel tekst');
  }
  if (w < 40) {
    ov--;
    ovWhy.push('bijna geen inhoud');
  }
  ov = Math.max(1, ov + (ovWhy.length === 0 && $('h2').length >= 3 ? 1 : 0));
  A_.ui_overzicht = A(
    ov,
    'onzeker',
    ovWhy.length
      ? `Aanwijzingen voor drukte: ${ovWhy.join('; ')}.`
      : 'Geen aanwijzingen voor een drukke pagina (aantal links, tekstlengte, kopjes).',
    {
      s: (ov - 1) / 4,
      w: 1,
      strength: 'De homepage is overzichtelijk opgebouwd.',
      improve: 'De homepage voelt druk: veel tekst of veel links tegelijk, met te weinig kopjes.',
    },
  );

  /* =========================================================
   * 4. Gebruiksvriendelijkheid
   * ========================================================= */
  const headerEl = $('header, [role=banner]').first();
  const headerOk =
    headerEl.length && (headerEl.find('a').length >= 3 || headerEl.find('nav').length);
  A_.ux_header = headerEl.length
    ? A(
        headerOk ? 'ja' : 'gedeeltelijk',
        'onzeker',
        headerOk
          ? `Header met ${headerEl.find('a').length} links gevonden.`
          : 'Header gevonden maar met weinig inhoud.',
        {
          s: headerOk ? 1 : 0.5,
          w: 1,
          improve:
            'De header (bovenkant) bevat weinig: bezoekers missen daar logo, menu of een contactmogelijkheid.',
        },
      )
    : A(
        'nee',
        'onzeker',
        'Geen <header>-onderdeel gevonden (de site kan het anders hebben opgebouwd).',
        { s: 0.3, w: 1 },
      );

  A_.ux_menu =
    menu.length >= 3
      ? A('ja', 'waarschijnlijk', `Menu met ${menu.length} onderdelen: ${list(menu, 8)}`, {
          s: 1,
          w: 1.5,
          strength: 'Er is een duidelijk menu waarmee bezoekers snel kunnen navigeren.',
        })
      : A(
          'nee',
          'onzeker',
          menu.length
            ? `Slechts ${menu.length} menu-onderdeel gevonden.`
            : 'Geen menu in de HTML gevonden (kan via JavaScript geladen worden).',
          {
            s: 0,
            w: 1.5,
            improve:
              'Er is geen duidelijk menu te vinden, waardoor bezoekers moeilijk zien wat er nog meer op de site staat.',
          },
        );

  if (menu.length >= 2) {
    const v = menu.length <= 8 ? 'ja' : menu.length <= 12 ? 'gedeeltelijk' : 'nee';
    A_.ux_menustructuur = A(
      v,
      'onzeker',
      `${menu.length} hoofdonderdelen: ${list(menu, 12)}. ` +
        'Of de volgorde en namen logisch zijn moet je zelf beoordelen.',
      {
        s: tri(v),
        w: 0.7,
        improve: `Het menu heeft veel onderdelen (${menu.length}); minder keuze maakt kiezen makkelijker.`,
      },
    );
  } else
    A_.ux_menustructuur = manual(
      'Geen menu uit de HTML te lezen: beoordeel de menustructuur zelf.',
    );

  const burgerPattern = new RegExp(
    [
      'hamburger|burger|menu-toggle|nav-toggle|navbar-toggler|mobile-menu|',
      'menu-trigger|toggle-menu|menu-button|menu-icon|offcanvas',
    ].join(''),
    'i',
  );
  const burger =
    burgerPattern.test(allHtml + css) ||
    $(
      'button[aria-label*="menu" i], button[aria-controls*="nav" i], button[aria-controls*="menu" i]',
    ).length > 0;
  A_.ux_hamburger = burger
    ? A(
        'ja',
        'waarschijnlijk',
        'Code voor een uitklapmenu voor mobiel gevonden. Controleer dit door je browservenster smal te maken.',
        { s: 1, w: 0.7 },
      )
    : A(
        'nee',
        'onzeker',
        'Geen hamburgermenu gevonden in de code. Maak je browservenster smal om te zien hoe het menu op mobiel werkt.',
        { s: 0.4, w: 0.7 },
      );

  const footer = $('footer, [role=contentinfo]').first();
  const ftxt = footer.text();
  const footContact =
    footer.length &&
    (footer.find('a[href^="tel:"],a[href^="mailto:"]').length ||
      NL_PHONE.test(ftxt) ||
      /@[\w-]+\.\w+|\b\d{4}\s?[A-Z]{2}\b/.test(ftxt));
  A_.ux_footer = footContact
    ? A(
        'ja',
        'waarschijnlijk',
        'Footer met contactgegevens (telefoon, e-mail of adres) gevonden.',
        {
          s: 1,
          w: 1,
          strength: 'In de footer staan duidelijke contactgegevens.',
        },
      )
    : A(
        'nee',
        'waarschijnlijk',
        footer.length
          ? 'Footer gevonden, maar zonder telefoonnummer, e-mailadres of adres.'
          : 'Geen footer gevonden.',
        {
          s: 0,
          w: 1,
          improve:
            'Onderaan de website ontbreken contactgegevens; bezoekers verwachten daar telefoon, e-mail en adres.',
        },
      );

  const termsLinks = allLinks.filter((l) =>
    /(algemene\s)?voorwaarden|retour|annulering|verzend|levering|disclaimer/i.test(
      l.text + ' ' + l.path,
    ),
  );
  const terms = termsLinks.length;
  A_.ux_voorwaarden = terms
    ? A(
        'ja',
        'waarschijnlijk',
        `Gevonden: ${list(uniq(termsLinks.map((l) => l.text || l.path)), 4)}`,
        { s: 1, w: 0.7 },
      )
    : isShop
      ? A(
          'nee',
          'waarschijnlijk',
          'Er lijkt een webshop te zijn maar er is geen link naar voorwaarden of retour gevonden.',
          {
            s: 0,
            w: 1,
            improve:
              'Voor een webshop zijn algemene voorwaarden en retourinformatie wettelijk verplicht, ' +
              'maar die zijn niet makkelijk te vinden.',
          },
        )
      : A(
          'niet van toepassing',
          'onzeker',
          'Geen voorwaarden gevonden en geen webshop herkend. Heeft het bedrijf wel algemene ' +
            'voorwaarden voor diensten? Dan is "nee" passend.',
          {},
        );

  const searchEl = pages.some(
    (p) =>
      p.$(
        [
          'input[type=search], [role=search], form[action*="search"], form[action*="zoek"], ',
          'input[name=s], input[name=q], input[placeholder*="zoek" i], ',
          'input[placeholder*="search" i]',
        ].join(''),
      ).length,
  );
  A_.ux_zoek = A(
    searchEl ? 'ja' : 'nee',
    'waarschijnlijk',
    searchEl
      ? 'Zoekveld gevonden.'
      : 'Geen zoekveld gevonden. Bij een kleine website is dat vaak ook niet nodig.',
    { s: searchEl ? 1 : 0.5, w: 0.3 },
  );

  const crumbs =
    pages.some(
      (p) =>
        p.$(
          '[aria-label*="breadcrumb" i], [class*="breadcrumb"], .crumbs, nav.rank-math-breadcrumb',
        ).length,
    ) || schema.types.has('BreadcrumbList');
  A_.ux_breadcrumbs = A(
    crumbs ? 'ja' : 'nee',
    'waarschijnlijk',
    crumbs
      ? 'Breadcrumbs gevonden.'
      : `Geen broodkruimelpad gevonden op ${pages.length} gescande pagina('s).`,
    { s: crumbs ? 1 : 0.4, w: 0.3 },
  );

  const imgAltRatio = imgs.length ? (imgs.length - imgsNoAlt.length) / imgs.length : 1;
  const lang = $('html').attr('lang');
  const fields = $(
    'input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea',
  ).toArray();
  const fieldsLabelled = fields.filter(
    (f) =>
      $(f).attr('aria-label') ||
      $(f).attr('placeholder') ||
      $(f).attr('title') ||
      ($(f).attr('id') && $(`label[for="${$(f).attr('id')}"]`).length) ||
      $(f).closest('label').length,
  ).length;
  const hasMain = $('main, [role=main]').length > 0;
  let accScore =
    0.4 * imgAltRatio +
    0.2 * (lang ? 1 : 0) +
    0.2 * (hasMain ? 1 : 0) +
    0.2 * (fields.length ? fieldsLabelled / fields.length : 1);
  let accEv =
    `alt-teksten: ${Math.round(imgAltRatio * 100)}% van ${imgs.length} afbeeldingen; ` +
    `taal ingesteld: ${lang ? 'ja (' + lang + ')' : 'nee'}; ` +
    `hoofdgebied (<main>): ${hasMain ? 'ja' : 'nee'}; ` +
    `formuliervelden met label: ${fields.length ? fieldsLabelled + '/' + fields.length : 'geen velden'}.`;
  let accConf = 'onzeker';
  if (psi && typeof psi.accessibility === 'number') {
    accScore = 0.5 * accScore + 0.5 * psi.accessibility;
    accConf = 'waarschijnlijk';
    accEv +=
      ` Google Lighthouse toegankelijkheid: ${Math.round(psi.accessibility * 100)}/100` +
      `${psi.contrast === 0 ? ' (te laag kleurcontrast gevonden)' : ''}.`;
  } else
    accEv +=
      ' Kleurcontrast is niet gemeten: controleer dat zelf (bijv. met een contrast-checker).';
  const accV = accScore >= 0.8 ? 'ja' : accScore >= 0.5 ? 'gedeeltelijk' : 'nee';
  A_.ux_toegankelijk = A(accV, accConf, accEv, {
    s: accScore,
    w: 1,
    strength:
      'De website houdt er goed rekening mee dat iedereen hem kan gebruiken (alt-teksten, taal, labels).',
    improve:
      'De website is niet voor iedereen goed bruikbaar: afbeeldingen missen een beschrijving ' +
      'of formulieren missen labels (belangrijk voor slechtzienden).',
  });

  A_.ux_aanbod = manual(
    `Begrijp je het binnen 5 seconden? Hulpmiddel: hoofdkop "${clip(first, 80)}"` +
      `${metaDesc ? `; omschrijving "${clip(metaDesc, 120)}"` : ''}.`,
  );

  const euros = allText.match(/€\s?\d[\d.,]*|\d[\d.,]*\s?(?:euro|eur)\b/gi) || [];
  const priceWords =
    /\bprijs|prijzen|tarief|tarieven|prijslijst|vanaf\s*€|offerte op maat|kosten\b/i.test(allText);
  const pv = euros.length >= 2 ? 'ja' : euros.length === 1 || priceWords ? 'gedeeltelijk' : 'nee';
  A_.ux_prijzen = A(
    pv,
    'waarschijnlijk',
    euros.length
      ? `${euros.length} prijs(en) gevonden, bijv. ${list(uniq(euros), 3)}.`
      : priceWords
        ? 'Wel woorden als "prijs" of "tarief", maar geen bedragen gevonden.'
        : "Geen prijzen of bedragen gevonden op de gescande pagina's.",
    {
      s: tri(pv),
      w: 1,
      strength: 'Er staan prijzen of prijsindicaties op de site, wat bezoekers vertrouwen geeft.',
      improve:
        'Er staan geen prijzen of prijsindicaties op de site; bezoekers haken daardoor sneller af. ' +
        'Ook "vanaf-prijzen" helpen al.',
    },
  );

  const hoursFound = HOURS_RE.test(allText) || /openingHours/.test(schema.json);
  A_.ux_openingstijden = hoursFound
    ? A('ja', 'waarschijnlijk', 'Openingstijden of bereikbaarheidstijden gevonden in de tekst.', {
        s: 1,
        w: 0.7,
        strength: 'Openingstijden zijn duidelijk te vinden.',
      })
    : A(
        'nee',
        'onzeker',
        'Geen openingstijden gevonden. Heeft het bedrijf geen vaste tijden of is het alleen online? ' +
          'Kies dan "niet van toepassing".',
        {
          s: 0.3,
          w: 0.7,
          improve:
            'Openingstijden of bereikbaarheidstijden ontbreken; bezoekers willen weten wanneer ze ' +
            'iemand kunnen bereiken.',
        },
      );

  const headerContact = allLinks.filter(
    (l) =>
      l.inHeader &&
      (l.protocol === 'tel:' || l.protocol === 'mailto:' || /contact/i.test(l.text + l.path)),
  );
  const navContact = ctx.homeLinks.some(
    (l) => l.inNav && /contact|offerte|afspraak/i.test(l.text + l.path),
  );
  const anyContactLink = allLinks.some((l) => /contact/i.test(l.text + l.path));
  const cc =
    headerContact.length || navContact
      ? 'ja'
      : anyContactLink || tel.length || mail.length
        ? 'gedeeltelijk'
        : 'nee';
  A_.ux_contact = A(
    cc,
    'waarschijnlijk',
    cc === 'ja'
      ? 'Contactlink of telefoonnummer staat bovenaan/in het menu.'
      : cc === 'gedeeltelijk'
        ? 'Contactmogelijkheid gevonden, maar niet bovenaan of in het menu: je moet zoeken.'
        : 'Geen contactlink, telefoonnummer of e-mailadres gevonden.',
    {
      s: tri(cc),
      w: 1.5,
      strength: 'Contact opnemen is snel en makkelijk: de gegevens staan bovenaan of in het menu.',
      improve:
        'Contactgegevens zijn lastig te vinden; zet telefoon of een contactknop bovenaan elke pagina.',
    },
  );

  /* =========================================================
   * 5. Conversie & actiegerichtheid
   * ========================================================= */
  const ctaEls = $('a, button, [role=button], input[type=submit]').toArray();
  const ctas = [];
  ctaEls.forEach((e, i) => {
    const $e = $(e);
    const t = ($e.attr('value') || $e.text() || $e.attr('aria-label') || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (t && t.length <= 50 && CTA_RE.test(t) && !/^cookie|privacy/i.test(t))
      ctas.push({
        t,
        top: i < 25 || $e.closest('header,[role=banner]').length > 0,
      });
  });
  const ctaTop = ctas.filter((c) => c.top);
  const ctaTexts = uniq(ctas.map((c) => c.t));
  const cz = ctaTop.length ? 'ja' : ctas.length ? 'gedeeltelijk' : 'nee';
  A_.cv_actie_zichtbaar = A(
    cz,
    'waarschijnlijk',
    cz === 'ja'
      ? `Actieknop bovenaan: "${ctaTop[0].t}".`
      : cz === 'gedeeltelijk'
        ? `Actieknoppen gevonden, maar pas verderop op de pagina: ${list(ctaTexts, 3)}.`
        : 'Geen duidelijke actieknop gevonden (zoals "offerte aanvragen" of "bel ons").',
    {
      s: tri(cz),
      w: 2,
      strength:
        'De belangrijkste actie (zoals contact opnemen of een offerte aanvragen) staat meteen in beeld.',
      improve:
        'Er is op de homepage geen duidelijke actieknop; vertel bezoekers wat ze nu moeten doen.',
    },
  );
  A_.cv_actie_direct = manual(
    'Voer de actie zelf uit (bijv. tot aan het invullen van het formulier). Lukt het zonder omwegen?',
  );
  A_.cv_cta = ctaTexts.length
    ? A(
        list(ctaTexts, 8),
        'waarschijnlijk',
        `${ctas.length} knop(pen)/link(s) herkend als call-to-action.`,
      )
    : A(
        'Geen duidelijke call-to-actions gevonden.',
        'onzeker',
        'Controleer zelf of er knoppen zijn die niet als zodanig herkend zijn.',
      );
  const gv = ctaTexts.length >= 3 ? 'ja' : ctaTexts.length ? 'gedeeltelijk' : 'nee';
  A_.cv_gestimuleerd = A(
    gv,
    'onzeker',
    `${ctaTexts.length} verschillende actie-teksten gevonden. Of je je echt aangespoord voelt, beoordeel je zelf.`,
    {
      s: tri(gv),
      w: 1,
      improve:
        'De website spoort bezoekers weinig aan tot actie; meer duidelijke knoppen met een concrete boodschap helpen.',
    },
  );

  const contact = [];
  const contactEv = [];
  if (tel.length || NL_PHONE.test(allText)) {
    contact.push('telefoon');
    contactEv.push(tel.length ? 'tel:-link' : 'telefoonnummer in tekst');
  }
  if (mail.length || /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(allText)) {
    contact.push('e-mail');
    contactEv.push(mail.length ? 'mailto:-link' : 'e-mailadres in tekst');
  }
  if (hasForm) {
    contact.push('contactformulier');
    contactEv.push('formulier');
  }
  if (CHAT_RE.test(allHtml)) {
    contact.push('chatbot');
    contactEv.push('chat-widget');
  }
  if (/wa\.me|api\.whatsapp\.com|whatsapp:\/\//i.test(allHtml)) {
    contact.push('whatsapp');
    contactEv.push('WhatsApp-link');
  }
  A_.cv_contactmiddelen = A(
    contact,
    contact.length ? 'waarschijnlijk' : 'onzeker',
    contact.length
      ? `Gevonden: ${contactEv.join(', ')}. Social-DM of een afspraaktool kies je zelf bij "anders".`
      : 'Geen contactmiddelen herkend.',
    {
      s: Math.min(1, contact.length / 3),
      w: 1.5,
      strength: `Bezoekers kunnen op meerdere manieren contact opnemen (${contact.join(', ')}).`,
      improve:
        'Er is maar weinig keuze om contact op te nemen; bied minimaal telefoon én e-mail of een formulier.',
    },
  );

  const hm = HOURS_RE.exec(allText);
  A_.cv_bereikbaar = hm
    ? A(
        '…' + clip(allText.slice(Math.max(0, hm.index - 40), hm.index + 160), 200) + '…',
        'onzeker',
        'Fragment uit de tekst; controleer of dit echt de bereikbaarheid beschrijft.',
      )
    : A(
        'Niet gevonden: er staat geen duidelijke vermelding van dagen en tijden.',
        'onzeker',
        'Geen openingstijden of bereikbaarheidstijden in de tekst herkend.',
      );

  /* =========================================================
   * 6. Contentkwaliteit & E-E-A-T
   * ========================================================= */
  A_.ee_formulier = A(
    hasForm ? 'ja' : 'nee',
    'waarschijnlijk',
    hasForm
      ? 'Formulier (met tekstvak of e-mailveld) gevonden.'
      : "Geen contactformulier gevonden op de gescande pagina's.",
    {
      s: hasForm ? 1 : 0.3,
      w: 0.7,
      strength: 'Er is een contactformulier: bezoekers kunnen direct een bericht sturen.',
    },
  );
  A_.ee_formulier_werkt = A(
    'niet getest',
    'handmatig',
    'De scanner verstuurt NOOIT formulieren (er zouden echte berichten bij de ondernemer ' +
      'binnenkomen). Wil je het testen, doe dat dan zelf met een duidelijk testbericht.',
  );

  const revHits = uniq(
    (allText + ' ' + allHtml).match(new RegExp(REVIEW_RE.source, 'gi')) || [],
  ).slice(0, 5);
  const hasRating = /AggregateRating|Review/.test(schema.json);
  const rv = revHits.length || hasRating;
  A_.ee_reviews = A(
    rv ? 'ja' : 'nee',
    'waarschijnlijk',
    rv
      ? `Aanwijzingen: ${list(
          [...revHits, ...(hasRating ? ['sterren-markup (schema.org)'] : [])],
          6,
        )}. Kijk zelf of het echte reviews zijn en niet alleen het woord.`
      : 'Geen reviews, testimonials of keurmerken herkend.',
    {
      s: rv ? 1 : 0,
      w: 1.5,
      strength: 'Er zijn reviews, ervaringen of keurmerken te zien, wat het vertrouwen vergroot.',
      improve:
        'Er zijn geen reviews, klantverhalen of keurmerken te zien; juist die laten twijfelende ' +
        'bezoekers over de streep trekken.',
    },
  );

  const authSignals = [];
  if (aboutPage) authSignals.push('over-ons pagina');
  if (
    /\bsinds\s+(19|20)\d{2}|\b\d{1,2}\s*\+?\s*jaar ervaring|jarenlange ervaring|familiebedrijf/i.test(
      allText,
    )
  )
    authSignals.push('ervaring/historie genoemd');
  if (
    [
      /gecertificeerd|erkend|\bcertificaat|\bdiploma|geregistreerd|lid van/i,
      /partner van|dealer van|gediplomeerd|\bnen\b|\biso\b|\bvca\b/i,
    ].some((pattern) => pattern.test(allText))
  )
    authSignals.push('certificering/lidmaatschap');
  if (/bekend van|in de media|pers|award|prijs gewonnen|genomineerd|winnaar/i.test(allText))
    authSignals.push('media/prijzen');
  if (/\bportfolio|referenties|cases?\b|onze klanten|projecten/i.test(allText))
    authSignals.push('referenties/cases');
  const av = authSignals.length >= 3 ? 'ja' : authSignals.length ? 'gedeeltelijk' : 'nee';
  A_.ee_autoriteit = A(
    av,
    'onzeker',
    authSignals.length
      ? `Signalen: ${authSignals.join(', ')}.`
      : 'Geen signalen van deskundigheid gevonden (certificaten, ervaring, referenties, media).',
    {
      s: tri(av),
      w: 1,
      strength: 'Het bedrijf toont zijn deskundigheid (ervaring, certificaten of referenties).',
      improve:
        'De website laat nauwelijks zien waarom het bedrijf een expert is: vertel over ervaring, ' +
        'opleiding, certificaten of eerdere klanten.',
    },
  );

  const trust = [];
  if (https.finalIsHttps && !https.certError) trust.push('HTTPS');
  if (/\bkvk\b|kamer van koophandel/i.test(allText)) trust.push('KvK-nummer');
  if (/\bbtw[-\s]?(nummer|nr)?\b/i.test(allText)) trust.push('btw-nummer');
  if (/\b\d{4}\s?[A-Z]{2}\b/.test(allText) || /PostalAddress/.test(schema.json))
    trust.push('adres');
  if (tel.length || NL_PHONE.test(allText)) trust.push('telefoon');
  if (allLinks.some((l) => /privacy/i.test(l.text + l.path))) trust.push('privacyverklaring');
  if (terms) trust.push('voorwaarden');
  if (rv) trust.push('reviews/keurmerken');
  const bv = trust.length >= 6 ? 'ja' : trust.length >= 3 ? 'gedeeltelijk' : 'nee';
  A_.ee_betrouwbaarheid = A(
    bv,
    'onzeker',
    `Betrouwbaarheidssignalen: ${trust.length ? trust.join(', ') : 'geen'} (${trust.length} van 8).`,
    {
      s: tri(bv),
      w: 1.5,
      strength:
        'Bedrijfsgegevens zoals adres, KvK en privacyverklaring staan duidelijk op de site.',
      improve:
        'Belangrijke betrouwbaarheidsgegevens ontbreken (zoals KvK-nummer, adres of privacyverklaring).',
    },
  );

  A_.ee_onderscheid = manual(
    'Wat maakt dit bedrijf anders dan concurrenten in dezelfde plaats/branche? ' +
      'Zoek naar een eigen verhaal, specialisatie of belofte (USP).',
  );
  A_.ee_professioneel = A(
    Math.max(1, Math.min(10, Math.round(1 + 9 * (trust.length / 8) * 0.6 + 9 * 0.4 * accScore))),
    'onzeker',
    'Alleen een grove schatting uit betrouwbaarheidssignalen en toegankelijkheid. ' +
      'Lees de teksten zelf: kloppen ze, zijn er taalfouten, voelt het professioneel?',
    {},
  );

  const fp =
    ((allText.match(/\b(wij|ons|onze|we|ik|mijn|mij)\b/gi) || []).length /
      Math.max(
        1,
        pages.reduce((n, p) => n + p.words, 0),
      )) *
    1000;
  const persS = (aboutPage ? 1 : 0) + (fp >= 8 ? 1 : 0);
  const pv2 = persS === 2 ? 'ja' : persS === 1 ? 'gedeeltelijk' : 'nee';
  A_.ee_persoonlijk = A(
    pv2,
    'onzeker',
    `${aboutPage ? 'Over-ons pagina aanwezig' : 'Geen over-ons pagina gevonden'}; ` +
      `${fp.toFixed(0)} keer "wij/ik/ons" per 1000 woorden. ` +
      "Kijk ook of er echte foto's van mensen zijn.",
    {
      s: tri(pv2),
      w: 1,
      strength:
        'De website komt persoonlijk over: er is een eigen verhaal en spreekt de bezoeker direct aan.',
      improve:
        "De website komt wat afstandelijk over; een eigen verhaal en foto's van het team maken het persoonlijker.",
    },
  );

  /* =========================================================
   * 7. Technische basis
   * ========================================================= */
  A_.te_social_door = social.length
    ? A('ja', 'zeker', `Gevonden: ${social.map((s) => s.net).join(', ')}.`, {
        s: 1,
        w: 0.7,
        strength: `De website verwijst door naar social media (${social.map((s) => s.net).join(', ')}).`,
      })
    : A('nee', 'waarschijnlijk', 'Geen links naar social media gevonden.', {
        s: 0.2,
        w: 0.7,
        improve:
          'Er wordt niet doorverwezen naar social media; bezoekers kunnen het bedrijf daar niet verder volgen.',
      });
  A_.te_social_terug = A(
    'onbekend',
    'handmatig',
    'Social media-platforms zijn niet automatisch uit te lezen. Open ' +
      `${social.length ? list(social.map((s) => s.net)) : 'de kanalen'} ` +
      'en kijk of de website in de bio staat.',
  );
  A_.te_social_actief = manual(
    'Kijk per kanaal naar de datum van het laatste bericht.' +
      `${social.length ? ' Links: ' + social.map((s) => s.url).join(' · ') : ''}`,
  );
  A_.te_google = manual(
    'Zoek op de bedrijfsnaam (plus plaats) in Google, in een privévenster. ' +
      'Staat de eigen website bovenaan? Gebruik de zoeklink onder "Handmatige hulpmiddelen".',
  );

  // Snelheid
  const total = home.timing.total,
    ttfb = home.timing.ttfb;
  let snelV, snelEv, snelConf;
  const lcp = psi?.fieldLcp || psi?.lcp;
  if (lcp) {
    snelV = lcp <= 3000 ? 'ja' : lcp <= 5000 ? 'gedeeltelijk' : 'nee';
    snelConf = 'waarschijnlijk';
    snelEv =
      `Google PageSpeed (mobiel): grootste inhoud zichtbaar na ${(lcp / 1000).toFixed(1)}s` +
      `${psi.fieldLcp ? ' (echte bezoekers)' : ' (labtest)'}; ` +
      `prestatiescore ${Math.round((psi.performance || 0) * 100)}/100. ` +
      `Eigen meting: server reageert in ${Math.round(ttfb)}ms.`;
  } else {
    snelV =
      total < 1500 && scripts <= 15 ? 'ja' : total > 3500 || scripts > 40 ? 'nee' : 'gedeeltelijk';
    snelConf = 'onzeker';
    snelEv =
      `Eigen meting: server reageert na ${Math.round(ttfb)}ms, ` +
      `pagina binnen na ${Math.round(total)}ms (${Math.round(home.bytes / 1024)} KB HTML, ${scripts} scripts). ` +
      'Dit is niet de echte laadtijd in een browser: test zelf op pagespeed.web.dev.';
  }
  A_.te_snel = A(snelV, snelConf, snelEv, {
    s: tri(snelV),
    w: 2,
    strength: 'De website laadt snel.',
    improve:
      'De website laadt traag; bezoekers haken af als een pagina meer dan 3 seconden nodig heeft.',
  });

  // Responsive
  const viewport = $('meta[name=viewport]').attr('content') || '';
  const mq = (css.match(/@media[^{]*(max|min)-width/gi) || []).length;
  const fw =
    /bootstrap|tailwind|elementor|divi|avada|foundation|bulma|wix|squarespace|webflow|astra|generatepress/i.test(
      allHtml + css,
    );
  const hasSrcset = $('img[srcset], picture source').length > 0;
  let respV = /width=device-width/i.test(viewport)
    ? mq >= 2 || fw
      ? 'ja'
      : 'gedeeltelijk'
    : 'nee';
  let respEv =
    `viewport-instelling: ${viewport ? 'ja' : 'NEE'}; ` +
    `CSS-regels voor verschillende schermbreedtes: ${mq}` +
    `${fw ? '; responsive framework herkend' : ''}` +
    `${hasSrcset ? '; afbeeldingen in meerdere formaten' : ''}.`;
  let respConf = 'onzeker';
  if (psi && typeof psi.viewport === 'number') {
    respConf = 'waarschijnlijk';
    if (psi.viewport === 0) respV = 'nee';
    if (psi.tapTargets === 0 && respV === 'ja') respV = 'gedeeltelijk';
    respEv +=
      ` Google: viewport ${psi.viewport ? 'ok' : 'NIET ok'}` +
      `${psi.tapTargets === 0 ? ', knoppen te klein/dicht op elkaar' : ''}.`;
  } else respEv += ' Controleer zelf op je telefoon of in je browser met F12 → apparaat-weergave.';
  A_.te_responsive = A(respV, respConf, respEv, {
    s: tri(respV),
    w: 2,
    strength: 'De website past zich goed aan op telefoon, tablet en laptop.',
    improve: 'De website past zich niet goed aan op een telefoon; veel bezoekers komen via mobiel.',
  });

  // HTTPS
  const mixed = pages.reduce(
    (n, p) =>
      n +
      p.$(
        [
          'img[src^="http://"], script[src^="http://"], ',
          'link[rel=stylesheet][href^="http://"], iframe[src^="http://"], ',
          'source[src^="http://"]',
        ].join(''),
      ).length,
    0,
  );
  if (https.certError) {
    A_.te_https = A('nee', 'zeker', `Beveiligingsprobleem: ${https.certError.message}`, {
      s: 0,
      w: 3,
      improve:
        'Het beveiligingscertificaat (HTTPS) is ongeldig; browsers tonen een waarschuwing ' +
        'en bezoekers vertrouwen de site niet.',
    });
  } else if (https.finalIsHttps) {
    const tips = [];
    if (https.httpReachable && !https.httpRedirectsToHttps)
      tips.push('de oude http-versie stuurt niet door naar https');
    if (mixed) tips.push(`${mixed} onveilige bron(nen) op een https-pagina (mixed content)`);
    if (!https.hsts) tips.push('HSTS ontbreekt (kleine verbetering)');
    A_.te_https = A(
      'ja',
      'zeker',
      'De website draait op https met een geldig certificaat.' +
        `${tips.length ? ' Aandachtspunt: ' + tips.join('; ') + '.' : ''}`,
      {
        s: tips.some((t) => /niet door|onveilig/.test(t)) ? 0.7 : 1,
        w: 3,
        strength: 'De website is beveiligd met HTTPS (het slotje in de adresbalk).',
        improve: mixed
          ? 'De website is beveiligd, maar laadt nog onveilige onderdelen mee; daardoor kan het slotje verdwijnen.'
          : 'De oude http-versie stuurt bezoekers niet automatisch door naar de beveiligde versie.',
      },
    );
  } else {
    A_.te_https = A('nee', 'zeker', 'De website wordt geladen via onbeveiligd http.', {
      s: 0,
      w: 3,
      improve:
        'De website is niet beveiligd met HTTPS: browsers waarschuwen bezoekers en Google waardeert dit lager.',
    });
  }

  // Cookies
  const consent = CONSENT_RE.test(allHtml) || $('[id*="cookie" i],[class*="cookie" i]').length > 0;
  const trackers = TRACKER_RE.test(allHtml);
  A_.te_cookie = consent
    ? A(
        'ja',
        'waarschijnlijk',
        'Code van een cookiemelding gevonden. Controleer zelf of de melding goed zichtbaar is ' +
          'en je echt kunt weigeren.',
        { s: 1, w: 1.5, strength: 'Er is een cookiemelding aanwezig.' },
      )
    : A(
        'nee',
        'onzeker',
        `Geen cookiemelding in de code gevonden${
          trackers
            ? ', terwijl er wel meetcode (zoals Google Analytics of Facebook-pixel) op staat'
            : ''
        }. Meldingen worden soms pas na het laden getoond: ` +
          'open de site in een privévenster om het te zien.',
        {
          s: trackers ? 0 : 0.5,
          w: 1.5,
          improve: trackers
            ? 'Er wordt gemeten (bijv. Google Analytics) zonder zichtbare cookiemelding; ' +
              'dat is volgens de Nederlandse regels niet toegestaan.'
            : 'Er is geen cookiemelding gevonden; controleer of die nodig is.',
        },
      );

  // Technische fouten
  const issues = [];
  if (linkCheck.broken.length)
    issues.push(
      `${linkCheck.broken.length} kapotte link(s)/afbeelding(en): ${list(
        linkCheck.broken.map(
          (b) => b.href.replace(/^https?:\/\//, '') + ' (' + (b.status || 'geen antwoord') + ')',
        ),
        3,
      )}`,
    );
  if (mixed) issues.push(`${mixed} onveilige bron(nen) (mixed content)`);
  if (
    /lorem ipsum|dolor sit amet|under construction|coming soon|in aanbouw|binnenkort online/i.test(
      allText,
    )
  )
    issues.push('plaatshoudertekst of "in aanbouw"-melding');
  if (!title) issues.push('geen paginatitel');
  if (imgs.length >= 4 && imgsNoAlt.length / imgs.length > 0.5)
    issues.push(`${imgsNoAlt.length} van ${imgs.length} afbeeldingen zonder alt-tekst`);
  if (home.status >= 400) issues.push(`homepage geeft statuscode ${home.status}`);
  const fv = issues.length === 0 ? 'geen' : issues.length <= 2 ? 'enkele' : 'meerdere';
  A_.te_fouten = A(
    fv,
    'waarschijnlijk',
    `Steekproef van ${linkCheck.checked} links/afbeeldingen. ` +
      `${issues.length ? 'Gevonden: ' + issues.join('; ') + '.' : 'Geen fouten gevonden.'} ` +
      'Fouten die pas in de browser optreden (zoals JavaScript-fouten) ziet de scanner niet: ' +
      'klik zelf even rond.',
    {
      s: tri(fv),
      w: 2,
      strength: 'We vonden geen kapotte links of andere zichtbare technische fouten.',
      improve:
        'Er zijn technische foutjes gevonden' +
        `${linkCheck.broken.length ? ` (o.a. ${linkCheck.broken.length} kapotte link(s))` : ''}; ` +
        'die wekken wantrouwen en verwarren bezoekers.',
    },
  );
  A_.te_beste = manual(
    'Wat is het sterkste punt van de website? Gebruik de sterke punten uit de scan als startpunt.',
  );

  /* =========================================================
   * 7b. Social, reviews, SEO & GEO
   * ========================================================= */
  const tl = title.length;
  const tv = tl >= 25 && tl <= 65 ? 'ja' : tl ? 'gedeeltelijk' : 'nee';
  A_.sr_title = A(
    tv,
    'zeker',
    title
      ? `"${clip(title, 100)}" (${tl} tekens; ideaal 30–60).${name && !nameInTitle ? ' Bedrijfsnaam ontbreekt.' : ''}`
      : 'Geen titel gevonden.',
    {
      s: tri(tv),
      w: 1,
      strength: 'De paginatitel is goed gekozen en past in Google.',
      improve: 'De paginatitel (de blauwe regel in Google) is te kort, te lang of ontbreekt.',
    },
  );
  const ml = metaDesc.length;
  const mv = ml >= 70 && ml <= 165 ? 'ja' : ml ? 'gedeeltelijk' : 'nee';
  A_.sr_meta = A(
    mv,
    'zeker',
    ml
      ? `${ml} tekens (ideaal 70–160): "${clip(metaDesc, 110)}"`
      : 'Geen meta description gevonden.',
    {
      s: tri(mv),
      w: 1,
      improve: 'De korte omschrijving die Google toont ontbreekt of is niet ideaal van lengte.',
    },
  );
  const hv = h1s.length === 1 ? 'ja' : h1s.length > 1 ? 'gedeeltelijk' : 'nee';
  A_.sr_h1 = A(
    hv,
    'zeker',
    h1s.length
      ? `${h1s.length} H1: ${list(
          h1s.map((h) => '"' + clip(h, 60) + '"'),
          3,
        )}`
      : 'Geen H1 gevonden.',
    { s: tri(hv), w: 1 },
  );
  const noindex =
    /noindex/i.test($('meta[name=robots]').attr('content') || '') ||
    /noindex/i.test(home.headers['x-robots-tag'] || '');
  const rob = parseRobots(robots.text);
  const blockedAll = rob.isBlocked('*');
  A_.sr_index = A(
    noindex || blockedAll ? 'nee' : 'ja',
    'zeker',
    noindex
      ? 'De pagina staat op "noindex": Google mag hem niet tonen!'
      : blockedAll
        ? 'robots.txt blokkeert de hele site voor zoekmachines!'
        : `Geen blokkade gevonden${robots.ok ? '' : ' (geen robots.txt aanwezig)'}.`,
    {
      s: noindex || blockedAll ? 0 : 1,
      w: 3,
      improve:
        'Zoekmachines worden geblokkeerd: de website kan niet in Google verschijnen. Dit moet direct opgelost.',
    },
  );
  A_.sr_sitemap = A(
    sitemap.ok ? 'ja' : 'nee',
    'zeker',
    sitemap.ok ? 'sitemap.xml gevonden (of vermeld in robots.txt).' : 'Geen sitemap.xml gevonden.',
    {
      s: sitemap.ok ? 1 : 0.3,
      w: 0.7,
      improve: "Er is geen sitemap; die helpt Google om alle pagina's te vinden.",
    },
  );
  const biz =
    [...schema.types].some((x) =>
      [
        /LocalBusiness|Organization|Corporation|Store|Restaurant|Service|Practice/i,
        /Dentist|Physician|Bakery|Salon|Shop|Agency|Contractor|Plumber/i,
        /Electrician|Hotel|Cafe|Bar|Gym|Clinic/i,
      ].some((pattern) => pattern.test(x)),
    ) ||
    schema.items.some(
      (i) => i && (i.address || i.telephone || i.openingHours || i.openingHoursSpecification),
    );
  const scv = biz ? 'ja' : schema.types.size ? 'gedeeltelijk' : 'nee';
  A_.sr_schema = A(
    scv,
    'zeker',
    schema.types.size
      ? `Gevonden typen: ${list([...schema.types], 6)}.`
      : 'Geen gestructureerde gegevens (schema.org) gevonden.',
    {
      s: tri(scv),
      w: 1,
      strength:
        'Bedrijfsgegevens zijn netjes gestructureerd aangeleverd, handig voor Google en AI.',
      improve:
        'Bedrijfsgegevens zijn niet gestructureerd aangeleverd (schema.org); dat maakt het voor ' +
        'Google en AI lastiger om het bedrijf te begrijpen.',
    },
  );
  const nameHit = name ? allText.toLowerCase().includes(name.toLowerCase()) : null;
  const placeHit = place ? allText.toLowerCase().includes(place.toLowerCase()) : null;
  const napBits = [
    nameHit,
    placeHit,
    tel.length || NL_PHONE.test(allText),
    /\b\d{4}\s?[A-Z]{2}\b/.test(allText),
  ].filter(Boolean).length;
  const nv = napBits >= 4 ? 'ja' : napBits >= 2 ? 'gedeeltelijk' : 'nee';
  A_.sr_nap = A(
    nv,
    'waarschijnlijk',
    `Bedrijfsnaam ${nameHit ? '✔' : '✘'} · plaats "${place || '?'}" ${placeHit ? '✔' : '✘'} · ` +
      `telefoon ${tel.length || NL_PHONE.test(allText) ? '✔' : '✘'} · ` +
      `postcode/adres ${/\b\d{4}\s?[A-Z]{2}\b/.test(allText) ? '✔' : '✘'}`,
    {
      s: tri(nv),
      w: 1.5,
      strength:
        'Naam, plaats en contactgegevens van het bedrijf staan duidelijk op de site, goed voor lokale vindbaarheid.',
      improve:
        'Naam, plaats of contactgegevens staan niet duidelijk op de site; dat schaadt de lokale vindbaarheid.',
    },
  );
  const ar = imgs.length ? imgAltRatio : 1;
  const av2 = ar >= 0.9 ? 'ja' : ar >= 0.5 ? 'gedeeltelijk' : 'nee';
  A_.sr_alt = A(
    av2,
    'zeker',
    `${imgs.length - imgsNoAlt.length} van ${imgs.length} afbeeldingen hebben een alt-tekst.`,
    { s: tri(av2), w: 1 },
  );

  // GEO
  const bots = [
    'GPTBot',
    'ClaudeBot',
    'PerplexityBot',
    'Google-Extended',
    'CCBot',
    'anthropic-ai',
    'OAI-SearchBot',
  ];
  const blockedBots = bots.filter((b) => rob.isBlocked(b));
  const gv2 = blockedBots.length === 0 ? 'ja' : blockedBots.length >= 4 ? 'nee' : 'gedeeltelijk';
  A_.geo_crawlers = A(
    gv2,
    robots.ok ? 'zeker' : 'waarschijnlijk',
    blockedBots.length
      ? `Geblokkeerd in robots.txt: ${blockedBots.join(', ')}.`
      : robots.ok
        ? 'robots.txt blokkeert geen bekende AI-crawlers.'
        : 'Geen robots.txt: AI-crawlers worden dus niet geblokkeerd.',
    {
      s: tri(gv2),
      w: 1,
      improve:
        'AI-zoekmachines (zoals ChatGPT en Perplexity) worden geweerd; daardoor kan het bedrijf ' +
        'daar niet genoemd worden.',
    },
  );
  const faq =
    /FAQPage|Question/.test(schema.json) ||
    pages.some((p) => p.$('details, [class*=faq], [id*=faq]').length) ||
    $('h2,h3')
      .toArray()
      .filter((e) => /\?\s*$/.test($(e).text().trim())).length >= 2;
  const heads = $('h2,h3').length;
  const gsv = faq && heads >= 4 ? 'ja' : faq || heads >= 4 ? 'gedeeltelijk' : 'nee';
  A_.geo_structuur = A(
    gsv,
    'onzeker',
    `${faq ? 'Veelgestelde vragen/vraag-kopjes aanwezig' : 'Geen veelgestelde vragen gevonden'}; ` +
      `${heads} tussenkopjes op de homepage.`,
    {
      s: tri(gsv),
      w: 1,
      strength:
        'De teksten zijn goed opgedeeld met kopjes en vragen, handig voor Google én AI-assistenten.',
      improve:
        'Er staan geen veelgestelde vragen en weinig kopjes op de site; AI-assistenten halen daar hun antwoorden uit.',
    },
  );
  A_.geo_llms = A(
    llms.ok ? 'ja' : 'nee',
    'zeker',
    llms.ok
      ? 'llms.txt aanwezig.'
      : 'Geen llms.txt. Dit is een nieuwe, nog niet algemeen gebruikte afspraak: geen punt van zorg.',
    { s: llms.ok ? 1 : 0.7, w: 0.2 },
  );
  A_.geo_test = manual(
    'Gebruik de GEO-promptkaart onder "Handmatige hulpmiddelen": stel de vragen aan ' +
      'ChatGPT, Gemini, Perplexity en Claude en noteer of het bedrijf genoemd wordt.',
  );
  A_.rev_google = manual(
    'Zoek het bedrijf in Google Maps/Google-zoeken (zie links onder "Handmatige hulpmiddelen") ' +
      'en noteer aantal reviews, gemiddelde en wat opvalt in recente reviews.',
  );
  A_.soc_scorecard = manual(
    social.length
      ? 'Links uit de website:\n' +
          social.map((s) => `${s.net}: ${s.url}`).join('\n') +
          '\nNoteer per kanaal: volgers, datum laatste bericht, kwaliteit.'
      : 'Geen social links op de website gevonden. Zoek zelf of het bedrijf toch ergens actief is.',
  );

  /* =========================================================
   * Overig: signalen voor klantreis / contentadvies
   * ========================================================= */
  const newsletter = pages.some((p) =>
    p
      .$('form')
      .toArray()
      .some((f) =>
        /nieuwsbrief|newsletter|inschrijven/i.test(p.$(f).text() + p.$(f).attr('class')),
      ),
  );
  const hasAccount = allLinks.some((l) => /inloggen|mijn account|account|login/i.test(l.text));
  meta.signals = {
    newsletter,
    hasAccount,
    hasForm,
    social: social.map((s) => s.net),
    ctaTexts,
    trust,
    authSignals,
    faq,
    isShop,
    schemaTypes: [...schema.types],
    title,
    metaDesc,
    h1: first,
    menu,
    words: home.words,
  };

  return { answers: A_, extras, meta };
}

module.exports = { analyze };
