# APK-tester 
Kan je de code schrijven waarin je de url en overige dingen kunnen toevoegen om een website te checken
Zorg dat het de vragen van de vragenlijst beantwoord


# Website APK-scanner

## Mappen
Zet je bestanden zo neer:

```
website-apk/
  package.json   .env.example
  public/        index.html  app.js  style.css
  src/           server.js  scanner.js  fetcher.js  analyze.js  scoring.js
                 ai.js  questionnaire.js  markdown.js
  test/          fixture-server.js  run-fixture.js
```

## Starten
1. Installeer Node.js 18 of nieuwer.
2. `npm install`
3. (optioneel) kopieer `.env.example` naar `.env` en vul `ANTHROPIC_API_KEY` in.
4. `npm start` en open http://localhost:3000
5. Test zonder internet: `npm test` (scant een nagemaakte bakkerijsite).

## Werking
Vul URL, bedrijfsnaam, plaats en je eerste verwachtingen in. De scanner leest de
homepage en tot 5 andere pagina's, controleert links, HTTPS, robots.txt, sitemap,
schema.org en (optioneel) Google PageSpeed. Elke vraag uit `questionnaire.js`
krijgt een voorstel met een betrouwbaarheidslabel; de stagiair controleert alles
en bewaart. Resultaten komen in `opgeslagen/` (.json en .md).