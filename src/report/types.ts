// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import { PROVISIONS, type Provision, type ProvisionId } from '../legal/provisions.js';
import type { BlockedRequest } from '../net/proxy.js';
import type { Confidence, DetectorId, Finding } from '../types.js';

/** Version of the JSON report format (semver). Breaking changes bump the major. */
export const REPORT_SCHEMA_VERSION = '1.0.0';

/** Package version. Kept in sync with package.json by a test. */
export const TOOL_VERSION = '0.1.1';

/** Fixed disclaimer included in every report. */
export const DISCLAIMER =
  'Brightline reports possible issues found by automated heuristics. It does not decide whether anything is illegal and is not legal advice. ' +
  'Every finding needs review by a person who knows the facts and the applicable national law.';

/** Outcome for one page. */
export interface PageResult {
  readonly url: string;
  readonly status: 'scanned' | 'skipped-robots' | 'not-html' | 'error';
  readonly httpStatus?: number;
  readonly error?: string;
}

/** Outcome of a journey. */
export interface JourneyResult {
  readonly name: string;
  readonly completed: boolean;
  readonly stepsRun: number;
  readonly marks: readonly string[];
  readonly error?: string;
}

/** Limits the scan ran with. */
export interface ReportLimits {
  readonly maxPages: number;
  readonly maxDurationMs: number;
  readonly navigationTimeoutMs: number;
  readonly maxResponseBytes: number;
  readonly maxTotalBytes: number;
  readonly maxRedirects: number;
  readonly respectRobotsTxt: boolean;
}

/** Counts per confidence and detector. */
export interface ReportSummary {
  readonly total: number;
  readonly high: number;
  readonly medium: number;
  readonly low: number;
  readonly byDetector: Readonly<Partial<Record<DetectorId, number>>>;
}

/** The JSON report. */
export interface ScanReport {
  readonly schemaVersion: string;
  readonly tool: { readonly name: 'brightline'; readonly version: string };
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly startUrl: string;
  readonly pages: readonly PageResult[];
  readonly journey?: JourneyResult;
  readonly findings: readonly Finding[];
  readonly summary: ReportSummary;
  /** Provisions referenced by the findings, with links to the official text. */
  readonly provisions: readonly Provision[];
  /** Requests refused by the network guard (capped). */
  readonly blockedRequests: readonly BlockedRequest[];
  readonly limits: ReportLimits;
  readonly notes: readonly string[];
  readonly disclaimer: string;
}

const RANK: Readonly<Record<Confidence, number>> = { high: 0, medium: 1, low: 2 };

/** Order findings: confidence, then detector, then page. Pure. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => RANK[a.confidence] - RANK[b.confidence] || a.detector.localeCompare(b.detector) || a.pageUrl.localeCompare(b.pageUrl),
  );
}

/** Summarise findings. Pure. */
export function summarize(findings: readonly Finding[]): ReportSummary {
  const byDetector: Partial<Record<DetectorId, number>> = {};
  let high = 0;
  let medium = 0;
  let low = 0;
  for (const f of findings) {
    byDetector[f.detector] = (byDetector[f.detector] ?? 0) + 1;
    if (f.confidence === 'high') high += 1;
    else if (f.confidence === 'medium') medium += 1;
    else low += 1;
  }
  return { total: findings.length, high, medium, low, byDetector };
}

/** Provisions referenced by findings, in catalogue order. Pure. */
export function referencedProvisions(findings: readonly Finding[]): Provision[] {
  const used = new Set<ProvisionId>(findings.flatMap((f) => f.provisions));
  return Object.values(PROVISIONS).filter((p) => used.has(p.id));
}

/** True if a confidence is at or above a threshold. */
export function atLeast(confidence: Confidence, threshold: Confidence): boolean {
  return RANK[confidence] <= RANK[threshold];
}
