'use strict';

/** Zet de bewaarde analyse om in leesbare tekst (om te kopiëren naar het formulier). */

const CONF = {
  zeker: 'gemeten',
  waarschijnlijk: 'waarschijnlijk',
  onzeker: 'onzeker',
  handmatig: 'zelf ingevuld',
};

function formatAnswer(answer) {
  if (Array.isArray(answer)) {
    return answer.length ? answer.join(', ') : '(niets gekozen)';
  }
  if (answer === null || answer === undefined || answer === '') {
    return '(niet ingevuld)';
  }
  return String(answer);
}

function formatMultilineAnswer(answer) {
  return formatAnswer(answer)
    .split('\n')
    .map((line, index) => (index ? '  ' + line : line))
    .join('\n');
}

function buildDocumentHeader(result, meta) {
  const lines = [
    `# Website APK: ${meta.input?.name || ''} (${meta.input?.place || ''})`,
    '',
    `- Website: ${meta.finalUrl || meta.input?.url || ''}`,
    `- Gescand op: ${meta.scannedAt || ''}`,
    `- Status: **${result.status === 'gecontroleerd' ? 'definitief (gecontroleerd)' : 'concept'}**`,
  ];

  if (meta.psi) {
    lines.push(
      `- PageSpeed (mobiel): prestaties ${Math.round((meta.psi.performance ?? 0) * 100)}/100, ` +
        `toegankelijkheid ${Math.round((meta.psi.accessibility ?? 0) * 100)}/100`,
    );
  }

  lines.push(`- ${meta.aiNote || ''}`, '');
  return lines;
}

function buildQuestion(question) {
  const lines = [`**${question.text}**`, `- Antwoord: ${formatMultilineAnswer(question.answer)}`];

  if (question.reviewed === false) {
    lines.push('- ⚠ Nog niet gecontroleerd');
  }

  lines.push('');
  return lines;
}

function buildSections(sections) {
  const lines = [];

  for (const section of sections || []) {
    lines.push(`## ${section.title}`, '');

    for (const question of section.questions) {
      lines.push(...buildQuestion(question));
    }
  }

  return lines;
}

function buildCustomerJourney(summary) {
  const lines = [
    '## Persona, klantreis & contentadvies',
    '',
    `**Persona:** ${summary.persona || ''}`,
    '',
    '**Klantreis:**',
  ];

  for (const [key, label] of summary.klantreisLabels || []) {
    lines.push(`- ${label}: ${summary.klantreis?.[key] || ''}`);
  }

  lines.push(
    '',
    `**Kernboodschap:** ${summary.kernboodschap || ''}`,
    '',
    `**Call-to-action:** ${summary.call_to_action || ''}`,
    '',
    `**Contentadvies:** ${summary.contentadvies || ''}`,
    '',
  );

  return lines;
}

function toMarkdown(result) {
  const meta = result.meta || {};
  const summary = result.summary || {};
  const lines = [
    ...buildDocumentHeader(result, meta),
    ...buildSections(result.sections),
    ...buildCustomerJourney(summary),
  ];

  return lines.join('\n');
}

module.exports = { toMarkdown, CONF };
