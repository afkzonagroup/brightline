import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROVISIONS } from '../../src/legal/provisions.js';
import { ATTRIBUTION, IMAGE_LIMITS, escapeHtml, renderHtmlReport, safeHref } from '../../src/report/html.js';
import {
  DISCLAIMER,
  REPORT_SCHEMA_VERSION,
  TOOL_VERSION,
  atLeast,
  referencedProvisions,
  sortFindings,
  summarize,
  type ScanReport,
} from '../../src/report/types.js';
import { writeReports } from '../../src/report/write.js';
import type { Finding } from '../../src/types.js';
import { validate } from '../helpers/jsonschema.js';

const EVIL = `<script>alert(1)</script><img src=x onerror=alert(2)>"'\`&`;

const finding = (over: Partial<Finding> = {}): Finding => ({
  id: 'F0001',
  detector: 'claim-to-verify',
  title: 'Scarcity claim to verify',
  confidence: 'low',
  provisions: ['ucpd-art-6-1', 'ucpd-annex-i-18'],
  explanation: `Possible issue. ${EVIL}`,
  pageUrl: 'https://shop.example/a',
  evidence: { selector: `p${EVIL}`, text: EVIL, details: { [EVIL]: EVIL, n: 2, b: true } },
  ...over,
});

const report = (findings: Finding[], over: Partial<ScanReport> = {}): ScanReport => ({
  schemaVersion: REPORT_SCHEMA_VERSION,
  tool: { name: 'brightline', version: TOOL_VERSION },
  startedAt: '2026-11-08T10:00:00.000Z',
  finishedAt: '2026-11-08T10:01:00.000Z',
  startUrl: 'https://shop.example/',
  pages: [{ url: `https://shop.example/${EVIL}`, status: 'error', error: EVIL }],
  findings,
  summary: summarize(findings),
  provisions: referencedProvisions(findings),
  blockedRequests: [],
  limits: { maxPages: 10, maxDurationMs: 1, navigationTimeoutMs: 1, maxResponseBytes: 1, maxTotalBytes: 1, maxRedirects: 5, respectRobotsTxt: true },
  notes: [EVIL],
  disclaimer: DISCLAIMER,
  ...over,
});

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'brightline-report-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('escaping', () => {
  it('escapes all HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&\`</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&#96;&lt;/a&gt;');
  });
  it('only links http(s) URLs', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,x')).toBeNull();
    expect(safeHref('not a url')).toBeNull();
    expect(safeHref('https://a.example/?q=<x>')).toBe('https://a.example/?q=%3Cx%3E');
  });
});

describe('HTML report', () => {
  it('never emits raw markup from scanned content and has no scripts', async () => {
    const html = await renderHtmlReport(
      report([finding(), finding({ id: 'F0002', pageUrl: 'javascript:alert(3)' })], { startUrl: 'javascript:alert(4)' }),
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toMatch(/href="javascript:/i);
    expect(html).not.toMatch(/<[^>]*\son[a-z]+\s*=/i);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('default-src &#39;none&#39;');
  });

  it('carries the attribution footer, the disclaimer and provision links', async () => {
    const html = await renderHtmlReport(report([finding()]));
    expect(html).toContain(`<a href="${ATTRIBUTION.url}" rel="noopener noreferrer">${ATTRIBUTION.text}</a>`);
    expect(html).toContain(escapeHtml(DISCLAIMER));
    expect(html).toContain(escapeHtml(PROVISIONS['ucpd-annex-i-18'].url));
    expect(html).toContain('Possible issue under');
    expect(html).not.toMatch(/\billegal\b(?! and is not)/i);
  });

  it('CSP style hash matches the inline style', async () => {
    const { createHash } = await import('node:crypto');
    const html = await renderHtmlReport(report([]));
    const css = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    const hash = createHash('sha256').update(css).digest('base64');
    expect(html).toContain(`style-src &#39;sha256-${hash}&#39;`);
    expect(html).toContain('No possible issues were found');
  });

  it('embeds screenshots only from the expected path, JPEG only, within size caps', async () => {
    const shots = path.join(dir, 'a', 'screenshots');
    await mkdir(shots, { recursive: true });
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(100)]);
    await writeFile(path.join(shots, 'F0001.jpg'), jpeg);
    await writeFile(path.join(shots, 'F0002.jpg'), Buffer.from('<svg onload=alert(1)>'));
    await writeFile(path.join(shots, 'F0003.jpg'), Buffer.concat([jpeg, Buffer.alloc(IMAGE_LIMITS.maxImageBytes)]));
    await writeFile(path.join(dir, 'secret.txt'), 'SECRET');
    await symlink(path.join(dir, 'secret.txt'), path.join(shots, 'F0004.jpg'));
    const html = await renderHtmlReport(
      report([
        finding({ id: 'F0001', evidence: { selector: 'a', text: 'a', details: {}, screenshot: 'screenshots/F0001.jpg' } }),
        finding({ id: 'F0002', evidence: { selector: 'a', text: 'a', details: {}, screenshot: 'screenshots/F0002.jpg' } }),
        finding({ id: 'F0003', evidence: { selector: 'a', text: 'a', details: {}, screenshot: 'screenshots/F0003.jpg' } }),
        finding({ id: 'F0004', evidence: { selector: 'a', text: 'a', details: {}, screenshot: 'screenshots/F0004.jpg' } }),
        finding({ id: 'F0005', evidence: { selector: 'a', text: 'a', details: {}, screenshot: '../secret.txt' } }),
      ]),
      { baseDir: path.join(dir, 'a') },
    );
    expect(html.match(/data:image\/jpeg;base64,/g)).toHaveLength(1);
    expect(html).toContain(`data:image/jpeg;base64,${jpeg.toString('base64')}`);
    expect(html).not.toContain(Buffer.from('SECRET').toString('base64'));
  });

  it('renders unknown provision ids from untrusted JSON as text', async () => {
    const f = finding({ provisions: ['nope' as unknown as 'ucpd-art-5'] });
    const html = await renderHtmlReport(report([f], { provisions: [{ ...PROVISIONS['ucpd-art-5'], url: 'javascript:alert(1)' }] }));
    expect(html).toContain('Possible issue under nope.');
    expect(html).not.toContain('href="javascript:');
  });
  it('escapes fields that should be numbers or known values but hold markup in untrusted JSON', async () => {
    const hostile = JSON.parse(
      JSON.stringify(
        report([finding({ confidence: `low"><meta http-equiv="refresh" content="0;url=https://evil.example">` as unknown as 'low' })], {
          summary: { total: '<meta http-equiv="refresh" content="0;url=https://evil.example">' as unknown as number, high: EVIL as unknown as number, medium: 0, low: 0, byDetector: {} },
          pages: [{ url: 'https://shop.example/', status: 'error', httpStatus: EVIL as unknown as number, error: 42 as unknown as string }],
          journey: { name: 'j', completed: false, stepsRun: EVIL as unknown as number, marks: [] },
        }),
      ),
    ) as ScanReport;
    const html = await renderHtmlReport(hostile);
    expect(html).not.toContain('<script>alert(1)');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toMatch(/<meta http-equiv="refresh"/i);
    expect(html).toContain('not completed');
  });
});

describe('report data', () => {
  it('summarises, sorts and filters', () => {
    const fs = [finding({ id: 'F0001', confidence: 'low' }), finding({ id: 'F0002', confidence: 'high', detector: 'countdown-reset' }), finding({ id: 'F0003', confidence: 'medium' })];
    expect(sortFindings(fs).map((f) => f.id)).toEqual(['F0002', 'F0003', 'F0001']);
    expect(summarize(fs)).toEqual({ total: 3, high: 1, medium: 1, low: 1, byDetector: { 'claim-to-verify': 2, 'countdown-reset': 1 } });
    expect(atLeast('high', 'medium')).toBe(true);
    expect(atLeast('low', 'medium')).toBe(false);
    expect(referencedProvisions(fs).map((p) => p.id)).toEqual(['ucpd-art-6-1', 'ucpd-annex-i-18']);
  });

  it('matches the published JSON schema', async () => {
    const schema = JSON.parse(await readFile(new URL('../../schema/report.schema.json', import.meta.url), 'utf8')) as Record<string, unknown>;
    const r = report([finding({ evidence: { selector: 'a', text: 'b', details: { x: 1 }, screenshot: 'screenshots/F0001.jpg' } })], {
      journey: { name: 'j', completed: true, stepsRun: 1, marks: ['m'] },
    });
    expect(validate(schema, JSON.parse(JSON.stringify(r)))).toEqual([]);
    expect(validate(schema, { ...r, extra: 1 })).not.toEqual([]);
  });

  it('versions match package.json', async () => {
    const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(TOOL_VERSION).toBe(pkg.version);
    expect(REPORT_SCHEMA_VERSION).toMatch(/^1\.\d+\.\d+$/);
  });
});

describe('writeReports', () => {
  it('writes JSON and HTML with restrictive modes and refuses symlinked targets', async () => {
    const out = path.join(dir, 'out');
    const written = await writeReports(report([finding()]), out);
    expect(JSON.parse(await readFile(written.json ?? '', 'utf8'))).toMatchObject({ schemaVersion: REPORT_SCHEMA_VERSION });
    const { stat } = await import('node:fs/promises');
    expect((await stat(written.json ?? '')).mode & 0o777).toBe(0o600);
    expect((await stat(out)).mode & 0o777).toBe(0o700);

    const out2 = path.join(dir, 'out2');
    await mkdir(out2);
    await writeFile(path.join(dir, 'victim.txt'), 'keep');
    await symlink(path.join(dir, 'victim.txt'), path.join(out2, 'report.json'));
    await expect(writeReports(report([]), out2, { json: true, html: false })).rejects.toThrow();
    expect(await readFile(path.join(dir, 'victim.txt'), 'utf8')).toBe('keep');
  });
});
