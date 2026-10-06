'use strict';
/** Zet de bewaarde analyse om in leesbare tekst (om te kopiëren naar het formulier). */
const CONF = { zeker: 'gemeten', waarschijnlijk: 'waarschijnlijk', onzeker: 'onzeker', handmatig: 'zelf ingevuld' };

function fmt(q) {
  const a = q.answer;
  if (Array.isArray(a)) return a.length ? a.join(', ') : '(niets gekozen)';
  if (a === null || a === undefined || a === '') return '(niet ingevuld)';
  return String(a);
}

function toMarkdown(r) {
  const m = r.meta || {};
  const L = [];
  L.push(`# Website APK: ${m.input?.name || ''} (${m.input?.place || ''})`);
  L.push('');
  L.push(`- Website: ${m.finalUrl || m.input?.url || ''}`);
  L.push(`- Gescand op: ${m.scannedAt || ''}`);
  L.push(`- Status: **${r.status === 'gecontroleerd' ? 'definitief (gecontroleerd)' : 'concept'}**`);
  if (m.psi) L.push(`- PageSpeed (mobiel): prestaties ${Math.round((m.psi.performance ?? 0) * 100)}/100, toegankelijkheid ${Math.round((m.psi.accessibility ?? 0) * 100)}/100`);
  L.push(`- ${m.aiNote || ''}`);
  L.push('');
  for (const s of r.sections || []) {
    L.push(`## ${s.title}`);
    L.push('');
    for (const q of s.questions) {
      L.push(`**${q.text}**`);
      const ans = fmt(q).split('\n').map((x, i) => (i ? '  ' + x : x)).join('\n');
      L.push(`- Antwoord: ${ans}`);
      if (q.reviewed === false) L.push('- ⚠ Nog niet gecontroleerd');
      L.push('');
    }
  }
  const sm = r.summary || {};
  L.push('## Persona, klantreis & contentadvies', '');
  L.push(`**Persona:** ${sm.persona || ''}`, '');
  L.push('**Klantreis:**');
  for (const [k, label] of sm.klantreisLabels || []) L.push(`- ${label}: ${sm.klantreis?.[k] || ''}`);
  L.push('', `**Kernboodschap:** ${sm.kernboodschap || ''}`, '');
  L.push(`**Call-to-action:** ${sm.call_to_action || ''}`, '');
  L.push(`**Contentadvies:** ${sm.contentadvies || ''}`, '');
  return L.join('\n');
}

module.exports = { toMarkdown, CONF };