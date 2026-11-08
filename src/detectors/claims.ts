// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Scarcity, social-proof and urgency claims to verify ("only 2 left",
 * "12 people are viewing", "offer ends today").
 *
 * A scanner cannot know whether such a claim is true. Every finding is low
 * confidence and asks the reviewer to verify the claim against real data.
 *
 * Legal mapping: false statements of this kind may fall under UCPD Art. 6(1)
 * (misleading actions, for example about availability, point (b)); stock
 * claims under Annex I point 18 (inaccurate information on market conditions
 * or on the possibility of finding the product); time-limit claims under
 * Annex I point 7.
 */

import type { PageSnapshot } from '../browser/snapshot.js';
import { CLAIM_PATTERNS, type ClaimKind } from '../data/phrases.js';
import type { ProvisionId } from '../legal/provisions.js';
import type { DraftFinding } from '../types.js';
import { clip, normalizeText } from '../util/text.js';

const COMPILED = CLAIM_PATTERNS.map((p) => ({ ...p, re: new RegExp(p.pattern, 'iu') }));

/** A matched claim. */
export interface ClaimMatch {
  readonly kind: ClaimKind;
  readonly matched: string;
  readonly source: 'original' | 'translation';
}

/** Find claims in a text. Pure. */
export function findClaims(text: string): ClaimMatch[] {
  const t = normalizeText(text);
  const out: ClaimMatch[] = [];
  for (const p of COMPILED) {
    const m = p.re.exec(t);
    if (m !== null && !out.some((o) => o.kind === p.kind)) out.push({ kind: p.kind, matched: m[0], source: p.source });
  }
  return out;
}

const PROVISIONS: Readonly<Record<ClaimKind, ProvisionId[]>> = {
  stock: ['ucpd-art-6-1', 'ucpd-annex-i-18'],
  activity: ['ucpd-art-6-1'],
  urgency: ['ucpd-annex-i-7', 'ucpd-art-6-1'],
};

const TITLES: Readonly<Record<ClaimKind, string>> = {
  stock: 'Scarcity claim to verify',
  activity: 'Popularity / activity claim to verify',
  urgency: 'Time-limit claim to verify',
};

const EXPLANATIONS: Readonly<Record<ClaimKind, string>> = {
  stock:
    'The page states limited stock or high demand. If the statement is not true, it is a possible issue under UCPD Art. 6(1)(b) (availability) and Annex I point 18. Verify against stock data.',
  activity:
    'The page states how many people are viewing or buying. If the number is not real, it is a possible issue under UCPD Art. 6(1). Verify how the number is produced.',
  urgency:
    'The page states that an offer ends soon. If the time limit is not real, it is a possible issue under UCPD Annex I point 7. Verify the offer end date.',
};

/** Detect claims in a snapshot. Pure. One finding per claim kind and text per page. */
export function detectClaims(snapshot: PageSnapshot): DraftFinding[] {
  const findings: DraftFinding[] = [];
  const seen = new Set<string>();
  const blocks = [...snapshot.textBlocks].sort((a, b) => a.text.length - b.text.length);
  for (const block of blocks) {
    for (const claim of findClaims(block.text)) {
      const key = `${claim.kind}|${claim.matched}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        detector: 'claim-to-verify',
        title: TITLES[claim.kind],
        confidence: 'low',
        provisions: PROVISIONS[claim.kind],
        explanation: EXPLANATIONS[claim.kind] + (claim.source === 'translation' ? ' Matched by a translated pattern awaiting native review.' : ''),
        evidence: {
          selector: block.selector,
          text: clip(block.text, 200),
          details: { kind: claim.kind, matched: claim.matched, patternSource: claim.source },
        },
      });
    }
  }
  return findings;
}
