import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CLAIM_PATTERNS, CONFIRMSHAMING_PHRASES, PRIOR_PRICE_PHRASES } from '../../src/data/phrases.js';
import { GENERIC_LABELS, OFFICIAL_ORDER_BUTTON_LABELS, PAYMENT_WORDS } from '../../src/legal/order-button-labels.js';
import { PROVISIONS, getProvision } from '../../src/legal/provisions.js';
import { amountsIn, crawlKey, isCrawlable, launchErrorMessage, normaliseLimits } from '../../src/scan.js';
import { colorDistance, contrastRatio, over, parseColor } from '../../src/util/color.js';
import { ensureSubdir, isSafeFileName, safeWriteFile } from '../../src/util/files.js';
import { clip, equalsPhrase, findPhrase, findPrefix, normalizeText } from '../../src/util/text.js';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'brightline-misc-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('legal data', () => {
  it('every provision links to EUR-Lex over https with an anchor', () => {
    for (const p of Object.values(PROVISIONS)) {
      expect(p.url).toMatch(/^https:\/\/eur-lex\.europa\.eu\/legal-content\/EN\/TXT\/\?uri=CELEX:[0-9A-Z-]+#(art_\w+|anx_I)$/);
      expect(getProvision(p.id)).toBe(p);
      expect(`${p.summary} ${p.scope}`.toLowerCase()).not.toMatch(/\billegal\b/);
    }
  });
  it('DSA entry states its limited scope', () => {
    expect(PROVISIONS['dsa-art-25'].scope).toMatch(/online platforms/);
    expect(PROVISIONS['dsa-art-25'].scope).toMatch(/Art\. 25\(2\)/);
    expect(PROVISIONS['dsa-art-25'].scope).toMatch(/Art\. 19/);
  });
  it('official order-button wording covers 23 languages, without Irish', () => {
    const langs = OFFICIAL_ORDER_BUTTON_LABELS.map((l) => l.lang);
    expect(new Set(langs).size).toBe(23);
    expect(langs).not.toContain('ga');
    expect(OFFICIAL_ORDER_BUTTON_LABELS.every((l) => l.source === 'official')).toBe(true);
    expect(OFFICIAL_ORDER_BUTTON_LABELS.find((l) => l.lang === 'de')?.text).toBe('zahlungspflichtig bestellen');
    expect(OFFICIAL_ORDER_BUTTON_LABELS.find((l) => l.lang === 'lt')?.text).toBe('užsakymas su mokėjimo pareiga');
  });
  it('non-English phrases are marked as translations; English as original', () => {
    for (const list of [CONFIRMSHAMING_PHRASES, PRIOR_PRICE_PHRASES, PAYMENT_WORDS, GENERIC_LABELS]) {
      for (const p of list) expect(p.source).toBe(p.lang === 'en' ? 'original' : 'translation');
    }
    for (const p of CLAIM_PATTERNS) expect(p.source).toBe(p.lang === 'en' ? 'original' : 'translation');
  });
});

describe('text utilities', () => {
  it('normalises', () => {
    expect(normalizeText('  I DON’T  want ')).toBe("i don't want");
    expect(normalizeText('a – b')).toBe('a - b');
  });
  it('matches on word boundaries, including non-ASCII letters', () => {
    const list = [{ lang: 'en', text: 'pay', source: 'original' as const }];
    expect(findPhrase('Pay now', list)).toBeDefined();
    expect(findPhrase('PayPal', list)).toBeUndefined();
    expect(findPhrase('Repay', list)).toBeUndefined();
    const lt = [{ lang: 'lt', text: 'mokėti', source: 'translation' as const }];
    expect(findPhrase('Mokėti dabar', lt)).toBeDefined();
    expect(findPhrase('Sumokėtina', lt)).toBeUndefined();
    expect(findPrefix('No thanks', [{ lang: 'en', text: 'no', source: 'original' }])).toBeDefined();
    expect(findPrefix('Not now', [{ lang: 'en', text: 'no', source: 'original' }])).toBeUndefined();
    expect(equalsPhrase('Continue →', [{ lang: 'en', text: 'continue', source: 'original' }])).toBeDefined();
    expect(findPhrase('a.b(c)[d]+e*', [{ lang: 'en', text: 'b(c)[d]+e*', source: 'original' }])).toBeDefined();
  });
  it('clips', () => {
    expect(clip('abcdef', 4)).toBe('abc…');
    expect(clip('abc', 4)).toBe('abc');
  });
});

describe('colour utilities', () => {
  it('parses computed colours', () => {
    expect(parseColor('rgb(1, 2, 3)')).toEqual({ r: 1, g: 2, b: 3, a: 1 });
    expect(parseColor('rgba(1, 2, 3, 0.5)')).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
    expect(parseColor('rgb(1 2 3 / 50%)')).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
    expect(parseColor('color(srgb 1 0 0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('transparent')?.a).toBe(0);
    expect(parseColor('oklch(0.5 0.1 200)')).toBeNull();
  });
  it('computes WCAG contrast and blends', () => {
    const black = { r: 0, g: 0, b: 0, a: 1 };
    const white = { r: 255, g: 255, b: 255, a: 1 };
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
    expect(over({ ...black, a: 0.5 }, white).r).toBeCloseTo(127.5, 5);
    expect(colorDistance(black, white)).toBeCloseTo(441.67, 1);
  });
});

describe('files', () => {
  it('accepts only plain names', () => {
    expect(isSafeFileName('F0001.jpg')).toBe(true);
    for (const bad of ['../x', 'a/b', '.hidden', '', 'a\\b', '..', 'x'.repeat(101)]) expect(isSafeFileName(bad)).toBe(false);
  });
  it('refuses unsafe names and symlink targets', async () => {
    await expect(safeWriteFile(dir, '../escape.txt', 'x')).rejects.toThrow(/Unsafe/);
    await writeFile(path.join(dir, 'target.txt'), 'original');
    await symlink(path.join(dir, 'target.txt'), path.join(dir, 'link.txt'));
    await expect(safeWriteFile(dir, 'link.txt', 'overwrite')).rejects.toThrow();
    expect(await readFile(path.join(dir, 'target.txt'), 'utf8')).toBe('original');
    await safeWriteFile(dir, 'ok.txt', 'fine');
    expect(await readdir(dir)).toContain('ok.txt');
  });
  it('refuses a screenshots directory that is a symlink', async () => {
    const out = path.join(dir, 'out-sub');
    const elsewhere = path.join(dir, 'elsewhere');
    await mkdir(out);
    await mkdir(elsewhere);
    await symlink(elsewhere, path.join(out, 'screenshots'));
    await expect(ensureSubdir(out, 'screenshots')).rejects.toThrow(/not a plain directory/);
    await expect(ensureSubdir(out, '../x')).rejects.toThrow(/Unsafe/);
    const fresh = await ensureSubdir(out, 'shots');
    expect(await ensureSubdir(out, 'shots')).toBe(fresh);
  });
});

describe('crawl helpers', () => {
  it('keeps the crawl on the same origin and skips assets', () => {
    const origin = 'https://shop.example';
    expect(isCrawlable('https://shop.example/a', origin)?.href).toBe('https://shop.example/a');
    expect(isCrawlable('https://other.example/a', origin)).toBeNull();
    expect(isCrawlable('http://shop.example/a', origin)).toBeNull();
    expect(isCrawlable('https://shop.example:8443/a', origin)).toBeNull();
    expect(isCrawlable('https://u:p@shop.example/a', origin)).toBeNull();
    expect(isCrawlable('https://shop.example/a.pdf', origin)).toBeNull();
    expect(isCrawlable('nonsense', origin)).toBeNull();
    expect(crawlKey(new URL('https://shop.example/a#x'))).toBe('https://shop.example/a');
  });
  it('clamps limits', () => {
    expect(normaliseLimits({ url: 'x', maxPages: 10_000, maxDurationMs: 1, maxRedirects: 99 })).toMatchObject({ maxPages: 200, maxDurationMs: 5000, maxRedirects: 20 });
    expect(normaliseLimits({ url: 'x', maxPages: Number.NaN })).toMatchObject({ maxPages: 10, respectRobotsTxt: true });
  });
});

describe('Chromium launch errors', () => {
  it('explains a sandbox failure without suggesting to silently drop it', () => {
    const m = launchErrorMessage('browserType.launch: Failed to launch: No usable sandbox! Update your kernel or see https://chromium.googlesource.com/...');
    expect(m).toMatch(/OS sandbox/);
    expect(m).toMatch(/--no-sandbox/);
    expect(m).toMatch(/container/);
  });
  it('explains a missing browser and leaves other errors alone', () => {
    expect(launchErrorMessage("browserType.launch: Executable doesn't exist at /x")).toMatch(/playwright-core install/);
    expect(launchErrorMessage('something else')).toBeNull();
  });
});

describe('amounts shown at a journey mark', () => {
  it('reads amounts from short text blocks only', () => {
    expect(amountsIn({ textBlocks: [{ selector: 'p', text: 'Delivery: €4.99, added at checkout' }, { selector: 'p', text: 'No price here' }, { selector: 'p', text: `€9.99 ${'x'.repeat(200)}` }] })).toEqual([4.99]);
    expect(amountsIn({ textBlocks: Array.from({ length: 300 }, () => ({ selector: 'p', text: '€1.00' })) })).toHaveLength(200);
  });
});
