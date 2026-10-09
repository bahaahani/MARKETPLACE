import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@sahel/domain', '@sahel/i18n'],
  async redirects() {
    return [{ source: '/', destination: '/en', permanent: false }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        // The Flutter app (and Flutter dev builds) call the same API.
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,PATCH,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Idempotency-Key, Authorization, X-Sahel-Session' },
          // ⚠️ Sandbox customer session for the app (apps/web/lib/session.ts).
          { key: 'Access-Control-Expose-Headers', value: 'X-Sahel-Session' },
        ],
      },
      {
        // Per-customer answers (balances, voucher codes, the session id header) must never sit in a shared cache.
        source: '/api/v1/:area(me|rewards|assistant)/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
      },
      {
        source: '/api/v1/me',
        headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
      },
    ];
  },
};

export default nextConfig;
