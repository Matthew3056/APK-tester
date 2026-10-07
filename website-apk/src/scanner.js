'use strict';

const { crawl } = require('./fetcher');
const { analyze } = require('./analyze');
const { buildScores, deriveChoices, fallbackSummary } = require('./scoring');
const ai = require('./ai');
const { SECTIONS, KLANTREIS } = require('./questionnaire');

const encode = encodeURIComponent;

function buildHelpers(input, url) {
  const searchQuery = [input.name, input.place].filter(Boolean).join(' ');
  const businessName = input.name || '[bedrijfsnaam]';
  const place = input.place || '[plaats]';

  return {
    links: [
      { label: `Google: "${searchQuery}"`, url: `https://www.google.com/search?q=${encode(searchQuery)}` },
      { label: 'Google Maps (reviews en ratings)', url: `https://www.google.com/maps/search/${encode(searchQuery)}` },
      { label: 'PageSpeed Insights (snelheid, mobiel)', url: `https://pagespeed.web.dev/analysis?url=${encode(url)}` },
      { label: 'Wayback Machine (hoe oud is de site?)', url: `https://web.archive.org/web/*/${url}` },
    ],
    geoPrompts: [
      `Wat doet ${businessName} in ${place}? Wat weet je over dit bedrijf?`,
      `Welke bedrijven in ${place} kun je aanbevelen voor [dienst of product van het bedrijf]? Noem er een paar en leg uit waarom.`,
      `Ik zoek [dienst of product] in de buurt van ${place}. Wie raad je aan?`,
      `Wat zeggen klanten over ${businessName} in ${place}? Zijn er goede of slechte ervaringen?`,
      `Wat zijn de openingstijden, het adres en de contactgegevens van ${businessName}?`,
    ],
  };
}

async function addPageSpeedData(context, input, log) {
  if (input.usePsi === false) return;

  log('Google PageSpeed draaien (kan 20–40 seconden duren)…');
  try {
    context.psi = await ai.runPsi(context.home.url);
    log('PageSpeed klaar.');
  } catch (error) {
    context.psiError = error.message;
    log('PageSpeed overgeslagen: ' + error.message);
  }
}

function addSummaryAnswers(answers, summary) {
  const numbered = (items) => items.map((item, index) => `${index + 1}. ${item}`).join('\n');
  const aiEvidence = summary.bron.startsWith('AI') ? ' en AI-concept' : '';

  answers.ei_sterk = {
    answer: numbered(summary.sterke_punten),
    confidence: 'onzeker',
    evidence: 'Voorstel uit de beste meetpunten' + aiEvidence + '. Herschrijf in je eigen woorden.',
  };
  answers.ei_verbeter = {
    answer: numbered(summary.verbeterpunten),
    confidence: 'onzeker',
    evidence: 'Voorstel uit de zwakste meetpunten' + aiEvidence + '. Maak ze concreet en opbouwend.',
  };

  if (!answers.te_beste.answer) {
    answers.te_beste = {
      answer: summary.sterke_punten[0],
      confidence: 'onzeker',
      evidence: 'Gekozen uit het sterkste meetpunt. Beoordeel zelf wat het beste werkt.',
    };
  }
}

function buildQuestion(question, answers, scores) {
  const answer = answers[question.id] || {
    answer: null,
    confidence: 'handmatig',
    evidence: 'Dit beoordeel je zelf.',
  };
  const output = {
    id: question.id,
    text: question.text,
    type: question.type,
    options: question.options,
    labels: question.labels,
    answer: answer.answer ?? null,
    confidence: answer.confidence,
    evidence: answer.evidence,
    ai: !!answer.ai,
    reviewed: false,
    proposal: question.scoreFor ? scores[question.scoreFor] || null : null,
  };

  if (question.type === 'score10' || question.type === 'score5') {
    // Scores are suggestions; the intern chooses the final score.
    output.suggested = question.scoreFor
      ? scores[question.scoreFor]?.value ?? null
      : answer.answer;
    output.answer = null;
  }

  return output;
}

function buildSections(answers, scores) {
  return SECTIONS.map((section) => ({
    id: section.id,
    title: section.title,
    doel: section.doel,
    aanvulling: !!section.aanvulling,
    vooraf: !!section.vooraf,
    questions: section.questions.map((question) => buildQuestion(question, answers, scores)),
  }));
}

function buildMetadata(input, context, meta, started, aiNote) {
  return {
    scannedAt: new Date().toISOString(),
    durationSec: Math.round((Date.now() - started) / 1000),
    input: { url: input.url, name: input.name, place: input.place },
    finalUrl: context.home.url,
    pages: context.pages.map((page) => page.url),
    cms: meta.cms,
    fonts: meta.fonts,
    colors: meta.colors,
    psi: context.psi
      ? {
        performance: context.psi.performance,
        accessibility: context.psi.accessibility,
        seo: context.psi.seo,
        lcp: context.psi.lcp,
      }
      : null,
    psiError: context.psiError || null,
    aiNote,
    warnings: context.warnings,
    linkCheck: {
      checked: context.linkCheck.checked,
      broken: context.linkCheck.broken.length,
    },
    avg: 'Alleen openbare websitecontent is gebruikt. Geen persoonsgegevens, geen formulieren verstuurd.',
  };
}

async function createAiDraft(context, answers, scores, summary, log) {
  const disabledNote = 'AI uit (geen ANTHROPIC_API_KEY ingesteld): open vragen en klantreis zijn skeletten die je zelf invult.';
  if (!ai.isEnabled()) return disabledNote;

  log('AI-concept schrijven (alleen openbare websitetekst)…');
  try {
    const draft = await ai.draft(context, answers, scores);
    ai.applyDraft(draft, answers, summary);
    return `AI-concept door ${ai.MODEL}. Alles wat de AI schreef staat als "onzeker" gemarkeerd.`;
  } catch (error) {
    const note = 'AI-concept mislukt (' + error.message + '). Terugval op regels.';
    log(note);
    return note;
  }
}

async function runScan(input, log = () => {}) {
  const started = Date.now();
  const context = await crawl(input, log);
  await addPageSpeedData(context, input, log);

  log('Vragenlijst invullen op basis van de metingen…');
  const { answers, extras, meta } = analyze(context);
  context.meta = meta;

  const scores = buildScores(answers, extras);
  deriveChoices(scores, answers);
  const summary = fallbackSummary(answers, extras, meta);
  const aiNote = await createAiDraft(context, answers, scores, summary, log);

  addSummaryAnswers(answers, summary);
  const sections = buildSections(answers, scores);

  return {
    meta: buildMetadata(input, context, meta, started, aiNote),
    expectations: input.expectations || {},
    sections,
    summary: { ...summary, klantreisLabels: KLANTREIS },
    helpers: buildHelpers(input, context.home.url),
    status: 'concept',
  };
}

module.exports = { runScan };
