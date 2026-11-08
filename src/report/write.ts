// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import path from 'node:path';
import { ensureDir, safeWriteFile } from '../util/files.js';
import { renderHtmlReport } from './html.js';
import type { ScanReport } from './types.js';

/** Which files to write. */
export interface WriteReportsOptions {
  readonly json?: boolean;
  readonly html?: boolean;
}

/** Paths written. */
export interface WrittenReports {
  readonly json?: string;
  readonly html?: string;
}

/**
 * Write `report.json` and/or `report.html` into `dir` (created with mode 0700;
 * files 0600, never through a symlink). Screenshots referenced by the report
 * are read from `dir/screenshots` and embedded in the HTML.
 */
export async function writeReports(report: ScanReport, dir: string, options: WriteReportsOptions = { json: true, html: true }): Promise<WrittenReports> {
  const real = await ensureDir(dir);
  const out: { json?: string; html?: string } = {};
  if (options.json !== false) {
    out.json = await safeWriteFile(real, 'report.json', `${JSON.stringify(report, null, 2)}\n`);
  }
  if (options.html !== false) {
    out.html = await safeWriteFile(real, 'report.html', await renderHtmlReport(report, { baseDir: real }));
  }
  return out;
}

/** Resolve a user-supplied output directory against the working directory. */
export function resolveOutputDir(dir: string, cwd: string = process.cwd()): string {
  return path.resolve(cwd, dir);
}
