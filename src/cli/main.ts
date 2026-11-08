// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import { readFile, stat } from 'node:fs/promises';
import { canonicalIp } from '../net/ip.js';
import { BlockedRequestError } from '../net/guard.js';
import { JOURNEY_LIMITS, JourneyValidationError, parseJourney, type Journey } from '../journey/schema.js';
import { atLeast, TOOL_VERSION, type ScanReport } from '../report/types.js';
import { resolveOutputDir, writeReports } from '../report/write.js';
import { scan, type ScanOptions } from '../scan.js';
import { parseArgs, USAGE, UsageError } from './args.js';

/** Where the CLI writes text. */
export interface CliIo {
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Injected for tests; defaults to the real scanner. */
  readonly scanner?: typeof scan;
  /** Extra scan options for tests (for example a resolver). */
  readonly scanOverrides?: Partial<ScanOptions>;
  /** Called with the finished report and the output directory, after the report files are written. */
  readonly onReport?: (report: ScanReport, outDir: string) => Promise<void> | void;
}

async function readJourneyFile(file: string): Promise<Journey> {
  const info = await stat(file);
  if (!info.isFile()) throw new UsageError('Journey path is not a file');
  if (info.size > JOURNEY_LIMITS.maxBytes) throw new JourneyValidationError('', `journey file must be at most ${String(JOURNEY_LIMITS.maxBytes)} bytes`);
  return parseJourney(await readFile(file, 'utf8'));
}

/** Replace control characters (terminal escape sequences) in text from scanned pages. Pure. */
export function safeLine(line: string): string {
  // eslint-disable-next-line no-control-regex -- removing control characters is the point
  return line.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu, '?');
}

/**
 * Run the CLI. Returns the exit code: 0 success, 1 findings at or above
 * --fail-on, 2 usage or runtime error. Never prints stack traces.
 */
export async function main(argv: readonly string[], rawIo: CliIo): Promise<number> {
  const io: CliIo = {
    ...rawIo,
    out: (line) => {
      rawIo.out(safeLine(line));
    },
    err: (line) => {
      rawIo.err(safeLine(line));
    },
  };
  try {
    const cmd = parseArgs(argv, io.env);
    if (cmd.kind === 'help') {
      io.out(USAGE);
      return 0;
    }
    if (cmd.kind === 'version') {
      io.out(TOOL_VERSION);
      return 0;
    }
    if (cmd.kind === 'validate-journey') {
      const journey = await readJourneyFile(cmd.file);
      io.out(`Journey "${journey.name}" is valid (${String(journey.steps.length)} steps).`);
      return 0;
    }
    for (const a of cmd.allowAddresses) {
      if (canonicalIp(a) === null) throw new UsageError(`--allow-address needs an IP address, got ${a.slice(0, 60)}`);
    }
    const journey = cmd.journeyFile === undefined ? undefined : await readJourneyFile(cmd.journeyFile);
    const outDir = resolveOutputDir(cmd.outDir);
    const runScan = io.scanner ?? scan;
    const report = await runScan({
      url: cmd.url,
      outputDir: outDir,
      respectRobotsTxt: cmd.respectRobotsTxt,
      allowAddresses: cmd.allowAddresses,
      chromiumSandbox: cmd.sandbox,
      ...(journey === undefined ? {} : { journey }),
      ...(cmd.maxPages === undefined ? {} : { maxPages: cmd.maxPages }),
      ...(cmd.maxDurationSeconds === undefined ? {} : { maxDurationMs: cmd.maxDurationSeconds * 1000 }),
      ...(cmd.detectors === undefined ? {} : { detectors: cmd.detectors }),
      ...(cmd.quiet ? {} : { onProgress: (m: string) => { io.err(m); } }),
      ...io.scanOverrides,
    });
    const written = await writeReports(report, outDir, { json: cmd.json, html: cmd.html });
    if (rawIo.onReport !== undefined) await rawIo.onReport(report, outDir);
    const s = report.summary;
    io.out(`${String(s.total)} possible issue(s): ${String(s.high)} high, ${String(s.medium)} medium, ${String(s.low)} low. Pages scanned: ${String(report.pages.filter((p) => p.status === 'scanned').length)}.`);
    if (!cmd.quiet) {
      for (const f of report.findings) io.out(`  [${f.confidence}] ${f.id} ${f.title} — ${f.pageUrl}`);
      if (written.json !== undefined) io.out(`JSON report: ${written.json}`);
      if (written.html !== undefined) io.out(`HTML report: ${written.html}`);
    }
    if (cmd.failOn !== 'none' && report.findings.some((f) => atLeast(f.confidence, cmd.failOn as 'high' | 'medium' | 'low'))) return 1;
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      io.err(`Error: ${error.message}`);
      io.err('Run "brightline --help" for usage.');
    } else if (error instanceof JourneyValidationError) {
      io.err(`Invalid journey: ${error.message}`);
    } else if (error instanceof BlockedRequestError) {
      io.err(`Refused: ${error.message}`);
    } else if (error instanceof Error) {
      io.err(`Error: ${error.message.split('\n')[0] ?? 'unknown error'}`);
    } else {
      io.err('Error: unknown error');
    }
    return 2;
  }
}
