// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import type { PageSnapshot } from '../browser/snapshot.js';
import type { ProvisionId } from '../legal/provisions.js';
import type { Confidence, DetectorId, DraftFinding } from '../types.js';
import { detectAsymmetricChoice } from './asymmetric.js';
import { detectClaims } from './claims.js';
import { detectConfirmshaming } from './confirmshaming.js';
import { detectPreselected } from './preselected.js';
import { detectPriceReduction } from './price-reduction.js';

/** Description of a detector. */
export interface DetectorInfo {
  readonly id: DetectorId;
  readonly name: string;
  /** "page": runs on every scanned page. "reload": loads pages again. "journey": needs a journey. */
  readonly needs: 'page' | 'reload' | 'journey';
  readonly provisions: readonly ProvisionId[];
  readonly confidences: readonly Confidence[];
}

/** All detectors. */
export const DETECTORS: readonly DetectorInfo[] = Object.freeze([
  { id: 'countdown-reset', name: 'Countdown timer restarts', needs: 'reload', provisions: ['ucpd-annex-i-7', 'ucpd-art-6-1'], confidences: ['high', 'low'] },
  { id: 'preselected-option', name: 'Pre-selected paid extra or consent', needs: 'page', provisions: ['crd-art-22', 'gdpr-art-4-11', 'gdpr-art-7'], confidences: ['high', 'medium', 'low'] },
  { id: 'confirmshaming', name: 'Guilt or shame wording on decline', needs: 'page', provisions: ['ucpd-art-5', 'ucpd-art-8-9', 'gdpr-art-4-11', 'dsa-art-25'], confidences: ['medium', 'low'] },
  { id: 'asymmetric-choice', name: 'Decline much weaker than accept', needs: 'page', provisions: ['gdpr-art-4-11', 'gdpr-art-7', 'ucpd-art-5', 'dsa-art-25'], confidences: ['high', 'medium', 'low'] },
  { id: 'claim-to-verify', name: 'Scarcity, popularity or urgency claim to verify', needs: 'page', provisions: ['ucpd-art-6-1', 'ucpd-annex-i-18', 'ucpd-annex-i-7'], confidences: ['low'] },
  { id: 'price-reduction-prior-price', name: 'Price reduction without prior price', needs: 'page', provisions: ['pid-art-6a', 'ucpd-art-6-1'], confidences: ['medium', 'low'] },
  { id: 'order-button-label', name: 'Order button wording', needs: 'journey', provisions: ['crd-art-8-2-sub2'], confidences: ['high', 'medium', 'low'] },
  { id: 'hidden-costs', name: 'Total increases between steps', needs: 'journey', provisions: ['crd-art-6-1-e', 'crd-art-8-2-sub1', 'ucpd-art-7'], confidences: ['medium', 'low'] },
]);

/** All detector ids. */
export const DETECTOR_IDS: readonly DetectorId[] = Object.freeze(DETECTORS.map((d) => d.id));

/** True if the string is a detector id. */
export function isDetectorId(value: string): value is DetectorId {
  return (DETECTOR_IDS as readonly string[]).includes(value);
}

const PAGE_DETECTORS: readonly [DetectorId, (s: PageSnapshot) => DraftFinding[]][] = [
  ['preselected-option', detectPreselected],
  ['confirmshaming', detectConfirmshaming],
  ['asymmetric-choice', detectAsymmetricChoice],
  ['claim-to-verify', detectClaims],
  ['price-reduction-prior-price', detectPriceReduction],
];

/** Run every enabled snapshot-based detector. Pure. */
export function runPageDetectors(snapshot: PageSnapshot, enabled: ReadonlySet<DetectorId>): DraftFinding[] {
  return PAGE_DETECTORS.filter(([id]) => enabled.has(id)).flatMap(([, fn]) => fn(snapshot));
}

export { detectAsymmetricChoice } from './asymmetric.js';
export { detectClaims } from './claims.js';
export { detectConfirmshaming } from './confirmshaming.js';
export { detectCountdownReset, parseTimerSeconds } from './countdown.js';
export { detectHiddenCosts, parseAmount } from './hidden-costs.js';
export { assessOrderButtonLabel, detectOrderButton } from './order-button.js';
export { detectPreselected } from './preselected.js';
export { detectPriceReduction } from './price-reduction.js';
