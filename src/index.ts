// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Brightline: finds likely manipulative design on websites and maps each
 * finding to the EU provision it may fall under. Reports possible issues with
 * evidence; never decides that anything is illegal.
 *
 * @packageDocumentation
 */

export { scan, normaliseLimits, type ScanOptions } from './scan.js';
export { writeReports, type WriteReportsOptions, type WrittenReports } from './report/write.js';
export { renderHtmlReport, escapeHtml, ATTRIBUTION, IMAGE_LIMITS, type HtmlOptions } from './report/html.js';
export {
  REPORT_SCHEMA_VERSION,
  TOOL_VERSION,
  DISCLAIMER,
  summarize,
  sortFindings,
  atLeast,
  type ScanReport,
  type PageResult,
  type JourneyResult,
  type ReportLimits,
  type ReportSummary,
} from './report/types.js';
export { validateJourney, parseJourney, JourneyValidationError, JOURNEY_LIMITS, type Journey, type JourneyStep } from './journey/schema.js';
export { PROVISIONS, getProvision, type Provision, type ProvisionId } from './legal/provisions.js';
export { OFFICIAL_ORDER_BUTTON_LABELS, type SourcedPhrase, type PhraseSource } from './legal/order-button-labels.js';
export { DETECTORS, DETECTOR_IDS, isDetectorId, runPageDetectors, type DetectorInfo } from './detectors/index.js';
export {
  detectAsymmetricChoice,
  detectClaims,
  detectConfirmshaming,
  detectCountdownReset,
  detectHiddenCosts,
  detectOrderButton,
  detectPreselected,
  detectPriceReduction,
  assessOrderButtonLabel,
  parseAmount,
  parseTimerSeconds,
} from './detectors/index.js';
export { classifyIp, parseIp, type IpVerdict } from './net/ip.js';
export { checkUrlSyntax, resolveAndCheck, BlockedRequestError, systemResolver, type NetworkPolicy, type Resolver, type ResolvedAddress } from './net/guard.js';
export type { BlockedRequest } from './net/proxy.js';
export type { Confidence, DetectorId, Evidence, Finding, DraftFinding } from './types.js';
export type { PageSnapshot } from './browser/snapshot.js';
