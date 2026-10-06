'use strict';
const { SECTIONS, KLANTREIS } = require('./questionnaire');

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const plain = (t) => t.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();

/** Voorstel-cijfer per onderdeel uit de meetbare punten. De stagiair bepaalt het echte cijfer. */
function sectionScore(section, answers, extras) {
  const items = [];
  for (const q of section.questions) {
    const a = answers[q.id];
    if (a && typeof a.s === 'number') items.push({ label: plain(q.text), s: a.s, w: a.w || 1 });
  }
  for (const x of extras) if (x.section === section.id && typeof x.s === 'number') items.push({ label: x.label, s: x.s, w: x.w || 1 });
  const totalW = items.reduce((n, i) => n + i.w, 0);
  if (!items.length) return null;
  const frac = items.reduce((n, i) => n + i.s * i.w, 0) / totalW;
  const raw = 1 + 9 * frac;
  const measurable = section.questions.filter((q) => !q.scoreFor).length + extras.filter((x) => x.section === section.id).length;
  const coverage = items.length / Math.max(1, measurable);
  // Meet de scanner maar een deel van het onderdeel, dan ligt het voorstel dichter bij het midden (5,5).
  const k = Math.min(1, coverage / 0.8);
  const value = clamp(Math.round(5.5 + (raw - 5.5) * k), 1, 10);
  const confidence = items.length < 5 || coverage < 0.5 ? 'onzeker' : 'waarschijnlijk';
  const rationale = items
    .sort((a, b) => a.s - b.s)
    .map((i) => `${i.s >= 0.7 ? '✔' : i.s >= 0.4 ? '~' : '✘'} ${i.label}`);
  rationale.push(`Gebaseerd op ${items.length} van ${measurable} punten die de scanner kan meten.${k < 1 ? ' Omdat dat maar een deel is, ligt het voorstel dichter bij het midden.' : ''} De rest (design, gevoel, teksten) beoordeel jij zelf.`);
  return { value, confidence, rationale };
}

function pick(candidates, n, scoreFn) {
  const sorted = [...candidates].sort((a, b) => scoreFn(b) - scoreFn(a));
  const out = [], used = new Set();
  for (const c of sorted) { if (out.length < n && !used.has(c.section)) { out.push(c); used.add(c.section); } }
  for (const c of sorted) { if (out.length < n && !out.includes(c)) out.push(c); }
  return out;
}

function buildScores(answers, extras) {
  const scores = {};
  for (const sec of SECTIONS) {
    if (!sec.questions.some((q) => q.scoreFor === sec.id)) continue;
    if (['gr', 'ei'].includes(sec.id)) continue;
    const sc = sectionScore(sec, answers, extras);
    if (sc) scores[sec.id] = sc;
  }

  // Digitale groeikansen: hoe goed benut de ondernemer de groeihefbomen (conversie, vindbaarheid, social, reviews)?
  const levers = ['cv', 'sr'].map((k) => scores[k]?.value).filter(Boolean);
  if (levers.length) {
    const v = clamp(Math.round(levers.reduce((a, b) => a + b, 0) / levers.length), 1, 10);
    scores.gr = { value: v, confidence: 'onzeker', rationale: [`Gemiddelde van conversie (${scores.cv?.value ?? '?'}) en vindbaarheid/social/reviews (${scores.sr?.value ?? '?'}).`, 'Aanname: een hoge score betekent dat de ondernemer zijn digitale kansen al goed benut. Stem de betekenis af met je begeleider.'] };
  }

  // Eindscore: gewogen gemiddelde van alle onderdelen
  const weights = { pos: 1, ui: 1, ux: 1.5, cv: 1.5, ee: 1.2, te: 1.5, sr: 1 };
  let sum = 0, wsum = 0;
  for (const [k, w] of Object.entries(weights)) if (scores[k]) { sum += scores[k].value * w; wsum += w; }
  if (wsum) scores.ei = { value: clamp(Math.round(sum / wsum), 1, 10), confidence: 'onzeker', rationale: ['Gewogen gemiddelde van de voorstel-cijfers per onderdeel (UX, conversie en techniek tellen zwaarder).', 'Het eindoordeel is jouw oordeel: pas het aan na het doorlopen van de hele analyse.'] };
  return scores;
}

function deriveChoices(scores, answers) {
  const map = { Content: scores.ee?.value, Techniek: scores.te?.value, UX: scores.ux?.value, Vindbaarheid: scores.sr?.value, Conversie: scores.cv?.value };
  const entries = Object.entries(map).filter(([, v]) => typeof v === 'number').sort((a, b) => a[1] - b[1]);
  if (entries.length) answers.gr_kans = { answer: entries[0][0], confidence: 'onzeker', evidence: `Laagste voorstel-score: ${entries.map(([k, v]) => `${k} ${v}`).join(' · ')}.` };
  else answers.gr_kans = { answer: null, confidence: 'handmatig', evidence: 'Niet te bepalen.' };
  const e = scores.ei?.value;
  answers.gr_doelen = e ? { answer: e >= 7 ? 'Goed' : e >= 5 ? 'Matig' : 'Slecht', confidence: 'onzeker', evidence: `Afgeleid van het voorstel-eindcijfer (${e}). De scanner kent de bedrijfsdoelen niet: vraag of leid ze af uit de site.` } : { answer: null, confidence: 'handmatig', evidence: 'Niet te bepalen.' };
}

function fallbackSummary(answers, extras, meta) {
  const cands = [];
  const secOf = (qid) => SECTIONS.find((s) => s.questions.some((q) => q.id === qid))?.id;
  for (const [id, a] of Object.entries(answers)) if (typeof a.s === 'number') cands.push({ section: secOf(id), s: a.s, w: a.w || 1, strength: a.strength, improve: a.improve });
  for (const x of extras) if (typeof x.s === 'number') cands.push({ section: x.section, s: x.s, w: x.w || 1, strength: x.strength, improve: x.improve });
  const strengths = pick(cands.filter((c) => c.s >= 0.8 && c.strength), 3, (c) => c.w * c.s).map((c) => c.strength);
  const improvements = pick(cands.filter((c) => c.s <= 0.5 && c.improve), 3, (c) => c.w * (1 - c.s)).map((c) => c.improve);
  while (strengths.length < 3) strengths.push('[Aanvullen door stagiair: de scanner vond hier geen duidelijk sterk punt]');
  while (improvements.length < 3) improvements.push('[Aanvullen door stagiair: de scanner vond hier geen duidelijk verbeterpunt]');

  const s = meta.signals;
  const yes = (b) => (b ? '✔' : '✘');
  const klantreis = {
    bewustwording: `Hoe vind je het bedrijf? Titel ${yes(s.title)}, omschrijving voor Google ${yes(s.metaDesc)}, social: ${s.social.length ? s.social.join(', ') : 'geen'}, bedrijfsgegevens voor Google ${yes(s.schemaTypes.length)}. [Aanvullen: hoe kom je er via Google/AI/social?]`,
    overweging: `Wat helpt twijfelaars? Aanbod/diensten ${yes(s.words > 100)}, reviews of keurmerken ${yes(s.trust.includes('reviews/keurmerken'))}, signalen van deskundigheid: ${s.authSignals.length ? s.authSignals.join(', ') : 'geen'}. [Aanvullen]`,
    aankoop: `Hoe zet je de stap? Actieknoppen: ${s.ctaTexts.length ? s.ctaTexts.slice(0, 4).join(', ') : 'geen'}, formulier ${yes(s.hasForm)}, webshop ${yes(s.isShop)}. [Aanvullen: probeer het zelf]`,
    loyaliteit: `Wat houdt klanten vast? Nieuwsbrief ${yes(s.newsletter)}, klantaccount ${yes(s.hasAccount)}, social volgen ${yes(s.social.length)}. [Aanvullen]`,
    aanbeveling: `Hoe verspreiden tevreden klanten het? Reviews ${yes(s.trust.includes('reviews/keurmerken'))}, social ${yes(s.social.length)}, deelknoppen of review-verzoek: [aanvullen]`,
  };
  return {
    sterke_punten: strengths,
    verbeterpunten: improvements,
    persona: '[Aanvullen: beschrijf een typische klant — wie, wat wil die, wat houdt die tegen? Gebruik je antwoorden bij doelgroep en type klant.]',
    klantreis,
    kernboodschap: s.h1 ? `Hoofdkop op de site: "${s.h1}". [Aanvullen: wat is de kernboodschap die blijft hangen?]` : '[Aanvullen]',
    call_to_action: s.ctaTexts.length ? `Nu: ${s.ctaTexts.slice(0, 2).join(' / ')}. [Aanvullen: wat zou de ene duidelijke actie moeten zijn?]` : '[Aanvullen: er is geen duidelijke actie gevonden]',
    contentadvies: improvements.length ? 'Op basis van de verbeterpunten: ' + improvements.filter((i) => !i.startsWith('[')).join(' ') + ' [Aanvullen met concrete content-ideeën]' : '[Aanvullen]',
    bron: 'regels',
  };
}

module.exports = { buildScores, deriveChoices, fallbackSummary, KLANTREIS };