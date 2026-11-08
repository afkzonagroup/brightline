/**
 * Shadow DOM, client-side navigation and content revealed by clicks: the
 * collector on real rendered fixture pages, and full scans through the
 * network guard.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COLLECT_ARGS, QUIET_LIMITS, WALK_LIMITS, pushClientRoute, readTimers, settleAfter, snapshotPage } from '../../src/browser/page-ops.js';
import type { PageSnapshot } from '../../src/browser/snapshot.js';
import { validateJourney } from '../../src/journey/schema.js';
import { scanPage } from '../../src/playwright/index.js';
import { scan, type ScanOptions } from '../../src/scan.js';
import type { Finding } from '../../src/types.js';
import { startFixtures, type Fixtures } from '../helpers/server.js';

let fx: Fixtures;
let browser: Browser;
let page: Page;
let dir: string;

beforeAll(async () => {
  fx = await startFixtures();
  dir = await mkdtemp(path.join(os.tmpdir(), 'brightline-shadow-'));
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
});
afterAll(async () => {
  await browser.close();
  await fx.close();
  await rm(dir, { recursive: true, force: true });
});

const local = (path: string): string => `http://127.0.0.1:${String(fx.port)}${path}`;
const open = async (path: string): Promise<Finding[]> => {
  await page.goto(local(path), { waitUntil: 'load' });
  return await scanPage(page);
};
const of = (findings: readonly Finding[], detector: Finding['detector']): Finding[] => findings.filter((f) => f.detector === detector);
const texts = (findings: readonly Finding[], detector: Finding['detector']): string[] => of(findings, detector).map((f) => f.evidence.text).sort();
const opts = (pathname: string, extra: Partial<ScanOptions> = {}): ScanOptions => ({
  url: `${fx.base}${pathname}`,
  resolver: fx.resolver,
  allowAddresses: fx.allowAddresses,
  maxPages: 1,
  respectRobotsTxt: false,
  ...extra,
});

describe('open shadow roots', () => {
  it('finds a pre-ticked add-on, a countdown claim and confirmshaming inside shadow roots', async () => {
    const f = await open('/shadow-shop.html');
    expect(of(f, 'preselected-option').map((x) => `${x.confidence}:${x.evidence.text}`)).toEqual(['high:Add travel insurance (+€9.99)']);
    expect(texts(f, 'confirmshaming')).toEqual(['No thanks, I prefer to pay full price']);
    expect(of(f, 'claim-to-verify').map((x) => x.evidence.details.kind)).toEqual(['urgency']);
    // The decline in the shadow-root dialog is measured against the accept button.
    expect(of(f, 'asymmetric-choice').length).toBe(1);
  });

  it('reads a countdown inside a shadow root and reports that it restarts on reload', async () => {
    await page.goto(local('/shadow-shop.html'), { waitUntil: 'load' });
    expect((await readTimers(page)).map((t) => t.selector)).toEqual(['#timer']);
    const r = await scan(opts('/shadow-shop.html', { detectors: ['countdown-reset'], countdownWaitMs: 3000 }));
    const f = of(r.findings, 'countdown-reset');
    expect(f.map((x) => x.confidence)).toEqual(['high']);
    expect(f[0]?.evidence.selector).toBe('#timer');
  });

  it('reads nested shadow roots three levels deep', async () => {
    const f = await open('/shadow-nested.html');
    expect(texts(f, 'preselected-option')).toEqual(['Add protection plan (+€14.99)']);
    expect(texts(f, 'claim-to-verify')).toEqual(['Only 2 left in stock']);
    expect(of(f, 'price-reduction-prior-price').map((x) => x.confidence)).toEqual(['low']);
  });

  it('reads slotted text and labels that cross the shadow boundary', async () => {
    const f = await open('/shadow-slotted.html');
    expect(texts(f, 'preselected-option')).toEqual(['Add travel insurance (+€9.99)', 'Priority boarding (+€6.00)', 'Send me the newsletter with special offers']);
    expect(texts(f, 'confirmshaming')).toEqual(['No thanks, I prefer to pay full price']);
    expect(texts(f, 'claim-to-verify')).toEqual(['Hurry, sale ends today', 'Only 1 left in stock', 'Only 4 left in stock', 'Shadow twin, only 3 left in stock']);
    // The dialog is only marked by its role, inside the shadow root.
    expect(of(f, 'asymmetric-choice').map((x) => x.evidence.text)).toEqual(['Yes, give me 10% off / No thanks, I prefer to pay full price']);
  });

  it('follows links inside shadow roots and screenshots evidence found there', async () => {
    const out = path.join(dir, 'shop');
    const r = await scan(opts('/shadow-shop.html', { maxPages: 2, detectors: ['preselected-option'], outputDir: out }));
    expect(r.pages.map((p) => `${p.status}:${new URL(p.url).pathname}`)).toEqual(['scanned:/shadow-shop.html', 'scanned:/shadow-nested.html']);
    const f = of(r.findings, 'preselected-option');
    expect(f.map((x) => x.evidence.text).sort()).toEqual(['Add protection plan (+€14.99)', 'Add travel insurance (+€9.99)']);
    expect(f.every((x) => x.evidence.screenshot !== undefined)).toBe(true);
  });

  it('reads a total and a slotted order button label inside a shadow root in a journey', async () => {
    const j = validateJourney({
      version: 1,
      name: 'shadow checkout',
      startUrl: `${fx.base}/shop/product.html`,
      steps: [
        { action: 'click', selector: '#add' },
        { action: 'mark', name: 'cart', total: '#total' },
        { action: 'goto', url: `${fx.base}/shop/checkout-shadow.html` },
        { action: 'mark', name: 'review', total: '#total', orderButton: '#place' },
      ],
    });
    const r = await scan(opts('/shop/product.html', { maxPages: 0, journey: j, detectors: ['order-button-label', 'hidden-costs'] }));
    expect(r.journey?.completed).toBe(true);
    const button = of(r.findings, 'order-button-label');
    expect(button.map((x) => `${x.confidence}:${x.evidence.text}`)).toEqual(['high:Continue']);
    expect(of(r.findings, 'hidden-costs')[0]?.evidence.details.increase).toBe(4.99);
  });

  it('measures a consent dialog in a shadow root whose buttons are slotted light DOM', async () => {
    const f = of(await open('/shadow-consent.html'), 'asymmetric-choice');
    expect(f.map((x) => `${x.confidence}:${x.provisions[0] ?? ''}`)).toEqual(['high:gdpr-art-4-11']);
    expect(String(f[0]?.evidence.details.reasons)).toContain('link-styled');
  });

  it('treats a positioned host whose buttons are in its shadow root as an overlay', async () => {
    const f = of(await open('/shadow-overlay.html'), 'asymmetric-choice');
    expect(f.map((x) => x.evidence.text)).toEqual(['Yes, give me 10% off / No thanks, maybe later']);
  });

  it('does not read closed shadow roots (documented limit)', async () => {
    expect(await open('/shadow-closed.html')).toEqual([]);
  });
});

describe('selectors', () => {
  /** Every selector of a snapshot with what the collector saw there. */
  const emitted = (s: PageSnapshot): { selector: string; text: string }[] => [
    ...s.dialogs.map((d) => ({ selector: d.selector, text: d.text })),
    ...s.clickables.map((c) => ({ selector: c.selector, text: c.text })),
    ...s.toggles.map((t) => ({ selector: t.selector, text: '' })),
    ...s.textBlocks.map((b) => ({ selector: b.selector, text: b.text })),
    ...s.priceSignals.flatMap((p) => [
      { selector: p.selector, text: p.text },
      { selector: p.containerSelector, text: '' },
    ]),
  ];
  /** Rendered text of the element a selector resolves to, read by Playwright, not by the collector. */
  const renderedText = (el: Element): string => {
    const parts: string[] = [];
    const visit = (n: Node): void => {
      if (n.nodeType === 3) parts.push(n.nodeValue ?? '');
      if (n.nodeType !== 1) return;
      const e = n as Element;
      if (['SCRIPT', 'STYLE'].includes(e.tagName)) return;
      const kids = e.shadowRoot !== null ? e.shadowRoot.childNodes : e.tagName === 'SLOT' ? (e as HTMLSlotElement).assignedNodes({ flatten: true }) : e.childNodes;
      Array.from(kids).forEach(visit);
    };
    visit(el);
    return parts.join('').replace(/\s+/g, ' ').trim();
  };

  it.each(['/shadow-shop.html', '/shadow-nested.html', '/shadow-slotted.html', '/shadow-consent.html', '/shadow-overlay.html', '/preticked.html', '/confirmshaming.html', '/price.html', '/cookie-asymmetric.html', '/shop/checkout.html'])(
    'every selector on %s resolves with Playwright to exactly the element collected',
    async (path) => {
      await page.goto(local(path), { waitUntil: 'load' });
      const items = emitted(await snapshotPage(page)).filter((i) => i.selector !== '');
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        const locator = page.locator(item.selector);
        expect(await locator.count(), item.selector).toBe(1);
        if (item.text !== '') {
          const value = await locator.evaluate((el) => (el instanceof HTMLInputElement ? el.value : ''));
          const text = value !== '' ? value : await locator.evaluate(renderedText);
          expect(text.startsWith(item.text.slice(0, 40)) || item.text.startsWith(text.slice(0, 40)), `${item.selector}: ${text} / ${item.text}`).toBe(true);
        }
      }
    },
  );

  it('a light child and a shadow child of the same host get different selectors; an exact twin gets none', async () => {
    await page.goto(local('/shadow-slotted.html'), { waitUntil: 'load' });
    const blocks = (await snapshotPage(page)).textBlocks;
    const twin = blocks.find((b) => b.text.startsWith('Shadow twin'));
    expect(twin?.selector).toBe('html > body > twin-host > p:nth-child(1):nth-last-child(2)');
    expect(await page.locator(twin?.selector ?? '').textContent()).toBe('Shadow twin, only 3 left in stock');
    // Same tag, position and attributes in both trees: no selector would be safe.
    expect(blocks.find((b) => b.text === 'Only 1 left in stock')?.selector).toBe('');
  });
});

describe('hostile shadow DOM', () => {
  it('very deep nesting stops at the depth limit, quickly, and says so', async () => {
    await page.goto(local('/hostile-shadow-deep.html'), { waitUntil: 'load' });
    const started = Date.now();
    const s = await snapshotPage(page);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(s.truncated).toBe(true);
    // Depth 10 is read, depth 5000 is beyond maxShadowDepth.
    expect(s.toggles.map((t) => t.label)).toEqual(['Add travel insurance (+€9.99)']);
    expect(WALK_LIMITS.maxShadowDepth).toBeLessThan(5000);
    const r = await scan(opts('/hostile-shadow-deep.html'));
    expect(r.pages[0]?.status).toBe('scanned');
    expect(r.notes.some((n) => n.startsWith('Collection caps reached'))).toBe(true);
  });

  it('a huge number of shadow roots stays within the node and root budgets', async () => {
    await page.goto(local('/hostile-shadow-many.html'), { waitUntil: 'load' });
    const started = Date.now();
    const s = await snapshotPage(page);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(s.truncated).toBe(true);
    expect(s.textBlocks.length).toBeLessThanOrEqual(COLLECT_ARGS.maxTextBlocks);
    // Light DOM before the flood is still read; the extra in the last shadow root
    // (beyond maxShadowRoots) and the one after 100 000 elements (beyond maxNodes) are not.
    expect(s.toggles.map((t) => t.label)).toEqual(['Add travel insurance (+€9.99)']);
    expect(s.textBlocks.some((b) => b.text === 'Card 0')).toBe(true);
    expect(WALK_LIMITS.maxShadowRoots).toBeLessThan(30_000);
    expect(WALK_LIMITS.maxNodes).toBeLessThan(110_000);
    const r = await scan(opts('/hostile-shadow-many.html', { detectors: ['preselected-option'] }));
    expect(r.pages[0]?.status).toBe('scanned');
    expect(of(r.findings, 'preselected-option')).toHaveLength(1);
  });
});

describe('client-side navigation', () => {
  it('crawls a history-API route that the server does not serve, by client-side navigation', async () => {
    const r = await scan(opts('/spa.html', { maxPages: 3 }));
    expect(r.pages.map((p) => `${p.status}:${new URL(p.url).pathname}`)).toEqual(['scanned:/spa.html', 'scanned:/spa/checkout']);
    const f = of(r.findings, 'preselected-option');
    expect(f.map((x) => `${new URL(x.pageUrl).pathname}:${x.evidence.text}`)).toEqual(['/spa/checkout:Add travel insurance (+€9.99)']);
    expect(r.notes.some((n) => n.includes('/spa/checkout returned HTTP 404') && n.includes('client-side navigation'))).toBe(true);
    expect(r.blockedRequests).toEqual([]);
  });

  it('crawls hash routes as pages of their own, but not in-page anchors', async () => {
    const r = await scan(opts('/spa-hash.html', { maxPages: 5 }));
    const pages = r.pages.map((p) => `${p.status}:${new URL(p.url).pathname}${new URL(p.url).hash}`);
    expect(pages).toEqual(['scanned:/spa-hash.html', 'scanned:/spa-hash.html#/checkout']);
    expect(of(r.findings, 'preselected-option').map((x) => new URL(x.pageUrl).hash)).toEqual(['#/checkout']);
  });

  it('a journey click that changes the route in the page scans the new route', async () => {
    const j = validateJourney({ version: 1, name: 'spa', startUrl: `${fx.base}/spa.html`, steps: [{ action: 'click', selector: '#to-checkout' }] });
    const r = await scan(opts('/spa.html', { maxPages: 0, journey: j }));
    expect(r.journey?.completed).toBe(true);
    const f = of(r.findings, 'preselected-option');
    expect(f.map((x) => `${new URL(x.pageUrl).pathname}:${x.evidence.text}`)).toEqual(['/spa/checkout:Add travel insurance (+€9.99)']);
    expect(r.notes.some((n) => n.includes('1 client-side route change(s) scanned'))).toBe(true);
  });

  it('a mark after a client-side route change reads the rendered route, and a finding is listed once', async () => {
    const j = validateJourney({
      version: 1,
      name: 'spa checkout',
      startUrl: `${fx.base}/spa.html`,
      steps: [
        { action: 'click', selector: '#to-checkout' },
        { action: 'mark', name: 'review', total: '#total', orderButton: '#place' },
      ],
    });
    const r = await scan(opts('/spa.html', { maxPages: 0, journey: j }));
    expect(r.journey).toMatchObject({ completed: true, marks: ['review'] });
    expect(of(r.findings, 'order-button-label').map((x) => x.confidence)).toEqual(['high']);
    expect(of(r.findings, 'preselected-option')).toHaveLength(1);
  });

  it('pushing a route of another origin is refused by the browser', async () => {
    await page.goto(local('/spa.html'), { waitUntil: 'load' });
    await expect(pushClientRoute(page, `http://internal.test:${String(fx.secretPort)}/`)).rejects.toThrow();
    expect(fx.secretHits()).toBe(0);
  });
});

describe('content revealed by a click', () => {
  it('a ticking clock does not hold the wait open, and is not a structural change', async () => {
    await page.goto(local('/shadow-shop.html'), { waitUntil: 'load' });
    const started = Date.now();
    const r = await settleAfter(page, async () => {
      await page.waitForTimeout(10);
    });
    expect(Date.now() - started).toBeLessThan(QUIET_LIMITS.maxMs - 500);
    expect(r).toEqual({ changed: false, loaded: false });
  });

  it('waits for data and for content rendered step by step inside a shadow root', async () => {
    const j = validateJourney({
      version: 1,
      name: 'offers',
      startUrl: `${fx.base}/shadow-reveal.html`,
      steps: [
        { action: 'click', selector: '#show' },
        { action: 'mark', name: 'offers' },
      ],
    });
    const r = await scan(opts('/shadow-reveal.html', { maxPages: 0, journey: j }));
    expect(r.journey?.completed).toBe(true);
    expect(texts(r.findings, 'preselected-option')).toEqual(['Add extended warranty (+€19.99)']);
    expect(texts(r.findings, 'confirmshaming')).toEqual(['No thanks, I prefer to pay full price']);
  });
});
