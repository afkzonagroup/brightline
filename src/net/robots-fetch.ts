// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import { guardedFetch, type ByteBudget, type FetchLimits } from './fetcher.js';
import type { NetworkPolicy } from './guard.js';
import { ALLOW_ALL, parseRobots, type RobotsRules } from './robots.js';

/** Product token used for robots.txt matching. */
export const ROBOTS_TOKEN = 'Brightline';

/**
 * Fetch and parse robots.txt for an origin through the SSRF guard. Every
 * redirect hop is checked again. Per RFC 9309: a 4xx or unreadable file
 * allows everything (2.3.1.3); a 5xx disallows everything (2.3.1.4).
 */
export async function fetchRobots(origin: string, policy: NetworkPolicy, limits: FetchLimits, budget: ByteBudget, maxRedirects: number): Promise<RobotsRules> {
  let url = new URL('/robots.txt', origin).href;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    let res;
    try {
      res = await guardedFetch(
        { url, method: 'GET', headers: { 'user-agent': `${ROBOTS_TOKEN}/robots`, accept: 'text/plain' } },
        policy,
        { maxResponseBytes: Math.min(limits.maxResponseBytes, 512 * 1024), requestTimeoutMs: limits.requestTimeoutMs },
        budget,
      );
    } catch {
      return ALLOW_ALL;
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.location;
      if (location === undefined) return ALLOW_ALL;
      url = new URL(location, url).href;
      continue;
    }
    if (res.status >= 500) return { isAllowed: () => false };
    if (res.status !== 200) return ALLOW_ALL;
    return parseRobots(res.body.toString('utf8'), ROBOTS_TOKEN);
  }
  return ALLOW_ALL;
}
