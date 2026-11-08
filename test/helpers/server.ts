// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import { readFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ResolvedAddress, Resolver } from '../../src/net/guard.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/site');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
};

/** Fixture server plus a "secret" internal server that must never be reached. */
export interface Fixtures {
  /** Base URL using the host name shop.test (resolved by `resolver`). */
  readonly base: string;
  readonly port: number;
  readonly secretPort: number;
  /** Paths requested from the fixture server. */
  readonly requests: string[];
  /** Number of HTTP requests on the secret server. */
  secretHits(): number;
  /** Number of TCP connections to the secret server (any protocol). */
  secretConnections(): number;
  readonly resolver: Resolver;
  /** Policy allow-list for the fixture server address. */
  readonly allowAddresses: readonly string[];
  close(): Promise<void>;
}

/** Start the fixture servers. */
export async function startFixtures(): Promise<Fixtures> {
  const deadline = Date.now() + 2 * 3600 * 1000;
  const requests: string[] = [];
  let secretHits = 0;
  let secretConnections = 0;

  const secret = http.createServer((_req, res) => {
    secretHits += 1;
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>secret</title><p>SECRET-TOKEN only 1 left</p>');
  });
  secret.on('connection', () => {
    secretConnections += 1;
  });
  await new Promise<void>((resolve) => secret.listen(0, '::', resolve));
  const secretPort = (secret.address() as AddressInfo).port;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://shop.test');
    requests.push(url.pathname);
    const send = (status: number, headers: Record<string, string>, body: string | Buffer = ''): void => {
      res.writeHead(status, headers);
      res.end(body);
    };
    switch (url.pathname) {
      case '/redirect-metadata':
        send(302, { location: 'http://169.254.169.254/latest/meta-data/' });
        return;
      case '/redirect-internal':
        send(302, { location: `http://internal.test:${String(secretPort)}/secret` });
        return;
      case '/redirect-internal-ip':
        send(302, { location: `http://[::ffff:127.0.0.1]:${String(secretPort)}/secret` });
        return;
      case '/redirect-chain': {
        const n = Number(url.searchParams.get('n') ?? '0');
        if (n < 8) send(302, { location: `/redirect-chain?n=${String(n + 1)}` });
        else send(200, { 'content-type': 'text/html' }, '<!doctype html><p>end of chain</p>');
        return;
      }
      case '/subresource-internal':
        send(200, { 'content-type': 'text/html' }, `<!doctype html><title>sub</title><img src="http://internal.test:${String(secretPort)}/img"><script>fetch('http://metadata.test/x').catch(()=>{});</script><p>sub</p>`);
        return;
      case '/big':
        send(200, { 'content-type': 'text/html' }, `<!doctype html><p>${'x'.repeat(200 * 1024)}</p>`);
        return;
      case '/slow': {
        // Data that arrives late, as from an API: content rendered from it must still be collected.
        const ms = Math.min(3000, Math.max(0, Number(url.searchParams.get('ms')) || 0));
        setTimeout(() => {
          send(200, { 'content-type': 'text/plain' }, 'ok');
        }, ms);
        return;
      }
      case '/image.png':
        send(200, { 'content-type': 'image/png' }, Buffer.from('89504e470d0a1a0a', 'hex'));
        return;
      default:
        break;
    }
    const rel = path.normalize(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)).replace(/^([/\\])+/, '');
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep)) {
      send(404, { 'content-type': 'text/plain' }, 'not found');
      return;
    }
    readFile(file)
      .then((data) => {
        const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
        const body = type.startsWith('text/html')
          ? data.toString('utf8').replace('{{DEADLINE}}', String(deadline)).replaceAll('{{SECRET_PORT}}', String(secretPort))
          : data;
        send(200, { 'content-type': type }, body);
      })
      .catch(() => {
        send(404, { 'content-type': 'text/plain' }, 'not found');
      });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;

  const table: Record<string, ResolvedAddress[]> = {
    'shop.test': [{ address: '127.0.0.1', family: 4 }],
    'internal.test': [{ address: '::ffff:127.0.0.1', family: 6 }],
    'metadata.test': [{ address: '169.254.169.254', family: 4 }],
    'mixed.test': [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ],
  };
  const resolver: Resolver = (host) => {
    const hit = table[host];
    return hit === undefined ? Promise.reject(new Error('ENOTFOUND')) : Promise.resolve(hit);
  };

  return {
    base: `http://shop.test:${String(port)}`,
    port,
    secretPort,
    requests,
    secretHits: () => secretHits,
    secretConnections: () => secretConnections,
    resolver,
    allowAddresses: ['127.0.0.1'],
    close: async () => {
      server.closeAllConnections();
      secret.closeAllConnections();
      await Promise.all([
        new Promise<void>((resolve) => server.close(() => { resolve(); })),
        new Promise<void>((resolve) => secret.close(() => { resolve(); })),
      ]);
    },
  };
}
