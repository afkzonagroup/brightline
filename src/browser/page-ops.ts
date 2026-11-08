// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import type { Page, Request } from 'playwright-core';
import { CONSENT_SOURCE, DIALOG_HINT_SOURCE, MONEY_SOURCE, TIMER_SOURCE } from '../data/phrases.js';
import { parseTimerSeconds } from '../detectors/countdown.js';
import { safeWriteFile } from '../util/files.js';
import { elementText, pageTask, waitForQuietDom, type CollectArgs, type PageTask, type WalkLimits } from './page-scripts.js';
import { isPlainCssSelector, sanitizeLinks, sanitizeSnapshot, sanitizeTimerTexts } from './sanitize.js';
import type { PageSnapshot, TimerReading } from './snapshot.js';

/** Longest time any in-page evaluation may take. A page that blocks its main thread fails instead of hanging the scan. */
export const EVALUATE_TIMEOUT_MS = 15_000;

/**
 * Run an in-page evaluation with a deadline. On timeout the page is closed,
 * which also ends the pending evaluation.
 */
export async function withDeadline<T>(page: Page, work: Promise<T>, ms: number = EVALUATE_TIMEOUT_MS): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      void page.close().catch(() => undefined);
      reject(new Error(`Page evaluation exceeded ${String(ms)} ms`));
    }, ms);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Bounds of the deep walk over the document and its open shadow roots. The
 * walk is iterative, so neither deep nesting nor many roots can exhaust the
 * stack; whatever lies beyond these bounds is not read and the snapshot is
 * marked truncated.
 */
export const WALK_LIMITS: WalkLimits = Object.freeze({
  maxNodes: 100_000,
  maxShadowRoots: 2_000,
  maxShadowDepth: 32,
});

/** Caps for the in-page collector. */
export const COLLECT_ARGS: CollectArgs = Object.freeze({
  ...WALK_LIMITS,
  moneySource: MONEY_SOURCE,
  consentSource: CONSENT_SOURCE,
  dialogHintSource: DIALOG_HINT_SOURCE,
  maxClickables: 800,
  maxToggles: 300,
  maxTextBlocks: 3000,
  maxPriceSignals: 300,
  maxElements: 20_000,
});

const task = (t: PageTask): PageTask => t;

/** Collect a snapshot of the current page state, including open shadow roots. */
export async function snapshotPage(page: Page): Promise<PageSnapshot> {
  // Page scripts share the JavaScript world with the collector and may tamper
  // with its result, so the result is treated as untrusted and re-validated.
  return sanitizeSnapshot(await withDeadline(page, page.evaluate(pageTask, task({ kind: 'snapshot', args: COLLECT_ARGS }))), COLLECT_ARGS);
}

/** Read countdown-like texts and parse them. */
export async function readTimers(page: Page): Promise<TimerReading[]> {
  const args = { ...WALK_LIMITS, timerSource: TIMER_SOURCE, max: 20, maxElements: COLLECT_ARGS.maxElements };
  const raw = sanitizeTimerTexts(await withDeadline(page, page.evaluate(pageTask, task({ kind: 'timers', args }))), 20);
  const out: TimerReading[] = [];
  for (const r of raw) {
    const seconds = parseTimerSeconds(r.text);
    if (seconds !== null) out.push({ selector: r.selector, text: r.text, seconds });
  }
  return out;
}

/** Links on the page, including those inside open shadow roots: http(s) only, capped. */
export async function collectLinks(page: Page, max = 500): Promise<string[]> {
  const raw = await withDeadline(page, page.evaluate(pageTask, task({ kind: 'links', args: { ...WALK_LIMITS, max } })));
  return sanitizeLinks(raw, max);
}

/** Limits for {@link settleAfter}: quiet period and longest wait, in ms. */
export const QUIET_LIMITS = Object.freeze({ quietMs: 300, maxMs: 2500 });

/** Outcome of {@link settleAfter}. */
export interface SettleResult {
  /** Elements were added, removed or moved by or after the action (text-only updates do not count). */
  readonly changed: boolean;
  /** The main frame started loading a new document (a real navigation, not a client-side route change). */
  readonly loaded: boolean;
}

/**
 * Run `action` (a click, a client-side route change), then wait until the page
 * has no requests in flight and its DOM, including open shadow roots, has not
 * changed for {@link QUIET_LIMITS}.quietMs, or until maxMs has passed. Content
 * an app renders after fetching data is therefore present before the next
 * step reads the page. Requests are only observed here; they still pass the
 * network guard. A page that navigates away ends the wait early.
 */
export async function settleAfter(page: Page, action: () => Promise<unknown>): Promise<SettleResult> {
  const inflight = new Set<Request>();
  let lastNetwork = 0;
  // Set from the event handler; an object so that the compiler does not narrow it to false.
  const state = { loaded: false };
  const onRequest = (request: Request): void => {
    inflight.add(request);
    lastNetwork = Date.now();
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) state.loaded = true;
  };
  const onDone = (request: Request): void => {
    inflight.delete(request);
    lastNetwork = Date.now();
  };
  const structure = async (): Promise<unknown> =>
    await withDeadline(page, page.evaluate(pageTask, task({ kind: 'structure', args: WALK_LIMITS }))).catch(() => null);
  const before = await structure();
  page.on('request', onRequest);
  page.on('requestfinished', onDone);
  page.on('requestfailed', onDone);
  try {
    await action();
    const deadline = Date.now() + QUIET_LIMITS.maxMs;
    let changed = false;
    while (Date.now() < deadline && !page.isClosed()) {
      const maxMs = Math.max(QUIET_LIMITS.quietMs, deadline - Date.now());
      const result: unknown = await withDeadline(page, page.evaluate(waitForQuietDom, { ...WALK_LIMITS, quietMs: QUIET_LIMITS.quietMs, maxMs }), maxMs + 5000).catch(() => null);
      if (typeof result !== 'object' || result === null) break;
      if ((result as { changed?: unknown }).changed === true) changed = true;
      if (inflight.size === 0 && Date.now() - lastNetwork >= QUIET_LIMITS.quietMs) break;
      while (inflight.size > 0 && Date.now() < deadline && !page.isClosed()) await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
    // Changes made by the action itself happen before the observer is in place,
    // so the structure before and after is compared as well.
    if (!changed && !state.loaded && !page.isClosed()) {
      const after = await structure();
      changed = typeof before === 'string' && typeof after === 'string' && before !== after;
    }
    return { changed, loaded: state.loaded };
  } finally {
    page.off('request', onRequest);
    page.off('requestfinished', onDone);
    page.off('requestfailed', onDone);
  }
}

/**
 * Client-side navigation: push `url` onto the page's history and announce it
 * with a popstate event, as the browser does on Back and Forward. Routers that
 * follow the history API render the route without loading a document. The
 * caller checks the result; nothing is fetched by this call itself, and the
 * browser refuses a URL from another origin.
 */
export async function pushClientRoute(page: Page, url: string): Promise<void> {
  await withDeadline(
    page,
    page.evaluate((target: string) => {
      history.pushState(null, '', target);
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    }, url),
  );
}

/** Visible label of an element: value for inputs, else text, else aria-label or title. Reads open shadow roots and slots. */
export async function labelOfSelector(page: Page, selector: string): Promise<{ found: boolean; label: string }> {
  const locator = page.locator(selector).first();
  const count = await page.locator(selector).count().catch(() => 0);
  if (count === 0) return { found: false, label: '' };
  const visible = await locator.isVisible().catch(() => false);
  if (!visible) return { found: false, label: '' };
  const label: unknown = await locator.evaluate(elementText, 'label', { timeout: 5000 }).catch(() => '');
  return { found: true, label: typeof label === 'string' ? label.slice(0, 300) : '' };
}

/** Text of the first element matching the selector (capped), or null. Reads open shadow roots and slots. */
export async function textOfSelector(page: Page, selector: string): Promise<string | null> {
  const locator = page.locator(selector).first();
  if ((await page.locator(selector).count().catch(() => 0)) === 0) return null;
  const text: unknown = await locator.evaluate(elementText, 'text', { timeout: 3000 }).catch(() => null);
  return typeof text === 'string' ? text.slice(0, 300) : null;
}

/** Screenshot limits. */
export const SCREENSHOT_LIMITS = Object.freeze({ maxWidth: 1200, maxHeight: 800, padding: 4, quality: 70 });

/**
 * Save a cropped JPEG screenshot of an element. Returns false when the element
 * has no box. The file name is generated by the caller and validated.
 */
export async function screenshotElement(page: Page, selector: string, dir: string, fileName: string): Promise<boolean> {
  // Evidence selectors come from the page; only plain CSS selectors are used.
  if (!isPlainCssSelector(selector)) return false;
  const locator = page.locator(selector).first();
  await locator.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => undefined);
  // Small toggles (a checkbox) are shown with their label or parent for context.
  const box = await locator
    .evaluate((el: Element) => {
      let own = el.getBoundingClientRect();
      // For text, crop to the text itself rather than the full-width block.
      const control = el instanceof HTMLInputElement || el instanceof HTMLButtonElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
      if (!control && el.textContent.trim() !== '') {
        const range = document.createRange();
        range.selectNodeContents(el);
        const text = range.getBoundingClientRect();
        if (text.width > 0 && text.height > 0) own = text;
      }
      const toggle = el instanceof HTMLInputElement || el.getAttribute('role') === 'switch' || el.getAttribute('role') === 'checkbox';
      if (!toggle || own.width * own.height >= 2000) return { x: own.x, y: own.y, width: own.width, height: own.height };
      const root = el.getRootNode();
      const scope: Document | ShadowRoot = root.nodeType === 11 ? (root as ShadowRoot) : document;
      const context = el.closest('label') ?? (el.id !== '' ? scope.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null) ?? el.parentElement;
      const rects = [own, ...(context === null ? [] : [context.getBoundingClientRect()])].filter((r) => r.width > 0 && r.height > 0);
      if (rects.length === 0) return null;
      const x = Math.min(...rects.map((r) => r.x));
      const y = Math.min(...rects.map((r) => r.y));
      const right = Math.max(...rects.map((r) => r.x + r.width));
      const bottom = Math.max(...rects.map((r) => r.y + r.height));
      return { x, y, width: right - x, height: bottom - y };
    }, undefined, { timeout: 2000 })
    .catch(() => null);
  if (box === null || box.width < 1 || box.height < 1) return false;
  const vp = page.viewportSize() ?? { width: 1280, height: 800 };
  const L = SCREENSHOT_LIMITS;
  // Viewport coordinates, clamped to the viewport and to the size caps.
  const x = Math.max(0, box.x - L.padding);
  const y = Math.max(0, box.y - L.padding);
  const width = Math.min(box.x + box.width + L.padding, vp.width) - x;
  const height = Math.min(box.y + box.height + L.padding, vp.height) - y;
  if (width < 1 || height < 1) return false;
  const clip = { x, y, width: Math.min(width, L.maxWidth), height: Math.min(height, L.maxHeight) };
  const buffer = await page.screenshot({ clip, type: 'jpeg', quality: L.quality, animations: 'disabled', timeout: 5000 }).catch(() => null);
  if (buffer === null) return false;
  await safeWriteFile(dir, fileName, buffer);
  return true;
}
