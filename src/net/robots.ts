// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Minimal robots.txt parser (RFC 9309): groups by user-agent, Allow/Disallow
 * with `*` and `$`, longest match wins, Allow wins ties.
 */

interface Rule {
  readonly allow: boolean;
  readonly pattern: string;
}

/** Parsed rules for one product token. */
export interface RobotsRules {
  /** True if the path (with query) may be fetched. */
  isAllowed(pathWithQuery: string): boolean;
}

const MAX_ROBOTS_BYTES = 500 * 1024;
const MAX_RULES = 5000;

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const pieces = body.split('*');
  let pos = 0;
  for (let i = 0; i < pieces.length; i += 1) {
    const piece = pieces[i] ?? '';
    if (i === 0) {
      if (!path.startsWith(piece)) return false;
      pos = piece.length;
      continue;
    }
    const found = path.indexOf(piece, pos);
    if (found === -1) return false;
    pos = found + piece.length;
  }
  if (!anchored) return true;
  if (pieces.length === 1) return path === body;
  const lastPiece = pieces[pieces.length - 1] ?? '';
  return path.endsWith(lastPiece) && pos <= path.length;
}

/**
 * Parse robots.txt for a user-agent product token (for example "Brightline").
 *
 * @example
 * ```ts
 * parseRobots('User-agent: *\nDisallow: /private', 'Brightline').isAllowed('/private/x'); // false
 * ```
 */
export function parseRobots(text: string, productToken: string): RobotsRules {
  const token = productToken.toLowerCase();
  const source = text.length > MAX_ROBOTS_BYTES ? text.slice(0, MAX_ROBOTS_BYTES) : text;
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  let ruleCount = 0;
  for (const rawLine of source.split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (line === '') continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      if (current === null || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && current !== null) {
      lastWasAgent = false;
      if (ruleCount >= MAX_RULES) continue;
      if (value === '') continue;
      current.rules.push({ allow: key === 'allow', pattern: value });
      ruleCount += 1;
    } else {
      lastWasAgent = false;
    }
  }
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && token.startsWith(a)));
  const chosen = specific.length > 0 ? specific : groups.filter((g) => g.agents.includes('*'));
  const rules = chosen.flatMap((g) => g.rules);
  return {
    isAllowed(pathWithQuery: string): boolean {
      let best: Rule | null = null;
      for (const rule of rules) {
        if (!matches(rule.pattern, pathWithQuery)) continue;
        if (
          best === null ||
          rule.pattern.length > best.pattern.length ||
          (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
        ) {
          best = rule;
        }
      }
      return best === null || best.allow || pathWithQuery === '/robots.txt';
    },
  };
}

/** Rules that allow everything (used when robots.txt is missing or ignored). */
export const ALLOW_ALL: RobotsRules = Object.freeze({ isAllowed: () => true });
