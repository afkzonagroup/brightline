// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Countdown timers that restart.
 *
 * Method: load the page, read every countdown twice to confirm it ticks down,
 * wait, then read it again after a reload in the same browser context and
 * after a load in a fresh context. A genuine deadline keeps counting down; a
 * timer that shows more time than expected has restarted.
 *
 * Legal mapping: UCPD Annex I point 7 (falsely stating that a product or terms
 * are available only for a very limited time) and Art. 6(1).
 */

import type { DraftFinding } from '../types.js';
import { clip } from '../util/text.js';

/** One timed reading. `atMs` is a monotonic timestamp in milliseconds. */
export interface TimedReading {
  readonly seconds: number;
  readonly atMs: number;
}

/** All readings for one timer element. */
export interface CountdownObservation {
  readonly selector: string;
  readonly text: string;
  readonly first: TimedReading;
  readonly tick: TimedReading;
  readonly reload?: TimedReading | undefined;
  readonly fresh?: TimedReading | undefined;
}

/** Seconds of slack for load time and rounding. */
export const COUNTDOWN_TOLERANCE_SECONDS = 4;

const UNIT_SECONDS: Readonly<Record<string, number>> = {
  d: 86_400,
  day: 86_400,
  days: 86_400,
  h: 3600,
  hr: 3600,
  hrs: 3600,
  hour: 3600,
  hours: 3600,
  m: 60,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  s: 1,
  sec: 1,
  secs: 1,
  second: 1,
  seconds: 1,
};

/**
 * Parse the remaining time shown by a countdown, in seconds.
 * Accepts "hh:mm:ss", "mm:ss", "2d 03:14:05" and unit forms such as
 * "1 day 2 hours 3 minutes 4 seconds" or "14m 05s". Returns null if no time.
 *
 * @example
 * ```ts
 * parseTimerSeconds('Offer ends in 00:14:59'); // 899
 * ```
 */
export function parseTimerSeconds(text: string): number | null {
  const t = text.toLowerCase();
  const clock = /(\d{1,3})\s?:\s?(\d{2})(?:\s?:\s?(\d{2}))?/.exec(t);
  if (clock !== null) {
    const a = Number(clock[1]);
    const b = Number(clock[2]);
    const c = clock[3] === undefined ? null : Number(clock[3]);
    if (b > 59 || (c !== null && c > 59)) return null;
    let seconds = c === null ? a * 60 + b : a * 3600 + b * 60 + c;
    const days = /(\d{1,3})\s?(?:d|days?)\b/.exec(t.slice(0, clock.index));
    if (days !== null) seconds += Number(days[1]) * 86_400;
    return seconds;
  }
  const unitRe = /(\d{1,4})\s?(days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/g;
  let total = 0;
  let found = 0;
  for (const match of t.matchAll(unitRe)) {
    const unit = UNIT_SECONDS[match[2] ?? ''];
    if (unit === undefined) continue;
    total += Number(match[1]) * unit;
    found += 1;
  }
  return found >= 2 ? total : null;
}

/**
 * True if two readings show a timer counting down in real time
 * (allows for one second of rounding either way).
 */
export function isTickingDown(a: TimedReading, b: TimedReading): boolean {
  const elapsed = (b.atMs - a.atMs) / 1000;
  const dropped = a.seconds - b.seconds;
  return elapsed > 0 && dropped >= 1 && dropped <= elapsed + 1.5;
}

/** Seconds a later reading shows above what a real deadline would show. */
export function excessSeconds(first: TimedReading, later: TimedReading): number {
  const expected = first.seconds - (later.atMs - first.atMs) / 1000;
  return later.seconds - expected;
}

/**
 * Analyse countdown observations. Pure.
 */
export function detectCountdownReset(observations: readonly CountdownObservation[]): DraftFinding[] {
  const findings: DraftFinding[] = [];
  for (const o of observations) {
    if (!isTickingDown(o.first, o.tick)) continue;
    const reloadExcess = o.reload === undefined ? null : excessSeconds(o.first, o.reload);
    const freshExcess = o.fresh === undefined ? null : excessSeconds(o.first, o.fresh);
    const reloadReset = reloadExcess !== null && reloadExcess > COUNTDOWN_TOLERANCE_SECONDS;
    const freshReset = freshExcess !== null && freshExcess > COUNTDOWN_TOLERANCE_SECONDS;
    if (!reloadReset && !freshReset) continue;
    const details: Record<string, string | number | boolean> = {
      firstSeconds: o.first.seconds,
      restartedOnReload: reloadReset,
      restartedInFreshSession: freshReset,
    };
    if (o.reload !== undefined) {
      details.reloadSeconds = o.reload.seconds;
      details.reloadAfterSeconds = Math.round((o.reload.atMs - o.first.atMs) / 1000);
    }
    if (o.fresh !== undefined) {
      details.freshSessionSeconds = o.fresh.seconds;
      details.freshAfterSeconds = Math.round((o.fresh.atMs - o.first.atMs) / 1000);
    }
    const where = reloadReset && freshReset ? 'after a reload and in a new session' : reloadReset ? 'after a reload' : 'in a new browser session';
    findings.push({
      detector: 'countdown-reset',
      title: 'Countdown timer restarts',
      // A restart only in a new session is also what a genuine per-visitor hold
      // (cart or seat reservation) does, so it is weak evidence on its own.
      confidence: reloadReset ? 'high' : 'low',
      provisions: ['ucpd-annex-i-7', 'ucpd-art-6-1'],
      explanation:
        `The countdown showed more time ${where} than a fixed deadline would allow. ` +
        'If the offer is not really limited to this time, this is a possible issue under UCPD Annex I point 7. ' +
        (reloadReset
          ? 'Verify whether the deadline is real.'
          : 'Some timers are legitimately per visitor (for example a seat hold); verify what the timer represents.'),
      evidence: { selector: o.selector, text: clip(o.text, 120), details },
    });
  }
  return findings;
}
