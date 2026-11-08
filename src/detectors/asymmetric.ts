// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Asymmetric choice in dialogs and banners: the decline option is visually
 * much weaker than the accept option, or missing from the first layer.
 *
 * Measured from computed styles and bounding boxes: area, font size, text
 * contrast (WCAG formula), filled button versus plain link, opacity.
 *
 * Legal mapping: for consent requests, GDPR Art. 4(11) and Art. 7 (freely
 * given, unambiguous consent); DSA Art. 25 is not listed there because
 * Art. 25(2) excludes practices covered by the GDPR. Otherwise the UCPD
 * general clause (Art. 5(2)), with DSA Art. 25(3)(a) ("giving more prominence
 * to certain choices") as a secondary reference for online platforms only.
 * Outside consent requests confidence is capped at medium.
 */

import type { ClickableInfo, PageSnapshot } from '../browser/snapshot.js';
import { ACCEPT_WORDS, DECLINE_WORDS, NECESSARY_ONLY_WORDS, SETTINGS_WORDS } from '../data/phrases.js';
import type { ProvisionId } from '../legal/provisions.js';
import type { Confidence, DraftFinding } from '../types.js';
import { colorDistance, contrastRatio, over, parseColor, type Rgba } from '../util/color.js';
import { clip, findPhrase, findPrefix } from '../util/text.js';
import { assessDeclineLabel } from './confirmshaming.js';

/** Thresholds, exported so the README and tests use the same numbers. */
export const ASYMMETRY_THRESHOLDS = Object.freeze({
  /** Accept area at least this many times the decline area. */
  areaRatio: 3,
  /** Accept font size at least this many times the decline font size. */
  fontRatio: 1.4,
  /** Decline text contrast below this ... */
  weakContrast: 3,
  /** ... while accept text contrast is at least this much higher. */
  contrastGap: 2,
  /** Decline opacity below this. */
  faded: 0.6,
  /** Minimum RGB distance for a background to count as a filled button. */
  fillDistance: 40,
});

/** Role of a control in a choice. */
export type ChoiceRole = 'accept' | 'decline' | 'settings' | null;

/** Classify a control label. Pure. */
export function choiceRole(label: string): ChoiceRole {
  if (label.length === 0 || label.length > 160) return null;
  if (findPrefix(label, DECLINE_WORDS) !== undefined || findPhrase(label, NECESSARY_ONLY_WORDS) !== undefined || assessDeclineLabel(label) !== null) {
    return 'decline';
  }
  if (label.length <= 60 && findPrefix(label, ACCEPT_WORDS) !== undefined) return 'accept';
  if (label.length <= 60 && findPrefix(label, SETTINGS_WORDS) !== undefined) return 'settings';
  return null;
}

/** Visual measurements of one control. */
export interface Prominence {
  readonly area: number;
  readonly fontSizePx: number;
  readonly contrast: number | null;
  readonly filled: boolean;
  readonly bordered: boolean;
  readonly opacity: number;
}

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

/** Measure a control from its collected styles. Pure. */
export function measure(c: ClickableInfo): Prominence {
  const parentBg = parseColor(c.style.parentBackground) ?? WHITE;
  const ownBg = parseColor(c.style.backgroundColor);
  const effectiveBg = parseColor(c.style.effectiveBackground) ?? parentBg;
  const text = parseColor(c.style.color);
  const filled = ownBg !== null && ownBg.a > 0.5 && colorDistance(over(ownBg, parentBg), parentBg) >= ASYMMETRY_THRESHOLDS.fillDistance;
  const border = parseColor(c.style.borderColor);
  const bordered =
    c.style.borderWidthPx >= 1 && border !== null && border.a > 0.3 && colorDistance(over(border, parentBg), parentBg) >= ASYMMETRY_THRESHOLDS.fillDistance;
  const contrast = text === null ? null : contrastRatio(over(text, effectiveBg), over(effectiveBg, WHITE));
  return {
    area: Math.max(0, c.rect.width) * Math.max(0, c.rect.height),
    fontSizePx: c.style.fontSizePx,
    contrast,
    filled,
    bordered,
    opacity: c.style.opacity,
  };
}

/** Compare accept and decline. Returns the reasons the decline is weaker. Pure. */
export function asymmetryReasons(accept: Prominence, decline: Prominence): string[] {
  const t = ASYMMETRY_THRESHOLDS;
  const reasons: string[] = [];
  if (decline.area > 0 && accept.area / decline.area >= t.areaRatio) reasons.push('smaller');
  if (accept.filled && !decline.filled && !decline.bordered) reasons.push('link-styled');
  if (decline.fontSizePx > 0 && accept.fontSizePx / decline.fontSizePx >= t.fontRatio) reasons.push('smaller-text');
  if (
    accept.contrast !== null &&
    decline.contrast !== null &&
    decline.contrast < t.weakContrast &&
    accept.contrast - decline.contrast >= t.contrastGap
  ) {
    reasons.push('low-contrast');
  }
  if (decline.opacity < t.faded && accept.opacity >= t.faded) reasons.push('faded');
  return reasons;
}

const REASON_TEXT: Readonly<Record<string, string>> = {
  smaller: 'much smaller',
  'link-styled': 'styled as a plain link while accept is a filled button',
  'smaller-text': 'in much smaller text',
  'low-contrast': 'in low-contrast text',
  faded: 'faded (low opacity)',
};

/**
 * Confidence from the number of signals. Outside consent requests the cap is
 * medium: a secondary action styled as a link is common, and whether it
 * distorts an economic decision depends on what the dialog offers.
 */
function confidenceFor(count: number, consent: boolean): Confidence {
  if (count >= 3) return consent ? 'high' : 'medium';
  return count === 2 ? 'medium' : 'low';
}

/**
 * Provisions. DSA Art. 25 is not listed for consent requests: Art. 25(2)
 * excludes practices covered by the GDPR.
 */
function provisionsFor(consent: boolean): ProvisionId[] {
  return consent ? ['gdpr-art-4-11', 'gdpr-art-7'] : ['ucpd-art-5', 'dsa-art-25'];
}

/** Detect asymmetric choices in a snapshot. Pure. */
export function detectAsymmetricChoice(snapshot: PageSnapshot): DraftFinding[] {
  const findings: DraftFinding[] = [];
  for (const dialog of snapshot.dialogs) {
    const controls = snapshot.clickables.filter((c) => c.dialog === dialog.index && c.visible);
    const byRole = (role: ChoiceRole): ClickableInfo[] => controls.filter((c) => choiceRole(c.text) === role);
    const accepts = byRole('accept');
    const declines = byRole('decline');
    if (accepts.length === 0) continue;
    const largest = (list: ClickableInfo[]): ClickableInfo | undefined =>
      list.reduce<ClickableInfo | undefined>((best, c) => (best === undefined || c.rect.width * c.rect.height > best.rect.width * best.rect.height ? c : best), undefined);
    const accept = largest(accepts);
    if (accept === undefined) continue;

    if (declines.length === 0) {
      if (!dialog.consent) continue;
      const hasSettings = byRole('settings').length > 0;
      findings.push({
        detector: 'asymmetric-choice',
        title: 'No option to refuse on the first layer of a consent request',
        confidence: 'low',
        provisions: provisionsFor(true),
        explanation:
          `The consent request offers "${clip(accept.text, 40)}" but no equally direct way to refuse` +
          (hasSettings ? ' (only a settings option).' : '.') +
          ' Making refusal harder than acceptance is a possible issue under GDPR Art. 4(11) and Art. 7. Verify the full dialog.',
        evidence: {
          selector: dialog.selector,
          text: clip(dialog.text, 200),
          details: { accept: clip(accept.text, 60), settingsOption: hasSettings },
        },
      });
      continue;
    }

    // Compare with the most prominent decline option.
    const decline = largest(declines);
    if (decline === undefined) continue;
    const a = measure(accept);
    const d = measure(decline);
    const reasons = asymmetryReasons(a, d);
    if (reasons.length === 0) continue;
    const description = reasons.map((r) => REASON_TEXT[r] ?? r).join(', ');
    findings.push({
      detector: 'asymmetric-choice',
      title: 'Decline option much less prominent than accept',
      confidence: confidenceFor(reasons.length, dialog.consent),
      provisions: provisionsFor(dialog.consent),
      explanation:
        `In this ${dialog.consent ? 'consent request' : 'dialog'}, "${clip(decline.text, 40)}" is ${description} compared with "${clip(accept.text, 40)}". ` +
        (dialog.consent
          ? 'Steering users to accept is a possible issue under GDPR Art. 4(11) and Art. 7 (freely given, unambiguous consent).'
          : 'Steering users towards one choice is a possible issue under the UCPD general clause (Art. 5(2)) where it concerns a commercial decision.' +
            ' DSA Art. 25(3)(a) names giving more prominence to certain choices; it applies only to online platforms and only where the UCPD and GDPR do not.'),
      evidence: {
        selector: dialog.selector,
        text: clip(`${accept.text} / ${decline.text}`, 160),
        details: {
          acceptSelector: accept.selector,
          declineSelector: decline.selector,
          areaRatio: d.area > 0 ? Math.round((a.area / d.area) * 10) / 10 : 0,
          acceptFontPx: a.fontSizePx,
          declineFontPx: d.fontSizePx,
          acceptContrast: a.contrast === null ? 'unknown' : Math.round(a.contrast * 10) / 10,
          declineContrast: d.contrast === null ? 'unknown' : Math.round(d.contrast * 10) / 10,
          acceptFilled: a.filled,
          declineFilled: d.filled,
          declineBordered: d.bordered,
          reasons: reasons.join(','),
        },
      },
    });
  }
  return findings;
}
