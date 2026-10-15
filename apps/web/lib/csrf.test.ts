import { describe, expect, it } from 'vitest';
import { crossSiteDecision, type GuardInput } from './csrf';

const base: GuardInput = {
  method: 'POST',
  origin: null,
  secFetchSite: null,
  host: 'sahel.example',
  hasCookie: true,
  hasHeaderCredential: false,
  allowedOrigins: ['http://localhost:*', 'https://app.example'],
};
const decide = (over: Partial<GuardInput>) => crossSiteDecision({ ...base, ...over });

describe('crossSiteDecision', () => {
  it('never blocks safe methods', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) expect(decide({ method, origin: 'https://evil.example' }).allowed).toBe(true);
  });

  it('refuses a cookie-authenticated write from a foreign Origin', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const d = decide({ method, origin: 'https://evil.example', secFetchSite: 'cross-site' });
      expect(d.allowed).toBe(false);
    }
  });

  it('refuses the opaque "null" origin', () => {
    expect(decide({ origin: 'null' }).allowed).toBe(false);
  });

  it('allows the same origin (by Host) and allow-listed origins', () => {
    expect(decide({ origin: 'https://sahel.example' }).allowed).toBe(true);
    expect(decide({ origin: 'http://sahel.example' }).allowed).toBe(true);
    expect(decide({ origin: 'https://app.example' }).allowed).toBe(true);
    expect(decide({ origin: 'http://localhost:5173' }).allowed).toBe(true);
  });

  it('does not treat a look-alike host as the same origin', () => {
    expect(decide({ origin: 'https://sahel.example.evil.example' }).allowed).toBe(false);
  });

  it('exempts requests without a cookie and requests carrying a header credential', () => {
    expect(decide({ origin: 'https://evil.example', hasCookie: false }).allowed).toBe(true);
    expect(decide({ origin: 'https://evil.example', hasHeaderCredential: true }).allowed).toBe(true);
  });

  it('falls back to Fetch Metadata when there is no Origin', () => {
    expect(decide({ secFetchSite: 'cross-site' }).allowed).toBe(false);
    expect(decide({ secFetchSite: 'same-site' }).allowed).toBe(false);
    expect(decide({ secFetchSite: 'same-origin' }).allowed).toBe(true);
    expect(decide({ secFetchSite: 'none' }).allowed).toBe(true);
    // a non-browser client (curl, test runner) sends neither header
    expect(decide({}).allowed).toBe(true);
  });
});
