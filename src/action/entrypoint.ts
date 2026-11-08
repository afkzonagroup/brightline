// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * GitHub Action entry point. Inputs arrive as environment variables set by
 * action.yml (never interpolated into a shell script), are turned into an
 * argument array and passed to the CLI. Outputs are written to
 * $GITHUB_OUTPUT; the job summary contains only counts and fixed titles (no
 * text from the scanned site).
 */

import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { main, type CliIo } from '../cli/main.js';
import type { ScanReport } from '../report/types.js';

/** Map action inputs to CLI arguments. Pure. */
export function actionArgs(env: Readonly<Record<string, string | undefined>>): string[] {
  const get = (name: string): string => (env[name] ?? '').trim();
  const args = ['scan', get('BRIGHTLINE_URL')];
  const pairs: [string, string][] = [
    ['--journey', get('BRIGHTLINE_JOURNEY')],
    ['--max-pages', get('BRIGHTLINE_MAX_PAGES')],
    ['--max-duration', get('BRIGHTLINE_MAX_DURATION')],
    ['--out', get('BRIGHTLINE_OUT')],
    ['--format', get('BRIGHTLINE_FORMAT')],
    ['--detectors', get('BRIGHTLINE_DETECTORS')],
    ['--fail-on', get('BRIGHTLINE_FAIL_ON')],
  ];
  for (const [flag, value] of pairs) if (value !== '') args.push(flag, value);
  for (const ip of get('BRIGHTLINE_ALLOW_ADDRESSES').split(/[\s,]+/).filter((v) => v !== '')) args.push('--allow-address', ip);
  if (get('BRIGHTLINE_IGNORE_ROBOTS') === 'true') args.push('--ignore-robots');
  return args;
}

/** A count as a plain non-negative integer string (anything else becomes "0"). Pure. */
function count(value: unknown): string {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : '0';
}

/** Lines for $GITHUB_OUTPUT. Values are integers or the output path only. Pure. */
export function outputLines(report: Pick<ScanReport, 'summary'>, outDir: string): string {
  // eslint-disable-next-line no-control-regex -- control characters must never reach $GITHUB_OUTPUT
  const safeDir = outDir.replace(/[\u0000-\u001f\u007f\u2028\u2029]/gu, '');
  return [
    `findings=${count(report.summary.total)}`,
    `high=${count(report.summary.high)}`,
    `medium=${count(report.summary.medium)}`,
    `low=${count(report.summary.low)}`,
    `report-dir=${safeDir}`,
    '',
  ].join('\n');
}

const CONFIDENCES = new Set(['high', 'medium', 'low']);

/** Markdown job summary with counts and fixed detector titles only. Pure. */
export function summaryMarkdown(report: Pick<ScanReport, 'summary' | 'findings'>): string {
  const cell = (text: string): string => text.replace(/[^A-Za-z0-9 ,.()/'-]/g, ' ').slice(0, 120);
  const rows = report.findings
    .map((f) => `| ${cell(f.id)} | ${CONFIDENCES.has(f.confidence) ? f.confidence : ''} | ${cell(f.title)} |`)
    .join('\n');
  return [
    '## Brightline',
    '',
    `${count(report.summary.total)} possible issue(s): ${count(report.summary.high)} high, ${count(report.summary.medium)} medium, ${count(report.summary.low)} low.`,
    '',
    report.findings.length === 0 ? '' : `| Id | Confidence | Finding |\n| --- | --- | --- |\n${rows}`,
    '',
    'Possible issues only; see the HTML report for evidence and provisions. Not legal advice.',
    '',
  ].join('\n');
}

/**
 * Run the action. Returns the exit code.
 *
 * Outputs and the job summary are built from the report of this run, held in
 * memory. A `report.json` already present in the workspace (for example
 * committed in a pull request) is never read.
 */
export async function runAction(env: Readonly<Record<string, string | undefined>>, testing: Pick<CliIo, 'scanner' | 'scanOverrides'> = {}): Promise<number> {
  const args = actionArgs(env);
  let finished: { report: ScanReport; outDir: string } | undefined;
  const code = await main(args, {
    ...testing,
    out: (line) => {
      process.stdout.write(`${line}\n`);
    },
    err: (line) => {
      process.stderr.write(`${line}\n`);
    },
    env,
    onReport: (report, outDir) => {
      finished = { report, outDir };
    },
  });
  if (finished === undefined) return code;
  if (env.GITHUB_OUTPUT !== undefined && env.GITHUB_OUTPUT !== '') await appendFile(env.GITHUB_OUTPUT, outputLines(finished.report, finished.outDir));
  if (env.GITHUB_STEP_SUMMARY !== undefined && env.GITHUB_STEP_SUMMARY !== '') await appendFile(env.GITHUB_STEP_SUMMARY, summaryMarkdown(finished.report));
  return code;
}

// Run only when executed directly as the action script (not when imported by tests).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runAction(process.env);
}
