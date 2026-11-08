// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Confirmshaming: decline options worded to make the user feel guilty or
 * foolish ("No thanks, I prefer to pay full price").
 *
 * A label containing a listed phrase gives medium confidence. A negative
 * opener ("No", "I don't") combined with a loss or guilt cue gives low
 * confidence. English phrases are original; other languages are translations
 * flagged for native review (see `src/data/phrases.ts`).
 *
 * Legal mapping: no blacklist point names this pattern. It may be assessed
 * under the UCPD general clause (Art. 5(2)) and the rules on aggressive
 * practices / undue influence (Art. 8 and 9). In a consent request it may
 * affect whether consent is freely given (GDPR Art. 4(11)). DSA Art. 25 is
 * listed for online platforms only, where the UCPD and GDPR do not apply.
 */

import type { PageSnapshot } from '../browser/snapshot.js';
import { CONFIRMSHAMING_PHRASES, DECLINE_OPENERS, GUILT_CUES } from '../data/phrases.js';
import type { SourcedPhrase } from '../legal/order-button-labels.js';
import type { ProvisionId } from '../legal/provisions.js';
import type { Confidence, DraftFinding } from '../types.js';
import { clip, findPhrase, findPrefix } from '../util/text.js';

/** Result of assessing one label. */
export interface ShamingMatch {
  readonly confidence: Confidence;
  readonly matched: string;
  readonly source: SourcedPhrase['source'];
}

const NEGATIVE_OPENERS = DECLINE_OPENERS;

/** Assess a single decline label. Pure. Returns null when nothing is found. */
export function assessDeclineLabel(label: string): ShamingMatch | null {
  if (label.length === 0 || label.length > 160) return null;
  const phrase = findPhrase(label, CONFIRMSHAMING_PHRASES);
  if (phrase !== undefined) return { confidence: 'medium', matched: phrase.text, source: phrase.source };
  const opener = findPrefix(label, NEGATIVE_OPENERS);
  if (opener === undefined) return null;
  const cue = findPhrase(label, GUILT_CUES);
  if (cue === undefined) return null;
  return { confidence: 'low', matched: `${opener.text} … ${cue.text}`, source: cue.source === 'translation' || opener.source === 'translation' ? 'translation' : 'original' };
}

/** Detect confirmshaming in a snapshot. Pure. */
export function detectConfirmshaming(snapshot: PageSnapshot): DraftFinding[] {
  const findings: DraftFinding[] = [];
  const seen = new Set<string>();
  for (const c of snapshot.clickables) {
    if (!c.visible) continue;
    const match = assessDeclineLabel(c.text);
    if (match === null) continue;
    const key = `${c.text}|${String(c.dialog)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const dialog = c.dialog >= 0 ? snapshot.dialogs[c.dialog] : undefined;
    // DSA Art. 25 does not apply to practices covered by the GDPR (Art. 25(2)),
    // so it is not listed for consent requests.
    const provisions: ProvisionId[] = ['ucpd-art-5', 'ucpd-art-8-9'];
    if (dialog?.consent === true) provisions.push('gdpr-art-4-11');
    else provisions.push('dsa-art-25');
    findings.push({
      detector: 'confirmshaming',
      title: 'Decline option uses guilt or shame wording',
      confidence: match.confidence,
      provisions,
      explanation:
        'The option to say no is worded to make the user feel foolish or guilty. ' +
        'This is a possible issue under the UCPD general clause (Art. 5(2)) or as undue influence (Art. 8 and 9)' +
        (dialog?.consent === true ? ', and it may affect whether consent is freely given (GDPR Art. 4(11))' : '') +
        (dialog?.consent === true ? '.' : '. DSA Art. 25 is relevant only if the site is an online platform and the UCPD and GDPR do not cover the practice.') +
        (match.source === 'translation' ? ' The matched phrase is a translation awaiting native review.' : ''),
      evidence: {
        selector: c.selector,
        text: clip(c.text, 160),
        details: { matched: match.matched, phraseSource: match.source, inDialog: c.dialog >= 0 },
      },
    });
  }
  return findings;
}
