// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Order button labelling, CRD Art. 8(2) second subparagraph (journey-based).
 *
 * The button that places an order with an obligation to pay must be labelled
 * "only with the words 'order with obligation to pay' or a corresponding
 * unambiguous formulation". The official wording in every official language is
 * in `src/legal/order-button-labels.ts`.
 *
 * - Official wording, or a label with a payment word ("pay", "buy",
 *   "purchase", ...): not reported.
 * - A generic label ("Continue", "Submit", "Confirm"): high confidence.
 * - Anything else ("Place order", "Complete order"): medium confidence, because
 *   it does not say that the order entails an obligation to pay.
 */

import { GENERIC_LABELS, OFFICIAL_ORDER_BUTTON_LABELS, PAYMENT_WORDS, type SourcedPhrase } from '../legal/order-button-labels.js';
import type { DraftFinding } from '../types.js';
import { clip, equalsPhrase, findPhrase, normalizeText } from '../util/text.js';

/** Verdict on a label. */
export interface OrderButtonVerdict {
  readonly verdict: 'official' | 'payment-word' | 'generic' | 'unclear';
  readonly matched?: SourcedPhrase;
}

/** Assess an order button label. Pure. */
export function assessOrderButtonLabel(label: string): OrderButtonVerdict {
  const t = normalizeText(label);
  const official = findPhrase(t, OFFICIAL_ORDER_BUTTON_LABELS);
  if (official !== undefined) return { verdict: 'official', matched: official };
  const payment = findPhrase(t, PAYMENT_WORDS);
  if (payment !== undefined) return { verdict: 'payment-word', matched: payment };
  if (t === '') return { verdict: 'generic' };
  const generic = equalsPhrase(t, GENERIC_LABELS);
  if (generic !== undefined) return { verdict: 'generic', matched: generic };
  return { verdict: 'unclear' };
}

/** Input: the final order button seen in a journey. */
export interface OrderButtonObservation {
  readonly markName: string;
  readonly selector: string;
  /** Accessible label (text, value or aria-label). */
  readonly label: string;
  readonly found: boolean;
}

/** Detect order-button labelling issues. Pure. */
export function detectOrderButton(observations: readonly OrderButtonObservation[]): DraftFinding[] {
  const findings: DraftFinding[] = [];
  for (const o of observations) {
    if (!o.found) {
      findings.push({
        detector: 'order-button-label',
        title: 'Order button from the journey not found',
        confidence: 'low',
        provisions: ['crd-art-8-2-sub2'],
        explanation:
          `The journey step "${clip(o.markName, 60)}" names an order button that was not found or not visible, so its label could not be checked. Fix the selector and scan again.`,
        evidence: { selector: o.selector, text: '', details: { mark: clip(o.markName, 60) } },
      });
      continue;
    }
    const v = assessOrderButtonLabel(o.label);
    if (v.verdict === 'official' || v.verdict === 'payment-word') continue;
    findings.push({
      detector: 'order-button-label',
      title: 'Order button does not say that ordering means paying',
      confidence: v.verdict === 'generic' ? 'high' : 'medium',
      provisions: ['crd-art-8-2-sub2'],
      explanation:
        `The button that places the order reads "${clip(o.label, 60)}". ` +
        'For an electronic order with an obligation to pay, the button must be labelled only with "order with obligation to pay" or a corresponding unambiguous formulation: a possible issue under CRD Art. 8(2). ' +
        'If the trader does not comply, the consumer is not bound by the contract or order.',
      evidence: { selector: o.selector, text: clip(o.label, 120), details: { mark: clip(o.markName, 60), verdict: v.verdict } },
    });
  }
  return findings;
}
