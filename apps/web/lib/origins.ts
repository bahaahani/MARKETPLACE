/**
 * Public origin and the browser origin allow-list (CORS and the cross-site POST guard). Pure, so it is unit-tested
 * (lib/origins.test.ts).
 *
 * - SAHEL_PUBLIC_ORIGIN: the origin this site is served from, used for canonical URLs, hreflang, Open Graph, the
 *   sitemap and JSON-LD. Default http://localhost:3000 (sandbox). Never hard-code a hostname.
 * - SAHEL_ALLOWED_ORIGINS: comma-separated browser origins allowed to call the API cross-origin. An entry is an
 *   exact origin (`https://app.example`) or `scheme://host:*` for any port (`http://localhost:*`). When unset the
 *   default is local development only (localhost, 127.0.0.1, [::1] on any port: Flutter web dev builds pick a
 *   random port). The public origin is always allowed. A lone `*` is not supported on purpose.
 *
 * The Flutter mobile app is not a browser: it sends no Origin header and CORS does not apply to it.
 */
export const DEFAULT_PUBLIC_ORIGIN = 'http://localhost:3000';
export const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:*', 'http://127.0.0.1:*', 'http://[::1]:*'];

type Env = Record<string, string | undefined>;

/** `scheme://host[:port]` of an http(s) URL, or null. */
export function normalizeOrigin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

export function publicOrigin(env: Env = process.env): string {
  return normalizeOrigin(env.SAHEL_PUBLIC_ORIGIN?.trim()) ?? DEFAULT_PUBLIC_ORIGIN;
}

/** The configured allow-list entries (exact origins and `:*` patterns), invalid entries dropped. */
export function parseOriginList(raw: string | undefined): string[] {
  if (raw === undefined) return [...DEFAULT_ALLOWED_ORIGINS];
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const entry = part.trim();
    if (!entry) continue;
    if (entry.endsWith(':*')) {
      const base = normalizeOrigin(entry.slice(0, -2));
      if (base && !new URL(base).port) out.push(`${base}:*`);
    } else {
      const exact = normalizeOrigin(entry);
      if (exact) out.push(exact);
    }
  }
  return out;
}

export function allowedOrigins(env: Env = process.env): string[] {
  return [...parseOriginList(env.SAHEL_ALLOWED_ORIGINS), publicOrigin(env)];
}

/** True when `origin` (an Origin header value) matches an allow-list entry. `null` / garbage never match. */
export function isAllowedOrigin(origin: string | null | undefined, allowed: readonly string[]): boolean {
  const o = normalizeOrigin(origin);
  if (!o) return false;
  const url = new URL(o);
  return allowed.some((entry) => {
    if (entry.endsWith(':*')) {
      const base = new URL(entry.slice(0, -2));
      return base.protocol === url.protocol && base.hostname === url.hostname;
    }
    return entry === o;
  });
}
