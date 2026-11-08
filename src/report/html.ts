// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Self-contained HTML report. No scripts. Every dynamic value is escaped,
 * including numbers: `renderHtmlReport` may be given a report parsed from an
 * untrusted JSON file, where any field can hold any type.
 * Screenshots are embedded as data URIs with per-image and total size caps.
 * A Content-Security-Policy meta tag allows only the inline style (by hash)
 * and data: images.
 */

import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { PROVISIONS } from '../legal/provisions.js';
import type { Finding } from '../types.js';
import { DISCLAIMER, type ScanReport } from './types.js';

/** Attribution required by LICENSE-ADDITIONAL-TERMS.md (AGPL-3.0 section 7(b)). */
export const ATTRIBUTION = Object.freeze({ text: 'Brightline by AFKzona Group', url: 'https://afkzonagroup.lt' });

/** Size caps for embedded images. */
export const IMAGE_LIMITS = Object.freeze({ maxImageBytes: 400 * 1024, maxTotalBytes: 8 * 1024 * 1024 });

/** Escape text for HTML element content and quoted attribute values. */
export function escapeHtml(value: string | number | boolean): string {
  // String() keeps a non-string from an untrusted report from throwing or passing through.
  return String(value).replace(/[&<>"'`]/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return '&#96;';
    }
  });
}

/** Return the URL if it is http(s) and parses; otherwise null (rendered as text, not a link). */
export function safeHref(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

const SCREENSHOT_PATH = /^screenshots\/F\d{4,6}\.jpg$/;

const CONFIDENCE_CLASS = new Set(['high', 'medium', 'low']);

const CSS = `
:root{--bg:#fff;--fg:#1b1d21;--muted:#5b616e;--line:#dfe2e7;--card:#f7f8fa;--high:#a3142b;--medium:#8a5300;--low:#2d5b8a;--link:#1a56b5}
@media (prefers-color-scheme:dark){:root{--bg:#121417;--fg:#e8eaed;--muted:#a3a9b5;--line:#2c3038;--card:#1a1d22;--high:#ff8a9a;--medium:#ffc266;--low:#8ab8ff;--link:#8ab4ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px 48px}h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:32px 0 12px}h3{font-size:16px;margin:0}
a{color:var(--link)}p{margin:6px 0;overflow-wrap:anywhere}.muted{color:var(--muted)}.summary{display:flex;flex-wrap:wrap;gap:16px;margin:16px 0}
.summary div{padding:8px 0}.finding{border-top:1px solid var(--line);padding:16px 0}.head{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.conf{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}.high{color:var(--high)}.medium{color:var(--medium)}.low{color:var(--low)}
code{font:13px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;margin:8px 0}
dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}img{max-width:100%;height:auto;border:1px solid var(--line);margin-top:8px}
table{border-collapse:collapse;width:100%;table-layout:fixed}td,th{border-top:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}td:first-child,th:first-child{width:38%}
footer{margin-top:40px;border-top:1px solid var(--line);padding-top:12px;font-size:13px;color:var(--muted)}
`;

/** Options for rendering. */
export interface HtmlOptions {
  /**
   * Directory the report's screenshot paths are relative to. Only paths of
   * the form `screenshots/F0001.jpg` are read, and only inside this directory.
   */
  readonly baseDir?: string;
}

async function loadImages(findings: readonly Finding[], baseDir: string | undefined): Promise<Map<string, string>> {
  const images = new Map<string, string>();
  if (baseDir === undefined) return images;
  let realBase: string;
  try {
    realBase = await realpath(baseDir);
  } catch {
    return images;
  }
  let total = 0;
  for (const f of findings) {
    const rel = f.evidence.screenshot;
    if (rel === undefined || !SCREENSHOT_PATH.test(rel)) continue;
    try {
      const file = await realpath(path.join(realBase, rel));
      if (!file.startsWith(realBase + path.sep)) continue;
      const data = await readFile(file);
      if (data.length > IMAGE_LIMITS.maxImageBytes || total + data.length > IMAGE_LIMITS.maxTotalBytes) continue;
      if (data[0] !== 0xff || data[1] !== 0xd8) continue; // JPEG magic bytes only
      total += data.length;
      images.set(f.id, `data:image/jpeg;base64,${data.toString('base64')}`);
    } catch {
      // Missing or unreadable screenshot: render without it.
    }
  }
  return images;
}

function renderFinding(f: Finding, image: string | undefined): string {
  const e = escapeHtml;
  const page = safeHref(f.pageUrl);
  const provisions = f.provisions
    .map((id) => {
      const p = Object.hasOwn(PROVISIONS, id) ? PROVISIONS[id] : undefined;
      return p === undefined ? e(id) : `<a href="${e(p.url)}" rel="noopener noreferrer">${e(p.citation)}</a>`;
    })
    .join(', ');
  const details = Object.entries(f.evidence.details)
    .map(([k, v]) => `<dt>${e(k)}</dt><dd>${e(String(v))}</dd>`)
    .join('');
  return `<section class="finding" id="${e(f.id)}">
<div class="head"><span class="conf ${CONFIDENCE_CLASS.has(f.confidence) ? f.confidence : ''}">${e(f.confidence)}</span><h3>${e(f.title)}</h3><span class="muted">${e(f.id)}</span></div>
<p>Possible issue under ${provisions}.</p>
<p>${e(f.explanation)}</p>
<dl><dt>Page</dt><dd>${page === null ? e(f.pageUrl) : `<a href="${e(page)}" rel="noopener noreferrer">${e(f.pageUrl)}</a>`}</dd>
<dt>Element</dt><dd><code>${e(f.evidence.selector)}</code></dd>
<dt>Text</dt><dd>${e(f.evidence.text)}</dd>${details}</dl>
${image === undefined ? '' : `<img alt="${e(`Screenshot for ${f.id}`)}" src="${e(image)}">`}
</section>`;
}

/**
 * Render a report as one self-contained HTML document.
 *
 * @example
 * ```ts
 * const html = await renderHtmlReport(report, { baseDir: './brightline-report' });
 * ```
 */
export async function renderHtmlReport(report: ScanReport, options: HtmlOptions = {}): Promise<string> {
  const e = escapeHtml;
  const images = await loadImages(report.findings, options.baseDir);
  const styleHash = createHash('sha256').update(CSS).digest('base64');
  const csp = `default-src 'none'; img-src data:; style-src 'sha256-${styleHash}'; base-uri 'none'; form-action 'none'`;
  const start = safeHref(report.startUrl);
  const findings = report.findings.length === 0 ? '<p>No possible issues were found by the enabled detectors. This does not mean the site has none.</p>' : report.findings.map((f) => renderFinding(f, images.get(f.id))).join('\n');
  const pages = report.pages
    .map((p) => `<tr><td>${e(p.url)}</td><td>${e(p.status)}${p.httpStatus === undefined ? '' : ` (${e(String(p.httpStatus))})`}</td><td>${e(p.error ?? '')}</td></tr>`)
    .join('');
  const provisions = report.provisions
    .map((p) => {
      const href = safeHref(p.url);
      const cite = href === null ? e(p.citation) : `<a href="${e(href)}" rel="noopener noreferrer">${e(p.citation)}</a>`;
      return `<tr><td>${cite}</td><td>${e(p.summary)}<br><span class="muted">${e(p.scope)}</span></td></tr>`;
    })
    .join('');
  const notes = report.notes.map((n) => `<li>${e(n)}</li>`).join('');
  const journey =
    report.journey === undefined
      ? ''
      : `<p>Journey <strong>${e(report.journey.name)}</strong>: ${report.journey.completed ? 'completed' : 'not completed'} (${e(String(report.journey.stepsRun))} steps)${report.journey.error === undefined ? '' : ` — ${e(report.journey.error)}`}.</p>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${e(csp)}">
<meta name="referrer" content="no-referrer">
<title>Brightline report</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>Brightline report</h1>
<p class="muted">${start === null ? e(report.startUrl) : `<a href="${e(start)}" rel="noopener noreferrer">${e(report.startUrl)}</a>`} · ${e(report.finishedAt)} · report format ${e(report.schemaVersion)}</p>
<p>${e(DISCLAIMER)}</p>
<div class="summary"><div><strong>${e(String(report.summary.total))}</strong> findings</div><div class="high"><strong>${e(String(report.summary.high))}</strong> high</div><div class="medium"><strong>${e(String(report.summary.medium))}</strong> medium</div><div class="low"><strong>${e(String(report.summary.low))}</strong> low</div></div>
${journey}
<h2>Findings</h2>
${findings}
<h2>Provisions referenced</h2>
${provisions === '' ? '<p>None.</p>' : `<table>${provisions}</table>`}
<h2>Pages</h2>
<table><tr><th>URL</th><th>Status</th><th>Note</th></tr>${pages}</table>
${notes === '' ? '' : `<h2>Notes</h2><ul>${notes}</ul>`}
<footer><a href="${e(ATTRIBUTION.url)}" rel="noopener noreferrer">${e(ATTRIBUTION.text)}</a> · version ${e(report.tool.version)}</footer>
</main>
</body>
</html>
`;
}
