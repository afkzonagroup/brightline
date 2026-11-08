// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import { lookup as dnsLookup } from 'node:dns/promises';
import { canonicalIp, classifyIp, parseIp } from './ip.js';

/** A resolved address. */
export interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

/** DNS resolver signature (injectable for tests). Must return every address for the name. */
export type Resolver = (hostname: string) => Promise<readonly ResolvedAddress[]>;

/** Default resolver: the operating system resolver, all addresses. */
export const systemResolver: Resolver = async (hostname) => {
  const results = await dnsLookup(hostname, { all: true, order: 'verbatim' });
  return results.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
};

/** Network policy for the SSRF guard. */
export interface NetworkPolicy {
  /**
   * Exact IP addresses that may be fetched even though they are in a blocked
   * range (for example a staging server on your own private network).
   * An entry is `10.0.0.5` (every port), `10.0.0.5:8080`, `fd00::5` or `[fd00::5]:8080`.
   * Cloud metadata addresses can never be allowed.
   */
  readonly allowAddresses: readonly string[];
  /** DNS resolver. */
  readonly resolver: Resolver;
}

/** Thrown when a URL or address is refused by the guard. */
export class BlockedRequestError extends Error {
  /** Machine-readable reason, for example "loopback" or "scheme". */
  readonly reason: string;
  constructor(message: string, reason: string) {
    super(message);
    this.name = 'BlockedRequestError';
    this.reason = reason;
  }
}

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain', '.home.arpa', '.lan', '.intranet', '.corp'];
const BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain', 'metadata', 'metadata.google.internal', 'instance-data']);

const MAX_URL_LENGTH = 2048;

/**
 * Validate a URL string before any network activity: http/https only, no
 * credentials, length cap, no blocked host names. Returns the parsed URL.
 *
 * @throws BlockedRequestError
 */
export function checkUrlSyntax(input: string): URL {
  if (typeof input !== 'string' || input.length === 0 || input.length > MAX_URL_LENGTH) {
    throw new BlockedRequestError('URL is empty or longer than 2048 characters', 'length');
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new BlockedRequestError('URL does not parse', 'syntax');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedRequestError(`Scheme ${url.protocol} is not allowed (http and https only)`, 'scheme');
  }
  if (url.username !== '' || url.password !== '') {
    throw new BlockedRequestError('URLs with credentials are not allowed', 'credentials');
  }
  const host = hostOf(url);
  if (host.length === 0) throw new BlockedRequestError('URL has no host', 'syntax');
  if (BLOCKED_HOSTS.has(host) || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new BlockedRequestError(`Host ${host} is an internal name`, 'internal-name');
  }
  if (!host.includes('.') && parseIp(host) === null) {
    throw new BlockedRequestError(`Host ${host} is a single-label name`, 'internal-name');
  }
  return url;
}

/** Host name without IPv6 brackets and trailing dot, lower case. */
export function hostOf(url: URL): string {
  let h = url.hostname.toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  if (h.endsWith('.')) h = h.slice(0, -1);
  return h;
}

/**
 * Check a single IP address against the policy.
 *
 * @throws BlockedRequestError when the address is blocked and not allow-listed.
 */
export function checkAddress(address: string, policy: Pick<NetworkPolicy, 'allowAddresses'>, port?: number): void {
  const verdict = classifyIp(address);
  if (!verdict.blocked) return;
  if (!verdict.metadata) {
    const canon = canonicalIp(address);
    if (canon !== null) {
      for (const raw of policy.allowAddresses) {
        const entry = parseAllowEntry(raw);
        // An entry with a port matches only a connection to that port; a check without a port never matches it.
        if (entry !== null && entry.address === canon && (entry.port === null || entry.port === port)) return;
      }
    }
  }
  const where = port === undefined ? address : `${address} port ${String(port)}`;
  throw new BlockedRequestError(`Address ${where} is not allowed (${verdict.reason})`, verdict.reason);
}

/** One parsed allow-list entry: a canonical IP and an optional port (null means every port). */
export interface AllowEntry {
  readonly address: string;
  readonly port: number | null;
}

/**
 * Parse an allow-list entry: `10.0.0.5`, `10.0.0.5:8080`, `fd00::5`, `[fd00::5]` or `[fd00::5]:8080`.
 * An IPv6 address with a port needs brackets. Returns null when the entry is not valid.
 */
export function parseAllowEntry(entry: string): AllowEntry | null {
  if (typeof entry !== 'string' || entry.length === 0 || entry.length > 64) return null;
  let host = entry;
  let portText: string | null = null;
  if (entry.startsWith('[')) {
    const close = entry.indexOf(']');
    if (close === -1) return null;
    host = entry.slice(1, close);
    const rest = entry.slice(close + 1);
    if (rest !== '') {
      if (!rest.startsWith(':')) return null;
      portText = rest.slice(1);
    }
    if (!host.includes(':')) return null; // brackets are for IPv6 only
  } else {
    const colon = entry.indexOf(':');
    // One colon: IPv4 with a port. More than one: a bare IPv6 address, which cannot carry a port.
    if (colon !== -1 && entry.indexOf(':', colon + 1) === -1) {
      host = entry.slice(0, colon);
      portText = entry.slice(colon + 1);
    }
  }
  const address = canonicalIp(host);
  if (address === null) return null;
  if (portText === null) return { address, port: null };
  if (!/^[1-9][0-9]{0,4}$/.test(portText)) return null;
  const port = Number(portText);
  if (port > 65535) return null;
  return { address, port };
}

/** The TCP port a URL connects to. */
export function portOf(url: URL): number {
  if (url.port !== '') return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}

/**
 * Validate a URL and resolve its host. Every resolved address must pass;
 * a single blocked address blocks the request (defeats mixed DNS answers).
 * Returns the address to connect to (pin it to defeat DNS rebinding).
 *
 * @throws BlockedRequestError
 */
export async function resolveAndCheck(input: string | URL, policy: NetworkPolicy): Promise<{ url: URL; address: ResolvedAddress }> {
  const url = checkUrlSyntax(typeof input === 'string' ? input : input.href);
  const host = hostOf(url);
  const literal = parseIp(host);
  const port = portOf(url);
  if (literal !== null) {
    checkAddress(host, policy, port);
    return { url, address: { address: host, family: literal.family } };
  }
  let addresses: readonly ResolvedAddress[];
  try {
    addresses = await policy.resolver(host);
  } catch {
    throw new BlockedRequestError(`Host ${host} did not resolve`, 'dns');
  }
  if (addresses.length === 0) throw new BlockedRequestError(`Host ${host} did not resolve`, 'dns');
  for (const a of addresses) checkAddress(a.address, policy, port);
  const first = addresses[0];
  if (first === undefined) throw new BlockedRequestError(`Host ${host} did not resolve`, 'dns');
  return { url, address: first };
}
