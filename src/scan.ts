// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The scanner: same-origin crawl from a start URL, countdown re-load checks,
 * optional scripted journey, then a report. All network traffic passes the
 * SSRF guard.
 */

import type { Page } from 'playwright-core';
import { BrowserSession } from './browser/session.js';
import { labelOfSelector, readTimers, screenshotElement, snapshotPage, textOfSelector, collectLinks } from './browser/page-ops.js';
import type { PageSnapshot, TimerReading } from './browser/snapshot.js';
import { MONEY_SOURCE } from './data/phrases.js';
import { DETECTOR_IDS, runPageDetectors } from './detectors/index.js';
import { detectCountdownReset, isTickingDown, type CountdownObservation } from './detectors/countdown.js';
import { detectHiddenCosts, parseAmount, type TotalCheckpoint } from './detectors/hidden-costs.js';
import { detectOrderButton, type OrderButtonObservation } from './detectors/order-button.js';
import type { Journey } from './journey/schema.js';
import { ByteBudget, type FetchLimits } from './net/fetcher.js';
import { checkUrlSyntax, resolveAndCheck, systemResolver, type NetworkPolicy, type Resolver } from './net/guard.js';
import { fetchRobots } from './net/robots-fetch.js';
import { ALLOW_ALL, type RobotsRules } from './net/robots.js';
import {
  DISCLAIMER,
  REPORT_SCHEMA_VERSION,
  TOOL_VERSION,
  referencedProvisions,
  sortFindings,
  summarize,
  type JourneyResult,
  type PageResult,
  type ReportLimits,
  type ScanReport,
} from './report/types.js';
import type { DetectorId, DraftFinding, Finding } from './types.js';
import { ensureDir, ensureSubdir } from './util/files.js';

/** Options for {@link scan}. */
export interface ScanOptions {
  /** Start URL (http or https). */
  readonly url: string;
  /** Optional validated journey (see `validateJourney`). */
  readonly journey?: Journey;
  /** Pages to crawl, including the start page. Default 10, 1 to 200. 0 skips the crawl (journey only). */
  readonly maxPages?: number;
  /** Whole-scan time budget in ms. Default 180 000, max 1 800 000. */
  readonly maxDurationMs?: number;
  /** Time limit for one navigation or request in ms. Default 30 000. */
  readonly navigationTimeoutMs?: number;
  /** Maximum size of one response in bytes. Default 10 MiB. */
  readonly maxResponseBytes?: number;
  /** Maximum bytes transferred by the whole scan (responses and request bodies). Default 200 MiB. */
  readonly maxTotalBytes?: number;
  /** Maximum redirects accepted for a navigation. Default 5. */
  readonly maxRedirects?: number;
  /** Respect robots.txt for crawled pages. Default true. */
  readonly respectRobotsTxt?: boolean;
  /** Exact IPs in blocked ranges that may still be scanned (your own staging server). Metadata IPs never. */
  readonly allowAddresses?: readonly string[];
  /** Detectors to run. Default all. */
  readonly detectors?: readonly DetectorId[];
  /** Directory for screenshots. When omitted, no screenshots are taken. */
  readonly outputDir?: string;
  /** Run Chromium with its OS sandbox. Default true. */
  readonly chromiumSandbox?: boolean;
  /** Viewport. Default 1280 x 800. */
  readonly viewport?: { readonly width: number; readonly height: number };
  /** Browser locale. Default en-GB. */
  readonly locale?: string;
  /** DNS resolver override (tests, split-horizon DNS). */
  readonly resolver?: Resolver;
  /** Wait between the first countdown reading and the reload, in ms. Default 7000. */
  readonly countdownWaitMs?: number;
  /** Maximum pages that get the countdown reload check. Default 3. */
  readonly maxCountdownPages?: number;
  /** Progress callback (one line per event). */
  readonly onProgress?: (message: string) => void;
}

const clampInt = (value: number | undefined, fallback: number, min: number, max: number): number => {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
};

/** Normalised limits. Exported for tests. */
export function normaliseLimits(options: ScanOptions): ReportLimits {
  return {
    maxPages: clampInt(options.maxPages, 10, 0, 200),
    maxDurationMs: clampInt(options.maxDurationMs, 180_000, 5_000, 1_800_000),
    navigationTimeoutMs: clampInt(options.navigationTimeoutMs, 30_000, 1_000, 120_000),
    maxResponseBytes: clampInt(options.maxResponseBytes, 10 * 1024 * 1024, 64 * 1024, 100 * 1024 * 1024),
    maxTotalBytes: clampInt(options.maxTotalBytes, 200 * 1024 * 1024, 1024 * 1024, 2 * 1024 * 1024 * 1024),
    maxRedirects: clampInt(options.maxRedirects, 5, 0, 20),
    respectRobotsTxt: options.respectRobotsTxt ?? true,
  };
}

const ASSET_EXTENSION = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|pdf|zip|gz|tgz|rar|7z|mp[34]|webm|mov|avi|wav|ogg|woff2?|ttf|otf|eot|css|js|mjs|json|xml|rss|txt|csv|xlsx?|docx?|pptx?|dmg|exe|apk)$/i;

/** Canonical form for crawl de-duplication: no hash, default port dropped by URL. Pure. */
export function crawlKey(url: URL): string {
  const u = new URL(url.href);
  u.hash = '';
  return u.href;
}

/** True if a link should be crawled from `origin`. Pure. */
export function isCrawlable(link: string, origin: string): URL | null {
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    return null;
  }
  if (u.origin !== origin) return null;
  if (u.username !== '' || u.password !== '') return null;
  if (ASSET_EXTENSION.test(u.pathname)) return null;
  if (u.href.length > 2048) return null;
  return u;
}

const sleep = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
};

/** Scan state shared across steps. */
interface State {
  readonly limits: ReportLimits;
  readonly deadline: number;
  readonly enabled: ReadonlySet<DetectorId>;
  readonly outputDir: string | undefined;
  readonly findings: Finding[];
  readonly pages: PageResult[];
  readonly notes: string[];
  readonly progress: (m: string) => void;
  nextId: number;
  screenshots: number;
}

const timeLeft = (s: State): number => s.deadline - Date.now();

/** Caps that keep a hostile page from flooding the report. */
export const FINDING_LIMITS = Object.freeze({ perCall: 50, total: 1000, screenshots: 200 });

async function addFindings(state: State, page: Page | null, pageUrl: string, drafts: readonly DraftFinding[]): Promise<void> {
  if (drafts.length > FINDING_LIMITS.perCall) state.notes.push(`More than ${String(FINDING_LIMITS.perCall)} findings on ${pageUrl}; only the first ${String(FINDING_LIMITS.perCall)} are listed.`);
  for (const draft of drafts.slice(0, FINDING_LIMITS.perCall)) {
    if (state.findings.length >= FINDING_LIMITS.total) {
      state.notes.push(`Finding limit of ${String(FINDING_LIMITS.total)} reached; later findings are not listed.`);
      return;
    }
    const id = `F${String(state.nextId).padStart(4, '0')}`;
    state.nextId += 1;
    let screenshot: string | undefined;
    if (page !== null && state.outputDir !== undefined && draft.evidence.selector !== '' && state.screenshots < FINDING_LIMITS.screenshots && timeLeft(state) > 2000) {
      state.screenshots += 1;
      const ok = await screenshotElement(page, draft.evidence.selector, state.outputDir, `${id}.jpg`).catch(() => false);
      if (ok) screenshot = `screenshots/${id}.jpg`;
    }
    state.findings.push({
      ...draft,
      id,
      pageUrl,
      evidence: { ...draft.evidence, ...(screenshot === undefined ? {} : { screenshot }) },
    });
  }
}

async function settle(page: Page, timeoutMs: number): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: Math.min(3000, timeoutMs) }).catch(() => undefined);
}

function redirectCount(response: Awaited<ReturnType<Page['goto']>>): number {
  let hops = 0;
  for (let r = response?.request().redirectedFrom() ?? null; r !== null; r = r.redirectedFrom()) hops += 1;
  return hops;
}

/** Navigate and check the result. Returns an error text, or null when the page is usable HTML. */
async function navigate(page: Page, url: string, state: State): Promise<{ error: string | null; httpStatus?: number; notHtml?: boolean }> {
  try {
    const response = await page.goto(url, { waitUntil: 'load', timeout: Math.max(1000, Math.min(state.limits.navigationTimeoutMs, timeLeft(state))) });
    if (response === null) return { error: 'No response' };
    if (redirectCount(response) > state.limits.maxRedirects) return { error: 'Too many redirects', httpStatus: response.status() };
    if (response.status() >= 400) return { error: `HTTP ${String(response.status())}`, httpStatus: response.status() };
    const type = (await response.headerValue('content-type')) ?? '';
    if (!/text\/html|application\/xhtml\+xml/i.test(type)) return { error: null, httpStatus: response.status(), notHtml: true };
    await settle(page, state.limits.navigationTimeoutMs);
    return { error: null, httpStatus: response.status() };
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] ?? 'Navigation failed' : 'Navigation failed';
    return { error: message.slice(0, 200) };
  }
}

async function countdownCheck(session: BrowserSession, page: Page, url: string, first: readonly TimerReading[], firstAt: number, state: State, waitMs: number): Promise<CountdownObservation[]> {
  await sleep(1500);
  const tickAt = Date.now();
  const tick = await readTimers(page).catch(() => [] as TimerReading[]);
  const ticking = first
    .map((f) => ({ f, t: tick.find((t) => t.selector === f.selector) }))
    .filter((x): x is { f: TimerReading; t: TimerReading } => x.t !== undefined && isTickingDown({ seconds: x.f.seconds, atMs: firstAt }, { seconds: x.t.seconds, atMs: tickAt }));
  if (ticking.length === 0) return [];
  state.progress(`countdown: ${String(ticking.length)} ticking timer(s) on ${url}, checking for restarts`);
  const remaining = waitMs - (Date.now() - firstAt);
  if (remaining > 0) await sleep(remaining);

  let reload: TimerReading[] = [];
  let reloadAt = 0;
  try {
    await page.reload({ waitUntil: 'load', timeout: state.limits.navigationTimeoutMs });
    reloadAt = Date.now();
    reload = await readTimers(page);
  } catch {
    reload = [];
  }

  let fresh: TimerReading[] = [];
  let freshAt = 0;
  const freshContext = await session.newContext();
  try {
    const freshPage = await freshContext.newPage();
    const nav = await navigate(freshPage, url, state);
    if (nav.error === null) {
      freshAt = Date.now();
      fresh = await readTimers(freshPage);
    }
  } finally {
    await freshContext.close().catch(() => undefined);
  }

  const pick = (list: readonly TimerReading[], selector: string, index: number): TimerReading | undefined =>
    list.find((r) => r.selector === selector) ?? (list.length === first.length ? list[index] : undefined);
  return ticking.map(({ f }) => {
    const index = first.indexOf(f);
    const r = pick(reload, f.selector, index);
    const fr = pick(fresh, f.selector, index);
    return {
      selector: f.selector,
      text: f.text,
      first: { seconds: f.seconds, atMs: firstAt },
      tick: { seconds: tick.find((t) => t.selector === f.selector)?.seconds ?? f.seconds, atMs: tickAt },
      reload: r === undefined ? undefined : { seconds: r.seconds, atMs: reloadAt },
      fresh: fr === undefined ? undefined : { seconds: fr.seconds, atMs: freshAt },
    };
  });
}

async function crawl(session: BrowserSession, start: URL, robots: RobotsRules, state: State, options: ScanOptions): Promise<void> {
  if (state.limits.maxPages === 0) return;
  const origin = start.origin;
  const queue: URL[] = [start];
  const seen = new Set<string>([crawlKey(start)]);
  const context = await session.newContext();
  let countdownPages = 0;
  const maxCountdownPages = clampInt(options.maxCountdownPages, 3, 0, 20);
  const waitMs = clampInt(options.countdownWaitMs, 7000, 3000, 60_000);
  try {
    while (queue.length > 0 && state.pages.length < state.limits.maxPages) {
      if (timeLeft(state) < 3000) {
        state.notes.push('Time budget reached; crawl stopped early.');
        break;
      }
      const url = queue.shift();
      if (url === undefined) break;
      const pathWithQuery = `${url.pathname}${url.search}`;
      if (!robots.isAllowed(pathWithQuery)) {
        state.pages.push({ url: url.href, status: 'skipped-robots' });
        continue;
      }
      state.progress(`page ${String(state.pages.length + 1)}: ${url.href}`);
      const page = await context.newPage();
      try {
        const nav = await navigate(page, url.href, state);
        if (nav.error !== null) {
          state.pages.push({ url: url.href, status: 'error', error: nav.error, ...(nav.httpStatus === undefined ? {} : { httpStatus: nav.httpStatus }) });
          continue;
        }
        if (nav.notHtml === true) {
          state.pages.push({ url: url.href, status: 'not-html', ...(nav.httpStatus === undefined ? {} : { httpStatus: nav.httpStatus }) });
          continue;
        }
        const finalUrl = page.url();
        const firstAt = Date.now();
        const timers = state.enabled.has('countdown-reset') ? await readTimers(page).catch(() => [] as TimerReading[]) : [];
        const snapshot = await snapshotPage(page);
        if (snapshot.truncated) state.notes.push(`Collection caps reached on ${finalUrl}; some elements were not checked.`);
        await addFindings(state, page, finalUrl, runPageDetectors(snapshot, state.enabled));
        state.pages.push({ url: url.href, status: 'scanned', ...(nav.httpStatus === undefined ? {} : { httpStatus: nav.httpStatus }) });

        if (timers.length > 0 && countdownPages < maxCountdownPages && timeLeft(state) > waitMs + 2 * state.limits.navigationTimeoutMs) {
          countdownPages += 1;
          const observations = await countdownCheck(session, page, url.href, timers, firstAt, state, waitMs);
          await addFindings(state, page, finalUrl, detectCountdownReset(observations));
        }

        for (const link of await collectLinks(page).catch(() => [] as string[])) {
          const next = isCrawlable(link, origin);
          if (next === null) continue;
          const key = crawlKey(next);
          if (seen.has(key) || seen.size > 5000) continue;
          seen.add(key);
          queue.push(new URL(key));
        }
      } catch (pageError) {
        // A page that navigates away or crashes during analysis must not stop the scan.
        const message = pageError instanceof Error ? (pageError.message.split('\n')[0] ?? '') : 'Analysis failed';
        const existing = state.pages.findIndex((p) => p.url === url.href);
        const entry: PageResult = { url: url.href, status: 'error', error: `Analysis failed: ${message.slice(0, 160)}` };
        if (existing === -1) state.pages.push(entry);
        else state.pages[existing] = entry;
      } finally {
        await page.close().catch(() => undefined);
        // Pages the scanned page opened (pop-ups, including noopener ones) do not outlive it.
        for (const other of context.pages()) await other.close().catch(() => undefined);
      }
    }
  } finally {
    await context.close().catch(() => undefined);
  }
}

const MONEY_TEXT = new RegExp(MONEY_SOURCE, 'iu');

/** Amounts of money in short text blocks of a snapshot (capped). Pure. */
export function amountsIn(snapshot: Pick<PageSnapshot, 'textBlocks'>, max = 200): number[] {
  const out: number[] = [];
  for (const block of snapshot.textBlocks) {
    if (out.length >= max) break;
    if (block.text.length > 120 || !MONEY_TEXT.test(block.text)) continue;
    const value = parseAmount(block.text);
    if (value !== null && value > 0) out.push(value);
  }
  return out;
}

async function runJourney(session: BrowserSession, journey: Journey, state: State): Promise<JourneyResult> {
  const context = await session.newContext();
  const marks: string[] = [];
  const checkpoints: TotalCheckpoint[] = [];
  const buttons: OrderButtonObservation[] = [];
  let actions: string[] = [];
  let stepsRun = 0;
  let error: string | undefined;
  const timeout = (): number => Math.max(1000, Math.min(state.limits.navigationTimeoutMs, timeLeft(state)));
  try {
    const page = await context.newPage();
    state.progress(`journey "${journey.name}": ${journey.startUrl}`);
    const nav = await navigate(page, journey.startUrl, state);
    if (nav.error !== null) throw new Error(`Start URL: ${nav.error}`);
    for (const [i, step] of journey.steps.entries()) {
      if (timeLeft(state) < 2000) throw new Error('Time budget reached');
      const where = `step ${String(i + 1)} (${step.action})`;
      try {
        switch (step.action) {
          case 'goto': {
            const r = await navigate(page, step.url, state);
            if (r.error !== null) throw new Error(r.error);
            break;
          }
          case 'click':
            await page.locator(step.selector).first().click({ timeout: timeout() });
            await settle(page, state.limits.navigationTimeoutMs);
            break;
          case 'fill':
            await page.locator(step.selector).first().fill(step.value, { timeout: timeout() });
            break;
          case 'select':
            await page.locator(step.selector).first().selectOption(step.value, { timeout: timeout() });
            break;
          case 'check':
            await page.locator(step.selector).first().check({ timeout: timeout() });
            break;
          case 'uncheck':
            await page.locator(step.selector).first().uncheck({ timeout: timeout() });
            break;
          case 'waitFor':
            await page.locator(step.selector).first().waitFor({ state: 'visible', timeout: timeout() });
            break;
          case 'mark': {
            const pageUrl = page.url();
            const snapshot = await snapshotPage(page);
            await addFindings(state, page, pageUrl, runPageDetectors(snapshot, state.enabled));
            if (step.total !== undefined) {
              const text = await textOfSelector(page, step.total);
              checkpoints.push({
                markName: step.name,
                selector: step.total,
                totalText: text ?? '',
                total: text === null ? null : parseAmount(text),
                actionsSincePrevious: actions,
                expectTotalChange: step.expectTotalChange ?? false,
                amountsShown: amountsIn(snapshot),
              });
              if (text === null) state.notes.push(`Journey mark "${step.name}": total element not found.`);
            }
            if (step.orderButton !== undefined) {
              const label = await labelOfSelector(page, step.orderButton);
              buttons.push({ markName: step.name, selector: step.orderButton, label: label.label, found: label.found });
            }
            marks.push(step.name);
            actions = [];
            break;
          }
        }
        if (step.action !== 'mark') actions.push(step.action);
        stepsRun += 1;
      } catch (stepError) {
        const msg = stepError instanceof Error ? (stepError.message.split('\n')[0] ?? '') : '';
        throw new Error(`${where}: ${msg.slice(0, 200)}`, { cause: stepError });
      }
    }
    const journeyDrafts: DraftFinding[] = [];
    if (state.enabled.has('order-button-label')) journeyDrafts.push(...detectOrderButton(buttons));
    if (state.enabled.has('hidden-costs')) journeyDrafts.push(...detectHiddenCosts(checkpoints));
    await addFindings(state, page, page.url(), journeyDrafts);
  } catch (journeyError) {
    error = journeyError instanceof Error ? journeyError.message.slice(0, 300) : 'Journey failed';
  } finally {
    await context.close().catch(() => undefined);
  }
  return { name: journey.name, completed: error === undefined, stepsRun, marks, ...(error === undefined ? {} : { error }) };
}

/**
 * A clear message for a Chromium launch failure, or null to keep the original.
 * The sandbox case comes first: it must never be "solved" silently by turning
 * the sandbox off. Pure.
 */
export function launchErrorMessage(message: string): string | null {
  if (/no usable sandbox|sandbox_host_linux|setuid sandbox|namespace|zygote/i.test(message)) {
    return (
      'Chromium could not start its OS sandbox. Brightline keeps the sandbox on because it renders untrusted pages. ' +
      'On Linux, allow unprivileged user namespaces (Ubuntu 23.10 and later restrict them through AppArmor), ' +
      'or run Brightline inside a container and pass --no-sandbox (or BRIGHTLINE_NO_SANDBOX=1) so the container is the boundary.'
    );
  }
  if (/Executable doesn't exist|browserType\.launch/i.test(message)) {
    return 'Could not start Chromium. Install it with: npx playwright-core install chromium-headless-shell';
  }
  return null;
}

async function startSession(options: Parameters<typeof BrowserSession.start>[0]): Promise<BrowserSession> {
  try {
    return await BrowserSession.start(options);
  } catch (error) {
    const friendly = launchErrorMessage(error instanceof Error ? error.message : '');
    if (friendly !== null) throw new Error(friendly, { cause: error });
    throw error;
  }
}

/**
 * Scan a website and return a report.
 *
 * @example
 * ```ts
 * import { scan } from '@afkzona/brightline';
 * const report = await scan({ url: 'https://shop.example', maxPages: 5, outputDir: './brightline-report' });
 * console.log(report.summary);
 * ```
 */
export async function scan(options: ScanOptions): Promise<ScanReport> {
  const startedAt = new Date().toISOString();
  const limits = normaliseLimits(options);
  const start = checkUrlSyntax(options.url);
  const policy: NetworkPolicy = { allowAddresses: [...(options.allowAddresses ?? [])], resolver: options.resolver ?? systemResolver };
  const fetchLimits: FetchLimits = { maxResponseBytes: limits.maxResponseBytes, requestTimeoutMs: limits.navigationTimeoutMs };
  const budget = new ByteBudget(limits.maxTotalBytes);
  // Refuse a blocked start URL (or journey start URL) before launching anything.
  await resolveAndCheck(start, policy);
  if (options.journey !== undefined) await resolveAndCheck(options.journey.startUrl, policy);
  const enabledList = options.detectors ?? DETECTOR_IDS;
  let outputDir: string | undefined;
  if (options.outputDir !== undefined) {
    outputDir = await ensureSubdir(await ensureDir(options.outputDir), 'screenshots');
  }
  const state: State = {
    limits,
    deadline: Date.now() + limits.maxDurationMs,
    enabled: new Set(enabledList),
    outputDir,
    findings: [],
    pages: [],
    notes: [],
    progress: options.onProgress ?? (() => undefined),
    nextId: 1,
    screenshots: 0,
  };

  const robots = limits.respectRobotsTxt && limits.maxPages > 0 ? await fetchRobots(start.origin, policy, fetchLimits, budget, limits.maxRedirects) : ALLOW_ALL;
  const session = await startSession({
    policy,
    limits: fetchLimits,
    budget,
    maxRedirects: limits.maxRedirects,
    viewport: options.viewport ?? { width: 1280, height: 800 },
    locale: options.locale ?? 'en-GB',
    chromiumSandbox: options.chromiumSandbox ?? true,
  });
  let journey: JourneyResult | undefined;
  try {
    await crawl(session, start, robots, state, options);
    if (options.journey !== undefined) journey = await runJourney(session, options.journey, state);
  } finally {
    await session.close();
  }
  const blocked = session.blocked;
  if (blocked.length > 0) state.notes.push(`${String(blocked.length)} request(s) were refused by the network guard (see blockedRequests).`);
  const journeyDetectorsOn = state.enabled.has('order-button-label') || state.enabled.has('hidden-costs');
  if (journeyDetectorsOn && options.journey === undefined) {
    state.notes.push('No journey was given, so the order-button and hidden-cost checks did not run.');
  }

  const findings = sortFindings(state.findings);
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    tool: { name: 'brightline', version: TOOL_VERSION },
    startedAt,
    finishedAt: new Date().toISOString(),
    startUrl: start.href,
    pages: state.pages,
    ...(journey === undefined ? {} : { journey }),
    findings,
    summary: summarize(findings),
    provisions: referencedProvisions(findings),
    blockedRequests: blocked,
    limits,
    notes: state.notes,
    disclaimer: DISCLAIMER,
  };
}
