// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Price reductions without a stated prior price (Price Indication Directive
 * 98/6/EC Art. 6a, inserted by Directive (EU) 2019/2161).
 *
 * Heuristic, per product container:
 * - a discount percentage with no other amount of money: medium confidence;
 *   with a second amount that is not marked as the prior price: low;
 * - a struck-through price with no statement that it is the lowest price of
 *   the previous 30 days: low confidence (the struck price may be the prior
 *   price; the reviewer should verify it).
 * A container that mentions the prior / 30-day lowest price is not reported.
 * General banners without any amount of money are ignored.
 */

import type { PageSnapshot, PriceSignal } from '../browser/snapshot.js';
import { MONEY_SOURCE, PRIOR_PRICE_PHRASES } from '../data/phrases.js';
import type { DraftFinding } from '../types.js';
import { clip, findPhrase, normalizeText } from '../util/text.js';

const MONEY = new RegExp(MONEY_SOURCE, 'iu');

/** Discount wording around a percentage (regex, flags `iu`). */
export const DISCOUNT_PERCENT =
  /(?:^|[\s(])[-−–]\s?\d{1,2}(?:[.,]\d)?\s?%|\d{1,2}\s?%\s?(?:off|rabatt|de réduction|de remise|descuento|de descuento|sconto|di sconto|korting|zniżki|taniej|nuolaida)|(?:save|spare|sparen sie|économisez|ahorra|risparmia|bespaar|oszczędź|sutaupykite)\s(?:up to\s)?\d{1,2}\s?%/iu;

const THIRTY_DAYS =
  /\b30\b[^.]{0,40}\b(?:days?|tage[n]?|jours|días|giorni|dagen|dni|dienų|dienas|päeva|päivän|dage|dagar|dní|napi?|zile)(?![\p{L}\p{N}])/iu;

/**
 * "Lowest" in the languages of {@link THIRTY_DAYS}. A 30-day mention counts as
 * a prior-price statement only together with one of these, so that "30 days
 * free returns" next to a struck price does not hide the finding.
 */
const LOWEST =
  /(?<![\p{L}])(?:lowest|niedrigst|günstigst|plus bas|más baj|più bass|laagste|najniższ|mažiausi|zemāk|madalaim|alhaisin|laveste|lägsta|nejnižš|najnižš|legalacsonyabb|cel mai mic|най-ниск|χαμηλότερ|mais baix|prior price|previous price)/iu;

/** True if the text states a prior / 30-day lowest price. Pure. */
export function statesPriorPrice(text: string): boolean {
  const t = normalizeText(text);
  return findPhrase(t, PRIOR_PRICE_PHRASES) !== undefined || (THIRTY_DAYS.test(t) && LOWEST.test(t));
}

/** A whole amount of money with its currency sign or code before or after it. */
const AMOUNT =
  /(?:[€$£]|(?<![\p{L}])(?:eur|chf|pln|czk|huf|ron|sek|dkk|bgn)(?![\p{L}]))\s?\d[\d.,]*|\d[\d.,]*\s?(?:[€$£]|zł|kč|лв|(?<![\p{L}])(?:eur|chf|pln|czk|huf|ron|lei|ft|kr|sek|dkk|bgn)(?![\p{L}]))/giu;

/** Number of distinct amounts of money in a text (compared by their digits). Pure. */
export function countAmounts(text: string): number {
  return new Set((text.match(AMOUNT) ?? []).map((m) => m.replace(/\D/g, ''))).size;
}

/** True if a short text announces a percentage reduction. Pure. */
export function isDiscountPercent(text: string): boolean {
  return DISCOUNT_PERCENT.test(normalizeText(text));
}

/** Detect price reductions without a prior price in a snapshot. Pure. */
export function detectPriceReduction(snapshot: PageSnapshot): DraftFinding[] {
  const byContainer = new Map<string, PriceSignal[]>();
  for (const s of snapshot.priceSignals) {
    if (s.kind === 'percent' && !isDiscountPercent(s.text)) continue;
    const list = byContainer.get(s.containerSelector) ?? [];
    list.push(s);
    byContainer.set(s.containerSelector, list);
  }
  const findings: DraftFinding[] = [];
  for (const [containerSelector, signals] of byContainer) {
    const first = signals[0];
    if (first === undefined) continue;
    const containerText = first.containerText;
    if (!MONEY.test(containerText)) continue;
    if (statesPriorPrice(containerText)) continue;
    const strike = signals.find((s) => s.kind === 'strikethrough');
    const percent = signals.find((s) => s.kind === 'percent');
    if (strike === undefined && percent !== undefined) {
      // A second amount may be a reference price written as text ("was €80"), so it is weaker evidence.
      const secondAmount = countAmounts(containerText) >= 2;
      findings.push({
        detector: 'price-reduction-prior-price',
        title: 'Price reduction announced without a prior price',
        confidence: secondAmount ? 'low' : 'medium',
        provisions: ['pid-art-6a', 'ucpd-art-6-1'],
        explanation:
          `A reduction ("${clip(percent.text, 30)}") is announced but ${secondAmount ? 'no amount is clearly marked as the prior price' : 'no prior price is shown'}. ` +
          'Any announcement of a price reduction must indicate the prior price, the lowest price in at least the 30 days before the reduction: a possible issue under PID Art. 6a. ' +
          (secondAmount ? 'Verify whether the other amount shown is that prior price. ' : '') +
          'Applies to goods; national rules may differ for perishable goods, new products and progressive reductions.',
        evidence: { selector: containerSelector, text: clip(containerText, 240), details: { badge: clip(percent.text, 40), otherAmountShown: secondAmount } },
      });
    } else if (strike !== undefined) {
      findings.push({
        detector: 'price-reduction-prior-price',
        title: 'Struck-through price without a 30-day prior-price statement',
        confidence: 'low',
        provisions: ['pid-art-6a'],
        explanation:
          `A struck-through price ("${clip(strike.text, 30)}") announces a reduction, but nothing states that it is the lowest price of the previous 30 days. ` +
          'If the struck price is not the prior price as defined in PID Art. 6a(2), this is a possible issue under PID Art. 6a. Verify against price history.',
        evidence: {
          selector: containerSelector,
          text: clip(containerText, 240),
          details: { struckPrice: clip(strike.text, 40), hasPercentBadge: percent !== undefined },
        },
      });
    }
  }
  return findings;
}
