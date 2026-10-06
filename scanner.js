'use strict';
const { crawl } = require('./fetcher');
const { analyze } = require('./analyze');
const { buildScores, deriveChoices, fallbackSummary } = require('./scoring');
const ai = require('./ai');
const { SECTIONS, KLANTREIS } = require('./questionnaire');

const enc = encodeURIComponent;

function helpers(input, url) {
  const q = [input.name, input.place].filter(Boolean).join(' ');
  const n = input.name || '[bedrijfsnaam]', p = input.place || '[plaats]';
  return {
    links: [
      { label: `Google: "${q}"`, url: `https://www.google.com/search?q=${enc(q)}` },
      { label: 'Google Maps (reviews en ratings)', url: `https://www.google.com/maps/search/${enc(q)}` },
      { label: 'PageSpeed Insights (snelheid, mobiel)', url: `https://pagespeed.web.dev/analysis?url=${enc(url)}` },
      { label: 'Wayback Machine (hoe oud is de site?)', url: `https://web.archive.org/web/*/${url}` },
    ],
    geoPrompts: [
      `Wat doet ${n} in ${p}? Wat weet je over dit bedrijf?`,
      `Welke bedrijven in ${p} kun je aanbevelen voor [dienst of product van het bedrijf]? Noem er een paar en leg uit waarom.`,
      `Ik zoek [dienst of product] in de buurt van ${p}. Wie raad je aan?`,
      `Wat zeggen klanten over ${n} in ${p}? Zijn er goede of slechte ervaringen?`,
      `Wat zijn de openingstijden, het adres en de contactgegevens van ${n}?`,
    ],
  };
}

async function runScan(input, log = () => {}) {
  const started = Date.now();
  const ctx = await crawl(input, log);

  if (input.usePsi !== false) {
    log('Google PageSpeed draaien (kan 20–40 seconden duren)…');
    try { ctx.psi = await ai.runPsi(ctx.home.url); log('PageSpeed klaar.'); }
    catch (e) { ctx.psiError = e.message; log('PageSpeed overgeslagen: ' + e.message); }
  }

  log('Vragenlijst invullen op basis van de metingen…');
  const { answers, extras, meta } = analyze(ctx);
  ctx.meta = meta;
  const scores = buildScores(answers, extras);
  deriveChoices(scores, answers);
  const summary = fallbackSummary(answers, extras, meta);

  let aiNote = 'AI uit (geen ANTHROPIC_API_KEY ingesteld): open vragen en klantreis zijn skeletten die je zelf invult.';
  if (ai.isEnabled()) {
    log('AI-concept schrijven (alleen openbare websitetekst)…');
    try { ai.applyDraft(await ai.draft(ctx, answers, scores), answers, summary); aiNote = `AI-concept door ${ai.MODEL}. Alles wat de AI schreef staat als "onzeker" gemarkeerd.`; }
    catch (e) { aiNote = 'AI-concept mislukt (' + e.message + '). Terugval op regels.'; log(aiNote); }
  }

  // Eindvragen invullen vanuit de samenvatting
  const numbered = (arr) => arr.map((t, i) => `${i + 1}. ${t}`).join('\n');
  answers.ei_sterk = { answer: numbered(summary.sterke_punten), confidence: 'onzeker', evidence: 'Voorstel uit de beste meetpunten' + (summary.bron.startsWith('AI') ? ' en AI-concept' : '') + '. Herschrijf in je eigen woorden.' };
  answers.ei_verbeter = { answer: numbered(summary.verbeterpunten), confidence: 'onzeker', evidence: 'Voorstel uit de zwakste meetpunten' + (summary.bron.startsWith('AI') ? ' en AI-concept' : '') + '. Maak ze concreet en opbouwend.' };
  if (!answers.te_beste.answer) {
    answers.te_beste = { answer: summary.sterke_punten[0], confidence: 'onzeker', evidence: 'Gekozen uit het sterkste meetpunt. Beoordeel zelf wat het beste werkt.' };
  }

  const sections = SECTIONS.map((sec) => ({
    id: sec.id, title: sec.title, doel: sec.doel, aanvulling: !!sec.aanvulling, vooraf: !!sec.vooraf,
    questions: sec.questions.map((q) => {
      const a = answers[q.id] || { answer: null, confidence: 'handmatig', evidence: 'Dit beoordeel je zelf.' };
      const out = { id: q.id, text: q.text, type: q.type, options: q.options, labels: q.labels, answer: a.answer ?? null, confidence: a.confidence, evidence: a.evidence, ai: !!a.ai, reviewed: false };
      out.proposal = q.scoreFor ? scores[q.scoreFor] || null : null;
      if (q.type === 'score10' || q.type === 'score5') {
        // Cijfers zijn een VOORSTEL: de stagiair kiest zelf het definitieve cijfer.
        out.suggested = q.scoreFor ? scores[q.scoreFor]?.value ?? null : a.answer;
        out.answer = null;
      }
      return out;
    }),
  }));

  return {
    meta: {
      scannedAt: new Date().toISOString(), durationSec: Math.round((Date.now() - started) / 1000),
      input: { url: input.url, name: input.name, place: input.place }, finalUrl: ctx.home.url,
      pages: ctx.pages.map((p) => p.url), cms: meta.cms, fonts: meta.fonts, colors: meta.colors,
      psi: ctx.psi ? { performance: ctx.psi.performance, accessibility: ctx.psi.accessibility, seo: ctx.psi.seo, lcp: ctx.psi.lcp } : null,
      psiError: ctx.psiError || null, aiNote, warnings: ctx.warnings, linkCheck: { checked: ctx.linkCheck.checked, broken: ctx.linkCheck.broken.length },
      avg: 'Alleen openbare websitecontent is gebruikt. Geen persoonsgegevens, geen formulieren verstuurd.',
    },
    expectations: input.expectations || {},
    sections,
    summary: { ...summary, klantreisLabels: KLANTREIS },
    helpers: helpers(input, ctx.home.url),
    status: 'concept',
  };
}

module.exports = { runScan };