// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Order button wording under Consumer Rights Directive Art. 8(2), second subparagraph.
 *
 * `official` entries are copied verbatim from the official language versions of
 * the consolidated Directive 2011/83/EU (CELEX 02011L0083-20260927) on EUR-Lex.
 * The Irish (GA) consolidated text shows this subparagraph in English only, so
 * there is no Irish entry.
 *
 * `translation` entries are common "corresponding unambiguous formulations" that
 * are NOT taken from the legal text. They are the maintainers' judgement and
 * need native-speaker and legal review per language.
 */

/** Where a phrase comes from. */
export type PhraseSource = 'official' | 'original' | 'translation';

/** A phrase with its language and provenance. */
export interface SourcedPhrase {
  /** BCP 47 language code. */
  readonly lang: string;
  readonly text: string;
  /**
   * `official`: verbatim from an official EU text.
   * `original`: written by the maintainers in that language (English only).
   * `translation`: maintainers' translation, needs native review.
   */
  readonly source: PhraseSource;
}

/** Verbatim "order with obligation to pay" in each official language version. */
export const OFFICIAL_ORDER_BUTTON_LABELS: readonly SourcedPhrase[] = Object.freeze([
  { lang: 'bg', text: 'поръчка със задължение за плащане', source: 'official' },
  { lang: 'cs', text: 'objednávka zavazující k platbě', source: 'official' },
  { lang: 'da', text: 'ordre med betalingsforpligtelse', source: 'official' },
  { lang: 'de', text: 'zahlungspflichtig bestellen', source: 'official' },
  { lang: 'el', text: 'παραγγελία με υποχρέωση πληρωμής', source: 'official' },
  { lang: 'en', text: 'order with obligation to pay', source: 'official' },
  { lang: 'es', text: 'pedido con obligación de pago', source: 'official' },
  { lang: 'et', text: 'tellimus koos maksekohustusega', source: 'official' },
  { lang: 'fi', text: 'tilaukseen liittyy maksuvelvollisuus', source: 'official' },
  { lang: 'fr', text: 'commande avec obligation de paiement', source: 'official' },
  { lang: 'hr', text: 'narudžba s obvezom plaćanja', source: 'official' },
  { lang: 'hu', text: 'fizetési kötelezettséggel járó megrendelés', source: 'official' },
  { lang: 'it', text: 'ordine con obbligo di pagare', source: 'official' },
  { lang: 'lt', text: 'užsakymas su mokėjimo pareiga', source: 'official' },
  { lang: 'lv', text: 'pasūtījums ar pienākumu maksāt', source: 'official' },
  { lang: 'mt', text: 'ordni b\'obbligu ta’ pagament', source: 'official' },
  { lang: 'nl', text: 'bestelling met betalingsverplichting', source: 'official' },
  { lang: 'pl', text: 'zamówienie z obowiązkiem zapłaty', source: 'official' },
  { lang: 'pt', text: 'encomenda com obrigação de pagar', source: 'official' },
  { lang: 'ro', text: 'comandă ce implică o obligație de plată', source: 'official' },
  { lang: 'sk', text: 'objednávka s povinnosťou platby', source: 'official' },
  { lang: 'sl', text: 'naročilo z obveznostjo plačila', source: 'official' },
  { lang: 'sv', text: 'beställning förenad med betalningsskyldighet', source: 'official' },
]);

/**
 * Words that, in the maintainers' reading, make a label point to an obligation
 * to pay ("pay", "buy", "purchase"). A label containing one of these is not
 * flagged. English is `original`; other languages are `translation`.
 */
export const PAYMENT_WORDS: readonly SourcedPhrase[] = Object.freeze([
  { lang: 'en', text: 'pay', source: 'original' },
  { lang: 'en', text: 'buy', source: 'original' },
  { lang: 'en', text: 'purchase', source: 'original' },
  { lang: 'de', text: 'zahlungspflichtig', source: 'translation' },
  { lang: 'de', text: 'kaufen', source: 'translation' },
  { lang: 'de', text: 'bezahlen', source: 'translation' },
  { lang: 'de', text: 'kostenpflichtig', source: 'translation' },
  { lang: 'fr', text: 'payer', source: 'translation' },
  { lang: 'fr', text: 'acheter', source: 'translation' },
  { lang: 'fr', text: 'achat', source: 'translation' },
  { lang: 'es', text: 'pagar', source: 'translation' },
  { lang: 'es', text: 'comprar', source: 'translation' },
  { lang: 'es', text: 'compra', source: 'translation' },
  { lang: 'it', text: 'pagare', source: 'translation' },
  { lang: 'it', text: 'acquista', source: 'translation' },
  { lang: 'it', text: 'acquisto', source: 'translation' },
  { lang: 'it', text: 'paga', source: 'translation' },
  { lang: 'nl', text: 'betalen', source: 'translation' },
  { lang: 'nl', text: 'kopen', source: 'translation' },
  { lang: 'nl', text: 'betaalverplichting', source: 'translation' },
  { lang: 'nl', text: 'betalingsverplichting', source: 'translation' },
  { lang: 'pl', text: 'zapłać', source: 'translation' },
  { lang: 'pl', text: 'kupuję', source: 'translation' },
  { lang: 'pl', text: 'płacę', source: 'translation' },
  { lang: 'pl', text: 'zakup', source: 'translation' },
  { lang: 'lt', text: 'apmokėti', source: 'translation' },
  { lang: 'lt', text: 'pirkti', source: 'translation' },
  { lang: 'lt', text: 'mokėti', source: 'translation' },
]);

/**
 * Generic labels that give no hint of an obligation to pay. A final order
 * button labelled only with one of these is reported with high confidence.
 */
export const GENERIC_LABELS: readonly SourcedPhrase[] = Object.freeze([
  { lang: 'en', text: 'continue', source: 'original' },
  { lang: 'en', text: 'next', source: 'original' },
  { lang: 'en', text: 'submit', source: 'original' },
  { lang: 'en', text: 'confirm', source: 'original' },
  { lang: 'en', text: 'proceed', source: 'original' },
  { lang: 'en', text: 'ok', source: 'original' },
  { lang: 'en', text: 'done', source: 'original' },
  { lang: 'en', text: 'finish', source: 'original' },
  { lang: 'en', text: 'send', source: 'original' },
  { lang: 'de', text: 'weiter', source: 'translation' },
  { lang: 'de', text: 'bestätigen', source: 'translation' },
  { lang: 'de', text: 'absenden', source: 'translation' },
  { lang: 'fr', text: 'continuer', source: 'translation' },
  { lang: 'fr', text: 'valider', source: 'translation' },
  { lang: 'es', text: 'continuar', source: 'translation' },
  { lang: 'it', text: 'continua', source: 'translation' },
  { lang: 'nl', text: 'verder', source: 'translation' },
  { lang: 'pl', text: 'dalej', source: 'translation' },
  { lang: 'lt', text: 'tęsti', source: 'translation' },
  { lang: 'lt', text: 'toliau', source: 'translation' },
]);
