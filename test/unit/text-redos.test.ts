// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { parseAmount } from '../../src/detectors/hidden-costs.js';
import type { SourcedPhrase } from '../../src/legal/order-button-labels.js';
import { equalsPhrase, trimTrailing } from '../../src/util/text.js';

const X: SourcedPhrase = { lang: 'en', text: 'x', source: 'original' };

describe('linear-time trimming on hostile page text', () => {
  it('trims trailing punctuation and whitespace like the previous expression', () => {
    expect(trimTrailing('Accept all!! ', new Set(['!']))).toBe('Accept all');
    expect(trimTrailing('...', new Set(['.']))).toBe('');
    expect(trimTrailing('a.b', new Set(['.']))).toBe('a.b');
  });

  it('handles long runs of separators quickly', () => {
    const hostile = `${'\t'.repeat(200_000)}x`;
    const t0 = performance.now();
    expect(equalsPhrase(hostile, [X])).toBeDefined();
    expect(performance.now() - t0).toBeLessThan(500);
    const commas = `1${','.repeat(200_000)}x`;
    const t1 = performance.now();
    parseAmount(commas);
    expect(performance.now() - t1).toBeLessThan(500);
  });

  it('still parses ordinary amounts', () => {
    expect(parseAmount('Delivery €4.99')).toBe(4.99);
    expect(parseAmount('Total 1.234,50 €')).toBe(1234.5);
  });
});
