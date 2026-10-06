'use strict';
/* Website APK-scanner — voorkant. Geen framework, geen build-stap. */

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CONF = {
  zeker: ['Gemeten', 'Door de scanner gemeten of direct in de code gezien.'],
  waarschijnlijk: ['Waarschijnlijk', 'Redelijk betrouwbaar voorstel: kijk even of het klopt.'],
  onzeker: ['Onzeker, controleer', 'Dit is een schatting of concept: controleer het zeker.'],
  handmatig: ['Vul zelf in', 'Dit kan de scanner niet beoordelen: dit is jouw werk.'],
};

let state = null;     // de analyse die de stagiair aan het bewerken is
let dirty = false;    // niet-bewaarde wijzigingen
let lastSaved = null; // resultaat van de laatste bewaar-actie

/* ---------- Status ---------- */
fetch('/api/status').then((r) => r.json()).then((s) => {
  $('#aiPill').textContent = s.ai ? `AI-concepten aan (${s.model})` : 'AI-concepten uit';
}).catch(() => { $('#aiPill').textContent = 'server niet bereikbaar'; });

/* ---------- Scan starten ---------- */
$('#scanForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const body = {
    url: f.get('url'), name: f.get('name'), place: f.get('place'), usePsi: !!f.get('usePsi'),
    expectations: { verw_3klikken: f.get('verw_3klikken'), verw_homepage: f.get('verw_homepage'), pos_eerste_indruk: f.get('pos_eerste_indruk') },
  };
  $('#start').hidden = true;
  $('#progress').hidden = false;
  $('#scanError').hidden = true; $('#retryBtn').hidden = true; $('#spinner').hidden = false;
  $('#logList').innerHTML = '';
  try {
    const r = await fetch('/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Starten mislukt');
    poll(j.id);
  } catch (err) { showError(err.message); }
});

$('#retryBtn').addEventListener('click', () => { $('#progress').hidden = true; $('#start').hidden = false; });

function showError(msg) {
  $('#spinner').hidden = true;
  $('#scanError').textContent = msg;
  $('#scanError').hidden = false;
  $('#retryBtn').hidden = false;
}

async function poll(id) {
  try {
    const j = await (await fetch('/api/scan/' + id)).json();
    $('#logList').innerHTML = (j.log || []).map((l) => `<li>${esc(l)}</li>`).join('');
    if (j.status === 'bezig') return setTimeout(() => poll(id), 1000);
    if (j.status === 'fout') return showError(j.error || 'De scan is mislukt.');
    begin(j.result);
  } catch (err) { showError('Verbinding met de scanner verbroken: ' + err.message); }
}

/* ---------- Resultaat voorbereiden ---------- */
function allQuestions() { return state.sections.flatMap((s) => s.questions); }
function findQ(id) { return allQuestions().find((q) => q.id === id); }

function begin(result) {
  state = result;
  // Antwoorden die de stagiair VOOR de scan invulde, zetten we in de vragenlijst
  for (const q of allQuestions()) {
    const own = state.expectations?.[q.id];
    if (own) {
      q.answer = own; q.confidence = 'zeker'; q.reviewed = true;
      q.evidence = 'Dit is jouw eigen antwoord, ingevuld vóór de scan.';
    }
  }
  state.summaryReviewed = false;
  dirty = false;
  $('#progress').hidden = true;
  render();
}

/* ---------- Tekenen ---------- */
const visibleSections = () => state.sections.filter((s) => !s.vooraf);
const countable = () => visibleSections().flatMap((s) => s.questions);

function render() {
  const m = state.meta;
  const el = $('#results');
  el.hidden = false;
  el.innerHTML = `
    <div class="bar" id="bar"></div>
    <section class="card">
      <h2>${esc(m.input.name)} <span class="muted">· ${esc(m.input.place)}</span></h2>
      <p><a href="${esc(m.finalUrl)}" target="_blank" rel="noopener">${esc(m.finalUrl)}</a> · ${m.pages.length} pagina('s) gelezen · scan duurde ${m.durationSec}s</p>
      ${m.warnings.map((w) => `<div class="warn">⚠ ${esc(w)}</div>`).join('')}
      <details class="ev"><summary>Wat heeft de scanner gedaan?</summary>
        <ul>
          <li>Gelezen pagina's: ${m.pages.map((p) => esc(p)).join(' · ')}</li>
          <li>Linksteekproef: ${m.linkCheck.checked} links/afbeeldingen gecontroleerd, ${m.linkCheck.broken} kapot</li>
          <li>PageSpeed: ${m.psi ? `prestaties ${Math.round((m.psi.performance ?? 0) * 100)}/100, toegankelijkheid ${Math.round((m.psi.accessibility ?? 0) * 100)}/100` : 'niet gebruikt' + (m.psiError ? ' (' + esc(m.psiError) + ')' : '')}</li>
          <li>${esc(m.aiNote)}</li>
          <li>${esc(m.avg)}</li>
        </ul>
      </details>
      <details class="ev" open><summary>Jouw verwachtingen vooraf</summary>
        <ul>
          <li><b>Binnen 3 klikken:</b> ${esc(state.expectations.verw_3klikken)}</li>
          <li><b>Verwacht op de homepage:</b> ${esc(state.expectations.verw_homepage)}</li>
        </ul>
        <p>Vergelijk dit met wat je ziet: is dit gelukt? Vul het in bij onderdeel 2.</p>
      </details>
    </section>
    ${visibleSections().map(sectionHtml).join('')}
    ${klantreisHtml()}
    ${helpersHtml()}`;
  updateBar();
}

function sectionHtml(s) {
  return `<section class="card" id="sec_${s.id}">
    <h2>${esc(s.title)} ${s.aanvulling ? '<span class="badge c-waarschijnlijk">aanvulling uit briefing</span>' : ''}</h2>
    <p class="doel"><b>Doel:</b> ${esc(s.doel)}</p>
    ${s.questions.map(questionHtml).join('')}
  </section>`;
}

function badge(q) {
  const [label, tip] = CONF[q.confidence] || CONF.handmatig;
  return `<span class="badge c-${q.confidence}" title="${esc(tip)}">${label}${q.ai ? ' · AI' : ''}</span>`;
}

function questionHtml(q) {
  const isScore = q.type === 'score10' || q.type === 'score5';
  const isSummaryQ = q.id === 'ei_sterk' || q.id === 'ei_verbeter';
  let body = '';
  if (isSummaryQ) {
    const key = q.id === 'ei_sterk' ? 'sterke_punten' : 'verbeterpunten';
    body = `<div class="stack">${[0, 1, 2].map((i) => `<input data-sum="${key}" data-idx="${i}" value="${esc(state.summary[key][i] || '')}" placeholder="${i + 1}.">`).join('')}</div>`;
  } else if (q.type === 'open') {
    const rows = /Sterke|scorecard|reviews|GEO-test/.test(q.text) ? 4 : 3;
    body = `<textarea data-q="${q.id}" rows="${rows}">${esc(q.answer || '')}</textarea>`;
  } else if (q.type === 'single') {
    body = `<div class="opts">${q.options.map((o) => `<label class="opt"><input type="radio" name="r_${q.id}" data-q="${q.id}" value="${esc(o)}" ${q.answer === o ? 'checked' : ''}> ${esc(o)}</label>`).join('')}</div>`;
  } else if (q.type === 'multi') {
    const sel = Array.isArray(q.answer) ? q.answer : [];
    body = `<div class="opts">${q.options.map((o) => `<label class="opt"><input type="checkbox" data-q="${q.id}" value="${esc(o)}" ${sel.includes(o) ? 'checked' : ''}> ${esc(o)}</label>`).join('')}</div>`;
  } else if (isScore) {
    const max = q.type === 'score5' ? 5 : 10;
    const lab = q.labels ? ` (1 = ${esc(q.labels[0])}, ${max} = ${esc(q.labels[1])})` : '';
    body = `<select data-q="${q.id}"><option value="">— kies jouw cijfer —</option>${Array.from({ length: max }, (_, i) => `<option value="${i + 1}" ${q.answer == i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select>
      <div class="proposal">${q.suggested != null ? `Voorstel van de scanner: <b>${esc(q.suggested)}</b>${lab}` : `Geen voorstel van de scanner${lab}: beoordeel zelf.`}</div>`;
  }
  const rationale = q.proposal ? `<details class="ev"><summary>Onderbouwing van het voorstel (${esc(q.proposal.value)}/10, ${esc(CONF[q.proposal.confidence][0].toLowerCase())})</summary><ul>${q.proposal.rationale.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></details>` : '';
  const evidence = q.evidence ? `<details class="ev"><summary>Waarom dit voorstel?</summary><p>${esc(q.evidence)}</p></details>` : '';
  const big = q.proposal ? ' big' : '';
  return `<div class="q ${isScore ? 'scoreq' + big : ''} ${q.reviewed ? 'done' : ''}" data-row="${q.id}">
    <div class="qhead"><p class="qtext">${esc(q.text)}</p>${badge(q)}</div>
    ${body}${rationale}${evidence}
    <label class="rev"><input type="checkbox" data-rev="${q.id}" ${q.reviewed ? 'checked' : ''}> Ik heb dit gecontroleerd en het klopt (of ik heb het aangepast)</label>
  </div>`;
}

function klantreisHtml() {
  const s = state.summary;
  return `<section class="card" id="sec_summary">
    <h2>Persona, klantreis & contentadvies</h2>
    <p class="doel">Dit komt straks op de infographic (sheet 2 en 3). ${esc(s.bron === 'regels' ? 'De scanner levert hier alleen een skelet met gevonden signalen: vul het zelf aan.' : 'Dit is een AI-concept: controleer elke zin. Staat er [ONZEKER] in? Zoek het dan zelf uit.')}</p>
    ${s.onzeker?.length ? `<div class="warn">De AI is onzeker over: ${s.onzeker.map(esc).join('; ')}</div>` : ''}
    <label>Doelgroep & persona<textarea data-sum="persona" rows="3">${esc(s.persona)}</textarea></label>
    <h3>Klantreis</h3>
    ${s.klantreisLabels.map(([k, label]) => `<label>${esc(label)}<textarea data-sum="klantreis.${k}" rows="2">${esc(s.klantreis[k])}</textarea></label>`).join('')}
    <label>Kernboodschap<textarea data-sum="kernboodschap" rows="2">${esc(s.kernboodschap)}</textarea></label>
    <label>Call-to-action<textarea data-sum="call_to_action" rows="2">${esc(s.call_to_action)}</textarea></label>
    <label>Contentadvies<textarea data-sum="contentadvies" rows="4">${esc(s.contentadvies)}</textarea></label>
    <label class="rev"><input type="checkbox" data-rev="__summary" ${state.summaryReviewed ? 'checked' : ''}> Ik heb dit blok gecontroleerd, aangevuld en het is in gewone taal en opbouwend</label>
  </section>`;
}

function helpersHtml() {
  const h = state.helpers;
  return `<section class="card" id="sec_help">
    <h2>Handmatige hulpmiddelen</h2>
    <p class="doel">Dit zijn dingen die jij moet nagaan (Google-vindbaarheid, reviews, GEO). De scanner bereidt het voor, jij voert het uit.</p>
    <div class="links">${h.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('')}</div>
    <h3>GEO-promptkaart <small>(stel deze vragen aan ChatGPT, Gemini, Perplexity en Claude; vul [..] in)</small></h3>
    ${h.geoPrompts.map((p) => `<div class="prompt"><span>${esc(p)}</span><button class="secondary" data-copy="${esc(p)}">Kopieer</button></div>`).join('')}
    <p class="doel">Noteer de uitkomst bij "GEO-test" onder onderdeel 7b: wordt het bedrijf genoemd, klopt wat er staat, en wie noemt de AI wél?</p>
  </section>`;
}

/* ---------- Voortgang ---------- */
function progress() {
  const qs = countable();
  const done = qs.filter((q) => q.reviewed).length + (state.summaryReviewed ? 1 : 0);
  return { done, total: qs.length + 1 };
}
function updateBar() {
  const { done, total } = progress();
  const all = done === total;
  $('#bar').innerHTML = `
    <div class="row">
      <div><b>Controle: ${done} van ${total}</b> <span class="muted">${all ? '· alles gecontroleerd 🎉' : '· vink af wat je hebt nagelopen'}</span></div>
      <div class="row" style="gap:8px">
        <button class="secondary" id="saveDraft">Concept bewaren</button>
        <button class="primary" id="saveFinal" ${all ? '' : 'disabled'} title="${all ? '' : 'Vink eerst alle vragen af'}" style="margin-top:0">Definitief bewaren</button>
      </div>
    </div>
    <div class="meter"><i style="width:${Math.round((done / total) * 100)}%"></i></div>
    <div class="legend">${Object.entries(CONF).map(([k, [l, t]]) => `<span class="badge c-${k}" title="${esc(t)}">${l}</span>`).join('')}</div>`;
  $('#saveDraft').onclick = () => save(false);
  $('#saveFinal').onclick = () => save(true);
}

/* ---------- Bewerken ---------- */
function readControl(q) {
  const root = $('#results');
  if (q.type === 'open') return root.querySelector(`textarea[data-q="${q.id}"]`).value;
  if (q.type === 'single') return root.querySelector(`input[data-q="${q.id}"]:checked`)?.value ?? null;
  if (q.type === 'multi') return [...root.querySelectorAll(`input[data-q="${q.id}"]:checked`)].map((i) => i.value);
  const v = root.querySelector(`select[data-q="${q.id}"]`).value;
  return v ? +v : null;
}
const hasAnswer = (q) => {
  if (q.id === 'ei_sterk' || q.id === 'ei_verbeter') return state.summary[q.id === 'ei_sterk' ? 'sterke_punten' : 'verbeterpunten'].every((x) => x && x.trim() && !x.startsWith('[Aanvullen'));
  if (q.type === 'multi') return true;
  return q.answer !== null && q.answer !== '' && q.answer !== undefined;
};

function onEdit(e) {
  const t = e.target;
  dirty = true;
  if (t.dataset.q) {
    const q = findQ(t.dataset.q);
    q.answer = readControl(q);
    if (q.confidence !== 'zeker' || q.evidence?.startsWith('Dit is jouw')) { /* badge blijft: het was een voorstel */ }
  } else if (t.dataset.sum) {
    const path = t.dataset.sum;
    if (t.dataset.idx !== undefined) state.summary[path][+t.dataset.idx] = t.value;
    else if (path.includes('.')) { const [a, b] = path.split('.'); state.summary[a][b] = t.value; }
    else state.summary[path] = t.value;
  } else if (t.dataset.rev) {
    const id = t.dataset.rev;
    if (id === '__summary') {
      const open = [state.summary.persona, ...Object.values(state.summary.klantreis), state.summary.kernboodschap, state.summary.call_to_action, state.summary.contentadvies].some((x) => !x || x.includes('[Aanvullen'));
      if (t.checked && open) { t.checked = false; alert('Er staat nog een [Aanvullen]-stuk in dit blok. Vul eerst alles in.'); return; }
      state.summaryReviewed = t.checked;
    } else {
      const q = findQ(id);
      if (t.checked && !hasAnswer(q)) { t.checked = false; alert('Vul eerst zelf een antwoord in voordat je dit afvinkt.'); return; }
      q.reviewed = t.checked;
      $(`[data-row="${id}"]`).classList.toggle('done', t.checked);
    }
    updateBar();
  }
}
$('#results').addEventListener('input', onEdit);
$('#results').addEventListener('change', onEdit);
$('#results').addEventListener('click', (e) => {
  const b = e.target.closest('[data-copy]');
  if (b) { navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Gekopieerd ✓'; setTimeout(() => (b.textContent = 'Kopieer'), 1500); }
});

/* ---------- Bewaren ---------- */
const numbered = (a) => a.map((t, i) => `${i + 1}. ${t}`).join('\n');
async function save(final) {
  const payload = JSON.parse(JSON.stringify(state));
  payload.status = final ? 'gecontroleerd' : 'concept';
  for (const s of payload.sections) for (const q of s.questions) {
    if (q.id === 'ei_sterk') q.answer = numbered(payload.summary.sterke_punten);
    if (q.id === 'ei_verbeter') q.answer = numbered(payload.summary.verbeterpunten);
  }
  try {
    const r = await fetch('/api/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    dirty = false;
    lastSaved = { json: payload, md: j.markdown };
    $('#modalTitle').textContent = final ? 'Analyse bewaard ✓' : 'Concept bewaard';
    $('#modalText').innerHTML = `Opgeslagen in de map van de scanner: <code>${j.saved.map(esc).join('</code> en <code>')}</code>.${final ? '' : ' Dit is een <b>concept</b>: nog niet alles is gecontroleerd.'}`;
    $('#modalPre').textContent = j.markdown; $('#modalPre').hidden = false;
    $('#modal').hidden = false;
  } catch (err) { alert('Bewaren mislukt: ' + err.message); }
}
$('#closeModal').onclick = () => { $('#modal').hidden = true; };
$('#copyMd').onclick = () => { navigator.clipboard.writeText(lastSaved.md); $('#copyMd').textContent = 'Gekopieerd ✓'; setTimeout(() => ($('#copyMd').textContent = 'Kopieer als tekst'), 1500); };
$('#dlJson').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(lastSaved.json, null, 2)], { type: 'application/json' }));
  a.download = `apk-${(state.meta.input.name || 'website').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
  a.click();
};
window.addEventListener('beforeunload', (e) => { if (state && dirty) { e.preventDefault(); e.returnValue = ''; } });