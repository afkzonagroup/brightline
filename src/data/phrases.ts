// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Phrase lists used by the detectors. This file is data.
 *
 * `source: 'original'` = written by the maintainers in English.
 * `source: 'translation'` = maintainers' translation; needs native-speaker review
 * before anyone relies on it (listed in the README). None of these phrases are
 * taken from legal texts; official wording lives in `src/legal`.
 */

import type { SourcedPhrase } from '../legal/order-button-labels.js';

const en = (text: string): SourcedPhrase => ({ lang: 'en', text, source: 'original' });
const tr = (lang: string, text: string): SourcedPhrase => ({ lang, text, source: 'translation' });

/** Currency amounts (regex source, used with flags `iu`). */
export const MONEY_SOURCE =
  '(?:€|eur|\\$|£|zł|pln|kr|kč|czk|lei|ron|ft|huf|лв|chf)\\s?\\d|\\d(?:[\\d.,\\s\\u00a0]*\\d)?\\s?(?:€|eur\\b|\\$|£|zł|pln\\b|kr\\b|kč|czk\\b|lei\\b|ron\\b|ft\\b|huf\\b|лв|chf\\b)';

/** Words that mark a dialog as being about cookies, consent or personal data (regex source). */
export const CONSENT_SOURCE =
  'cookie|consent|privacy|personal data|tracking|gdpr|datenschutz|einwillig|confidentialit|consentement|privacidad|riservatezza|toestemming|prywatno|zgod[ay]|slapuk|sutikim|asmens duomen';

/** Id/class hints for overlays (regex source). */
export const DIALOG_HINT_SOURCE = '(?:^|[\\s_-])(?:cookie|consent|gdpr|modal|popup|pop-up|overlay|newsletter|banner|dialog|lightbox)';

/** Loose countdown pattern used to find candidates in the page (regex source). */
export const TIMER_SOURCE =
  '\\b\\d{1,2}\\s?:\\s?\\d{2}(?:\\s?:\\s?\\d{2})?\\b|\\b\\d{1,3}\\s?(?:d|days?|h|hrs?|hours?|m|mins?|minutes?)\\b[\\s,:]*\\d{1,2}\\s?(?:h|hrs?|hours?|m|mins?|minutes?|s|secs?|seconds?)\\b';

/** Labels for an accepting choice (word or phrase, matched on word boundaries). */
export const ACCEPT_WORDS: readonly SourcedPhrase[] = Object.freeze([
  en('accept'),
  en('accept all'),
  en('agree'),
  en('i agree'),
  en('allow'),
  en('allow all'),
  en('yes'),
  en('consent'),
  en('subscribe'),
  en('sign me up'),
  en('claim'),
  en('add'),
  en('upgrade'),
  en('get'),
  en('enable'),
  tr('de', 'akzeptieren'),
  tr('de', 'alle akzeptieren'),
  tr('de', 'zustimmen'),
  tr('de', 'erlauben'),
  tr('de', 'ja'),
  tr('fr', 'accepter'),
  tr('fr', 'tout accepter'),
  tr('fr', 'j\'accepte'),
  tr('fr', 'oui'),
  tr('es', 'aceptar'),
  tr('es', 'aceptar todo'),
  tr('es', 'sí'),
  tr('it', 'accetta'),
  tr('it', 'accetto'),
  tr('nl', 'accepteren'),
  tr('nl', 'alles accepteren'),
  tr('pl', 'akceptuję'),
  tr('pl', 'zaakceptuj'),
  tr('lt', 'sutinku'),
  tr('lt', 'priimti'),
  tr('lt', 'priimti visus'),
]);

/** Labels for a declining choice. */
export const DECLINE_WORDS: readonly SourcedPhrase[] = Object.freeze([
  en('reject'),
  en('reject all'),
  en('decline'),
  en('deny'),
  en('refuse'),
  en('no'),
  en('no thanks'),
  en('not now'),
  en('maybe later'),
  en('skip'),
  en('only necessary'),
  en('necessary only'),
  en('essential only'),
  en('only essential'),
  en('continue without'),
  en('dismiss'),
  tr('de', 'ablehnen'),
  tr('de', 'alle ablehnen'),
  tr('de', 'nein'),
  tr('de', 'nur notwendige'),
  tr('fr', 'refuser'),
  tr('fr', 'tout refuser'),
  tr('fr', 'non'),
  tr('fr', 'continuer sans accepter'),
  tr('es', 'rechazar'),
  tr('es', 'rechazar todo'),
  tr('es', 'no'),
  tr('it', 'rifiuta'),
  tr('it', 'rifiuto'),
  tr('nl', 'weigeren'),
  tr('nl', 'alles weigeren'),
  tr('nl', 'nee'),
  tr('pl', 'odrzuć'),
  tr('pl', 'odrzucam'),
  tr('pl', 'nie'),
  tr('lt', 'atmesti'),
  tr('lt', 'atsisakyti'),
  tr('lt', 'ne'),
]);

/**
 * Labels that refuse optional processing even though they may start with an
 * accepting verb ("Allow necessary cookies only", "Accept only essential").
 * Matched anywhere in the label; they make the control a decline option.
 */
export const NECESSARY_ONLY_WORDS: readonly SourcedPhrase[] = Object.freeze([
  en('necessary only'),
  en('only necessary'),
  en('necessary cookies only'),
  en('only the necessary'),
  en('essential only'),
  en('only essential'),
  en('essential cookies only'),
  en('required only'),
  en('only required'),
  en('required cookies only'),
  en('strictly necessary only'),
  en('without accepting'),
  tr('de', 'nur notwendige'),
  tr('de', 'nur erforderliche'),
  tr('de', 'nur essenzielle'),
  tr('de', 'nur technisch notwendige'),
  tr('fr', 'uniquement les cookies nécessaires'),
  tr('fr', 'nécessaires uniquement'),
  tr('fr', 'sans accepter'),
  tr('es', 'solo necesarias'),
  tr('es', 'solo las necesarias'),
  tr('it', 'solo necessari'),
  tr('it', 'solo quelli necessari'),
  tr('nl', 'alleen noodzakelijke'),
  tr('nl', 'alleen functionele'),
  tr('pl', 'tylko niezbędne'),
  tr('lt', 'tik būtinus'),
  tr('lt', 'tik būtini'),
  tr('lt', 'tik būtinuosius'),
]);

/** Labels for a "settings" choice (neither accept nor decline). */
export const SETTINGS_WORDS: readonly SourcedPhrase[] = Object.freeze([
  en('settings'),
  en('preferences'),
  en('manage'),
  en('customise'),
  en('customize'),
  en('options'),
  en('more options'),
  tr('de', 'einstellungen'),
  tr('fr', 'paramètres'),
  tr('fr', 'personnaliser'),
  tr('es', 'configurar'),
  tr('it', 'impostazioni'),
  tr('nl', 'instellingen'),
  tr('pl', 'ustawienia'),
  tr('lt', 'nustatymai'),
]);

/**
 * Confirmshaming: decline labels that shame or guilt the user. A label that
 * contains one of these phrases is reported with medium confidence.
 */
export const CONFIRMSHAMING_PHRASES: readonly SourcedPhrase[] = Object.freeze([
  en("i don't want to save"),
  en('i do not want to save'),
  en("i don't like saving"),
  en("i don't like discounts"),
  en("i don't want a discount"),
  en("i don't want the discount"),
  en('i prefer to pay full price'),
  en("i'd rather pay full price"),
  en('i would rather pay full price'),
  en("i'll pay full price"),
  en('i will pay full price'),
  en('i like paying full price'),
  en('i like paying more'),
  en('i prefer paying more'),
  en('i hate saving'),
  en('i hate discounts'),
  en('i hate free'),
  en("i don't care about"),
  en('i do not care about'),
  en("i'd rather stay uninformed"),
  en('i prefer to stay uninformed'),
  en("i'll stay uninformed"),
  en('i want to miss out'),
  en("i'm ok missing out"),
  en("i'm okay missing out"),
  en("i'm fine missing out"),
  en("i'm fine with missing out"),
  en("i'll miss out"),
  en("i don't want to be"),
  en("i'll take the risk"),
  en("i'll risk it"),
  en('leave me unprotected'),
  en("i don't need protection"),
  en("i'm not interested in saving"),
  en("i don't want to support"),
  en('no, i like'),
  en("no, i'd rather"),
  en('no, i prefer'),
  tr('de', 'ich will nicht sparen'),
  tr('de', 'ich möchte nicht sparen'),
  tr('de', 'ich zahle lieber den vollen preis'),
  tr('de', 'ich verzichte auf den rabatt'),
  tr('fr', 'je ne veux pas économiser'),
  tr('fr', 'je préfère payer le prix fort'),
  tr('fr', 'je préfère payer plein tarif'),
  tr('es', 'no quiero ahorrar'),
  tr('es', 'prefiero pagar el precio completo'),
  tr('it', 'non voglio risparmiare'),
  tr('it', 'preferisco pagare il prezzo pieno'),
  tr('nl', 'ik wil niet besparen'),
  tr('nl', 'ik betaal liever de volle prijs'),
  tr('pl', 'nie chcę oszczędzać'),
  tr('pl', 'wolę zapłacić pełną cenę'),
  tr('lt', 'nenoriu sutaupyti'),
  tr('lt', 'mieliau mokėsiu visą kainą'),
]);

/** Negative start of a decline label (heuristic). */
export const DECLINE_OPENERS: readonly SourcedPhrase[] = Object.freeze([
  en('no'),
  en('nah'),
  en('nope'),
  en("i don't"),
  en('i do not'),
  en("i'd rather"),
  en('i would rather'),
  en('i prefer'),
  tr('de', 'nein'),
  tr('fr', 'non'),
  tr('es', 'no'),
  tr('it', 'no'),
  tr('nl', 'nee'),
  tr('pl', 'nie'),
  tr('lt', 'ne'),
]);

/** Guilt / loss cues used with {@link DECLINE_OPENERS} (heuristic). */
export const GUILT_CUES: readonly SourcedPhrase[] = Object.freeze([
  en('full price'),
  en('pay more'),
  en('miss out'),
  en('save money'),
  en('savings'),
  en('saving'),
  en('discount'),
  en('deal'),
  en('smart'),
  en('stupid'),
  en('boring'),
  en('hate'),
  en("don't care"),
  en('uninformed'),
  en('unprotected'),
  en('risk'),
  en('lose'),
  en('losing'),
  en('worse'),
  en('fomo'),
  tr('de', 'vollen preis'),
  tr('de', 'sparen'),
  tr('de', 'rabatt'),
  tr('fr', 'prix fort'),
  tr('fr', 'économiser'),
  tr('es', 'ahorrar'),
  tr('es', 'descuento'),
  tr('it', 'risparmiare'),
  tr('it', 'sconto'),
  tr('nl', 'besparen'),
  tr('nl', 'korting'),
  tr('pl', 'oszczędzać'),
  tr('pl', 'zniżki'),
  tr('pl', 'zniżkę'),
  tr('lt', 'sutaupyti'),
  tr('lt', 'nuolaida'),
  tr('lt', 'nuolaidos'),
  tr('lt', 'nuolaidą'),
]);

/**
 * Cues that a pre-selected option is an extra paid item. On a checkbox or
 * switch, one of these is enough for a medium-confidence finding.
 */
export const PAID_ADDON_CUES: readonly SourcedPhrase[] = Object.freeze([
  en('insurance'),
  en('insure'),
  en('protect my'),
  en('protection plan'),
  en('buyer protection'),
  en('purchase protection'),
  en('device protection'),
  en('damage protection'),
  en('theft protection'),
  en('extended warranty'),
  en('warranty'),
  en('donation'),
  en('donate'),
  en('priority'),
  en('express delivery'),
  en('express shipping'),
  en('gift wrap'),
  en('gift wrapping'),
  en('add-on'),
  en('upgrade'),
  en('membership'),
  en('subscription'),
  en('subscribe and save'),
  en('carbon offset'),
  en('offset my'),
  en('travel cover'),
  en('cancellation cover'),
  tr('de', 'versicherung'),
  tr('de', 'garantieverlängerung'),
  tr('de', 'spende'),
  tr('fr', 'assurance'),
  tr('fr', 'extension de garantie'),
  tr('es', 'seguro'),
  tr('es', 'garantía extendida'),
  tr('es', 'donación'),
  tr('it', 'assicurazione'),
  tr('it', 'estensione di garanzia'),
  tr('it', 'donazione'),
  tr('nl', 'verzekering'),
  tr('nl', 'garantieverlenging'),
  tr('pl', 'ubezpieczenie'),
  tr('pl', 'przedłużona gwarancja'),
  tr('lt', 'draudimas'),
  tr('lt', 'pratęsta garantija'),
]);

/**
 * Weaker cues ("express", "premium", "protection", "tip", "guarantee") that
 * also appear in neutral labels such as "express checkout" or "data
 * protection". They count only when the label also names a non-zero amount.
 */
export const WEAK_PAID_ADDON_CUES: readonly SourcedPhrase[] = Object.freeze([
  en('express'),
  en('premium'),
  en('protection'),
  en('guarantee'),
  en('tip'),
  tr('de', 'garantie'),
  tr('fr', 'garantie'),
  tr('es', 'garantía'),
  tr('it', 'garanzia'),
  tr('nl', 'garantie'),
  tr('pl', 'gwarancja'),
  tr('lt', 'garantija'),
]);

/**
 * Cues that a pre-selected option is consent to marketing or data processing.
 * Strong cues give high confidence, the others medium (or high inside a
 * consent dialog).
 */
export const CONSENT_CUES: readonly SourcedPhrase[] = Object.freeze([
  en('newsletter'),
  en('marketing'),
  en('promotional'),
  en('promotions'),
  en('special offers'),
  en('offers and news'),
  en('news and offers'),
  en('third parties'),
  en('third-party'),
  en('partners'),
  en('advertising'),
  en('personalised ads'),
  en('personalized ads'),
  en('i consent'),
  en('consent to'),
  en('share my data'),
  en('share my'),
  en('analytics'),
  en('cookies'),
  en('personalised'),
  en('personalized'),
  en('tracking'),
  tr('de', 'newsletter'),
  tr('de', 'werbung'),
  tr('de', 'einwilligung'),
  tr('fr', 'lettre d\'information'),
  tr('fr', 'offres'),
  tr('fr', 'partenaires'),
  tr('es', 'boletín'),
  tr('es', 'ofertas'),
  tr('it', 'offerte'),
  tr('nl', 'nieuwsbrief'),
  tr('pl', 'zgoda'),
  tr('pl', 'marketing'),
  tr('lt', 'naujienlaiškis'),
  tr('lt', 'naujienlaiškį'),
  tr('lt', 'pasiūlymai'),
]);

/** Consent cues that point clearly to marketing or data sharing (high confidence). */
export const STRONG_CONSENT_CUES: readonly SourcedPhrase[] = Object.freeze([
  en('newsletter'),
  en('marketing'),
  en('promotional'),
  en('promotions'),
  en('special offers'),
  en('offers and news'),
  en('news and offers'),
  en('third parties'),
  en('third-party'),
  en('partners'),
  en('advertising'),
  en('personalised ads'),
  en('personalized ads'),
  tr('de', 'newsletter'),
  tr('de', 'werbung'),
  tr('nl', 'nieuwsbrief'),
  tr('pl', 'marketing'),
  tr('lt', 'naujienlaiškis'),
  tr('lt', 'naujienlaiškį'),
]);

/**
 * Contact cues ("send me", "email me", "SMS") that are consent only when the
 * label also speaks of marketing; on their own they may be service messages
 * about an order. They give low confidence.
 */
export const CONTACT_CUES: readonly SourcedPhrase[] = Object.freeze([
  en('email me'),
  en('e-mail me'),
  en('send me'),
  en('contact me'),
  en('sms'),
  en('text me'),
]);

/** Labels that are legitimately pre-selected (no finding). */
export const BENIGN_PRESELECT: readonly SourcedPhrase[] = Object.freeze([
  en('necessary'),
  en('strictly necessary'),
  en('essential'),
  en('required'),
  en('functional'),
  en('remember me'),
  en('keep me signed in'),
  en('keep me logged in'),
  en('stay signed in'),
  en('same as'),
  en('save this address'),
  en('save address'),
  en('standard delivery'),
  en('standard shipping'),
  en('free delivery'),
  en('free shipping'),
  tr('de', 'notwendig'),
  tr('de', 'erforderlich'),
  tr('fr', 'nécessaires'),
  tr('es', 'necesarias'),
  tr('lt', 'būtini'),
  tr('lt', 'būtinieji'),
]);

/** Statements that a prior (30-day lowest) price is shown, Art. 6a PID. */
export const PRIOR_PRICE_PHRASES: readonly SourcedPhrase[] = Object.freeze([
  en('lowest price in the last 30 days'),
  en('lowest price in the previous 30 days'),
  en('lowest price in the past 30 days'),
  en('lowest price of the last 30 days'),
  en('lowest price during the last 30 days'),
  en('lowest 30-day price'),
  en('30-day low'),
  en('30 day low'),
  en('lowest price 30 days'),
  en('prior price'),
  en('previous price'),
  en('price before reduction'),
  en('price before discount'),
  en('price before the reduction'),
  tr('de', 'niedrigster preis der letzten 30 tage'),
  tr('de', 'niedrigster gesamtpreis der letzten 30 tage'),
  tr('de', 'günstigster preis der letzten 30 tage'),
  tr('fr', 'prix le plus bas des 30 derniers jours'),
  tr('fr', 'prix antérieur'),
  tr('fr', 'prix de référence'),
  tr('es', 'precio más bajo de los últimos 30 días'),
  tr('es', 'precio anterior'),
  tr('it', 'prezzo più basso degli ultimi 30 giorni'),
  tr('it', 'prezzo precedente'),
  tr('nl', 'laagste prijs van de afgelopen 30 dagen'),
  tr('nl', 'laagste prijs afgelopen 30 dagen'),
  tr('pl', 'najniższa cena z 30 dni'),
  tr('pl', 'najniższa cena z ostatnich 30 dni'),
  tr('lt', 'mažiausia kaina per 30 dienų'),
  tr('lt', 'mažiausia kaina per paskutines 30 dienų'),
  tr('lt', 'ankstesnė kaina'),
]);

/** Category of a scarcity / urgency / social-proof claim. */
export type ClaimKind = 'stock' | 'activity' | 'urgency';

/** A text pattern for claims that should be verified. */
export interface ClaimPattern {
  readonly kind: ClaimKind;
  readonly lang: string;
  /** Regex source, used with flags `iu`. */
  readonly pattern: string;
  readonly source: 'original' | 'translation';
}

const cp = (kind: ClaimKind, lang: string, pattern: string): ClaimPattern => ({
  kind,
  lang,
  pattern,
  source: lang === 'en' ? 'original' : 'translation',
});

/** Scarcity, social proof and urgency patterns. */
export const CLAIM_PATTERNS: readonly ClaimPattern[] = Object.freeze([
  cp('stock', 'en', '\\bonly\\s+\\d+\\s+(?:\\w+\\s+){0,2}left\\b'),
  cp('stock', 'en', '\\b\\d+\\s+(?:\\w+\\s+){0,2}left in stock\\b'),
  cp('stock', 'en', '\\b(?:only\\s+)?\\d+\\s+(?:items?|pieces?|units?|rooms?|seats?|tickets?)\\s+(?:left|remaining)\\b'),
  cp('stock', 'en', '\\blow (?:in )?stock\\b'),
  cp('stock', 'en', '\\balmost (?:gone|sold out)\\b'),
  cp('stock', 'en', '\\bselling (?:out )?fast\\b'),
  cp('stock', 'en', '\\bin high demand\\b'),
  cp('stock', 'en', '\\blast (?:one|item|room|seat|ticket)s? (?:left|available)\\b'),
  cp('activity', 'en', '\\b\\d+\\s+(?:other\\s+)?(?:people|persons|customers|users|shoppers|visitors|travell?ers)\\s+(?:are\\s+)?(?:viewing|looking at|watching|considering)\\b'),
  cp('activity', 'en', '\\b\\d+\\s+(?:people|customers|users|shoppers)\\s+(?:have\\s+)?(?:bought|purchased|booked|ordered)\\b'),
  cp('activity', 'en', '\\b(?:bought|purchased|booked|ordered)\\s+\\d+\\s+times\\b'),
  cp('activity', 'en', '\\bin\\s+\\d+\\s+(?:other\\s+)?(?:carts|baskets|bags)\\b'),
  cp('activity', 'en', '\\bsomeone (?:in [\\p{L} ]{1,40} )?just (?:bought|purchased|booked|ordered)\\b'),
  cp('urgency', 'en', '\\b(?:offer|sale|deal|price|discount)s?\\s+ends?\\s+(?:today|tonight|soon|in\\b)'),
  cp('urgency', 'en', '\\btoday only\\b'),
  cp('urgency', 'en', '\\blimited[- ]time (?:offer|only|deal)\\b'),
  cp('urgency', 'en', '\\blast chance\\b'),
  cp('urgency', 'en', '\\bhurry\\b'),
  cp('urgency', 'en', '\\bends in \\d'),
  cp('stock', 'de', '\\bnur noch \\d+\\s+(?:\\p{L}+\\s+)?(?:verfügbar|auf lager|vorrätig|übrig)\\b'),
  cp('activity', 'de', '\\b\\d+\\s+(?:personen|kunden|leute)\\s+(?:sehen sich|betrachten|schauen)'),
  cp('urgency', 'de', '\\bnur heute\\b'),
  cp('stock', 'fr', '\\bplus que \\d+\\s+(?:\\p{L}+\\s+)?(?:en stock|disponibles?)\\b'),
  cp('activity', 'fr', '\\b\\d+\\s+personnes\\s+(?:consultent|regardent)\\b'),
  cp('stock', 'es', '\\bsolo quedan? \\d+\\b'),
  cp('activity', 'es', '\\b\\d+\\s+personas\\s+(?:están viendo|lo están viendo|viendo)\\b'),
  cp('stock', 'it', '\\bsolo \\d+\\s+(?:\\p{L}+\\s+)?rimast[ie]\\b'),
  cp('stock', 'nl', '\\bnog maar \\d+\\s+(?:\\p{L}+\\s+)?(?:beschikbaar|op voorraad)\\b'),
  cp('stock', 'pl', '\\bzostał[ao]? tylko \\d+\\b'),
  cp('stock', 'lt', '\\bliko tik \\d+\\b'),
  cp('activity', 'lt', '\\b\\d+\\s+(?:žmonės|žmonių|lankytojai|lankytojų)\\s+(?:dabar\\s+)?(?:žiūri|peržiūri)\\b'),
]);
