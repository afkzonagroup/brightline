// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Pre-selected checkboxes, toggles and radio buttons for extra paid items or
 * for consent.
 *
 * Legal mapping: CRD Art. 22 (extra payments need express consent; default
 * options the consumer must reject are not consent). For marketing or data
 * consent: GDPR Art. 4(11) and Art. 7 (recital 32: pre-ticked boxes do not
 * constitute consent).
 */

import type { PageSnapshot, ToggleInfo } from '../browser/snapshot.js';
import { BENIGN_PRESELECT, CONSENT_CUES, CONTACT_CUES, MONEY_SOURCE, PAID_ADDON_CUES, STRONG_CONSENT_CUES, WEAK_PAID_ADDON_CUES } from '../data/phrases.js';
import type { Confidence, DraftFinding } from '../types.js';
import { clip, findPhrase } from '../util/text.js';

const MONEY = new RegExp(MONEY_SOURCE, 'iu');

/** True if the text names a non-zero amount of money. */
export function mentionsNonZeroAmount(text: string): boolean {
  const match = MONEY.exec(text);
  if (match === null) return false;
  return /[1-9]/.test(match[0]);
}

/** Classification of a pre-selected option. */
export interface PreselectClass {
  readonly paid: Confidence | null;
  readonly consent: Confidence | null;
}

/**
 * Classify a toggle label. Pure.
 *
 * Paid: a strong cue with an amount is high (medium for a radio button); a
 * strong cue alone (checkbox or switch), a weak cue with an amount, or
 * "+ amount" / "add" is medium.
 * Consent: a strong cue, or any cue inside a consent dialog, is high; other
 * consent cues are medium; contact cues alone ("send me", "SMS") are low.
 */
export function classifyPreselected(label: string, kind: ToggleInfo['kind'], inConsentDialog: boolean): PreselectClass {
  if (label.trim() === '' || findPhrase(label, BENIGN_PRESELECT) !== undefined) return { paid: null, consent: null };
  const strongCue = findPhrase(label, PAID_ADDON_CUES);
  const weakCue = strongCue === undefined ? findPhrase(label, WEAK_PAID_ADDON_CUES) : undefined;
  const amount = mentionsNonZeroAmount(label);
  let paid: Confidence | null = null;
  // A radio group always has some default, so a radio choice is at most medium.
  if (strongCue !== undefined && amount) paid = kind === 'radio' ? 'medium' : 'high';
  else if (strongCue !== undefined && kind !== 'radio') paid = 'medium';
  else if (weakCue !== undefined && amount) paid = 'medium';
  else if (amount && kind !== 'radio' && /\+\s?\p{Sc}?\s?\d|\badd\b/iu.test(label)) paid = 'medium';

  let consent: Confidence | null = null;
  if (kind !== 'radio') {
    if (findPhrase(label, STRONG_CONSENT_CUES) !== undefined) consent = 'high';
    else if (findPhrase(label, CONSENT_CUES) !== undefined) consent = inConsentDialog ? 'high' : 'medium';
    else if (findPhrase(label, CONTACT_CUES) !== undefined) consent = inConsentDialog ? 'high' : 'low';
  }
  return { paid, consent };
}

/** Detect pre-selected options in a snapshot. Pure. */
export function detectPreselected(snapshot: PageSnapshot): DraftFinding[] {
  const findings: DraftFinding[] = [];
  for (const t of snapshot.toggles) {
    if (!t.checked || t.disabled || !t.visible) continue;
    const dialog = t.dialog >= 0 ? snapshot.dialogs[t.dialog] : undefined;
    const cls = classifyPreselected(t.label, t.kind, dialog?.consent ?? false);
    const details = { kind: t.kind, preselected: true };
    if (cls.paid !== null) {
      findings.push({
        detector: 'preselected-option',
        title: 'Extra paid item selected by default',
        confidence: cls.paid,
        provisions: ['crd-art-22'],
        explanation:
          'This option for an extra item appears to be selected before the consumer chose it. ' +
          'Consent to an extra payment inferred from a default the consumer must reject is a possible issue under CRD Art. 22. ' +
          'Verify whether the item costs extra and whether it stays selected at checkout.',
        evidence: { selector: t.selector, text: clip(t.label), details },
      });
    }
    if (cls.consent !== null) {
      findings.push({
        detector: 'preselected-option',
        title: 'Consent option selected by default',
        confidence: cls.consent,
        provisions: ['gdpr-art-4-11', 'gdpr-art-7'],
        explanation:
          'This consent option (for example marketing or sharing data) appears to be ticked before the user acted. ' +
          'Consent needs a clear affirmative action; a pre-ticked box is a possible issue under GDPR Art. 4(11) and Art. 7 (see recital 32).' +
          (cls.consent === 'low' ? ' The label only asks to be contacted; verify whether these are marketing messages or service messages about an order.' : ''),
        evidence: { selector: t.selector, text: clip(t.label), details },
      });
    }
  }
  return findings;
}
