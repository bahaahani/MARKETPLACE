import { NextResponse, type NextRequest } from 'next/server';
import { crossSiteDecision } from '@/lib/csrf';
import { allowedOrigins, isAllowedOrigin } from '@/lib/origins';

/**
 * API v1 edge rules (Next 16 "proxy", the renamed middleware). Runs for /api/* only:
 *
 * 1. CORS with an allow-list (SAHEL_ALLOWED_ORIGINS, see lib/origins.ts) instead of `*`. A browser origin that is
 *    not allowed gets no CORS headers (and a 403 on the preflight); `Vary: Origin` is always set so caches keep
 *    the answers apart. The Flutter mobile app is not a browser and is unaffected; Flutter web dev builds run on
 *    localhost and are allowed by default. Credentials are not allowed cross-origin: the app uses the
 *    `X-Sahel-Session` header, not cookies.
 * 2. The cross-site guard (lib/csrf.ts) for cookie-authenticated POST / PUT / PATCH / DELETE.
 *
 * Security headers for pages and the `private, no-store` rules live in next.config.ts.
 */
const ALLOW_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
// ⚠️ X-Sahel-Session is the sandbox customer session for the app (apps/web/lib/session.ts).
const ALLOW_HEADERS = 'Content-Type, Idempotency-Key, Authorization, X-Sahel-Session';
const EXPOSE_HEADERS = 'X-Sahel-Session';

function problem(status: number, code: string, message: string): NextResponse {
  const res = NextResponse.json({ error: { code, message } }, { status });
  res.headers.append('Vary', 'Origin');
  return res;
}

export function proxy(req: NextRequest): NextResponse {
  const allowed = allowedOrigins();
  const origin = req.headers.get('origin');
  const originAllowed = isAllowedOrigin(origin, allowed);
  const isPreflight = req.method === 'OPTIONS' && req.headers.has('access-control-request-method');

  if (isPreflight) {
    if (!originAllowed) return problem(403, 'ORIGIN_NOT_ALLOWED', 'This origin is not allowed to call the API.');
    const res = new NextResponse(null, { status: 204 });
    res.headers.set('Access-Control-Allow-Origin', origin!);
    res.headers.set('Access-Control-Allow-Methods', ALLOW_METHODS);
    res.headers.set('Access-Control-Allow-Headers', ALLOW_HEADERS);
    res.headers.set('Access-Control-Max-Age', '600');
    res.headers.append('Vary', 'Origin');
    return res;
  }

  if (req.nextUrl.pathname.startsWith('/api/v1/')) {
    const decision = crossSiteDecision({
      method: req.method,
      origin,
      secFetchSite: req.headers.get('sec-fetch-site'),
      host: req.headers.get('x-forwarded-host') ?? req.headers.get('host'),
      hasCookie: Boolean(req.headers.get('cookie')),
      hasHeaderCredential: req.headers.has('x-sahel-session') || req.headers.has('x-sahel-staff-role'),
      allowedOrigins: allowed,
    });
    if (!decision.allowed) return problem(403, 'CROSS_SITE_REQUEST', decision.reason);
  }

  const res = NextResponse.next();
  res.headers.append('Vary', 'Origin');
  if (originAllowed) {
    res.headers.set('Access-Control-Allow-Origin', origin!);
    res.headers.set('Access-Control-Expose-Headers', EXPOSE_HEADERS);
  }
  return res;
}

export const config = { matcher: '/api/:path*' };
