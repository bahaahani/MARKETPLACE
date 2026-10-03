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
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Idempotency-Key' },
        ],
      },
    ];
  },
};

export default nextConfig;
