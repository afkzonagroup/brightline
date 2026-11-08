/**
 * Collector + detectors on real rendered fixture pages, through the
 * Playwright test helper. Positive and negative fixture for every
 * snapshot-based detector.
 */
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { brightlineMatchers, scanPage, type ScanPageOptions } from '../../src/playwright/index.js';
import type { Finding } from '../../src/types.js';
import { startFixtures, type Fixtures } from '../helpers/server.js';

expect.extend(brightlineMatchers);

declare module 'vitest' {
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> {
    toHaveNoBrightlineFindings(options?: ScanPageOptions): Promise<R | T>;
  }
}

let fx: Fixtures;
let browser: Browser;
let page: Page;

beforeAll(async () => {
  fx = await startFixtures();
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
});
afterAll(async () => {
  await browser.close();
  await fx.close();
});

const open = async (path: string): Promise<Finding[]> => {
  await page.goto(`http://127.0.0.1:${String(fx.port)}${path}`, { waitUntil: 'load' });
  return await scanPage(page);
};
const of = (findings: Finding[], detector: Finding['detector']): Finding[] => findings.filter((f) => f.detector === detector);

describe('pre-selected options', () => {
  it('finds pre-ticked paid extras and consent, not benign defaults', async () => {
    const f = of(await open('/preticked.html'), 'preselected-option');
    const texts = f.map((x) => `${x.confidence}:${x.evidence.text}`).sort();
    expect(texts).toEqual(
      [
        'high:Add travel insurance (+€9.99)',
        'high:Send me the newsletter with special offers',
        'high:Share my data with partners',
        'medium:Priority boarding',
      ].sort(),
    );
  });
  it('no findings on the legitimate variant', async () => {
    expect(of(await open('/preticked-ok.html'), 'preselected-option')).toEqual([]);
  });
  it('service checkboxes are not paid extras; an SMS opt-in on its own is low', async () => {
    const f = of(await open('/preticked-service.html'), 'preselected-option');
    expect(f.map((x) => `${x.confidence}:${x.title}:${x.evidence.text}`)).toEqual(['low:Consent option selected by default:Send me order updates by SMS']);
  });
});

describe('confirmshaming', () => {
  it('finds guilt wording on decline options', async () => {
    const f = of(await open('/confirmshaming.html'), 'confirmshaming');
    expect(f.map((x) => x.evidence.text).sort()).toEqual(["Nah, I don't care about saving money", 'No thanks, I prefer to pay full price']);
  });
  it('no findings on neutral wording', async () => {
    expect(of(await open('/confirmshaming-ok.html'), 'confirmshaming')).toEqual([]);
  });
});

describe('asymmetric choice', () => {
  it('measures a weak reject link against a large accept button', async () => {
    const f = of(await open('/cookie-asymmetric.html'), 'asymmetric-choice');
    expect(f).toHaveLength(1);
    expect(f[0]?.confidence).toBe('high');
    expect(String(f[0]?.evidence.details.reasons)).toContain('link-styled');
    expect(Number(f[0]?.evidence.details.areaRatio)).toBeGreaterThan(3);
    expect(f[0]?.provisions[0]).toBe('gdpr-art-4-11');
  });
  it('flags a consent banner without a refuse option (low)', async () => {
    const f = of(await open('/cookie-no-reject.html'), 'asymmetric-choice');
    expect(f.map((x) => x.confidence)).toEqual(['low']);
  });
  it('measures a German banner whose refuse option is a faint "Nur notwendige Cookies" link', async () => {
    const f = of(await open('/cookie-de-asymmetric.html'), 'asymmetric-choice');
    expect(f.map((x) => x.confidence)).toEqual(['high']);
    expect(f[0]?.provisions).toEqual(['gdpr-art-4-11', 'gdpr-art-7']);
  });
  it.each(['/cookie-de.html', '/cookie-fr.html', '/cookie-lt.html', '/cookie-necessary-only.html'])('no findings on the symmetric banner %s', async (path) => {
    const all = await open(path);
    expect(all.filter((f) => f.detector === 'asymmetric-choice' || f.detector === 'confirmshaming')).toEqual([]);
  });
  it('no findings for equal buttons', async () => {
    expect(of(await open('/cookie-balanced.html'), 'asymmetric-choice')).toEqual([]);
    expect(of(await open('/confirmshaming-ok.html'), 'asymmetric-choice')).toEqual([]);
  });
});

describe('claims to verify', () => {
  it('finds scarcity, activity and urgency claims', async () => {
    const f = of(await open('/scarcity.html'), 'claim-to-verify');
    expect(f.map((x) => x.evidence.details.kind).sort()).toEqual(['activity', 'stock', 'urgency']);
    expect(f.every((x) => x.confidence === 'low')).toBe(true);
  });
  it('no findings on neutral product text', async () => {
    expect(of(await open('/scarcity-ok.html'), 'claim-to-verify')).toEqual([]);
  });
});

describe('price reduction without prior price', () => {
  it('flags a bare percentage (medium) and a bare strikethrough (low)', async () => {
    const f = of(await open('/price.html'), 'price-reduction-prior-price');
    expect(f.map((x) => `${x.confidence}:${x.evidence.selector}`).sort()).toEqual(['low:#p2', 'medium:#p1']);
  });
  it('no findings when the prior price is stated', async () => {
    expect(of(await open('/price-ok.html'), 'price-reduction-prior-price')).toEqual([]);
    expect(of(await open('/price-honest.html'), 'price-reduction-prior-price')).toEqual([]);
  });
  it('a 30-day returns note does not hide a struck price; a textual reference price lowers confidence', async () => {
    const f = of(await open('/price-tricky.html'), 'price-reduction-prior-price');
    expect(f.map((x) => `${x.confidence}:${x.evidence.selector}`).sort()).toEqual(['low:#t1', 'low:#t2']);
  });
});

describe('legitimate pages', () => {
  it('a plain page has no findings at all', async () => {
    await page.goto(`http://127.0.0.1:${String(fx.port)}/plain.html`);
    await expect(page).toHaveNoBrightlineFindings();
  });
  it('the matcher fails with a readable message when there are findings', async () => {
    await page.goto(`http://127.0.0.1:${String(fx.port)}/preticked.html`);
    const result = await brightlineMatchers.toHaveNoBrightlineFindings.call(undefined, page, { minConfidence: 'high' });
    expect(result.pass).toBe(false);
    expect(result.message()).toContain('possible issue under CRD Art. 22');
    const filtered = await scanPage(page, { detectors: ['claim-to-verify'] });
    expect(filtered).toEqual([]);
  });
});
