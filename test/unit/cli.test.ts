import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { actionArgs, outputLines, runAction, summaryMarkdown } from '../../src/action/entrypoint.js';
import { parseArgs, UsageError } from '../../src/cli/args.js';
import { main, safeLine } from '../../src/cli/main.js';
import { BlockedRequestError } from '../../src/net/guard.js';
import { DISCLAIMER, REPORT_SCHEMA_VERSION, TOOL_VERSION, summarize, type ScanReport } from '../../src/report/types.js';
import type { ScanOptions } from '../../src/scan.js';
import type { Finding } from '../../src/types.js';

const finding: Finding = {
  id: 'F0001',
  detector: 'preselected-option',
  title: 'Extra paid item selected by default',
  confidence: 'high',
  provisions: ['crd-art-22'],
  explanation: 'possible issue',
  pageUrl: 'https://shop.example/',
  evidence: { selector: '#x', text: 'Insurance +€9', details: {} },
};

const fakeReport = (findings: Finding[]): ScanReport => ({
  schemaVersion: REPORT_SCHEMA_VERSION,
  tool: { name: 'brightline', version: TOOL_VERSION },
  startedAt: 'a',
  finishedAt: 'b',
  startUrl: 'https://shop.example/',
  pages: [{ url: 'https://shop.example/', status: 'scanned', httpStatus: 200 }],
  findings,
  summary: summarize(findings),
  provisions: [],
  blockedRequests: [],
  limits: { maxPages: 1, maxDurationMs: 1, navigationTimeoutMs: 1, maxResponseBytes: 1, maxTotalBytes: 1, maxRedirects: 1, respectRobotsTxt: true },
  notes: [],
  disclaimer: DISCLAIMER,
});

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'brightline-cli-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('parseArgs', () => {
  it('parses a full scan command', () => {
    const cmd = parseArgs([
      'scan',
      'https://shop.example',
      '--journey',
      'j.json',
      '--max-pages',
      '5',
      '--max-duration',
      '60',
      '--out',
      'out',
      '--format',
      'json',
      '--detectors',
      'confirmshaming,hidden-costs',
      '--ignore-robots',
      '--allow-address',
      '10.0.0.5',
      '--fail-on',
      'medium',
      '--no-sandbox',
      '--quiet',
    ]);
    expect(cmd).toEqual({
      kind: 'scan',
      url: 'https://shop.example',
      journeyFile: 'j.json',
      maxPages: 5,
      maxDurationSeconds: 60,
      outDir: 'out',
      json: true,
      html: false,
      detectors: ['confirmshaming', 'hidden-costs'],
      respectRobotsTxt: false,
      allowAddresses: ['10.0.0.5'],
      failOn: 'medium',
      sandbox: false,
      quiet: true,
    });
  });

  it('reads BRIGHTLINE_NO_SANDBOX', () => {
    const cmd = parseArgs(['scan', 'https://a.example'], { BRIGHTLINE_NO_SANDBOX: '1' });
    expect(cmd.kind === 'scan' && cmd.sandbox).toBe(false);
  });

  it.each([
    [['scan']],
    [['scan', 'a', 'b']],
    [['scan', 'https://a.example', '--max-pages', '201']],
    [['scan', 'https://a.example', '--max-pages', '-1']],
    [['scan', 'https://a.example', '--max-pages', '1e3']],
    [['scan', 'https://a.example', '--max-duration', '2']],
    [['scan', 'https://a.example', '--format', 'xml']],
    [['scan', 'https://a.example', '--detectors', 'nope']],
    [['scan', 'https://a.example', '--fail-on', 'critical']],
    [['scan', 'https://a.example', '--journey']],
    [['scan', 'https://a.example', '--journey', '--quiet']],
    [['scan', 'https://a.example', '--eval', 'x']],
    [['rm', '-rf']],
    [['validate-journey']],
    [new Array(201).fill('x')],
  ])('rejects %j', (argv) => {
    expect(() => parseArgs(argv)).toThrow(UsageError);
  });

  it('help and version', () => {
    expect(parseArgs([])).toEqual({ kind: 'help' });
    expect(parseArgs(['--version'])).toEqual({ kind: 'version' });
  });
});

describe('main', () => {
  const io = (scanner?: (o: ScanOptions) => Promise<ScanReport>) => {
    const out: string[] = [];
    const err: string[] = [];
    return {
      out,
      err,
      io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l), env: {}, ...(scanner === undefined ? {} : { scanner }) },
    };
  };

  it('prints help and version', async () => {
    const h = io();
    expect(await main(['--help'], h.io)).toBe(0);
    expect(h.out.join('\n')).toContain('brightline scan <url>');
    expect(h.out.join('\n')).toContain('Brightline by AFKzona Group - https://afkzonagroup.lt');
    const v = io();
    expect(await main(['--version'], v.io)).toBe(0);
    expect(v.out).toEqual([TOOL_VERSION]);
  });

  it('returns 2 with a short message and no stack trace on errors', async () => {
    const a = io();
    expect(await main(['bogus'], a.io)).toBe(2);
    expect(a.err.join('\n')).not.toMatch(/\n\s+at /);
    const b = io(() => Promise.reject(new BlockedRequestError('Address 10.0.0.1 is not allowed (private)', 'private')));
    expect(await main(['scan', 'http://10.0.0.1/', '--out', path.join(dir, 'x')], b.io)).toBe(2);
    expect(b.err[0]).toBe('Refused: Address 10.0.0.1 is not allowed (private)');
    const c = io(() => Promise.reject(new Error('boom\n    at secret (/path/file.js:1:1)')));
    expect(await main(['scan', 'https://a.example', '--out', path.join(dir, 'y')], c.io)).toBe(2);
    expect(c.err.join('\n')).not.toContain('/path/file.js');
    const d = io();
    expect(await main(['scan', 'https://a.example', '--allow-address', 'not-an-ip'], d.io)).toBe(2);
  });

  it('validates journey files', async () => {
    const good = path.join(dir, 'good.json');
    await writeFile(good, JSON.stringify({ version: 1, name: 'j', startUrl: 'https://a.example/', steps: [{ action: 'click', selector: '#a' }] }));
    const bad = path.join(dir, 'bad.json');
    await writeFile(bad, JSON.stringify({ version: 1, name: 'j', startUrl: 'https://a.example/', steps: [{ action: 'eval', code: 'x' }] }));
    const g = io();
    expect(await main(['validate-journey', good], g.io)).toBe(0);
    const b = io();
    expect(await main(['validate-journey', bad], b.io)).toBe(2);
    expect(b.err[0]).toContain('Invalid journey: /steps/0/action');
    const missing = io();
    expect(await main(['validate-journey', path.join(dir, 'missing.json')], missing.io)).toBe(2);
    const directory = io();
    expect(await main(['validate-journey', dir], directory.io)).toBe(2);
  });

  it('writes reports and applies --fail-on', async () => {
    let received: ScanOptions | undefined;
    const scanner = (o: ScanOptions): Promise<ScanReport> => {
      received = o;
      return Promise.resolve(fakeReport([finding]));
    };
    const out = path.join(dir, 'report');
    const ok = io(scanner);
    expect(await main(['scan', 'https://shop.example', '--out', out, '--quiet'], ok.io)).toBe(0);
    expect(received?.chromiumSandbox).toBe(true);
    expect(JSON.parse(await readFile(path.join(out, 'report.json'), 'utf8'))).toMatchObject({ summary: { high: 1 } });
    expect(await readFile(path.join(out, 'report.html'), 'utf8')).toContain('Brightline by AFKzona Group');
    const fail = io(scanner);
    expect(await main(['scan', 'https://shop.example', '--out', out, '--fail-on', 'high'], fail.io)).toBe(1);
    expect(fail.out.join('\n')).toContain('[high] F0001');
    const pass = io(() => Promise.resolve(fakeReport([{ ...finding, confidence: 'low' }])));
    expect(await main(['scan', 'https://shop.example', '--out', out, '--fail-on', 'medium'], pass.io)).toBe(0);
  });
});

describe('terminal output', () => {
  it('neutralises escape sequences and bidi controls from scanned content', () => {
    expect(safeLine('ok\u001b[2J\u0007 \u202etxt.exe\u009b')).toBe('ok?[2J? ?txt.exe?');
    expect(safeLine('tab\tkept')).toBe('tab\tkept');
  });
  it('main applies it to every line', async () => {
    const out: string[] = [];
    const evil: ScanReport = fakeReport([{ ...finding, pageUrl: 'https://a.example/\u001b]0;pwned\u0007' }]);
    await main(['scan', 'https://a.example', '--out', path.join(dir, 'esc')], { out: (l) => out.push(l), err: () => undefined, env: {}, scanner: () => Promise.resolve(evil) });
    const printed = out.join('\n');
    expect(printed.includes('\u001b')).toBe(false);
    expect(printed.includes('\u0007')).toBe(false);
  });
});

describe('GitHub Action entry point', () => {
  it('maps inputs to arguments without a shell', () => {
    expect(
      actionArgs({
        BRIGHTLINE_URL: ' https://shop.example ',
        BRIGHTLINE_MAX_PAGES: '3',
        BRIGHTLINE_FAIL_ON: 'high',
        BRIGHTLINE_ALLOW_ADDRESSES: '10.0.0.5, 10.0.0.6',
        BRIGHTLINE_IGNORE_ROBOTS: 'true',
        BRIGHTLINE_JOURNEY: '',
      }),
    ).toEqual(['scan', 'https://shop.example', '--max-pages', '3', '--fail-on', 'high', '--allow-address', '10.0.0.5', '--allow-address', '10.0.0.6', '--ignore-robots']);
    // Shell metacharacters stay inert array elements.
    expect(actionArgs({ BRIGHTLINE_URL: 'https://a.example/$(id);`id`' })).toEqual(['scan', 'https://a.example/$(id);`id`']);
  });

  it('writes outputs that cannot inject extra keys', () => {
    const lines = outputLines(fakeReport([finding]), '/tmp/x\nfindings=999');
    expect(lines.split('\n').filter((l) => l.startsWith('findings='))).toEqual(['findings=1']);
  });

  it('job summary contains counts and fixed titles only', () => {
    const md = summaryMarkdown(fakeReport([finding]));
    expect(md).toContain('1 possible issue(s): 1 high');
    expect(md).not.toContain('Insurance');
  });

  it('runAction never publishes a stale report after a failed scan', async () => {
    const out = path.join(dir, 'action-out');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(out, { recursive: true });
    await writeFile(path.join(out, 'report.json'), JSON.stringify(fakeReport([finding])));
    const ghOut = path.join(dir, 'gh-output');
    await writeFile(ghOut, '');
    const code = await runAction({ BRIGHTLINE_URL: 'http://127.0.0.1/', BRIGHTLINE_OUT: out, GITHUB_OUTPUT: ghOut });
    expect(code).toBe(2);
    expect(await readFile(ghOut, 'utf8')).toBe('');
  });

  it('runAction builds outputs from this run, never from a report.json already in the workspace', async () => {
    const out = path.join(dir, 'action-planted');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(out, { recursive: true });
    // A pull request could commit this file; with --format html the scan does not overwrite it.
    const planted = { ...fakeReport([]), summary: { total: '0\nhigh=0\nreport-dir=/etc', high: 0, medium: 0, low: 0, byDetector: {} }, findings: [{ ...finding, title: 'x | [y](https://evil.example)' }] };
    await writeFile(path.join(out, 'report.json'), JSON.stringify(planted));
    const ghOut = path.join(dir, 'gh-output-2');
    const ghSummary = path.join(dir, 'gh-summary-2');
    await writeFile(ghOut, '');
    await writeFile(ghSummary, '');
    const code = await runAction(
      { BRIGHTLINE_URL: 'https://shop.example/', BRIGHTLINE_OUT: out, BRIGHTLINE_FORMAT: 'html', GITHUB_OUTPUT: ghOut, GITHUB_STEP_SUMMARY: ghSummary },
      { scanner: () => Promise.resolve(fakeReport([finding])) },
    );
    expect(code).toBe(0);
    const lines = (await readFile(ghOut, 'utf8')).split('\n').filter((l) => l !== '');
    expect(lines).toEqual(['findings=1', 'high=1', 'medium=0', 'low=0', `report-dir=${out}`]);
    expect(await readFile(ghSummary, 'utf8')).not.toContain('evil.example');
  });

  it('outputs and summary accept only integer counts and plain titles', () => {
    const hostile = { ...fakeReport([{ ...finding, title: 'a | b\n## c [d](e)' }]), summary: { total: '1\nhigh=0' as unknown as number, high: -1, medium: 1.5, low: 2, byDetector: {} } };
    expect(outputLines(hostile, '/x').split('\n')).toEqual(['findings=0', 'high=0', 'medium=0', 'low=2', 'report-dir=/x', '']);
    const md = summaryMarkdown(hostile);
    expect(md).not.toMatch(/\[d\]|\n## c/);
    expect(md.split('\n').filter((l) => l.startsWith('| F0001'))).toHaveLength(1);
  });

  it('action.yml never interpolates inputs into run scripts and pins actions by SHA', async () => {
    const yml = await readFile(new URL('../../action.yml', import.meta.url), 'utf8');
    const runBlocks = yml.split(/\n\s+- name:/).map((step) => /run: \|?([\s\S]*)$/.exec(step)?.[1] ?? '');
    for (const block of runBlocks) expect(block).not.toContain('${{');
    for (const uses of yml.match(/uses: \S+/g) ?? []) expect(uses).toMatch(/@[0-9a-f]{40}$/);
  });

  it('action.yml changes the kernel setting for the sandbox only on GitHub-hosted Linux runners and never turns the sandbox off', async () => {
    const yml = await readFile(new URL('../../action.yml', import.meta.url), 'utf8');
    const steps = yml.split(/\n\s+- name:/);
    const withSysctl = steps.filter((step) => step.includes('sysctl'));
    expect(withSysctl).toHaveLength(1);
    expect(withSysctl[0]).toContain("if: runner.os == 'Linux' && runner.environment == 'github-hosted'");
    expect(yml).not.toMatch(/no-sandbox|BRIGHTLINE_NO_SANDBOX/);
  });
});
