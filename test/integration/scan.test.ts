/**
 * End-to-end scans against the fixture site through the full network guard
 * (route interception + guard proxy).
 */
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { main } from '../../src/cli/main.js';
import { validateJourney, type Journey } from '../../src/journey/schema.js';
import { BlockedRequestError } from '../../src/net/guard.js';
import { renderHtmlReport } from '../../src/report/html.js';
import { scan, type ScanOptions } from '../../src/scan.js';
import { validate } from '../helpers/jsonschema.js';
import { startFixtures, type Fixtures } from '../helpers/server.js';

let fx: Fixtures;
let dir: string;
beforeAll(async () => {
  fx = await startFixtures();
  dir = await mkdtemp(path.join(os.tmpdir(), 'brightline-scan-'));
});
afterAll(async () => {
  await fx.close();
  await rm(dir, { recursive: true, force: true });
});

const opts = (pathname: string, extra: Partial<ScanOptions> = {}): ScanOptions => ({
  url: `${fx.base}${pathname}`,
  resolver: fx.resolver,
  allowAddresses: fx.allowAddresses,
  maxPages: 1,
  respectRobotsTxt: false,
  ...extra,
});

describe('crawl', () => {
  it('stays on the origin, de-duplicates, skips assets and respects robots.txt', async () => {
    const r = await scan(opts('/', { maxPages: 10, respectRobotsTxt: true }));
    const urls = r.pages.map((p) => `${p.status}:${new URL(p.url).pathname}`);
    expect(urls).toEqual(['scanned:/', 'scanned:/preticked.html', 'scanned:/scarcity.html', 'scanned:/plain.html', 'skipped-robots:/private/secret.html']);
    expect(fx.requests).not.toContain('/private/secret.html');
    expect(fx.requests).not.toContain('/image.png');
    expect(r.findings.some((f) => f.detector === 'preselected-option')).toBe(true);
    expect(r.blockedRequests).toEqual([]);
  });

  it('stops at maxPages', async () => {
    const r = await scan(opts('/', { maxPages: 2 }));
    expect(r.pages).toHaveLength(2);
  });
});

describe('countdown restarts (load twice in fresh contexts)', () => {
  it('high confidence for a timer that restarts on reload', async () => {
    const r = await scan(opts('/countdown-fake.html'));
    const f = r.findings.filter((x) => x.detector === 'countdown-reset');
    expect(f).toHaveLength(1);
    expect(f[0]?.confidence).toBe('high');
    expect(f[0]?.evidence.details.restartedInFreshSession).toBe(true);
  });
  it('low confidence for a per-visitor timer', async () => {
    const r = await scan(opts('/countdown-session.html'));
    expect(r.findings.filter((x) => x.detector === 'countdown-reset').map((x) => x.confidence)).toEqual(['low']);
  });
  it('a real seat hold kept across reloads is at most low', async () => {
    const r = await scan(opts('/countdown-hold.html'));
    const f = r.findings.filter((x) => x.detector === 'countdown-reset');
    expect(f.map((x) => x.confidence)).toEqual(['low']);
    expect(f[0]?.evidence.details.restartedOnReload).toBe(false);
  });
  it('no finding for a real deadline or a static clock time', async () => {
    const r = await scan(opts('/countdown-real.html'));
    expect(r.findings.filter((x) => x.detector === 'countdown-reset')).toEqual([]);
  });
});

describe('journeys', () => {
  const journey = (checkout: string, withFill: boolean): Journey =>
    validateJourney({
      version: 1,
      name: 'checkout',
      startUrl: `${fx.base}/shop/product.html`,
      steps: [
        { action: 'click', selector: '#add' },
        { action: 'mark', name: 'cart', total: '#total' },
        ...(withFill ? [{ action: 'fill', selector: '#email', value: 'test@example.com' }] : []),
        { action: 'goto', url: `${fx.base}/shop/${checkout}` },
        { action: 'mark', name: 'review', total: '#total', orderButton: '#place' },
      ],
    });

  it('reports a generic order button, a late fee and the pre-ticked add-on', async () => {
    const out = path.join(dir, 'journey');
    const r = await scan(opts('/shop/product.html', { maxPages: 0, journey: journey('checkout.html', false), outputDir: out }));
    expect(r.journey).toMatchObject({ completed: true, marks: ['cart', 'review'] });
    const byDetector = Object.fromEntries(r.findings.map((f) => [f.detector, f]));
    expect(byDetector['order-button-label']?.confidence).toBe('high');
    expect(byDetector['hidden-costs']?.confidence).toBe('medium');
    expect(byDetector['hidden-costs']?.evidence.details.increase).toBe(4.99);
    expect(byDetector['preselected-option']?.provisions).toEqual(['crd-art-22']);
    const shots = await readdir(path.join(out, 'screenshots'));
    expect(shots.length).toBeGreaterThan(0);
    expect(r.findings.filter((f) => f.evidence.screenshot !== undefined).length).toBeGreaterThan(0);
    const html = await renderHtmlReport(r, { baseDir: out });
    expect(html).toMatch(/data:image\/jpeg;base64,/);
  });

  it('a user action between marks lowers hidden-cost confidence', async () => {
    const r = await scan(opts('/shop/product.html', { maxPages: 0, journey: journey('checkout.html', true) }));
    expect(r.findings.find((f) => f.detector === 'hidden-costs')?.confidence).toBe('low');
  });

  it.each([
    ['checkout-ok.html', []],
    ['checkout-de.html', []],
    ['checkout-unclear.html', ['medium']],
  ])('order button on %s', async (page, expected) => {
    const r = await scan(opts('/shop/product.html', { maxPages: 0, journey: journey(page, false), detectors: ['order-button-label', 'hidden-costs'] }));
    expect(r.findings.filter((f) => f.detector === 'order-button-label').map((f) => f.confidence)).toEqual(expected);
    expect(r.findings.filter((f) => f.detector === 'hidden-costs')).toEqual([]);
  });

  it('a delivery charge stated on the cart and an order button that says "pay" give no medium or high finding', async () => {
    const j = validateJourney({
      version: 1,
      name: 'honest checkout',
      startUrl: `${fx.base}/shop/cart-delivery.html`,
      steps: [
        { action: 'mark', name: 'cart', total: '#total' },
        { action: 'click', selector: '#next' },
        { action: 'mark', name: 'review', total: '#total', orderButton: '#place' },
      ],
    });
    const r = await scan(opts('/shop/cart-delivery.html', { maxPages: 0, journey: j }));
    expect(r.journey?.completed).toBe(true);
    expect(r.findings.filter((f) => f.detector === 'order-button-label')).toEqual([]);
    expect(r.findings.filter((f) => f.detector === 'hidden-costs').map((f) => f.confidence)).toEqual(['low']);
    expect(r.findings.filter((f) => f.confidence !== 'low')).toEqual([]);
  });

  it('records a failing step without crashing', async () => {
    const j = validateJourney({ version: 1, name: 'broken', startUrl: `${fx.base}/shop/product.html`, steps: [{ action: 'click', selector: '#does-not-exist' }] });
    const r = await scan(opts('/shop/product.html', { maxPages: 0, journey: j, navigationTimeoutMs: 1500 }));
    expect(r.journey?.completed).toBe(false);
    expect(r.journey?.error).toMatch(/^step 1 \(click\)/);
  });

  it('a journey cannot navigate to a blocked address', async () => {
    const j = validateJourney({ version: 1, name: 'ssrf', startUrl: `${fx.base}/shop/product.html`, steps: [{ action: 'goto', url: `http://internal.test:${String(fx.secretPort)}/` }] });
    const r = await scan(opts('/shop/product.html', { maxPages: 0, journey: j }));
    expect(r.journey?.completed).toBe(false);
    expect(fx.secretHits()).toBe(0);
  });
});

describe('SSRF guard (end to end)', () => {
  it('refuses a blocked start URL before launching a browser', async () => {
    for (const url of ['http://127.0.0.1/', 'http://169.254.169.254/', 'http://[::1]/', 'http://2130706433/', 'http://metadata.test/', 'http://mixed.test/']) {
      await expect(scan({ url, resolver: fx.resolver })).rejects.toBeInstanceOf(BlockedRequestError);
    }
    await expect(scan({ url: 'file:///etc/passwd' })).rejects.toBeInstanceOf(BlockedRequestError);
  });

  it.each(['/redirect-internal', '/redirect-internal-ip', '/redirect-metadata'])('blocks the redirect hop of %s', async (pathname) => {
    const r = await scan(opts(pathname));
    expect(r.pages[0]?.status).toBe('error');
    // Redirect hops are not routed by Playwright; the guard proxy must catch them.
    expect(r.blockedRequests.map((b) => b.stage)).toContain('proxy');
    expect(fx.secretHits()).toBe(0);
  });

  it('blocks sub-resources to internal addresses and WebSockets', async () => {
    const r = await scan(opts('/subresource-internal'));
    expect(r.pages[0]?.status).toBe('scanned');
    // Caught by the route check, before the browser sends anything.
    const reasons = r.blockedRequests.map((b) => `${b.stage}:${b.reason}`).sort();
    expect(reasons).toEqual(['route:loopback', 'route:metadata']);
    expect(fx.secretHits()).toBe(0);
    const ws = await scan(opts('/hostile.html'));
    expect(ws.blockedRequests.map((b) => b.reason)).toContain('websocket');
  });

  it('refuses every browser-side SSRF vector: iframes, workers, beacons, forms, pop-ups, prefetch, prerender, WebRTC', async () => {
    const r = await scan(opts('/hostile-ssrf.html'));
    expect(r.pages[0]?.status).toBe('scanned');
    // Give late requests (pop-up, form post, worker) time to reach the network if a layer let them through.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(fx.secretConnections()).toBe(0);
    expect(fx.secretHits()).toBe(0);
    const reasons = new Set(r.blockedRequests.map((b) => b.reason));
    for (const reason of ['loopback', 'nat64', 'metadata', 'websocket']) expect(reasons).toContain(reason);
    // Shared workers are not routed by Playwright: only the guard proxy stops them.
    expect(r.blockedRequests.some((b) => b.url.endsWith('/shared-worker') && b.stage === 'proxy')).toBe(true);
  });

  it('caps redirects', async () => {
    const r = await scan(opts('/redirect-chain', { maxRedirects: 3 }));
    expect(r.pages[0]).toMatchObject({ status: 'error' });
  });

  it('enforces the byte budget', async () => {
    const r = await scan(opts('/big', { maxTotalBytes: 1024 * 1024, maxResponseBytes: 64 * 1024 }));
    expect(r.pages[0]?.status).toBe('error');
    expect(r.blockedRequests.map((b) => b.reason)).toContain('size');
  });
});

describe('hostile pages', () => {
  it('a page that hangs the collector is cut off by the evaluation deadline', async () => {
    const started = Date.now();
    const r = await scan(opts('/hostile-loop.html'));
    expect(r.pages[0]).toMatchObject({ status: 'error' });
    expect(r.pages[0]?.error).toMatch(/exceeded|closed/i);
    expect(Date.now() - started).toBeLessThan(45_000);
  }, 90_000);

  it('pop-ups opened by the page are closed', async () => {
    const r = await scan(opts('/hostile-popups.html'));
    expect(r.pages[0]?.status).toBe('scanned');
    expect(r.blockedRequests.filter((b) => b.reason === 'popup').length).toBeGreaterThan(0);
  });

  it('a page cannot flood the report', async () => {
    const r = await scan(opts('/many-claims.html', { detectors: ['claim-to-verify'] }));
    expect(r.findings.length).toBe(50);
    expect(r.notes.some((n) => n.includes('only the first 50'))).toBe(true);
  });

  it('a page that breaks the collector is reported as an error and the scan continues', async () => {
    const r = await scan(opts('/hostile-dom.html'));
    expect(r.pages[0]).toMatchObject({ status: 'error' });
    expect(r.pages[0]?.error).toMatch(/^Analysis failed/);
  });
});

describe('reports', () => {
  it('JSON matches the schema and HTML escapes hostile page content', async () => {
    const r = await scan(opts('/hostile.html'));
    const schema = JSON.parse(await readFile(new URL('../../schema/report.schema.json', import.meta.url), 'utf8')) as Record<string, unknown>;
    expect(validate(schema, JSON.parse(JSON.stringify(r)))).toEqual([]);
    const html = await renderHtmlReport(r);
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>alert(2)');
    expect(html).not.toMatch(/<[^>]*\son[a-z]+\s*=/i);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('the CLI scans and writes both reports', async () => {
    const out = path.join(dir, 'cli');
    const lines: string[] = [];
    const code = await main(['scan', `${fx.base}/price.html`, '--max-pages', '1', '--ignore-robots', '--out', out, '--allow-address', '127.0.0.1', '--quiet', '--fail-on', 'medium'], {
      out: (l) => lines.push(l),
      err: () => undefined,
      env: {},
      scanOverrides: { resolver: fx.resolver },
    });
    expect(code).toBe(1);
    expect(lines[0]).toMatch(/^2 possible issue\(s\): 0 high, 1 medium, 1 low/);
    expect(await readdir(out)).toEqual(expect.arrayContaining(['report.json', 'report.html', 'screenshots']));
  });
});
