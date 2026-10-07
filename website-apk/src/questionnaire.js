'use strict';
/**
 * De APK-vragenlijst als data ("Roast my Website (website-analyse)").
 * Wil je een vraag toevoegen, aanpassen of verwijderen? Dat doe je HIER.
 *
 * type: open | single | multi | score10 | score5
 * scoreFor: bij een eindscore-vraag; de scanner doet dan een voorstel op basis van de metingen.
 */

const JA_NEE = ['ja', 'nee'];
const JA_GED_NEE = ['ja', 'gedeeltelijk', 'nee'];

const SECTIONS = [
  {
    id: 'verw',
    title: '1. Verwachtingen vooraf',
    doel:
      'Vaststellen wat een gebruiker verwacht voordat hij de website echt gaat beoordelen. ' +
      'Dit helpt om later te vergelijken of de website aan die verwachtingen voldoet.',
    vooraf: true, // wordt ingevuld VÓÓR de scan (zoals in de werkinstructie)
    questions: [
      {
        id: 'verw_3klikken',
        type: 'open',
        text: 'Wat wil je binnen 3 klikken kunnen doen? (bijv. contact opnemen, bestellen, informatie vinden)',
      },
      {
        id: 'verw_homepage',
        type: 'open',
        text: 'Welke informatie verwacht je direct op de homepage te zien?',
      },
    ],
  },
  {
    id: 'pos',
    title: '2. Eerste indruk & positionering',
    doel: 'Beoordelen of bezoekers direct begrijpen wat het bedrijf doet en voor wie de website bedoeld is.',
    questions: [
      { id: 'pos_eerste_indruk', type: 'open', text: 'Wat is je eerste indruk?' },
      {
        id: 'pos_taak_3_klikken',
        type: 'single',
        options: JA_NEE,
        text: 'Is het gelukt om die taak binnen 3 klikken uit te voeren?',
      },
      { id: 'pos_doelgroep', type: 'open', text: 'Voor wie is deze website bedoeld (doelgroep)?' },
      {
        id: 'pos_content_actueel',
        type: 'single',
        options: JA_GED_NEE,
        text: 'Is de content actueel en relevant voor de doelgroep?',
      },
      {
        id: 'pos_omschrijving',
        type: 'open',
        text: 'Hoe zou je dit bedrijf omschrijven na het bekijken van de website?',
      },
      {
        id: 'pos_type_klant',
        type: 'open',
        text: 'Voor welk type klant denk je dat dit bedrijf bedoeld is?',
      },
      {
        id: 'pos_score',
        type: 'score10',
        scoreFor: 'pos',
        text: 'SCORE EERSTE INDRUK & POSITIONERING',
      },
    ],
  },
  {
    id: 'ui',
    title: '3. Uitstraling & huisstijl',
    doel: 'Beoordelen hoe professioneel en consistent de website eruitziet.',
    questions: [
      {
        id: 'ui_design',
        type: 'score10',
        text: 'Hoe professioneel oogt het design van de website?',
      },
      {
        id: 'ui_huisstijl',
        type: 'single',
        options: JA_GED_NEE,
        text: 'Is de huisstijl consistent (kleurgebruik, logo, branding)?',
      },
      { id: 'ui_logo', type: 'single', options: JA_NEE, text: 'Is het logo zichtbaar?' },
      {
        id: 'ui_lettertype',
        type: 'single',
        options: JA_GED_NEE,
        text: 'Is het lettertype duidelijk en goed leesbaar?',
      },
      {
        id: 'ui_beeld',
        type: 'open',
        text: 'Welk beeld krijg je van het bedrijf op basis van de homepage?',
      },
      {
        id: 'ui_balans',
        type: 'single',
        options: JA_GED_NEE,
        text: 'Is er een goede balans tussen tekst en beeld?',
      },
      {
        id: 'ui_overzicht',
        type: 'score5',
        labels: ['Zeer rommelig', 'Zeer overzichtelijk'],
        text: 'Is de website overzichtelijk en niet rommelig?',
      },
      { id: 'ui_score', type: 'score10', scoreFor: 'ui', text: 'SCORE UITSTRALING & HUISSTIJL' },
    ],
  },
  {
    id: 'ux',
    title: '4. Gebruiksvriendelijkheid',
    doel: 'Beoordelen hoe makkelijk bezoekers door de website kunnen navigeren.',
    questions: [
      {
        id: 'ux_header',
        type: 'single',
        options: JA_GED_NEE,
        text: 'Is de header duidelijk en informatief?',
      },
      { id: 'ux_menu', type: 'single', options: JA_NEE, text: 'Is er een menu aanwezig?' },
      {
        id: 'ux_menustructuur',
        type: 'single',
        options: JA_GED_NEE,
        text: 'Is de menustructuur logisch opgebouwd?',
      },
      {
        id: 'ux_hamburger',
        type: 'single',
        options: ['ja', 'nee', 'niet van toepassing'],
        text: 'Is er een hamburgermenu (mobiel)?',
      },
      {
        id: 'ux_footer',
        type: 'single',
        options: JA_NEE,
        text: 'Is er een duidelijke footer met contactinformatie?',
      },
      {
        id: 'ux_voorwaarden',
        type: 'single',
        options: ['ja', 'nee', 'niet van toepassing'],
        text: 'Zijn voorwaarden (retour/annulering/algemene voorwaarden) makkelijk vindbaar?',
      },
      {
        id: 'ux_zoek',
        type: 'single',
        options: JA_NEE,
        text: 'Is er een zoekfunctie aanwezig en bruikbaar?',
      },
      {
        id: 'ux_breadcrumbs',
        type: 'single',
        options: JA_NEE,
        text: 'Zijn breadcrumbs aanwezig (weet je waar je bent op de site)?',
      },
      {
        id: 'ux_toegankelijk',
        type: 'single',
        options: JA_GED_NEE,
        text: 'Is de website toegankelijk/inclusief (bijv. contrast, alternatieve teksten)?',
      },
      {
        id: 'ux_aanbod',
        type: 'single',
        options: JA_GED_NEE,
        text: 'Begrijp je direct wat het bedrijf aanbiedt?',
      },
      {
        id: 'ux_prijzen',
        type: 'single',
        options: JA_GED_NEE,
        text: 'Zijn prijzen of voldoende transparante prijsindicaties aanwezig?',
      },
      {
        id: 'ux_openingstijden',
        type: 'single',
        options: ['ja', 'nee', 'niet van toepassing'],
        text: 'Zijn openingstijden duidelijk vermeld (indien relevant)?',
      },
      {
        id: 'ux_contact',
        type: 'single',
        options: JA_GED_NEE,
        text: 'Kun je zonder te zoeken snel een contactmogelijkheid vinden?',
      },
      {
        id: 'ux_score',
        type: 'score10',
        scoreFor: 'ux',
        text: 'SCORE GEBRUIKSVRIENDELIJKHEID (UX)',
      },
    ],
  },
  {
    id: 'cv',
    title: '5. Conversie & actiegerichtheid',
    doel: 'Beoordelen of de website bezoekers stimuleert om actie te ondernemen.',
    questions: [
      {
        id: 'cv_actie_zichtbaar',
        type: 'single',
        options: JA_GED_NEE,
        text:
          'Is de belangrijkste actie (bijv. afspraak maken/bestellen/contact opnemen) direct ' +
          'zichtbaar op de homepage?',
      },
      {
        id: 'cv_actie_direct',
        type: 'single',
        options: JA_NEE,
        text: 'Kun je deze actie direct uitvoeren?',
      },
      {
        id: 'cv_cta',
        type: 'open',
        text: "Bevat de website duidelijke call-to-actions (CTA's)? Welke?",
      },
      {
        id: 'cv_gestimuleerd',
        type: 'single',
        options: JA_GED_NEE,
        text: 'Word je gestimuleerd om actie te ondernemen?',
      },
      {
        id: 'cv_contactmiddelen',
        type: 'multi',
        options: ['telefoon', 'e-mail', 'contactformulier', 'chatbot', 'whatsapp', 'anders'],
        text: 'Via welke middelen kun je contact opnemen met dit bedrijf?',
      },
      {
        id: 'cv_bereikbaar',
        type: 'open',
        text: 'Wordt duidelijk aangegeven op welke dagen en tijden het bedrijf bereikbaar is?',
      },
      {
        id: 'cv_score',
        type: 'score10',
        scoreFor: 'cv',
        text: 'SCORE CONVERSIE & ACTIEGERICHTHEID',
      },
    ],
  },
  {
    id: 'ee',
    title: '6. Contentkwaliteit & E-E-A-T',
    doel:
      'De kwaliteit en betrouwbaarheid van de content beoordelen ' +
      '(Experience, Expertise, Authoritativeness, Trust).',
    questions: [
      { id: 'ee_formulier', type: 'single', options: JA_NEE, text: 'Is er een contactformulier?' },
      {
        id: 'ee_formulier_werkt',
        type: 'single',
        options: ['ja', 'nee', 'niet getest'],
        text: 'Werkt het contactformulier correct (incl. bevestiging/kopie)?',
      },
      {
        id: 'ee_reviews',
        type: 'single',
        options: JA_NEE,
        text: 'Zijn er reviews, testimonials of keurmerken aanwezig?',
      },
      {
        id: 'ee_autoriteit',
        type: 'single',
        options: JA_GED_NEE,
        text: 'Komt het bedrijf over als een autoriteit in de branche?',
      },
      {
        id: 'ee_betrouwbaarheid',
        type: 'single',
        options: JA_GED_NEE,
        text: 'Vergroot dit de betrouwbaarheid?',
      },
      {
        id: 'ee_onderscheid',
        type: 'open',
        text: 'Onderscheidt dit bedrijf zich van concurrenten? Waarom?',
      },
      {
        id: 'ee_professioneel',
        type: 'score10',
        text: 'In hoeverre komt de inhoud van de website professioneel en betrouwbaar over?',
      },
      {
        id: 'ee_persoonlijk',
        type: 'single',
        options: JA_GED_NEE,
        text: 'Komt het bedrijf persoonlijk en authentiek over in de teksten en beelden?',
      },
      { id: 'ee_score', type: 'score10', scoreFor: 'ee', text: 'SCORE CONTENTKWALITEIT & E-E-A-T' },
    ],
  },
  {
    id: 'te',
    title: '7. Technische basis',
    doel: 'Beoordelen of de website technisch goed functioneert.',
    questions: [
      {
        id: 'te_social_door',
        type: 'single',
        options: JA_NEE,
        text: 'Wordt er vanaf de website doorgelinkt naar social media?',
      },
      {
        id: 'te_social_terug',
        type: 'single',
        options: ['ja', 'nee', 'onbekend'],
        text: 'Linken socialmediakanalen terug naar de website?',
      },
      {
        id: 'te_social_actief',
        type: 'single',
        options: ['ja', 'nee', 'gedeeltelijk'],
        text: 'Zijn de socialmediakanalen actief en up-to-date?',
      },
      {
        id: 'te_google',
        type: 'score10',
        text: 'Hoe snel komt het bedrijf naar voren bij zoeken op bedrijfsnaam in Google?',
      },
      {
        id: 'te_snel',
        type: 'single',
        options: JA_GED_NEE,
        text: 'Laadt de website snel (binnen 3 seconden)?',
      },
      {
        id: 'te_responsive',
        type: 'single',
        options: JA_GED_NEE,
        text: 'Werkt de website goed op mobiel én laptop (responsive)?',
      },
      {
        id: 'te_https',
        type: 'single',
        options: JA_NEE,
        text: 'Is de website beveiligd met HTTPS?',
      },
      {
        id: 'te_cookie',
        type: 'single',
        options: JA_NEE,
        text: 'Is er een duidelijke cookie-melding?',
      },
      {
        id: 'te_fouten',
        type: 'single',
        options: ['enkele', 'meerdere', 'geen'],
        text: 'Zijn er zichtbare technische fouten of problemen?',
      },
      { id: 'te_beste', type: 'open', text: 'Wat werkt het beste aan deze website?' },
      { id: 'te_score', type: 'score10', scoreFor: 'te', text: 'SCORE TECHNISCHE BASIS' },
    ],
  },
  {
    id: 'sr',
    title: '7b. Social, reviews, SEO & GEO',
    aanvulling: true,
    doel:
      'Aanvulling vanuit de briefing (niet in het Google-formulier): vindbaarheid in Google, ' +
      'zichtbaarheid in AI-antwoorden (GEO), social media en reviews.',
    questions: [
      {
        id: 'sr_title',
        type: 'single',
        options: JA_GED_NEE,
        text: 'Heeft de homepage een goede paginatitel?',
      },
      {
        id: 'sr_meta',
        type: 'single',
        options: JA_GED_NEE,
        text: 'Is er een bruikbare omschrijving voor Google (meta description)?',
      },
      {
        id: 'sr_h1',
        type: 'single',
        options: JA_GED_NEE,
        text: 'Heeft de homepage één duidelijke hoofdkop (H1)?',
      },
      {
        id: 'sr_index',
        type: 'single',
        options: JA_NEE,
        text: 'Mag Google de website indexeren (staat niet op "noindex"/geblokkeerd)?',
      },
      {
        id: 'sr_sitemap',
        type: 'single',
        options: JA_NEE,
        text: 'Is er een sitemap (sitemap.xml)?',
      },
      {
        id: 'sr_schema',
        type: 'single',
        options: JA_GED_NEE,
        text: 'Zijn bedrijfsgegevens gestructureerd aangeleverd (schema.org / LocalBusiness)?',
      },
      {
        id: 'sr_nap',
        type: 'single',
        options: JA_GED_NEE,
        text: 'Staan bedrijfsnaam, vestigingsplaats en contactgegevens duidelijk op de site (NAP)?',
      },
      {
        id: 'sr_alt',
        type: 'single',
        options: JA_GED_NEE,
        text: 'Hebben de afbeeldingen een alternatieve tekst?',
      },
      {
        id: 'geo_crawlers',
        type: 'single',
        options: ['ja', 'nee', 'gedeeltelijk'],
        text: 'GEO: staan AI-zoekmachines toe om de website te lezen (robots.txt)?',
      },
      {
        id: 'geo_structuur',
        type: 'single',
        options: JA_GED_NEE,
        text:
          'GEO: is de content zo opgezet dat een AI er makkelijk antwoorden uit haalt ' +
          '(vraag-en-antwoord, duidelijke kopjes)?',
      },
      {
        id: 'geo_llms',
        type: 'single',
        options: JA_NEE,
        text: 'GEO: is er een llms.txt? (nice-to-have, geen vereiste)',
      },
      {
        id: 'geo_test',
        type: 'open',
        text:
          'GEO-test: wordt het bedrijf genoemd als je het aan ChatGPT / Gemini / Perplexity / ' +
          'Claude vraagt? (gebruik de promptkaart)',
      },
      {
        id: 'rev_google',
        type: 'open',
        text:
          'Reviews & ratings: wat is de Google-beoordeling (aantal en gemiddelde), en wat zeggen ' +
          'de recente reviews?',
      },
      {
        id: 'soc_scorecard',
        type: 'open',
        text: 'Social media scorecard: per kanaal volgers, laatste bericht en kwaliteit',
      },
      { id: 'sr_score', type: 'score10', scoreFor: 'sr', text: 'SCORE SOCIAL, REVIEWS, SEO & GEO' },
    ],
  },
  {
    id: 'gr',
    title: '8. Digitale groeikansen',
    doel: 'Analyseren waar de website kan verbeteren.',
    questions: [
      {
        id: 'gr_kans',
        type: 'single',
        options: ['Content', 'Techniek', 'UX', 'Vindbaarheid', 'Conversie'],
        text: 'Wat is de grootste verbeterkans?',
      },
      {
        id: 'gr_doelen',
        type: 'single',
        options: ['Goed', 'Matig', 'Slecht'],
        text: 'In hoeverre ondersteunt de website de bedrijfsdoelen?',
      },
      { id: 'gr_score', type: 'score10', scoreFor: 'gr', text: 'SCORE DIGITALE GROEIKANSEN' },
    ],
  },
  {
    id: 'ei',
    title: '9. Eindbeoordeling',
    doel: 'Het totaaloordeel, met drie sterke punten en drie verbeterpunten.',
    questions: [
      { id: 'ei_score', type: 'score10', scoreFor: 'ei', text: 'EINDSCORE WEBSITE APK' },
      { id: 'ei_sterk', type: 'open', text: 'Sterke punten (3)' },
      { id: 'ei_verbeter', type: 'open', text: 'Verbeterpunten (3)' },
    ],
  },
];

/** Klantreis-fases uit de briefing (infographic sheet 2). */
const KLANTREIS = [
  ['bewustwording', 'Bewustwording'],
  ['overweging', 'Overweging'],
  ['aankoop', 'Aankoop'],
  ['loyaliteit', 'Loyaliteit'],
  ['aanbeveling', 'Aanbeveling'],
];

module.exports = { SECTIONS, KLANTREIS };
