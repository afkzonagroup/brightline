// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Hidden costs: the total grows between journey steps (journey-based).
 *
 * The journey marks checkpoints with a selector for the displayed total. If a
 * later total is higher than an earlier one, the extra cost was not shown up
 * front. Confidence is medium when only clicks / navigation happened between
 * the two checkpoints (the user did not choose anything that costs more), and
 * low when the user filled in or selected something in between, or when the
 * extra amount was already shown on the earlier page. A mark with
 * `expectTotalChange: true` is not compared with the previous one.
 *
 * Legal mapping: CRD Art. 6(1)(e) and 6(6) (total price including all
 * additional charges before the consumer is bound); CRD Art. 8(2) first
 * subparagraph (total price directly before the order); UCPD Art. 7(4)(c).
 */

import type { DraftFinding } from '../types.js';
import { clip } from '../util/text.js';

/** A checkpoint in a journey. */
export interface TotalCheckpoint {
  readonly markName: string;
  readonly selector: string;
  readonly totalText: string;
  /** Parsed total, or null when the text did not contain an amount. */
  readonly total: number | null;
  /** Journey actions performed since the previous checkpoint. */
  readonly actionsSincePrevious: readonly string[];
  readonly expectTotalChange: boolean;
  /**
   * Amounts of money shown elsewhere on the page at this checkpoint (for
   * example "Shipping €4.99, added at checkout"). Optional.
   */
  readonly amountsShown?: readonly number[];
}

const CURRENCY_BEFORE = /(?:€|\$|£|eur|usd|gbp|chf|pln|czk|huf|ron|sek|dkk|nok|bgn)$/iu;
const CURRENCY_AFTER = /^(?:€|\$|£|eur|usd|gbp|chf|zł|pln|kč|czk|ft|huf|lei|ron|kr|sek|dkk|nok|лв|bgn)/iu;

/**
 * Parse an amount of money from display text. Handles "1.234,56 €",
 * "€1,234.56", "1 234,56 zł", "12,99", "12.99", "1234". Returns null if none.
 *
 * @example
 * ```ts
 * parseAmount('Total: 1.234,56 €'); // 1234.56
 * ```
 */
export function parseAmount(text: string): number | null {
  const candidates = [...text.matchAll(/\d(?:[\d.,'\u00a0\u202f ]*\d)?/gu)];
  if (candidates.length === 0) return null;
  // Prefer the number written next to a currency sign or code; otherwise the last number.
  const nextToCurrency = candidates.find((m) => {
    const before = text.slice(Math.max(0, m.index - 4), m.index).trim();
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 5).trim();
    return CURRENCY_BEFORE.test(before) || CURRENCY_AFTER.test(after);
  });
  const match = nextToCurrency ?? candidates[candidates.length - 1];
  if (match === undefined) return null;
  let raw = match[0].replace(/[\s\u00a0\u202f']/gu, '');
  raw = raw.replace(/[.,]+$/u, '');
  if (raw === '') return null;
  const lastSep = Math.max(raw.lastIndexOf('.'), raw.lastIndexOf(','));
  let normalised: string;
  if (lastSep === -1) {
    normalised = raw;
  } else {
    const decimals = raw.length - lastSep - 1;
    const intPart = raw.slice(0, lastSep).replace(/[.,]/g, '');
    normalised = decimals === 1 || decimals === 2 ? `${intPart}.${raw.slice(lastSep + 1)}` : raw.replace(/[.,]/g, '');
  }
  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}

const PASSIVE_ACTIONS = new Set(['click', 'goto', 'waitFor']);

/** Detect total increases between checkpoints. Pure. */
export function detectHiddenCosts(checkpoints: readonly TotalCheckpoint[]): DraftFinding[] {
  const findings: DraftFinding[] = [];
  let previous: TotalCheckpoint | undefined;
  for (const cp of checkpoints) {
    if (cp.total === null) continue;
    if (previous !== undefined && previous.total !== null && !cp.expectTotalChange) {
      const delta = Math.round((cp.total - previous.total) * 100) / 100;
      if (delta > 0.004) {
        const passive = cp.actionsSincePrevious.every((a) => PASSIVE_ACTIONS.has(a));
        // The extra amount was already shown at the earlier step (for example as a delivery charge).
        const shownEarlier = (previous.amountsShown ?? []).some((a) => Math.abs(a - delta) < 0.005);
        findings.push({
          detector: 'hidden-costs',
          title: 'Total price increased between checkout steps',
          confidence: passive && !shownEarlier ? 'medium' : 'low',
          provisions: ['crd-art-6-1-e', 'crd-art-8-2-sub1', 'ucpd-art-7'],
          explanation:
            `The total went from "${clip(previous.totalText, 40)}" at "${clip(previous.markName, 40)}" to "${clip(cp.totalText, 40)}" at "${clip(cp.markName, 40)}"` +
            (passive ? ' although the user only moved forward. ' : ' after the user entered or selected something. ') +
            (shownEarlier ? 'The same amount was shown on the earlier step; check that it was clearly stated as part of the price. ' : '') +
            'Charges that appear late are a possible issue under CRD Art. 6(1)(e) (total price including all additional charges) and UCPD Art. 7(4)(c). Verify what the extra amount is for.',
          evidence: {
            selector: cp.selector,
            text: clip(cp.totalText, 80),
            details: {
              fromMark: clip(previous.markName, 60),
              toMark: clip(cp.markName, 60),
              fromTotal: previous.total,
              toTotal: cp.total,
              increase: delta,
              actionsBetween: cp.actionsSincePrevious.join(','),
              amountShownEarlier: shownEarlier,
            },
          },
        });
      }
    }
    previous = cp;
  }
  return findings;
}
