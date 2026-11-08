// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import type { ProvisionId } from './legal/provisions.js';

/** How strongly the evidence points to the pattern. Not a legal assessment. */
export type Confidence = 'high' | 'medium' | 'low';

/** Detector identifiers. */
export type DetectorId =
  | 'countdown-reset'
  | 'preselected-option'
  | 'confirmshaming'
  | 'asymmetric-choice'
  | 'claim-to-verify'
  | 'price-reduction-prior-price'
  | 'order-button-label'
  | 'hidden-costs';

/** Evidence for a finding. */
export interface Evidence {
  /** CSS selector of the element in the scanned page. */
  readonly selector: string;
  /** Visible text of the element (trimmed, capped). */
  readonly text: string;
  /** Path of the cropped screenshot, relative to the output directory, if one was taken. */
  readonly screenshot?: string;
  /** Detector-specific measurements, for example size ratios or timer readings. */
  readonly details: Readonly<Record<string, string | number | boolean>>;
}

/**
 * A possible issue. Brightline never says something is illegal; a finding is
 * a "possible issue under <provision>" with evidence for a human to review.
 */
export interface Finding {
  /** Stable id within a report, for example "F0003". */
  readonly id: string;
  readonly detector: DetectorId;
  /** Short neutral title. */
  readonly title: string;
  readonly confidence: Confidence;
  /** Provisions the pattern may fall under. First is the primary one. */
  readonly provisions: readonly ProvisionId[];
  /** Short neutral explanation, including what to verify. */
  readonly explanation: string;
  /** Page URL where the pattern was seen. */
  readonly pageUrl: string;
  readonly evidence: Evidence;
}

/** A finding before ids and screenshots are assigned. */
export type DraftFinding = Omit<Finding, 'id' | 'pageUrl' | 'evidence'> & {
  readonly evidence: Omit<Evidence, 'screenshot'>;
};
