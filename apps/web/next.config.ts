import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';

/**
 * Content-Security-Policy for pages. Enforced (not report-only).
 *
 * - Scripts: `'self' 'unsafe-inline'`. Next.js emits inline bootstrap / RSC payload scripts; a nonce would remove
 *   `'unsafe-inline'` but needs a per-request nonce from proxy.ts, which turns every page dynamic and loses the
 *   statically generated public pages (SEO, speed). Documented trade-off in docs/12-web-platform.md; the rest of
 *   the policy (no third-party scripts, no `eval`, `object-src 'none'`, `base-uri`, `form-action`) still blocks
 *   most injected payloads. Development adds `'unsafe-eval'` and websockets for React refresh / HMR.
 * - Styles: `'self' 'unsafe-inline'` (React `style` attributes, Next's inline CSS) plus the Google Fonts stylesheet.
 * - Fonts: Google Fonts file host. Images: self, data: (QR codes, generated artwork) and blob:.
 * - `frame-ancestors 'none'` is the modern X-Frame-Options.
 */
const PAGE_CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** API responses are JSON: nothing should load or frame them. */
const API_CSP = "default-src 'none'; frame-ancestors 'none'";

// Pages for one customer, a dealer or staff: never indexed, never in a shared cache.
const PRIVATE_AREAS = 'account|applications|backoffice|dealer|claims|checkout|requests|notifications|onboarding|rewards|trade-in|finance';

// API areas that are the same for everyone (catalogue and product rules). Everything else under /api/v1 can carry
// a customer's or staff member's data and is `private, no-store`.
const PUBLIC_API = 'config|vehicles|properties';

const NO_STORE = [{ key: 'Cache-Control', value: 'private, no-store' }];
const NOINDEX = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];

const nextConfig: NextConfig = {
  transpilePackages: ['@sahel/domain', '@sahel/i18n'],
  poweredByHeader: false,
  async redirects() {
    return [{ source: '/', destination: '/en', permanent: false }];
  },
  // Later rules override earlier ones for the same header key. CORS and the cross-site POST guard are in proxy.ts
  // (the allow-list depends on the request's Origin, which static headers cannot see).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: PAGE_CSP },
          // Only meaningful over HTTPS (browsers ignore it on http://localhost); sent so TLS deployments have it.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          // Geolocation: the claim form's "use my location". Photos use a file input, not getUserMedia.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=(self), usb=(), serial=()' },
        ],
      },
      { source: '/api/:path*', headers: [{ key: 'Content-Security-Policy', value: API_CSP }] },
      { source: `/api/v1/:path((?!(?:${PUBLIC_API})(?:/|$)).*)`, headers: NO_STORE },
      { source: `/:locale(en|ar)/:area(${PRIVATE_AREAS})/:path*`, headers: [...NO_STORE, ...NOINDEX] },
      { source: '/:locale(en|ar)/cards/:id/apply', headers: [...NO_STORE, ...NOINDEX] },
    ];
  },
};

export default nextConfig;
