// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import { isDetectorId } from '../detectors/index.js';
import type { Confidence, DetectorId } from '../types.js';

/** Parsed command line. */
export type Command =
  | { readonly kind: 'help' }
  | { readonly kind: 'version' }
  | { readonly kind: 'validate-journey'; readonly file: string }
  | {
      readonly kind: 'scan';
      readonly url: string;
      readonly journeyFile?: string;
      readonly maxPages?: number;
      readonly maxDurationSeconds?: number;
      readonly outDir: string;
      readonly json: boolean;
      readonly html: boolean;
      readonly respectRobotsTxt: boolean;
      readonly allowAddresses: readonly string[];
      readonly detectors?: readonly DetectorId[];
      readonly failOn: Confidence | 'none';
      readonly sandbox: boolean;
      readonly quiet: boolean;
    };

/** Usage error (exit code 2). */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export const USAGE = `Usage:
  brightline scan <url> [options]
  brightline validate-journey <file>
  brightline --help | --version

Scan options:
  --journey <file>        Run a JSON user journey after the crawl
  --max-pages <n>         Pages to crawl (default 10, max 200, 0 = journey only)
  --max-duration <s>      Time budget in seconds (default 180, max 1800)
  --out <dir>             Output directory (default ./brightline-report)
  --format <f>            json, html or both (default both)
  --detectors <list>      Comma-separated detector ids (default all)
  --ignore-robots         Do not read robots.txt
  --allow-address <ip>    Allow one private IP (your own staging server); repeatable
  --fail-on <level>       Exit 1 if a finding is at least high, medium or low (default none)
  --no-sandbox            Run Chromium without its OS sandbox (containers only)
  --quiet                 Print only the summary line

Brightline reports possible issues. It does not decide whether anything is illegal.

Brightline by AFKzona Group - https://afkzonagroup.lt
Licensed under AGPL-3.0-only with additional terms; see LICENSE and LICENSE-ADDITIONAL-TERMS.md.`;

const LEVELS = new Set(['high', 'medium', 'low', 'none']);

function intArg(name: string, value: string | undefined, min: number, max: number): number {
  if (value === undefined || !/^\d{1,7}$/.test(value)) throw new UsageError(`${name} needs a whole number`);
  const n = Number(value);
  if (n < min || n > max) throw new UsageError(`${name} must be between ${String(min)} and ${String(max)}`);
  return n;
}

/** Parse argv (without node and script). Pure. */
export function parseArgs(argv: readonly string[], env: Readonly<Record<string, string | undefined>> = {}): Command {
  if (argv.length > 200) throw new UsageError('Too many arguments');
  const [cmd, ...rest] = argv;
  if (cmd === undefined || cmd === '--help' || cmd === '-h' || cmd === 'help') return { kind: 'help' };
  if (cmd === '--version' || cmd === '-v') return { kind: 'version' };
  if (cmd === 'validate-journey') {
    if (rest.length !== 1 || rest[0] === undefined || rest[0].startsWith('-')) throw new UsageError('validate-journey needs exactly one file');
    return { kind: 'validate-journey', file: rest[0] };
  }
  if (cmd !== 'scan') throw new UsageError(`Unknown command: ${cmd.slice(0, 40)}`);

  let url: string | undefined;
  let journeyFile: string | undefined;
  let maxPages: number | undefined;
  let maxDurationSeconds: number | undefined;
  let outDir = 'brightline-report';
  let json = true;
  let html = true;
  let respectRobotsTxt = true;
  const allowAddresses: string[] = [];
  let detectors: DetectorId[] | undefined;
  let failOn: Confidence | 'none' = 'none';
  let sandbox = env.BRIGHTLINE_NO_SANDBOX !== '1';
  let quiet = false;

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] ?? '';
    const next = (): string => {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith('--')) throw new UsageError(`${arg} needs a value`);
      i += 1;
      return value;
    };
    switch (arg) {
      case '--journey':
        journeyFile = next();
        break;
      case '--max-pages':
        maxPages = intArg(arg, next(), 0, 200);
        break;
      case '--max-duration':
        maxDurationSeconds = intArg(arg, next(), 5, 1800);
        break;
      case '--out':
        outDir = next();
        break;
      case '--format': {
        const f = next();
        if (f !== 'json' && f !== 'html' && f !== 'both') throw new UsageError('--format must be json, html or both');
        json = f !== 'html';
        html = f !== 'json';
        break;
      }
      case '--detectors': {
        const list = next()
          .split(',')
          .map((d) => d.trim())
          .filter((d) => d !== '');
        for (const d of list) if (!isDetectorId(d)) throw new UsageError(`Unknown detector: ${d.slice(0, 40)}`);
        detectors = list as DetectorId[];
        break;
      }
      case '--ignore-robots':
        respectRobotsTxt = false;
        break;
      case '--allow-address':
        if (allowAddresses.length >= 20) throw new UsageError('At most 20 --allow-address values');
        allowAddresses.push(next());
        break;
      case '--fail-on': {
        const level = next();
        if (!LEVELS.has(level)) throw new UsageError('--fail-on must be high, medium, low or none');
        failOn = level as Confidence | 'none';
        break;
      }
      case '--no-sandbox':
        sandbox = false;
        break;
      case '--quiet':
        quiet = true;
        break;
      default:
        if (arg.startsWith('-')) throw new UsageError(`Unknown option: ${arg.slice(0, 40)}`);
        if (url !== undefined) throw new UsageError('Only one URL may be given');
        url = arg;
    }
  }
  if (url === undefined) throw new UsageError('scan needs a URL');
  return {
    kind: 'scan',
    url,
    outDir,
    json,
    html,
    respectRobotsTxt,
    allowAddresses,
    failOn,
    sandbox,
    quiet,
    ...(journeyFile === undefined ? {} : { journeyFile }),
    ...(maxPages === undefined ? {} : { maxPages }),
    ...(maxDurationSeconds === undefined ? {} : { maxDurationSeconds }),
    ...(detectors === undefined ? {} : { detectors }),
  };
}
