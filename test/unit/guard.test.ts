import { describe, expect, it } from 'vitest';
import { BlockedRequestError, checkAddress, checkUrlSyntax, parseAllowEntry, portOf, resolveAndCheck, type Resolver } from '../../src/net/guard.js';

const resolver =
  (table: Record<string, string[]>): Resolver =>
  (host) => {
    const list = table[host];
    if (list === undefined) return Promise.reject(new Error('ENOTFOUND'));
    return Promise.resolve(list.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })));
  };

const reasonOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'allowed';
  } catch (error) {
    if (error instanceof BlockedRequestError) return error.reason;
    throw error;
  }
};

const reasonSync = (fn: () => unknown): string => {
  try {
    fn();
    return 'allowed';
  } catch (error) {
    if (error instanceof BlockedRequestError) return error.reason;
    throw error;
  }
};

describe('checkUrlSyntax', () => {
  it.each([
    ['file:///etc/passwd', 'scheme'],
    ['ftp://example.com/', 'scheme'],
    ['javascript:alert(1)', 'scheme'],
    ['data:text/html,hi', 'scheme'],
    ['gopher://example.com/', 'scheme'],
    ['ws://example.com/', 'scheme'],
    ['http://user:pass@example.com/', 'credentials'],
    ['http://user@example.com/', 'credentials'],
    ['http://localhost/', 'internal-name'],
    ['http://LOCALHOST./', 'internal-name'],
    ['http://foo.localhost/', 'internal-name'],
    ['http://printer.local/', 'internal-name'],
    ['http://metadata.google.internal/', 'internal-name'],
    ['http://intranet/', 'internal-name'],
    ['not a url', 'syntax'],
    ['', 'length'],
    [`https://example.com/${'a'.repeat(2100)}`, 'length'],
  ])('refuses %s', (url, reason) => {
    expect(reasonSync(() => checkUrlSyntax(url))).toBe(reason);
  });

  it('accepts http and https', () => {
    expect(checkUrlSyntax('https://example.com/a?b=1').href).toBe('https://example.com/a?b=1');
    expect(checkUrlSyntax('http://example.com:8080/').port).toBe('8080');
  });
});

describe('resolveAndCheck', () => {
  const policy = (table: Record<string, string[]>, allow: string[] = []) => ({ resolver: resolver(table), allowAddresses: allow });

  it.each([
    ['http://127.0.0.1/', 'loopback'],
    ['http://2130706433/', 'loopback'],
    ['http://0177.0.0.1/', 'loopback'],
    ['http://0x7f.0.0.1/', 'loopback'],
    ['http://0x7f000001/', 'loopback'],
    ['http://127.1/', 'loopback'],
    ['http://[::1]/', 'loopback'],
    ['http://[::ffff:127.0.0.1]/', 'loopback'],
    ['http://[::ffff:7f00:1]/', 'loopback'],
    ['http://[0:0:0:0:0:ffff:a00:1]/', 'private'],
    ['http://169.254.169.254/latest/meta-data/', 'metadata'],
    ['http://[fd00:ec2::254]/', 'metadata'],
    ['http://10.0.0.1/', 'private'],
    ['http://100.64.1.1/', 'cgnat'],
    ['http://[fc00::1]/', 'unique-local'],
    ['http://[fe80::1]/', 'link-local'],
    ['http://224.0.0.1/', 'multicast'],
    ['http://0.0.0.0/', 'this-network'],
  ])('blocks literal %s', async (url, reason) => {
    expect(await reasonOf(resolveAndCheck(url, policy({})))).toBe(reason);
  });

  it('blocks names that resolve to private addresses', async () => {
    const p = policy({ 'evil.example': ['10.0.0.7'], 'meta.example': ['169.254.169.254'], 'v6.example': ['::1'] });
    expect(await reasonOf(resolveAndCheck('http://evil.example/', p))).toBe('private');
    expect(await reasonOf(resolveAndCheck('http://meta.example/', p))).toBe('metadata');
    expect(await reasonOf(resolveAndCheck('http://v6.example/', p))).toBe('loopback');
  });

  it('blocks when any one of several answers is private (mixed DNS)', async () => {
    const p = policy({ 'mixed.example': ['93.184.216.34', '192.168.0.10'] });
    expect(await reasonOf(resolveAndCheck('https://mixed.example/', p))).toBe('private');
  });

  it('blocks names that do not resolve or resolve to nothing', async () => {
    expect(await reasonOf(resolveAndCheck('https://missing.example/', policy({})))).toBe('dns');
    expect(await reasonOf(resolveAndCheck('https://empty.example/', policy({ 'empty.example': [] })))).toBe('dns');
  });

  it('returns the checked address for public names', async () => {
    const r = await resolveAndCheck('https://ok.example/', policy({ 'ok.example': ['93.184.216.34'] }));
    expect(r.address.address).toBe('93.184.216.34');
  });

  it('allow-list permits an exact private address but never metadata', async () => {
    expect(await reasonOf(resolveAndCheck('http://10.0.0.5/', policy({}, ['10.0.0.5'])))).toBe('allowed');
    expect(await reasonOf(resolveAndCheck('http://10.0.0.6/', policy({}, ['10.0.0.5'])))).toBe('private');
    expect(await reasonOf(resolveAndCheck('http://169.254.169.254/', policy({}, ['169.254.169.254'])))).toBe('metadata');
    expect(reasonSync(() => { checkAddress('fd00:ec2::254', { allowAddresses: ['fd00:ec2::254'] }); })).toBe('metadata');
    // A mapped form of an allowed IPv4 address is a different address and stays blocked.
    expect(await reasonOf(resolveAndCheck('http://[::ffff:10.0.0.5]/', policy({}, ['10.0.0.5'])))).toBe('private');
  });

  it('parses allow-list entries with and without a port', () => {
    expect(parseAllowEntry('10.0.0.5')).toEqual({ address: '10.0.0.5', port: null });
    expect(parseAllowEntry('10.0.0.5:8080')).toEqual({ address: '10.0.0.5', port: 8080 });
    expect(parseAllowEntry('fd00::5')).toEqual({ address: 'fd00:0:0:0:0:0:0:5', port: null });
    expect(parseAllowEntry('[fd00::5]')).toEqual({ address: 'fd00:0:0:0:0:0:0:5', port: null });
    expect(parseAllowEntry('[fd00::5]:65535')).toEqual({ address: 'fd00:0:0:0:0:0:0:5', port: 65535 });
    // Without brackets every colon belongs to the IPv6 address: this is the address fd00::5:80 on every port.
    expect(parseAllowEntry('fd00::5:80')).toEqual({ address: 'fd00:0:0:0:0:0:5:80', port: null });
    for (const bad of ['', 'staging.example', '10.0.0.5:', '10.0.0.5:0', '10.0.0.5:65536', '10.0.0.5:080', '10.0.0.5:8o', '10.0.0.5: 80', '[10.0.0.5]:80', '[fd00::5', '[fd00::5]80', '[fd00::5]:', 'a'.repeat(65)]) {
      expect(parseAllowEntry(bad), bad).toBeNull();
    }
  });

  it('an entry with a port allows only that port', async () => {
    expect(await reasonOf(resolveAndCheck('http://10.0.0.5:8080/', policy({}, ['10.0.0.5:8080'])))).toBe('allowed');
    expect(await reasonOf(resolveAndCheck('http://10.0.0.5:8081/', policy({}, ['10.0.0.5:8080'])))).toBe('private');
    expect(await reasonOf(resolveAndCheck('http://10.0.0.5/', policy({}, ['10.0.0.5:80'])))).toBe('allowed');
    expect(await reasonOf(resolveAndCheck('https://10.0.0.5/', policy({}, ['10.0.0.5:80'])))).toBe('private');
    expect(await reasonOf(resolveAndCheck('https://10.0.0.5/', policy({}, ['10.0.0.5:443'])))).toBe('allowed');
    expect(await reasonOf(resolveAndCheck('http://[fd00::5]:3000/', policy({}, ['[fd00::5]:3000'])))).toBe('allowed');
    expect(await reasonOf(resolveAndCheck('http://[fd00::5]:3001/', policy({}, ['[fd00::5]:3000'])))).toBe('unique-local');
    // Names resolve first; the port of the URL still has to match.
    expect(await reasonOf(resolveAndCheck('http://stage.example:8080/', policy({ 'stage.example': ['10.0.0.5'] }, ['10.0.0.5:8080'])))).toBe('allowed');
    expect(await reasonOf(resolveAndCheck('http://stage.example:9000/', policy({ 'stage.example': ['10.0.0.5'] }, ['10.0.0.5:8080'])))).toBe('private');
    // A check without a port never matches a port entry, and metadata stays blocked with a port too.
    expect(reasonSync(() => { checkAddress('10.0.0.5', { allowAddresses: ['10.0.0.5:80'] }); })).toBe('private');
    expect(await reasonOf(resolveAndCheck('http://169.254.169.254/', policy({}, ['169.254.169.254:80'])))).toBe('metadata');
    // Invalid entries never allow anything.
    expect(await reasonOf(resolveAndCheck('http://10.0.0.5/', policy({}, ['10.0.0.5:0'])))).toBe('private');
  });

  it('knows the default port of each scheme', () => {
    expect(portOf(new URL('http://a.example/'))).toBe(80);
    expect(portOf(new URL('https://a.example/'))).toBe(443);
    expect(portOf(new URL('https://a.example:8443/'))).toBe(8443);
    expect(portOf(new URL('http://a.example:443/'))).toBe(443);
  });
});
