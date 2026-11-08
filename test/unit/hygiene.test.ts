/**
 * Repository hygiene: no invisible or bidirectional control characters in
 * tracked text files (they can hide code from reviewers), and no raw control
 * characters in source.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TEXT = /\.(ts|js|mjs|json|md|yml|yaml|html|txt|css)$|^(LICENSE|Dockerfile|\.gitignore|\.npmrc|\.editorconfig|\.dockerignore)$/;

function trackedAndNewFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter((f) => f !== '' && TEXT.test(path.basename(f)));
}

describe('repository hygiene', () => {
  const files = trackedAndNewFiles();

  it('finds the files to check', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('contains no bidirectional or invisible formatting characters', () => {
    const bad = /[\u202a-\u202e\u2066-\u2069\u2028\u2029\u200b-\u200f\ufeff\u00ad]/u;
    const hits = files.filter((f) => bad.test(readFileSync(path.join(ROOT, f), 'utf8')));
    expect(hits).toEqual([]);
  });

  it('contains no raw control characters other than tab and line feed', () => {
    // eslint-disable-next-line no-control-regex -- detecting control characters is the point
    const bad = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
    const hits = files.filter((f) => bad.test(readFileSync(path.join(ROOT, f), 'utf8')));
    expect(hits).toEqual([]);
  });
});
