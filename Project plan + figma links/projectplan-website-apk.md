figma link: https://www.figma.com/design/YUHUZ2LBkxIkDhAyIRBbuT/Website-APK-scanner-%25E2%2580%2593-High-fidelity-wireframes?node-id=0-1&p=f&t=hdcLFVF415T20UIy-0

PROJECTPLAN
Website APK-scanner
High-fidelity wireframes in Figma
Digiwerkplaats Rijnmond · DigiwerkplaatsLab IT
Team van 4 · 4 sprints van 1 week (aanname)

 Inhoud

 1. Doel en scope
Probleemstelling. Stagiairs doen een "Website APK" van de site van een regionale mkb-ondernemer. De scanner meet veel zelf, maar de stagiair moet alles controleren, aanvullen en bewaren. Dat moet duidelijk en prettig voelen, ook voor iemand die dit voor het eerst doet.
Doel. Een klikbaar, high-fidelity wireframe in Figma van de volledige gebruikersflow, zodat het ontwerp getest en overgedragen kan worden aan ontwikkelaars.
Flow in scope: start scan → voortgang → resultaten controleren → samenvatting/persona → bewaren.
Buiten scope: werkende code, wijzigingen aan de scanlogica, AI-koppeling, accounts, PDF/infographic-export.
Opleverpunten
•	Figma-bestand met pagina's: Cover, Research, Design system, Desktop, Mobiel, Prototype, Handoff
•	Component library (knoppen, invoervelden, vraagkaart, badges, voortgangsbalk, modal)
•	Klikbaar prototype van de hoofdflow
•	Testverslag met 3 tot 5 gebruikerstests
•	Korte handoff-notitie (specificaties, states, toegankelijkheid)
2. Teamrollen
Teamlid	Rol	Hoofdverantwoordelijkheid
Teamlid 1	Projectleider & Product Owner	Planning, backlog, MoSCoW, stand-ups, kwaliteitsbewaking, oplevering
Teamlid 2	UX-onderzoeker & flows	Gebruikersonderzoek, persona, user flow, informatiearchitectuur, usertests
Teamlid 3	UI-ontwerper A	Design system + schermen Start en Voortgang + foutstaten
Teamlid 4	UI-ontwerper B	Schermen Resultaten, Samenvatting en Bewaar-modal + prototype

Iedereen reviewt minstens één ontwerp van een ander (peer review) en bouwt mee aan de component library.
3. MoSCoW-overzicht
Prioriteit	Items
Must have	US1 Startformulier · US2 Voortgangsscherm · US3 Resultaten met vraagkaarten en labels · US4 Scorevragen met voorstel · US5 Voortgangsbalk en definitief bewaren · US6 Bewaar-scherm · US7 Design system
Should have	US8 Persona, klantreis en contentadvies · US9 Fout- en lege staten · US10 Mobiele versie · US11 Klikbaar prototype · US12 Usertest en verbeterronde
Could have	US13 Handmatige hulpmiddelen · US14 Uitleg-tooltips · US15 Toegankelijkheid
Won't have (nu)	Werkende frontend/backend · wijzigen van scanner of AI · inlog en accounts · PDF/infographic-export · meertalige interface · dark mode

Richtlijn: Must is ongeveer 60% van de capaciteit, Should 20%, Could 20%. Valt het tegen, dan vervalt eerst Could, daarna Should.
4. User stories met acceptatiecriteria
US1: Startformulier
Prioriteit	Must have
Eigenaar / sprint	Teamlid 3 · sprint 1
User story	Als stagiair wil ik een scan starten met URL, bedrijfsnaam, plaats en mijn verwachtingen vooraf, zodat ik eerlijk kan vergelijken met wat ik daarna zie.
Acceptatiecriteria	☐ De velden URL, bedrijfsnaam, plaats, "binnen 3 klikken", "verwacht op homepage" en "eerste indruk" zijn zichtbaar en verplicht gemarkeerd.
☐ De uitleg met drie stappen staat boven het formulier.
☐ Er is een optie voor Google PageSpeed met tijdsindicatie.
☐ De AVG-melding is zichtbaar zonder scrollen op een laptop (1440 px).
☐ De knop "Scan starten" heeft de states default, hover, focus en disabled.

US2: Voortgangsscherm
Prioriteit	Must have
Eigenaar / sprint	Teamlid 3 · sprint 1
User story	Als stagiair wil ik zien dat de scan bezig is en wat er gebeurt, zodat ik niet denk dat het vastzit.
Acceptatiecriteria	☐ Spinner en kop "Bezig met scannen…" zijn zichtbaar.
☐ Een loglijst toont afgeronde stappen met vinkje en de actieve stap met "…".
☐ Er is een plek voor een foutmelding en een knop "Opnieuw proberen".

US3: Resultaten met vraagkaarten
Prioriteit	Must have
Eigenaar / sprint	Teamlid 4 · sprint 1–2
User story	Als stagiair wil ik per vraag het voorstel van de scanner zien met een label hoe zeker het is, zodat ik weet wat ik extra moet nalopen.
Acceptatiecriteria	☐ Er zijn kaartvarianten voor open vraag, enkele keuze, meerkeuze en cijfer.
☐ Elke kaart toont een label: Gemeten, Waarschijnlijk, Onzeker of Vul zelf in, met kleur én tekst.
☐ Een uitklapbaar blok "Waarom dit voorstel?" toont de onderbouwing.
☐ Elke kaart heeft de checkbox "Ik heb dit gecontroleerd" met een aparte gecontroleerd-state.
☐ Secties tonen titel en doel; de verwachtingen vooraf zijn bovenaan samengevat.

US4: Scorevragen met voorstel
Prioriteit	Must have
Eigenaar / sprint	Teamlid 4 · sprint 2
User story	Als stagiair wil ik een voorgesteld cijfer met onderbouwing zien en zelf mijn eigen cijfer kiezen, zodat het eindoordeel van mij blijft.
Acceptatiecriteria	☐ Een uitgelichte scorekaart toont het voorstel en een keuzemenu voor het eigen cijfer.
☐ Een uitklapbaar blok toont de onderbouwing met ✔ / ~ / ✘ per punt.
☐ Het ontwerp maakt duidelijk dat het voorstel geen definitief cijfer is.
☐ De schalen 1–5 en 1–10 zijn ontworpen, inclusief de uiteinden.

US5: Voortgangsbalk en bewaren
Prioriteit	Must have
Eigenaar / sprint	Teamlid 4 · sprint 2
User story	Als stagiair wil ik altijd zien hoeveel ik gecontroleerd heb en een concept kunnen bewaren, zodat ik niets kwijtraak.
Acceptatiecriteria	☐ De balk blijft bovenaan zichtbaar bij scrollen en toont "Controle: X van Y".
☐ "Concept bewaren" is altijd actief; "Definitief bewaren" is uitgeschakeld tot alles is afgevinkt, met uitleg.
☐ De legenda met de vier labels staat in de balk.
☐ Er is een state "alles gecontroleerd".

US6: Bewaar-scherm
Prioriteit	Must have
Eigenaar / sprint	Teamlid 4 · sprint 3
User story	Als stagiair wil ik na het bewaren de tekst kopiëren of een JSON downloaden, zodat ik het in het formulier kan plakken.
Acceptatiecriteria	☐ Er zijn aparte modals voor "Concept bewaard" en "Analyse bewaard ✓".
☐ Bestandsnamen en een tekstvoorbeeld zijn zichtbaar.
☐ Knoppen "Kopieer als tekst", "Download JSON" en "Sluiten"; de kopieerknop heeft een gekopieerd-state.
☐ De modal sluit met Escape en houdt de focus binnen de modal (annotatie).

US7: Design system
Prioriteit	Must have
Eigenaar / sprint	Teamlid 3 (met Teamlid 4) · sprint 1
User story	Als team wil ik één gedeelde component library, zodat schermen consistent zijn.
Acceptatiecriteria	☐ Kleur-, tekst- en spacingstijlen zijn als Figma-styles/variabelen vastgelegd (incl. de vier labelkleuren).
☐ Componenten zijn gebouwd met auto layout en varianten.
☐ Naamgeving volgt één afspraak, bijv. Button/Primary/Hover.
☐ Minstens 90% van de schermen gebruikt alleen componenten uit de library.

US8: Persona, klantreis en contentadvies
Prioriteit	Should have
Eigenaar / sprint	Teamlid 4 · sprint 3
User story	Als stagiair wil ik een blok om persona, vijf klantreisfasen, kernboodschap en contentadvies in te vullen, zodat dit op de infographic kan.
Acceptatiecriteria	☐ Alle velden zijn ontworpen, met een waarschuwing bij "[Aanvullen]"-tekst en een melding als de AI onzeker is.
☐ De checkbox voor dit blok toont een foutstate bij placeholders.
☐ De drie velden voor sterke punten en verbeterpunten zijn genummerd.

US9: Fout- en lege staten
Prioriteit	Should have
Eigenaar / sprint	Teamlid 3 · sprint 3
User story	Als stagiair wil ik begrijpelijke meldingen bij problemen, zodat ik weet wat ik kan doen.
Acceptatiecriteria	☐ Ontworpen staten: ongeldige URL, site niet bereikbaar, certificaatfout, server onbereikbaar, scan mislukt, waarschuwingsbanner, niet-bewaarde wijzigingen.
☐ Teksten zijn in gewone taal en bevatten een volgende stap.

US10: Mobiele versie
Prioriteit	Should have
Eigenaar / sprint	Teamlid 3 en 4 · sprint 3
User story	Als stagiair wil ik de tool ook op tablet of telefoon kunnen gebruiken, zodat ik op locatie kan controleren.
Acceptatiecriteria	☐ Alle Must-schermen bestaan op 375 px breed.
☐ Het formulier met 3 kolommen valt terug naar 1 kolom.
☐ De sticky balk neemt niet meer dan 20% van het scherm in.
☐ Aanraakdoelen zijn minimaal 44×44 px.

US11: Klikbaar prototype
Prioriteit	Should have
Eigenaar / sprint	Teamlid 4 · sprint 3
User story	Als tester wil ik door de hoofdflow klikken, zodat ik het ontwerp kan beoordelen.
Acceptatiecriteria	☐ De flow loopt van start → voortgang → resultaten → afvinken → bewaren → modal.
☐ Minstens twee interacties werken: uitklappen van onderbouwing en afvinken met bijgewerkte voortgangsbalk.
☐ Het prototype werkt zonder uitleg en heeft een aangeduid startpunt.

US12: Onderzoek, usertest en verbeterronde
Prioriteit	Should have
Eigenaar / sprint	Teamlid 2 · sprint 1 en 4
User story	Als team wil ik het ontwerp toetsen aan echte gebruikers, zodat we kunnen verbeteren voor oplevering.
Acceptatiecriteria	☐ Sprint 1: persona, user flow en 5 interviews of observaties met stagiairs/begeleiders zijn vastgelegd.
☐ Sprint 4: 3 tot 5 usertests met testscript en 3 taken (scan starten, vraag controleren, definitief bewaren).
☐ Bevindingen zijn op ernst gerangschikt; alle ernstige punten zijn verwerkt of onderbouwd afgewezen.

US13: Handmatige hulpmiddelen
Prioriteit	Could have
Eigenaar / sprint	Teamlid 4 · sprint 4
User story	Als stagiair wil ik zoeklinks en een GEO-promptkaart met kopieerknoppen, zodat ik het handwerk sneller doe.
Acceptatiecriteria	☐ Een sectie met links (Google, Maps, PageSpeed, Wayback) en vijf prompts, elk met "Kopieer"-knop en gekopieerd-state.

US14: Uitleg-tooltips
Prioriteit	Could have
Eigenaar / sprint	Teamlid 3 · sprint 4
User story	Als nieuwe stagiair wil ik uitleg bij de labels en onderdelen, zodat ik begrijp wat ze betekenen.
Acceptatiecriteria	☐ Tooltip voor elk van de vier labels.
☐ Een "?"-knop of eerste-keer-uitleg is ontworpen.

US15: Toegankelijkheid
Prioriteit	Could have
Eigenaar / sprint	Teamlid 2 · sprint 4
User story	Als team wil ik een toegankelijk ontwerp, zodat iedereen het kan gebruiken.
Acceptatiecriteria	☐ Alle tekstkleuren halen minimaal contrast 4.5:1 (WCAG AA), gecontroleerd met een Figma-plugin.
☐ Focusstates en leesvolgorde zijn geannoteerd op de Must-schermen.

5. Definition of Done
Per user story
•	Alle acceptatiecriteria zijn afgevinkt in het backlogbord.
•	Het ontwerp is high-fidelity: echte teksten uit de tool (geen lorem ipsum), echte kleuren en typografie.
•	Alle benodigde states zijn ontworpen (default, hover, focus, actief, uitgeschakeld, fout, gecontroleerd).
•	Alleen componenten en styles uit de library zijn gebruikt, met auto layout en logische laagnamen.
•	Een teamlid heeft een peer review gedaan en de opmerkingen zijn verwerkt of beantwoord.
•	De product owner heeft het goedgekeurd.
•	Het frame staat op de juiste Figma-pagina met statuslabel "Klaar voor review/ontwikkeling".
Per sprint
•	Alle Must-stories van de sprint voldoen aan de DoD, de sprintdemo is gegeven en de retrospective is gehouden.
Voor het hele project
•	Alle Must-stories voldoen aan de DoD en de Should-stories zijn klaar of bewust uitgesteld.
•	Het prototype is getest en de ernstige bevindingen zijn verwerkt.
•	De handoff-pagina is compleet en het bestand is gedeeld met de opdrachtgever (leesrechten).
6. Planning
Sprint	Focus	Opleveringen
1	Fundament	Research en persona (T2), design system (T3, T4), Startformulier en Voortgang (T3), eerste opzet vraagkaarten (T4)
2	Kernschermen	Vraagkaarten compleet, scorekaarten, voortgangsbalk (T4); foutstaten starten (T3); user flow af (T2)
3	Afwerking	Bewaar-modal, samenvatting, mobiel, fout- en lege staten, klikbaar prototype
4	Testen en overdracht	Usertests (T2), verbeterronde (allen), Could-items, handoff, eindpresentatie

Werkafspraken: dagelijkse stand-up van 10 minuten, review en demo op vrijdag, backlog in één bord (To do / Bezig / Review / Klaar), aparte werkpagina's per ontwerper in Figma.
7. Risico's
Risico	Kans	Impact	Maatregel
Design system loopt uit en blokkeert de rest	Middel	Hoog	Alleen de basis in sprint 1, uitbreiden per sprint
Inconsistente schermen door twee ontwerpers	Hoog	Middel	Gedeelde library, peer review, vaste naamgeving
Moeilijk om testpersonen te vinden	Middel	Middel	Eerder plannen, collega-stagiairs en begeleiders gebruiken
Scope groeit	Middel	Hoog	MoSCoW afspreken met opdrachtgever, wijzigingen via product owner
Uitval van een teamlid	Laag	Hoog	Gedeelde kennis, back-up per rol, buffer in sprint 4
8. Figma-structuur
•	01 Design system (cover, kleurvariabelen, typografie, componenten Badge en Button)
•	02 Desktop (7 schermen, handoff-notities en klikbaar prototype)
•	03 Mobiel (375 px: Start en Resultaten)
•	Opmerking: het gratis Figma Starter-plan staat maximaal 3 pagina's toe. Research, Prototype en Handoff zijn daarom onderdeel van deze pagina's.

Schermlijst desktop: Start · Voortgang · Voortgang met fout · Resultaten · Vraagkaart-varianten · Scorekaart uitgeklapt · Samenvatting/persona · Hulpmiddelen · Alles gecontroleerd · Modal concept · Modal definitief.
