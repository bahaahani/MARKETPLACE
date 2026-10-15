import { isAllowedOrigin } from './origins';

/**
 * Cross-site guard for cookie-authenticated, state-changing API requests (CSRF defence in depth). Pure, so it is
 * unit-tested (lib/csrf.test.ts); proxy.ts applies it to every /api/v1 request.
 *
 * The session cookie is HttpOnly + SameSite=Lax and the staff cookie SameSite=Strict, which already stops most
 * cross-site posts. This adds the check the OWASP CSRF cheat sheet recommends: for POST / PUT / PATCH / DELETE that
 * carry a cookie, the browser-set Origin (else Sec-Fetch-Site) must say the request came from this site or from an
 * allow-listed origin. Exempt: safe methods, requests with no cookie (nothing ambient to abuse), and requests that
 * carry the mobile `X-Sahel-Session` header or the staff header `X-Sahel-Staff-Role` (those win over the cookie in
 * the route code, and a browser cannot add a custom header cross-site without a CORS preflight).
 */
export const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

export interface GuardInput {
  method: string;
  /** Origin request header */
  origin: string | null;
  /** Sec-Fetch-Site request header */
  secFetchSite: string | null;
  /** Host (or X-Forwarded-Host) the request was sent to */
  host: string | null;
  hasCookie: boolean;
  /** X-Sahel-Session or X-Sahel-Staff-Role present */
  hasHeaderCredential: boolean;
  allowedOrigins: readonly string[];
}

export type GuardDecision = { allowed: true } | { allowed: false; reason: string };

function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

export function crossSiteDecision(i: GuardInput): GuardDecision {
  if (SAFE_METHODS.includes(i.method.toUpperCase())) return { allowed: true };
  if (i.hasHeaderCredential || !i.hasCookie) return { allowed: true };
  if (i.origin !== null) {
    if (i.host && hostOf(i.origin) === i.host) return { allowed: true };
    if (isAllowedOrigin(i.origin, i.allowedOrigins)) return { allowed: true };
    return { allowed: false, reason: 'Cross-site request refused: the Origin is not allowed.' };
  }
  // No Origin (older browsers, some same-origin cases): fall back to Fetch Metadata.
  if (i.secFetchSite === 'same-site' || i.secFetchSite === 'cross-site') {
    return { allowed: false, reason: 'Cross-site request refused: the request did not come from this site.' };
  }
  // same-origin, none (user-initiated), or no header at all (non-browser client such as curl or a test runner).
  return { allowed: true };
}
