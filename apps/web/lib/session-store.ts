import { newCustomerProfile, type CustomerProfile } from '@sahel/domain';

/**
 * ⚠️ SANDBOX customer sessions, standing in for an eKey / OIDC login. In memory only (lost on restart).
 * The session id is an opaque random value; it is never the customer id and never appears in a response body.
 * No Next.js imports here, so the store can be unit-tested (packages/domain/test/session.test.ts).
 */
export interface CustomerSession {
  id: string;
  profile: CustomerProfile;
  createdAt: number;
  lastSeenAt: number;
}

export interface SessionStoreOptions {
  /** Sessions unused for this long are forgotten. */
  idleTtlMs?: number;
  /** Oldest sessions are dropped beyond this many, so the sandbox cannot grow without bound. */
  maxSessions?: number;
  clock?: () => number;
  random?: (bytes: number) => string;
}

/** 24 random bytes, base64url: 32 characters. */
const SESSION_ID = /^[A-Za-z0-9_-]{32,64}$/;

export function isWellFormedSessionId(id: string | null | undefined): id is string {
  return typeof id === 'string' && SESSION_ID.test(id);
}

function randomBase64Url(bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return Buffer.from(buf).toString('base64url');
}

export class SessionStore {
  private readonly sessions = new Map<string, CustomerSession>();
  private readonly idleTtlMs: number;
  private readonly maxSessions: number;
  private readonly clock: () => number;
  private readonly random: (bytes: number) => string;

  constructor(opts: SessionStoreOptions = {}) {
    this.idleTtlMs = opts.idleTtlMs ?? 24 * 3600 * 1000;
    this.maxSessions = opts.maxSessions ?? 10_000;
    this.clock = opts.clock ?? Date.now;
    this.random = opts.random ?? randomBase64Url;
  }

  /** The live session for this id, or undefined (unknown, expired or malformed). Refreshes its idle timer. */
  get(id: string | null | undefined): CustomerSession | undefined {
    if (!isWellFormedSessionId(id)) return undefined;
    const s = this.sessions.get(id);
    if (!s) return undefined;
    const now = this.clock();
    if (now - s.lastSeenAt > this.idleTtlMs) {
      this.sessions.delete(id);
      return undefined;
    }
    s.lastSeenAt = now;
    return s;
  }

  /**
   * A new session that starts as the demo customer. The id is always generated here, never taken from the
   * client, so a client cannot choose (fix) another person's session id.
   */
  create(): CustomerSession {
    this.purge();
    let id = this.random(24);
    while (this.sessions.has(id)) id = this.random(24);
    const now = this.clock();
    const session: CustomerSession = { id, profile: newCustomerProfile(`cus_sbx_${this.random(9)}`), createdAt: now, lastSeenAt: now };
    this.sessions.set(id, session);
    return session;
  }

  /** The existing session for `id`, or a new one when it is unknown. */
  resolve(id: string | null | undefined): { session: CustomerSession; created: boolean } {
    const found = this.get(id);
    return found ? { session: found, created: false } : { session: this.create(), created: true };
  }

  /** Replaces the session's profile with `fn(profile)` and returns the new profile. */
  update(id: string, fn: (p: CustomerProfile) => CustomerProfile): CustomerProfile {
    const s = this.sessions.get(id);
    if (!s) throw new Error('unknown session');
    s.profile = fn(s.profile);
    return s.profile;
  }

  get size(): number {
    return this.sessions.size;
  }

  private purge(): void {
    const now = this.clock();
    for (const [k, s] of this.sessions) if (now - s.lastSeenAt > this.idleTtlMs) this.sessions.delete(k);
    // Map keeps insertion order, so the first entries are the oldest sessions.
    for (const k of this.sessions.keys()) {
      if (this.sessions.size < this.maxSessions) break;
      this.sessions.delete(k);
    }
  }
}
