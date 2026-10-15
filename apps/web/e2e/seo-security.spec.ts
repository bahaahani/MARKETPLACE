import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Web platform: SEO (metadata, hreflang, JSON-LD, sitemap, robots, manifest), security headers and CSP, the CORS
// allow-list and the cross-site POST guard (see docs/12-web-platform.md). The public origin in canonical URLs comes
// from SAHEL_PUBLIC_ORIGIN at build time (default http://localhost:3000); the CORS tests assume the default
// SAHEL_ALLOWED_ORIGINS (localhost on any port).

const ORIGIN = (process.env.SAHEL_PUBLIC_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');
const CAR = 'v-honda-city-2026';
const HOME = 'p-saar-villa-4br';

const PUBLIC_PATHS = ['', '/cars', `/cars/${CAR}`, '/property', `/property/${HOME}`, '/cards', '/insurance', '/insurance/travel', '/insurance/home', '/insurance/medical', '/insurance/life', '/life-events'];
const PRIVATE_PATHS = ['/account', '/backoffice', '/backoffice/credit', '/checkout?purpose=reservation_deposit&amount=100000&reference=x&label=x', '/claims/new', '/dealer', '/notifications', '/onboarding', '/requests/new', '/rewards', '/trade-in', '/finance/personal', '/cards/imtiaz-world/apply'];

async function head(page: Page) {
  return page.evaluate(() => {
    const attr = (sel: string, name: string) => document.querySelector(sel)?.getAttribute(name) ?? null;
    return {
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      title: document.title,
      description: attr('meta[name="description"]', 'content'),
      canonical: attr('link[rel="canonical"]', 'href'),
      robots: attr('meta[name="robots"]', 'content'),
      hreflang: Object.fromEntries([...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => [l.getAttribute('hreflang'), l.getAttribute('href')])),
      og: Object.fromEntries([...document.querySelectorAll('meta[property^="og:"]')].map((m) => [m.getAttribute('property'), m.getAttribute('content')])),
      twitter: Object.fromEntries([...document.querySelectorAll('meta[name^="twitter:"]')].map((m) => [m.getAttribute('name'), m.getAttribute('content')])),
      jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent ?? ''),
    };
  });
}

function flatten(ld: unknown): Record<string, unknown>[] {
  return (Array.isArray(ld) ? ld : [ld]) as Record<string, unknown>[];
}

for (const locale of ['en', 'ar'] as const) {
  test.describe(`metadata (${locale})`, () => {
    for (const path of PUBLIC_PATHS) {
      test(`${locale}${path || ' (home)'}: title, description, canonical, hreflang, Open Graph, Twitter`, async ({ page }) => {
        await page.goto(`/${locale}${path}`);
        const h = await head(page);
        const self = `${ORIGIN}/${locale}${path}`;
        expect(h.lang).toBe(locale);
        expect(h.dir).toBe(locale === 'ar' ? 'rtl' : 'ltr');
        expect(h.title.length).toBeGreaterThan(5);
        expect(h.description!.length).toBeGreaterThan(40);
        expect(h.canonical).toBe(self);
        expect(h.hreflang).toEqual({ en: `${ORIGIN}/en${path}`, ar: `${ORIGIN}/ar${path}`, 'x-default': `${ORIGIN}/en${path}` });
        expect(h.og).toMatchObject({
          'og:title': expect.stringContaining(h.title.split(' · ')[0]),
          'og:description': h.description,
          'og:url': self,
          'og:site_name': locale === 'ar' ? 'ساهل' : 'Sahel',
          'og:locale': locale === 'ar' ? 'ar_BH' : 'en_US',
          'og:locale:alternate': locale === 'ar' ? 'en_US' : 'ar_BH',
          'og:image': `${ORIGIN}/og/${locale}`,
          'og:type': 'website',
        });
        expect(h.twitter).toMatchObject({ 'twitter:card': 'summary_large_image', 'twitter:title': h.og['og:title'], 'twitter:description': h.description });
        // Public pages are indexable.
        expect(h.robots ?? '').not.toContain('noindex');
      });
    }

    test(`${locale}: the Arabic and English pages have different (translated) titles and descriptions`, async ({ page }) => {
      await page.goto('/en/cars');
      const en = await head(page);
      await page.goto('/ar/cars');
      const ar = await head(page);
      expect(ar.title).not.toBe(en.title);
      expect(ar.description).not.toBe(en.description);
      expect(ar.description).toMatch(/[؀-ۿ]/);
    });
  });
}

test('private pages are noindex in metadata and in X-Robots-Tag, and never cached', async ({ page }) => {
  for (const path of PRIVATE_PATHS) {
    const res = await page.goto(`/en${path}`);
    expect(res!.status(), path).toBeLessThan(400);
    const h = await head(page);
    expect(h.robots, path).toContain('noindex');
    expect(res!.headers()['x-robots-tag'], path).toContain('noindex');
    expect(res!.headers()['cache-control'], path).toContain('no-store');
  }
});

test('JSON-LD: valid JSON, escaped, public facts only', async ({ page }) => {
  const collect = async (path: string) => {
    await page.goto(path);
    const { jsonLd } = await head(page);
    expect(jsonLd.length, path).toBeGreaterThan(0);
    for (const raw of jsonLd) {
      // Nothing in the block can close the script element (the review found unescaped JSON-LD before).
      expect(raw, path).not.toContain('<');
      expect(raw, path).not.toMatch(/sahel_session|sahel_staff|cus_|customerId|preApproval/);
    }
    return jsonLd.flatMap((raw) => flatten(JSON.parse(raw)));
  };
  const types = (nodes: Record<string, unknown>[]) => nodes.map((n) => n['@type']);

  const car = await collect(`/en/cars/${CAR}`);
  expect(types(car)).toEqual(['Car', 'BreadcrumbList']);
  expect(car[0]).toMatchObject({
    '@context': 'https://schema.org',
    name: 'Honda City EX',
    brand: { '@type': 'Brand', name: 'Honda' },
    itemCondition: 'https://schema.org/NewCondition',
    offers: { '@type': 'Offer', price: '7450.000', priceCurrency: 'BHD', availability: 'https://schema.org/InStock', url: `${ORIGIN}/en/cars/${CAR}` },
  });
  expect((car[1].itemListElement as { position: number; item: string }[]).map((i) => i.item)).toEqual([`${ORIGIN}/en`, `${ORIGIN}/en/cars`, `${ORIGIN}/en/cars/${CAR}`]);

  const home = await collect(`/ar/property/${HOME}`);
  expect(types(home)).toEqual(['RealEstateListing', 'BreadcrumbList']);
  expect(home[0]).toMatchObject({ inLanguage: 'ar', mainEntity: { '@type': 'Offer', priceCurrency: 'BHD', itemOffered: { address: { addressCountry: 'BH' } } } });

  const cards = await collect('/en/cards');
  expect(types(cards)).toEqual(['ItemList']);
  const items = (cards[0].itemListElement as { item: { '@type': string } }[]).map((i) => i.item['@type']);
  expect(items).toContain('CreditCard');
  expect(items).toContain('FinancialProduct');

  const landing = await collect('/en');
  expect(types(landing)).toEqual(['Organization', 'WebSite']);
  expect(landing[1]).toMatchObject({ potentialAction: { '@type': 'SearchAction' } });
});

test('sitemap.xml lists the public pages in both locales with alternates and none of the private ones', async ({ request }) => {
  const res = await request.get('/sitemap.xml');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('xml');
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const locale of ['en', 'ar']) {
    for (const path of PUBLIC_PATHS) expect(locs, `${locale}${path}`).toContain(`${ORIGIN}/${locale}${path}`);
  }
  expect(new Set(locs).size).toBe(locs.length);
  expect(xml).toContain(`<xhtml:link rel="alternate" hreflang="ar" href="${ORIGIN}/ar/cars/${CAR}" />`);
  expect(xml).toContain(`<xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}/en/cars/${CAR}" />`);
  for (const loc of locs) {
    expect(loc.startsWith(ORIGIN)).toBe(true);
    expect(loc).not.toMatch(/\/(account|applications|backoffice|dealer|claims|checkout|requests|notifications|rewards|onboarding|trade-in|finance|api)(\/|$)/);
    expect(loc).not.toMatch(/\/cards\/.+\/apply/);
    expect(loc).not.toMatch(/\/life-events\/.+/);
  }
});

test('robots.txt disallows private, staff and API paths and points to the sitemap', async ({ request }) => {
  const res = await request.get('/robots.txt');
  expect(res.status()).toBe(200);
  const txt = await res.text();
  expect(txt).toMatch(/User-Agent: \*/i);
  expect(txt).toContain('Allow: /');
  for (const p of ['/api/', '/*/account', '/*/backoffice', '/*/dealer', '/*/checkout', '/*/claims', '/*/requests', '/*/notifications', '/*/rewards', '/*/onboarding', '/*/applications']) {
    expect(txt).toContain(`Disallow: ${p}`);
  }
  expect(txt).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  // Public pages are not blocked.
  expect(txt).not.toMatch(/^Disallow: \/(\*\/)?(cars|property|cards|insurance|life-events)\/?$/m);
});

test('web app manifest and icons', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ name: 'Sahel', short_name: 'Sahel', display: 'standalone', theme_color: '#0B4F8A' });
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  for (const icon of manifest.icons as { src: string; type: string }[]) {
    const res = await request.get(icon.src);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()['content-type']).toBe(icon.type);
  }
  for (const url of ['/icon.svg', '/icons/180', '/og/en', '/og/ar']) expect((await request.get(url)).status(), url).toBe(200);
});

test.describe('security headers', () => {
  test('pages: CSP (enforced), HSTS, framing, sniffing, referrer, COOP, permissions', async ({ request }) => {
    for (const path of ['/en', '/ar/cars', `/en/cars/${CAR}`, '/en/account']) {
      const h = (await request.get(path)).headers();
      const csp = h['content-security-policy'];
      expect(csp, path).toBeTruthy();
      expect(h['content-security-policy-report-only']).toBeUndefined();
      for (const d of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com']) {
        expect(csp, `${path}: ${d}`).toContain(d);
      }
      expect(csp).not.toMatch(/script-src[^;]*\*/);
      expect(h['strict-transport-security']).toMatch(/max-age=\d{7,}/);
      expect(h['x-frame-options']).toBe('DENY');
      expect(h['x-content-type-options']).toBe('nosniff');
      expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(h['cross-origin-opener-policy']).toBe('same-origin');
      expect(h['permissions-policy']).toMatch(/camera=\(\)/);
      expect(h['permissions-policy']).toMatch(/microphone=\(\)/);
      expect(h['permissions-policy']).toMatch(/geolocation=\(self\)/);
      expect(h['x-powered-by']).toBeUndefined();
    }
  });

  test('API responses: locked-down CSP, nosniff, and no shared cache for anything personal', async ({ request }) => {
    const config = await request.get('/api/v1/config');
    expect(config.headers()['content-security-policy']).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(config.headers()['x-content-type-options']).toBe('nosniff');
    expect(config.headers()['x-frame-options']).toBe('DENY');
    expect(config.headers()['vary']).toContain('Origin');
    // The catalogue and product rules are the same for everyone.
    expect(config.headers()['cache-control'] ?? '').not.toContain('no-store');
    for (const path of ['/api/v1/me', '/api/v1/me/rewards', '/api/v1/me/policies', '/api/v1/me/claims', '/api/v1/me/cards', '/api/v1/applications/app-x', '/api/v1/cards', '/api/v1/claims', '/api/v1/requests', '/api/v1/rewards/catalogue', '/api/v1/backoffice/audit', '/api/v1/payments/price']) {
      expect((await request.get(path)).headers()['cache-control'], path).toBe('private, no-store');
    }
  });

  test('no Content-Security-Policy violation on key pages, and the page still hydrates', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (m) => {
      if (/content security policy|permissions-policy/i.test(m.text())) violations.push(`${page.url()}: ${m.text()}`);
    });
    await page.addInitScript(() => {
      (window as unknown as { __csp: string[] }).__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    const pages = ['/en', '/ar', '/en/cars', `/en/cars/${CAR}`, `/ar/property/${HOME}`, '/en/cards', '/en/insurance', '/en/insurance/travel', '/en/life-events', '/en/claims/new', '/en/account', '/en/onboarding', '/en/backoffice', '/en/dealer'];
    for (const path of pages) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      const blocked = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
      // The Google Fonts host is allowed; any blocked URI is a real violation.
      expect(blocked, path).toEqual([]);
    }
    // Hydration works under the CSP (inline bootstrap scripts run): the assistant opens.
    await page.goto('/en');
    await page.getByTestId('assistant-launcher').click();
    await expect(page.getByTestId('assistant-panel')).toBeVisible();
    expect(violations).toEqual([]);
  });
});

test.describe('CORS allow-list', () => {
  const evil = 'https://evil.example';
  const flutterWebDev = 'http://localhost:5173';

  test('an allowed origin gets its own origin back, with Vary: Origin and the session header exposed', async ({ request }) => {
    const res = await request.get('/api/v1/config', { headers: { Origin: flutterWebDev } });
    const h = res.headers();
    expect(h['access-control-allow-origin']).toBe(flutterWebDev);
    expect(h['access-control-allow-origin']).not.toBe('*');
    expect(h['vary']).toContain('Origin');
    expect(h['access-control-expose-headers']).toContain('X-Sahel-Session');
    expect(h['access-control-allow-credentials']).toBeUndefined();
  });

  test('a disallowed origin gets no CORS headers (the browser blocks the read)', async ({ request }) => {
    const res = await request.get('/api/v1/config', { headers: { Origin: evil } });
    expect(res.status()).toBe(200);
    expect(res.headers()['access-control-allow-origin']).toBeUndefined();
    expect(res.headers()['vary']).toContain('Origin');
  });

  test('no Origin (the Flutter mobile app, curl) is unaffected', async ({ request }) => {
    const res = await request.get('/api/v1/config', { headers: { 'X-Sahel-Session': 'new' } });
    expect(res.status()).toBe(200);
    expect(res.headers()['access-control-allow-origin']).toBeUndefined();
  });

  test('preflight: allowed origin lists methods and X-Sahel-Session; disallowed origin gets 403', async ({ request }) => {
    const ok = await request.fetch('/api/v1/me/notification-preferences', {
      method: 'OPTIONS',
      headers: { Origin: flutterWebDev, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type,x-sahel-session' },
    });
    expect(ok.status()).toBe(204);
    expect(ok.headers()['access-control-allow-origin']).toBe(flutterWebDev);
    expect(ok.headers()['access-control-allow-methods']).toMatch(/\bPUT\b.*\bDELETE\b/);
    expect(ok.headers()['access-control-allow-headers']).toContain('X-Sahel-Session');
    expect(ok.headers()['access-control-allow-headers']).toContain('Idempotency-Key');
    expect(ok.headers()['vary']).toContain('Origin');

    const denied = await request.fetch('/api/v1/me/notification-preferences', { method: 'OPTIONS', headers: { Origin: evil, 'Access-Control-Request-Method': 'PUT' } });
    expect(denied.status()).toBe(403);
    expect(denied.headers()['access-control-allow-origin']).toBeUndefined();
    expect((await denied.json()).error.code).toBe('ORIGIN_NOT_ALLOWED');
  });
});

test.describe('cross-site POST guard', () => {
  const evil = 'https://evil.example';

  async function withSession(playwright: { request: { newContext: (o: { baseURL?: string }) => Promise<APIRequestContext> } }, baseURL: string | undefined) {
    const ctx = await playwright.request.newContext({ baseURL });
    // Starts the cookie session.
    const me = await ctx.get('/api/v1/me/notifications');
    expect(me.headers()['set-cookie'] ?? (await ctx.storageState()).cookies.map((c) => c.name).join()).toContain('sahel_session');
    const unread = async () => ((await (await ctx.get('/api/v1/me/notifications')).json()).data.unreadCount as number);
    return { ctx, unread };
  }

  test('a cookie-authenticated write from a foreign Origin is refused (403) and changes nothing', async ({ playwright, baseURL }) => {
    const { ctx, unread } = await withSession(playwright, baseURL);
    try {
      const before = await unread();
      expect(before).toBeGreaterThan(0);
      const post = await ctx.post('/api/v1/me/notifications/read-all', { headers: { Origin: evil } });
      expect(post.status()).toBe(403);
      expect((await post.json()).error.code).toBe('CROSS_SITE_REQUEST');
      expect(post.headers()['access-control-allow-origin']).toBeUndefined();
      expect(await unread()).toBe(before);

      for (const method of ['PUT', 'PATCH', 'DELETE'] as const) {
        const res = await ctx.fetch('/api/v1/me/notification-preferences', { method, headers: { Origin: evil }, data: {} });
        expect(res.status(), method).toBe(403);
      }
      // No Origin, but the browser says the request is cross-site (Fetch Metadata).
      expect((await ctx.post('/api/v1/me/notifications/read-all', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status()).toBe(403);
      // The opaque origin of sandboxed iframes and some redirects.
      expect((await ctx.post('/api/v1/me/notifications/read-all', { headers: { Origin: 'null' } })).status()).toBe(403);
      expect(await unread()).toBe(before);
    } finally {
      await ctx.dispose();
    }
  });

  test('a staff cookie is guarded the same way', async ({ request }) => {
    const res = await request.post('/api/v1/backoffice/session', { headers: { Origin: evil, Cookie: 'sahel_staff=operations' }, data: { role: 'operations' } });
    expect(res.status()).toBe(403);
  });

  test('same-origin requests (browser), allow-listed origins and clients without an Origin pass', async ({ playwright, baseURL, page }) => {
    const { ctx, unread } = await withSession(playwright, baseURL);
    try {
      const before = await unread();
      expect(before).toBeGreaterThan(0);
      expect((await ctx.post('/api/v1/me/notifications/read-all', { headers: { Origin: new URL(baseURL!).origin, 'Sec-Fetch-Site': 'same-origin' } })).status()).toBe(200);
      expect(await unread()).toBe(0);
      // No Origin and no Fetch Metadata: a non-browser client such as curl.
      expect((await ctx.post('/api/v1/me/notifications/read-all')).status()).toBe(200);
      // An allow-listed origin (Flutter web dev build) may write.
      expect((await ctx.post('/api/v1/me/notifications/read-all', { headers: { Origin: 'http://localhost:5173' } })).status()).toBe(200);
    } finally {
      await ctx.dispose();
    }
    // The real browser flow still works: the assistant posts same-origin with the session cookie.
    await page.goto('/en');
    const status = await page.evaluate(async () => (await fetch('/api/v1/me/notifications/read-all', { method: 'POST' })).status);
    expect(status).toBe(200);
  });

  test('mobile requests (X-Sahel-Session header) and requests without a cookie are exempt', async ({ playwright, baseURL }) => {
    const ctx = await playwright.request.newContext({ baseURL });
    try {
      // The Flutter app: no cookie, the session travels in the header.
      const start = await ctx.get('/api/v1/me', { headers: { 'X-Sahel-Session': 'new' } });
      const id = start.headers()['x-sahel-session'];
      expect(id).toBeTruthy();
      const post = await ctx.post('/api/v1/me/notifications/read-all', { headers: { 'X-Sahel-Session': id, Origin: evil } });
      expect(post.status()).toBe(200);
      // Even when a cookie rides along, the header session wins and is what the request acts on.
      const both = await ctx.post('/api/v1/me/notifications/read-all', { headers: { 'X-Sahel-Session': id, Origin: evil, Cookie: 'sahel_session=whatever' } });
      expect(both.status()).toBe(200);
    } finally {
      await ctx.dispose();
    }
    const cookieless = await playwright.request.newContext({ baseURL });
    try {
      const res = await cookieless.post('/api/v1/me/notifications/read-all', { headers: { Origin: evil } });
      expect(res.status()).toBe(200);
    } finally {
      await cookieless.dispose();
    }
  });
});
