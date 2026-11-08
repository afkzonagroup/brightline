/**
 * README examples are real files in examples/ and are executed here:
 * - every README block marked `<!-- example: path -->` must equal that file;
 * - the journey example validates (code and JSON schema);
 * - the library example scans the fixture site;
 * - the Playwright Test example runs under the real Playwright Test runner
 *   against the built package.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scanSite } from '../../examples/scan-site.js';
import { parseJourney } from '../../src/journey/schema.js';
import { validate } from '../helpers/jsonschema.js';
import { startFixtures, type Fixtures } from '../helpers/server.js';

const exec = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let fx: Fixtures;
let dir: string;
beforeAll(async () => {
  fx = await startFixtures();
  dir = await mkdtemp(path.join(os.tmpdir(), 'brightline-examples-'));
});
afterAll(async () => {
  await fx.close();
  await rm(dir, { recursive: true, force: true });
});

describe('README examples', () => {
  it('every marked README block equals its example file', async () => {
    const readme = await readFile(path.join(ROOT, 'README.md'), 'utf8');
    const blocks = [...readme.matchAll(/<!-- example: (\S+) -->\n```\w+\n([\s\S]*?)```/g)];
    expect(blocks.map((b) => b[1])).toEqual(['examples/scan-site.ts', 'examples/journey.json', 'examples/checkout.spec.ts']);
    for (const [, file, body] of blocks) {
      expect(body).toBe(await readFile(path.join(ROOT, file ?? ''), 'utf8'));
    }
  });

  it('journey example is valid in code and against the JSON schema', async () => {
    const text = await readFile(path.join(ROOT, 'examples/journey.json'), 'utf8');
    expect(parseJourney(text).steps).toHaveLength(4);
    const schema = JSON.parse(await readFile(path.join(ROOT, 'schema/journey.schema.json'), 'utf8')) as Record<string, unknown>;
    expect(validate(schema, JSON.parse(text))).toEqual([]);
    expect(validate(schema, { ...(JSON.parse(text) as object), steps: [{ action: 'eval', code: 'x' }] })).not.toEqual([]);
  });

  it('library example scans and writes reports', async () => {
    const out = path.join(dir, 'lib');
    const report = await scanSite(`${fx.base}/price.html`, out, { resolver: fx.resolver, allowAddresses: fx.allowAddresses, maxPages: 1, respectRobotsTxt: false });
    expect(report.summary.total).toBe(2);
    expect(JSON.parse(await readFile(path.join(out, 'report.json'), 'utf8'))).toMatchObject({ summary: { total: 2 } });
  });

  it('Playwright Test example passes against the built package', async () => {
    await exec(process.execPath, [path.join(ROOT, 'node_modules/typescript/bin/tsc'), '-p', path.join(ROOT, 'tsconfig.build.json')], { cwd: ROOT });
    const { stdout } = await exec(process.execPath, [path.join(ROOT, 'node_modules/@playwright/test/cli.js'), 'test', '--config', path.join(ROOT, 'examples/playwright.config.ts'), '--output', path.join(dir, 'pw')], {
      cwd: ROOT,
      env: { ...process.env, BASE_URL: `http://127.0.0.1:${String(fx.port)}`, CI: '1' },
    });
    expect(stdout).toMatch(/2 passed/);
  }, 120_000);
});
