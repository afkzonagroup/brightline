// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Playwright test helper: run Brightline's page detectors on a page inside
 * your own Playwright tests.
 *
 * The page is yours (your test, your network), so the scanner's SSRF guard
 * does not apply here: nothing is fetched by this helper. Countdown restarts
 * and journey checks are not run (they need reloads or a journey).
 *
 * @example
 * ```ts
 * import { test, expect } from '@playwright/test';
 * import { brightlineMatchers } from '@afkzona/brightline/playwright';
 * expect.extend(brightlineMatchers);
 *
 * test('checkout has no pre-ticked paid extras', async ({ page }) => {
 *   await page.goto('/checkout');
 *   await expect(page).toHaveNoBrightlineFindings({ minConfidence: 'medium' });
 * });
 * ```
 */

import type { Page } from 'playwright-core';
import { snapshotPage } from '../browser/page-ops.js';
import { DETECTOR_IDS, runPageDetectors } from '../detectors/index.js';
import { PROVISIONS } from '../legal/provisions.js';
import { atLeast, sortFindings } from '../report/types.js';
import type { Confidence, DetectorId, Finding } from '../types.js';

/** Options for {@link scanPage}. */
export interface ScanPageOptions {
  /** Detectors to run. Default: all page detectors. */
  readonly detectors?: readonly DetectorId[];
  /** Only return findings at or above this confidence. Default 'low'. */
  readonly minConfidence?: Confidence;
}

/**
 * Run the page detectors on the current state of `page`.
 * Works with pages from `@playwright/test` and `playwright` / `playwright-core`.
 */
export async function scanPage(page: Page, options: ScanPageOptions = {}): Promise<Finding[]> {
  const snapshot = await snapshotPage(page);
  const enabled = new Set(options.detectors ?? DETECTOR_IDS);
  const min = options.minConfidence ?? 'low';
  const url = page.url();
  const findings = runPageDetectors(snapshot, enabled)
    .filter((d) => atLeast(d.confidence, min))
    .map((d, i) => ({ ...d, id: `F${String(i + 1).padStart(4, '0')}`, pageUrl: url, evidence: { ...d.evidence } }));
  return sortFindings(findings);
}

/** Format findings for a test failure message. */
export function formatFindings(findings: readonly Finding[]): string {
  return findings
    .map((f) => {
      const cites = f.provisions.map((id) => PROVISIONS[id].citation).join(', ');
      return `- [${f.confidence}] ${f.title} (possible issue under ${cites})\n  element: ${f.evidence.selector}\n  text: ${f.evidence.text}`;
    })
    .join('\n');
}

/** Result shape expected by `expect.extend` in Playwright Test and Vitest. */
export interface MatcherResult {
  readonly pass: boolean;
  readonly message: () => string;
  readonly name: string;
}

/**
 * Custom matchers for `expect.extend`. `toHaveNoBrightlineFindings` passes when
 * no page detector finds anything at or above `minConfidence`.
 */
export const brightlineMatchers = {
  async toHaveNoBrightlineFindings(this: unknown, page: Page, options: ScanPageOptions = {}): Promise<MatcherResult> {
    const findings = await scanPage(page, options);
    const pass = findings.length === 0;
    return {
      pass,
      name: 'toHaveNoBrightlineFindings',
      message: () =>
        pass
          ? 'Expected Brightline findings, but there were none.'
          : `Brightline found ${String(findings.length)} possible issue(s) on ${page.url()}:\n${formatFindings(findings)}`,
    };
  },
};
