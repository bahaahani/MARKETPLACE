import { describe, expect, it } from 'vitest';
import { allowedOrigins, DEFAULT_ALLOWED_ORIGINS, DEFAULT_PUBLIC_ORIGIN, isAllowedOrigin, normalizeOrigin, parseOriginList, publicOrigin } from './origins';

describe('publicOrigin', () => {
  it('defaults to the local sandbox origin', () => {
    expect(publicOrigin({})).toBe(DEFAULT_PUBLIC_ORIGIN);
  });
  it('reads SAHEL_PUBLIC_ORIGIN and drops any path or trailing slash', () => {
    expect(publicOrigin({ SAHEL_PUBLIC_ORIGIN: 'https://sahel.example/en/' })).toBe('https://sahel.example');
  });
  it('ignores an invalid value', () => {
    expect(publicOrigin({ SAHEL_PUBLIC_ORIGIN: 'not a url' })).toBe(DEFAULT_PUBLIC_ORIGIN);
    expect(publicOrigin({ SAHEL_PUBLIC_ORIGIN: 'javascript:alert(1)' })).toBe(DEFAULT_PUBLIC_ORIGIN);
  });
});

describe('parseOriginList', () => {
  it('defaults to local development origins', () => {
    expect(parseOriginList(undefined)).toEqual(DEFAULT_ALLOWED_ORIGINS);
  });
  it('parses exact origins and port wildcards, trimming and dropping junk', () => {
    expect(parseOriginList(' https://app.example , http://localhost:*, ,nonsense, https://x.example/path, *')).toEqual([
      'https://app.example',
      'http://localhost:*',
      'https://x.example',
    ]);
  });
  it('an explicit empty value allows no browser origin (only the public origin is added by allowedOrigins)', () => {
    expect(parseOriginList('')).toEqual([]);
    expect(allowedOrigins({ SAHEL_ALLOWED_ORIGINS: '', SAHEL_PUBLIC_ORIGIN: 'https://sahel.example' })).toEqual(['https://sahel.example']);
  });
});

describe('isAllowedOrigin', () => {
  const list = ['http://localhost:*', 'https://app.example'];
  it('matches a wildcard port on the same scheme and host', () => {
    expect(isAllowedOrigin('http://localhost:5173', list)).toBe(true);
    expect(isAllowedOrigin('http://localhost', list)).toBe(true);
    expect(isAllowedOrigin('https://localhost:5173', list)).toBe(false);
    expect(isAllowedOrigin('http://localhost.evil.example', list)).toBe(false);
  });
  it('matches exact origins only', () => {
    expect(isAllowedOrigin('https://app.example', list)).toBe(true);
    expect(isAllowedOrigin('https://app.example:8443', list)).toBe(false);
    expect(isAllowedOrigin('http://app.example', list)).toBe(false);
    expect(isAllowedOrigin('https://app.example.evil.example', list)).toBe(false);
  });
  it('rejects null, missing and malformed origins', () => {
    expect(isAllowedOrigin(null, list)).toBe(false);
    expect(isAllowedOrigin('null', list)).toBe(false);
    expect(isAllowedOrigin('', list)).toBe(false);
    expect(isAllowedOrigin('file:///etc/passwd', list)).toBe(false);
  });
  it('normalizeOrigin keeps scheme, host and port only', () => {
    expect(normalizeOrigin('https://a.example:444/x?y#z')).toBe('https://a.example:444');
    expect(normalizeOrigin('ftp://a.example')).toBeNull();
  });
});
