'use strict';
process.env.ALLOW_PRIVATE = '1'; // alleen in de test: localhost toestaan
const { start } = require('../src/fixture-server');
const { runScan } = require('../src/scanner');

(async () => {
  const srv = await start(4000);
  const r = await runScan({ url: 'http://localhost:4000', name: 'De Gouden Korst', place: 'Rotterdam', usePsi: false, expectations: {} }, (m) => console.log('  ·', m));
  srv.close();
  const bad = [];
  for (const s of r.sections) {
    console.log('\n## ' + s.title);
    for (const q of s.questions) {
      const a = Array.isArray(q.answer) ? q.answer.join(', ') : q.answer;
      const sug = q.suggested != null ? ` [voorstel ${q.suggested}]` : '';
      console.log(`  [${q.confidence.padEnd(14)}] ${q.id.padEnd(20)} → ${String(a ?? '—').replace(/\n/g, ' | ').slice(0, 70)}${sug}`);
      if (q.proposal) console.log('        voorstel-cijfer:', q.proposal.value, `(${q.proposal.confidence})`);
    }
  }
  console.log('\nSterke punten:', r.summary.sterke_punten);
  console.log('Verbeterpunten:', r.summary.verbeterpunten);
  console.log('Klantreis/bewustwording:', r.summary.klantreis.bewustwording);
  console.log('meta:', JSON.stringify({ pages: r.meta.pages.length, linkCheck: r.meta.linkCheck, cms: r.meta.cms, aiNote: r.meta.aiNote }));

  // Verwachte uitkomsten voor deze nagemaakte site
  const get = (id) => r.sections.flatMap((s) => s.questions).find((q) => q.id === id);
  const expect = (id, v) => {
    const a = get(id).answer;
    const ok = Array.isArray(v) ? v.every((x) => a.includes(x)) : a === v;
    if (!ok) bad.push(`${id}: verwacht ${JSON.stringify(v)}, kreeg ${JSON.stringify(a)}`);
  };
  expect('ui_logo', 'ja'); expect('ux_menu', 'ja'); expect('ux_hamburger', 'ja'); expect('ux_footer', 'ja');
  expect('ux_voorwaarden', 'ja'); expect('ux_openingstijden', 'ja'); expect('ux_contact', 'ja');
  expect('cv_actie_zichtbaar', 'ja'); expect('cv_contactmiddelen', ['telefoon', 'e-mail', 'contactformulier']);
  expect('ee_formulier', 'ja'); expect('ee_reviews', 'ja'); expect('te_social_door', 'ja'); expect('te_cookie', 'ja');
  expect('te_fouten', 'enkele'); expect('sr_sitemap', 'ja'); expect('sr_schema', 'ja'); expect('geo_crawlers', 'gedeeltelijk');
  expect('te_https', 'nee'); expect('ee_formulier_werkt', 'niet getest');
  console.log(bad.length ? '\n❌ AFWIJKINGEN:\n' + bad.join('\n') : '\n✅ Alle verwachte uitkomsten kloppen.');
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error('FOUT:', e); process.exit(2); });