'use strict';

const { SECTIONS, KLANTREIS } = require('./questionnaire');

const OVERALL_SCORE_WEIGHTS = {
  pos: 1,
  ui: 1,
  ux: 1.5,
  cv: 1.5,
  ee: 1.2,
  te: 1.5,
  sr: 1,
};

const GROWTH_SCORE_SECTIONS = ['cv', 'sr'];
const GOAL_LABELS = [
  { minimum: 7, label: 'Goed' },
  { minimum: 5, label: 'Matig' },
  { minimum: 0, label: 'Slecht' },
];
const STRENGTH_PLACEHOLDER =
  '[Aanvullen door stagiair: de scanner vond hier geen duidelijk sterk punt]';
const IMPROVEMENT_PLACEHOLDER =
  '[Aanvullen door stagiair: de scanner vond hier geen duidelijk verbeterpunt]';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const plain = (text) =>
  text
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function collectScoringItems(section, answers, extras) {
  const answerItems = section.questions
    .map((question) => {
      const answer = answers[question.id];
      if (!answer || typeof answer.s !== 'number') return null;

      return {
        label: plain(question.text),
        s: answer.s,
        w: answer.w || 1,
      };
    })
    .filter(Boolean);

  const extraItems = extras
    .filter((extra) => extra.section === section.id && typeof extra.s === 'number')
    .map((extra) => ({
      label: extra.label,
      s: extra.s,
      w: extra.w || 1,
    }));

  return [...answerItems, ...extraItems];
}

function buildScoreRationale(items, measurableCount, coverageFactor) {
  const rationale = [...items]
    .sort((first, second) => first.s - second.s)
    .map((item) => {
      const indicator = item.s >= 0.7 ? '✔' : item.s >= 0.4 ? '~' : '✘';
      return `${indicator} ${item.label}`;
    });

  const partialCoverageNote =
    coverageFactor < 1
      ? ' Omdat dat maar een deel is, ligt het voorstel dichter bij het midden.'
      : '';

  rationale.push(
    `Gebaseerd op ${items.length} van ${measurableCount} punten die de scanner kan meten.` +
      `${partialCoverageNote} De rest (design, gevoel, teksten) beoordeel jij zelf.`,
  );

  return rationale;
}

/** Voorstel-cijfer per onderdeel uit de meetbare punten. De stagiair bepaalt het echte cijfer. */
function sectionScore(section, answers, extras) {
  const items = collectScoringItems(section, answers, extras);
  if (!items.length) return null;

  const totalWeight = items.reduce((total, item) => total + item.w, 0);
  const weightedFraction = items.reduce((total, item) => total + item.s * item.w, 0) / totalWeight;
  const rawScore = 1 + 9 * weightedFraction;
  const measurableCount =
    section.questions.filter((question) => !question.scoreFor).length +
    extras.filter((extra) => extra.section === section.id).length;
  const coverage = items.length / Math.max(1, measurableCount);

  // Beperk de invloed van een score als maar een deel van een onderdeel meetbaar is.
  const coverageFactor = Math.min(1, coverage / 0.8);
  const value = clamp(Math.round(5.5 + (rawScore - 5.5) * coverageFactor), 1, 10);
  const confidence = items.length < 5 || coverage < 0.5 ? 'onzeker' : 'waarschijnlijk';

  return {
    value,
    confidence,
    rationale: buildScoreRationale(items, measurableCount, coverageFactor),
  };
}

function pick(candidates, limit, scoreCandidate) {
  const sorted = [...candidates].sort(
    (first, second) => scoreCandidate(second) - scoreCandidate(first),
  );
  const selected = [];
  const usedSections = new Set();

  for (const candidate of sorted) {
    if (selected.length >= limit || usedSections.has(candidate.section)) continue;
    selected.push(candidate);
    usedSections.add(candidate.section);
  }

  for (const candidate of sorted) {
    if (selected.length >= limit) break;
    if (!selected.includes(candidate)) selected.push(candidate);
  }

  return selected;
}

function buildSectionScores(answers, extras) {
  const scores = {};

  for (const section of SECTIONS) {
    if (!section.questions.some((question) => question.scoreFor === section.id)) continue;
    if (['gr', 'ei'].includes(section.id)) continue;

    const score = sectionScore(section, answers, extras);
    if (score) scores[section.id] = score;
  }

  return scores;
}

function addGrowthScore(scores) {
  const leverScores = GROWTH_SCORE_SECTIONS.map((sectionId) => scores[sectionId]?.value).filter(
    Boolean,
  );
  if (!leverScores.length) return;

  const value = clamp(
    Math.round(leverScores.reduce((total, score) => total + score, 0) / leverScores.length),
    1,
    10,
  );
  scores.gr = {
    value,
    confidence: 'onzeker',
    rationale: [
      `Gemiddelde van conversie (${scores.cv?.value ?? '?'}) en ` +
        `vindbaarheid/social/reviews (${scores.sr?.value ?? '?'}).`,
      'Aanname: een hoge score betekent dat de ondernemer zijn digitale kansen al goed benut. ' +
        'Stem de betekenis af met je begeleider.',
    ],
  };
}

function addOverallScore(scores) {
  let weightedTotal = 0;
  let totalWeight = 0;

  for (const [sectionId, weight] of Object.entries(OVERALL_SCORE_WEIGHTS)) {
    if (!scores[sectionId]) continue;
    weightedTotal += scores[sectionId].value * weight;
    totalWeight += weight;
  }

  if (!totalWeight) return;

  scores.ei = {
    value: clamp(Math.round(weightedTotal / totalWeight), 1, 10),
    confidence: 'onzeker',
    rationale: [
      'Gewogen gemiddelde van de voorstel-cijfers per onderdeel (UX, conversie en techniek tellen zwaarder).',
      'Het eindoordeel is jouw oordeel: pas het aan na het doorlopen van de hele analyse.',
    ],
  };
}

function buildScores(answers, extras) {
  const scores = buildSectionScores(answers, extras);
  addGrowthScore(scores);
  addOverallScore(scores);
  return scores;
}

function buildGrowthOpportunityAnswer(scores) {
  const sectionLabels = {
    ee: 'Content',
    te: 'Techniek',
    ux: 'UX',
    sr: 'Vindbaarheid',
    cv: 'Conversie',
  };
  const entries = Object.entries(sectionLabels)
    .map(([sectionId, label]) => [label, scores[sectionId]?.value])
    .filter(([, value]) => typeof value === 'number')
    .sort((first, second) => first[1] - second[1]);

  if (!entries.length) {
    return {
      answer: null,
      confidence: 'handmatig',
      evidence: 'Niet te bepalen.',
    };
  }

  return {
    answer: entries[0][0],
    confidence: 'onzeker',
    evidence: `Laagste voorstel-score: ${entries.map(([label, value]) => `${label} ${value}`).join(' · ')}.`,
  };
}

function goalLabelForScore(score) {
  return GOAL_LABELS.find(({ minimum }) => score >= minimum)?.label;
}

function buildGoalAnswer(scores) {
  const score = scores.ei?.value;
  if (!score) {
    return {
      answer: null,
      confidence: 'handmatig',
      evidence: 'Niet te bepalen.',
    };
  }

  return {
    answer: goalLabelForScore(score),
    confidence: 'onzeker',
    evidence:
      `Afgeleid van het voorstel-eindcijfer (${score}). ` +
      'De scanner kent de bedrijfsdoelen niet: vraag of leid ze af uit de site.',
  };
}

function deriveChoices(scores, answers) {
  answers.gr_kans = buildGrowthOpportunityAnswer(scores);
  answers.gr_doelen = buildGoalAnswer(scores);
}

function sectionForQuestion(questionId) {
  return SECTIONS.find((section) =>
    section.questions.some((question) => question.id === questionId),
  )?.id;
}

function collectSummaryCandidates(answers, extras) {
  const answerCandidates = Object.entries(answers)
    .filter(([, answer]) => typeof answer.s === 'number')
    .map(([id, answer]) => ({
      section: sectionForQuestion(id),
      s: answer.s,
      w: answer.w || 1,
      strength: answer.strength,
      improve: answer.improve,
    }));

  const extraCandidates = extras
    .filter((extra) => typeof extra.s === 'number')
    .map((extra) => ({
      section: extra.section,
      s: extra.s,
      w: extra.w || 1,
      strength: extra.strength,
      improve: extra.improve,
    }));

  return [...answerCandidates, ...extraCandidates];
}

function padWithPlaceholders(items, placeholder) {
  while (items.length < 3) items.push(placeholder);
  return items;
}

function summarizeStrengths(candidates) {
  const strengths = pick(
    candidates.filter((candidate) => candidate.s >= 0.8 && candidate.strength),
    3,
    (candidate) => candidate.w * candidate.s,
  ).map((candidate) => candidate.strength);

  return padWithPlaceholders(strengths, STRENGTH_PLACEHOLDER);
}

function summarizeImprovements(candidates) {
  const improvements = pick(
    candidates.filter((candidate) => candidate.s <= 0.5 && candidate.improve),
    3,
    (candidate) => candidate.w * (1 - candidate.s),
  ).map((candidate) => candidate.improve);

  return padWithPlaceholders(improvements, IMPROVEMENT_PLACEHOLDER);
}

function buildCustomerJourney(signals) {
  const yes = (value) => (value ? '✔' : '✘');

  return {
    bewustwording:
      `Hoe vind je het bedrijf? Titel ${yes(signals.title)}, ` +
      `omschrijving voor Google ${yes(signals.metaDesc)}, ` +
      `social: ${signals.social.length ? signals.social.join(', ') : 'geen'}, ` +
      `bedrijfsgegevens voor Google ${yes(signals.schemaTypes.length)}. ` +
      '[Aanvullen: hoe kom je er via Google/AI/social?]',
    overweging:
      `Wat helpt twijfelaars? Aanbod/diensten ${yes(signals.words > 100)}, ` +
      `reviews of keurmerken ${yes(signals.trust.includes('reviews/keurmerken'))}, ` +
      `signalen van deskundigheid: ${signals.authSignals.length ? signals.authSignals.join(', ') : 'geen'}. ` +
      '[Aanvullen]',
    aankoop:
      `Hoe zet je de stap? Actieknoppen: ` +
      `${signals.ctaTexts.length ? signals.ctaTexts.slice(0, 4).join(', ') : 'geen'}, ` +
      `formulier ${yes(signals.hasForm)}, webshop ${yes(signals.isShop)}. ` +
      '[Aanvullen: probeer het zelf]',
    loyaliteit:
      `Wat houdt klanten vast? Nieuwsbrief ${yes(signals.newsletter)}, ` +
      `klantaccount ${yes(signals.hasAccount)}, social volgen ${yes(signals.social.length)}. ` +
      '[Aanvullen]',
    aanbeveling:
      `Hoe verspreiden tevreden klanten het? ` +
      `Reviews ${yes(signals.trust.includes('reviews/keurmerken'))}, ` +
      `social ${yes(signals.social.length)}, deelknoppen of review-verzoek: [aanvullen]`,
  };
}

function buildSummaryContent(signals, improvements) {
  const contentIdeas = improvements.filter((improvement) => !improvement.startsWith('[')).join(' ');

  return {
    kernboodschap: signals.h1
      ? `Hoofdkop op de site: "${signals.h1}". [Aanvullen: wat is de kernboodschap die blijft hangen?]`
      : '[Aanvullen]',
    call_to_action: signals.ctaTexts.length
      ? `Nu: ${signals.ctaTexts.slice(0, 2).join(' / ')}. [Aanvullen: wat zou de ene duidelijke actie moeten zijn?]`
      : '[Aanvullen: er is geen duidelijke actie gevonden]',
    contentadvies: improvements.length
      ? `Op basis van de verbeterpunten: ${contentIdeas} [Aanvullen met concrete content-ideeën]`
      : '[Aanvullen]',
  };
}

function fallbackSummary(answers, extras, meta) {
  const candidates = collectSummaryCandidates(answers, extras);
  const strengths = summarizeStrengths(candidates);
  const improvements = summarizeImprovements(candidates);
  const signals = meta.signals;

  return {
    sterke_punten: strengths,
    verbeterpunten: improvements,
    persona:
      '[Aanvullen: beschrijf een typische klant — wie, wat wil die, wat houdt die tegen? ' +
      'Gebruik je antwoorden bij doelgroep en type klant.]',
    klantreis: buildCustomerJourney(signals),
    ...buildSummaryContent(signals, improvements),
    bron: 'regels',
  };
}

module.exports = { buildScores, deriveChoices, fallbackSummary, KLANTREIS };
