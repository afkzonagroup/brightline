// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import type { SourcedPhrase } from '../legal/order-button-labels.js';

/**
 * Normalise text for matching: Unicode NFKC, lower case, typographic quotes
 * to ASCII, whitespace collapsed.
 *
 * @example
 * ```ts
 * normalizeText('  I DON’T  want ') ; // "i don't want"
 * ```
 */
export function normalizeText(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′`´]/g, "'")
    .replace(/[“”„«»]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const cache = new Map<string, RegExp>();

/** Word-boundary-aware regex for a phrase (Unicode letters and digits are word characters). */
export function phraseRegex(phrase: string, anchorStart = false): RegExp {
  const key = `${anchorStart ? '^' : ''}${phrase}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const body = escapeRegex(normalizeText(phrase)).replace(/ /g, '\\s+');
  const re = new RegExp(`${anchorStart ? '^' : '(?<![\\p{L}\\p{N}])'}${body}(?![\\p{L}\\p{N}])`, 'u');
  if (cache.size < 5000) cache.set(key, re);
  return re;
}

/** First phrase from the list contained in `text` (already normalised or not). */
export function findPhrase(text: string, phrases: readonly SourcedPhrase[]): SourcedPhrase | undefined {
  const t = normalizeText(text);
  return phrases.find((p) => phraseRegex(p.text).test(t));
}

/** First phrase from the list that `text` starts with. */
export function findPrefix(text: string, phrases: readonly SourcedPhrase[]): SourcedPhrase | undefined {
  const t = normalizeText(text);
  return phrases.find((p) => phraseRegex(p.text, true).test(t));
}

/** True if normalised `text` equals one of the phrases (ignoring trailing punctuation). */
export function equalsPhrase(text: string, phrases: readonly SourcedPhrase[]): SourcedPhrase | undefined {
  const t = normalizeText(text).replace(/[\s.!?:;,"'»«›‹>→]+$/u, '');
  return phrases.find((p) => normalizeText(p.text) === t);
}

/** Truncate for evidence output. */
export function clip(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
