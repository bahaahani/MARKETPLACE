# 12 — Web Platform (Web Parity)

> **Rule ([ADR-0004](adr/0004-web-parity.md)):** every feature built for mobile is also built for the web. A feature is not "done" until it works on **iOS, Android, Huawei, and Web**.

## 1. What "web parity" means

| In scope on the web | Notes |
|---|---|
| Full customer app (Sahel 2.0 Web) | Log in, pre-approval, browse, apply, sign, pay, manage, and claim. **Everything** the app does |
| Public marketplace pages | Car and property listings, product pages, calculators. Must be **indexable by Google (SEO)** |
| Dealer & broker portal | Web-first (desktop in showrooms and offices) |
| Back-office console | Web only |

**Parity means the same capability, not the same pixels.** The web uses responsive layouts: phone, tablet, and desktop (wide screens get multi-column layouts, side-by-side comparisons, and bigger galleries).

## 2. Technology: Next.js web + Flutter mobile + shared core

| Layer | Technology |
|---|---|
| **Web** (the full customer app, public SEO pages, and later the dealer portal and back-office) | **Next.js** (App Router, React Server Components, Tailwind) in `apps/web` |
| **Mobile** (iOS, Android, Huawei) | **Flutter** in `apps/mobile` |
| **Shared core** | `packages/domain` (pricing and rules), `packages/i18n` (strings), `packages/design-tokens`, and **API v1** (`api/openapi.yaml`) |

How parity is guaranteed: see [ADR-0004](adr/0004-web-parity.md).

### What runs today (prototype)

| Piece | Today | ⚠️ Sandbox gap |
|---|---|---|
| Pages | `apps/web/app/[locale]/*`: server-rendered pages that import `packages/domain` directly, plus client components (`apps/web/components`) that call API v1 for anything interactive (quotes, applications, payments, policies) | – |
| **API v1** | Next.js route handlers in `apps/web/app/api/v1/*`, contract in `api/openapi.yaml`. The **Flutter app calls the same handlers** (`API_BASE_URL`, default `localhost:3000`, `10.0.2.2:3000` on the Android emulator) | CORS allows an origin list (`SAHEL_ALLOWED_ORIGINS`, default: localhost on any port) instead of `*`; see [Web platform hardening](#web-platform-hardening-seo-headers-cors-csrf) |
| Customer session | **Web:** opaque random id in the `sahel_session` cookie (HttpOnly, SameSite=Lax, Secure on HTTPS); page scripts never see it. **Mobile:** `X-Sahel-Session` header; the app sends `new` until the API returns an id, then sends that id. Code: `apps/web/lib/session.ts` | Stand-in for eKey / OIDC login; sessions are in memory on the server |
| Product rules for Flutter | **`GET /api/v1/config`** returns calculator ranges, steps and defaults, the customer's personal finance range, consent scopes and validity, insurance form limits, and the reservation deposit. The web imports the same values from `packages/domain` | The property valuation fee is still hard-coded in both apps |
| Dealer portal | `/[locale]/dealer/*` pages and `/api/v1/dealer/*` | No staff login: the URL picks the dealership |
| Security headers | Enforced CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, COOP, `Permissions-Policy` on pages; locked-down CSP and `private, no-store` on personal API responses (`next.config.ts`). CORS allow-list and the cross-site POST guard in `apps/web/proxy.ts` | CSP still allows inline scripts (no nonces); no CSRF tokens, rate limiting, or bot defense yet (see section 4) |
| SEO | English and Arabic metadata on every public page (title, description, canonical, hreflang en / ar / x-default, Open Graph, Twitter), schema.org JSON-LD (`Car`, `RealEstateListing` + `Offer`, `CreditCard` / `FinancialProduct`, `Organization` + `WebSite`, `BreadcrumbList`), `sitemap.xml`, `robots.txt`, web app manifest and icons, `noindex` on private pages | Demo catalog and a `localhost` origin until a real domain is set (`SAHEL_PUBLIC_ORIGIN`); the share image is the brand mark, not per listing |
| Tests | Playwright in `apps/web/e2e`, desktop Chrome and Pixel 7 viewports, EN and AR (`seo-security.spec.ts` covers metadata, JSON-LD, sitemap, robots, headers, CSP, CORS and the cross-site guard); Vitest for the pure helpers in `apps/web/lib/*.test.ts` (`npm test -w @sahel/web`) | – |

### Next.js specifics
- **Locale in the URL** (`/en/...`, `/ar/...`), with `<html dir="rtl">` for Arabic and logical CSS properties (`ms-`, `me-`, `text-start`) so layouts mirror automatically.
- Listings and product pages are **server-rendered / statically generated**, carry schema.org JSON-LD, and work without JavaScript (filters are plain GET forms).
- Personalized pages (home, account, cards, insurance hub) render per request. Car and property detail pages and the life-events hub are statically generated (`generateStaticParams`). The cars and property lists read `searchParams` (the filters), so they render per request too.
- **Same paths as the mobile routes** (e.g., `/cars/{id}`, `/checkout?purpose=&amount=&reference=`), so a shared link can open the right screen on either channel (the app opens these URLs through verified App Links on Android and universal links on iOS, plus the `sahel://` scheme; see [15-mobile-release.md](15-mobile-release.md#4-deep-links)). Domain verification files are in `apps/web/public/.well-known/` (placeholders until the real domain, Team ID and signing fingerprints are known).
- Supported browsers: latest 2 versions of Chrome, Safari (macOS and iOS), Edge, Firefox, and Samsung Internet.

## 3. Mobile-only capabilities and their web equivalents

Some phone features don't exist in browsers. Each one needs a web equivalent, so a customer on the web is never blocked.

| Mobile capability | Web equivalent |
|---|---|
| Biometric login (Face ID / fingerprint) | **Passkeys (WebAuthn)**. Works with Windows Hello, Touch ID, and phone-as-key |
| Device binding | Trusted-browser registration + passkey; step-up OTP on new browsers |
| eKey 2.0 login | OIDC redirect (works in the browser) or **QR code: scan with the eKey app on your phone** ⚠️ VERIFY the iGA web flow |
| CPR NFC chip reading | Upload a photo of the CPR card + **web liveness check** (e-KYC vendor web SDK) |
| Camera (documents, damage photos) | Browser camera (`getUserMedia`) or file upload |
| Push notifications | **Web Push** (with permission) + email / WhatsApp / SMS |
| Secure token storage (Keychain/Keystore) | **No tokens in localStorage.** Use the **backend-for-frontend (BFF) pattern with HttpOnly, Secure, SameSite cookies**. The sandbox session already follows this (HttpOnly cookie); the mobile app keeps its session id in Keychain / Keystore (`flutter_secure_storage`), restored on launch and cleared on logout or 401; real login will replace the id with tokens in the same store |
| Apple Pay / Google Pay | Apple Pay on Safari, Google Pay on Chrome (Tap Web SDK) |
| BenefitPay | **Tap BenefitPay Web SDK** (QR code to scan with the BenefitPay app) |
| Add card to Apple/Google Wallet (push provisioning) | Not possible on the web. Show "**Add to wallet on your phone**" with a QR code or push to the app; the card details view is secured with step-up auth |
| AR showroom | `<model-viewer>` 3D on desktop; AR via WebXR / Quick Look on supported phones |
| Root/jailbreak detection, RASP | Bot protection, device fingerprinting, CSP, Subresource Integrity, anti-clickjacking |
| Screenshot blocking | Not possible. Mask sensitive data by default (tap to reveal) |
| Home-screen widgets / Siri shortcuts | Installable **PWA** (Next.js manifest, icons, offline shell) |

## 4. Web security (in addition to [07-security-compliance.md](07-security-compliance.md))

- Strict **Content Security Policy**, HSTS (preload), `X-Frame-Options: DENY` / `frame-ancestors 'none'` (prototype: enforced CSP and HSTS without preload, see [Web platform hardening](#web-platform-hardening-seo-headers-cors-csrf))
- HttpOnly session cookies, CSRF protection (prototype: SameSite cookies plus the Origin / Fetch Metadata guard), short sessions with idle timeout (e.g., 5 minutes on money screens)
- Payment pages: card fields are hosted by Tap (iframe / Tap Card SDK). **Card data never touches our web origin**, which keeps PCI scope minimal
- Bot defense on sign-up, login, and pre-approval (AWS WAF Bot Control + CAPTCHA fallback)
- Penetration tests cover web **and** mobile every release cycle
- Cookie consent banner and PDPL-compliant analytics

## Web platform hardening: SEO, headers, CORS, CSRF

What `apps/web` ships today, and the settings to change per environment. ⚠️ Sandbox: no production hostname is in the code; the origin comes from environment variables.

### Environment variables

| Variable | Default | What it does |
|---|---|---|
| `SAHEL_PUBLIC_ORIGIN` | `http://localhost:3000` | The origin the site is served from. Used for canonical URLs, hreflang, Open Graph and Twitter URLs, JSON-LD, `sitemap.xml` and `robots.txt`. **Read at build time** (public pages are statically generated), so set it for `next build`, not only for `next start`. A value that is not an `http(s)` origin falls back to the default |
| `SAHEL_ALLOWED_ORIGINS` | `http://localhost:*,http://127.0.0.1:*,http://[::1]:*` | Comma-separated browser origins that may call the API cross-origin (CORS) and that the cross-site POST guard accepts. Exact origins (`https://app.example`) or `scheme://host:*` for any port. The public origin is always included. Setting the variable replaces the localhost default, so an empty value allows no extra origin. A lone `*` is ignored on purpose. **Read at request time** (`apps/web/proxy.ts`). Set it explicitly in every shared environment |

The Flutter mobile app is not a browser: it sends no `Origin`, so CORS does not apply to it. Flutter **web** dev builds run on `localhost:<random port>` and are covered by the default.

### SEO

- `generateMetadata` on every public page goes through `pageMetadata()` (`apps/web/lib/seo.ts`), so the tags cannot drift apart: title, description (strings `seo*` in `packages/i18n`, English and Arabic), `canonical`, `alternates.languages` (`en`, `ar`, `x-default` = English), Open Graph (type, site name, locale `en_US` / `ar_BH` with the other as alternate, image) and a Twitter `summary_large_image` card. `metadataBase` in `app/[locale]/layout.tsx` makes the URLs absolute.
- Public pages: home, cars (list, detail), property (list, detail), cards, insurance hub and the four line pages (travel, home, medical, life), life-events hub. Filtered lists (`?q=`, `?condition=`) canonicalize to the unfiltered page.
- Structured data (`apps/web/lib/structured-data.ts`, rendered by `components/JsonLd.tsx`): `Car` + `Offer` on car pages, `RealEstateListing` with an `Offer` (sale, or rent with a monthly `UnitPriceSpecification`) on property pages, an `ItemList` of `CreditCard` (prepaid: `FinancialProduct`) on the cards page, `Organization` + `WebSite` (with a search action) on the home page, `BreadcrumbList` on detail pages. It holds catalog facts only: never a name, balance, pre-approval, or session id. All JSON-LD goes through `jsonLdString()` (`lib/json-ld.ts`), which escapes `<`, `>`, `&` and the JS line separators so a value cannot close the `<script>` element. Use `<JsonLd/>`, never `dangerouslySetInnerHTML` with a bare `JSON.stringify`.
- `app/sitemap.ts`: every public page in both locales with hreflang alternates. `app/robots.ts`: disallows `/api/` and the private areas (`account`, `applications`, `backoffice`, `dealer`, `claims`, `checkout`, `requests`, `notifications`, `rewards`, `onboarding`, `trade-in`, `finance`, card applications, life-event bundles) and points to the sitemap. Keep the two files in step when adding a page.
- Private areas are `noindex, nofollow` three ways: `robots` metadata (a `layout.tsx` per area exporting `privateMetadata`), the `X-Robots-Tag` header, and `robots.txt`.
- `app/manifest.ts` (name Sahel, theme colour from the design tokens), `public/icon.svg`, PNG icons from the brand "S" mark (`app/icons/[size]`: 180, 192, 512, maskable 512) and the share image (`app/og/[locale]`) are generated at build time. The share image has no text beyond the brand name because the default image font has no Arabic glyphs.

### Security headers (pages and API)

Static headers are in `apps/web/next.config.ts`; the ones that depend on the request (CORS, cross-site guard) are in `apps/web/proxy.ts` (Next 16 renamed `middleware.ts` to `proxy.ts`).

| Header | Value | Notes |
|---|---|---|
| `Content-Security-Policy` (pages) | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` | **Enforced**, not report-only. Development adds `'unsafe-eval'` and websockets for React refresh. Tap's hosted card fields will need `frame-src` / `script-src` entries when the real gateway is wired in |
| `Content-Security-Policy` (`/api/*`) | `default-src 'none'; frame-ancestors 'none'` | JSON only |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Browsers ignore it over plain HTTP, so it does nothing on `localhost`. No `preload` yet: add it only once every subdomain is HTTPS-only. The TLS terminator (CloudFront) should send it too |
| `X-Frame-Options` | `DENY` | Legacy twin of `frame-ancestors 'none'` |
| `X-Content-Type-Options` | `nosniff` | |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | |
| `Cross-Origin-Opener-Policy` | `same-origin` | No COEP: it would block the Google Fonts stylesheet |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(self), payment=(self), usb=(), serial=()` | Geolocation is used by the claim form ("use my location"); photos use a file input, not `getUserMedia`, so camera and microphone stay off |
| `Cache-Control: private, no-store` | every `/api/v1/*` response except the shared catalogue (`config`, `vehicles`, `properties`), and the pages for account, applications, back office, dealer, claims, checkout, requests, notifications, onboarding, rewards, trade-in and personal finance | Public static pages keep Next's `s-maxage=31536000` |
| `X-Robots-Tag: noindex, nofollow` | the same private pages | |

**CSP trade-off (decided).** Scripts allow `'unsafe-inline'` because Next.js emits inline bootstrap scripts. Nonces would remove it, but they are generated per request, which turns every page dynamic and gives up the statically generated detail pages. The policy still blocks third-party scripts, `eval`, plugins, base-tag and form-target hijacking, and framing. Revisit when pages are served through a layer that can inject nonces without losing caching, or when Next supports hash-based CSP for the bundler in use. Styles allow `'unsafe-inline'` for React `style` attributes and Next's inline CSS.

**Deployment headers.** Behind CloudFront or a load balancer, make sure the edge does not strip or override the headers above, forwards `Origin`, `Cookie`, `Host` (or `X-Forwarded-Host`) and `X-Forwarded-Proto` to the origin, and does not serve a cached `/api/*` response across origins (those carry `Vary: Origin`) or any `private, no-store` response from a shared cache. Also add `Strict-Transport-Security` at the edge so non-Next responses (error pages, redirects) carry it. Set `SAHEL_PUBLIC_ORIGIN` at build time and `SAHEL_ALLOWED_ORIGINS` at runtime for each environment.

### CORS

`proxy.ts` replaces the old `Access-Control-Allow-Origin: *`: an `Origin` on the allow-list is echoed back (never `*`), `Vary: Origin` is always set, and `X-Sahel-Session` is allowed (`Allow-Headers`, with `Content-Type`, `Idempotency-Key` and `Authorization`) and exposed (`Expose-Headers`). A preflight from an origin that is not allowed gets `403` (`ORIGIN_NOT_ALLOWED`); a simple request from one gets no CORS headers, so the browser blocks the read. Credentials are not allowed cross-origin (`Access-Control-Allow-Credentials` is never sent): the app authenticates with the `X-Sahel-Session` header, not cookies.

### Cross-site POST guard (CSRF)

The customer cookie is `HttpOnly; SameSite=Lax` and the staff cookie `SameSite=Strict`. On top of that, `proxy.ts` applies `crossSiteDecision()` (`apps/web/lib/csrf.ts`) to every `/api/v1` request: a POST, PUT, PATCH or DELETE that carries a cookie is refused with `403 CROSS_SITE_REQUEST` unless its `Origin` is this host or on the allow-list (with no `Origin`, `Sec-Fetch-Site` must not be `same-site` or `cross-site`; the opaque `null` origin is refused). Exempt: safe methods, requests with no cookie, and requests with `X-Sahel-Session` (mobile; the header wins over any cookie) or `X-Sahel-Staff-Role`, which a browser cannot add cross-site without a CORS preflight. Production should add a CSRF token or double-submit cookie once real login exists, because the guard trusts the browser to send `Origin`.

### Performance hygiene and budget

- Fonts: Google Fonts with `display=swap` and `preconnect` for both hosts (`app/[locale]/layout.tsx`). There are no raster images yet (listing art is generated), so `next/image` is not used.
- Statically generated: car and property detail pages (both locales), the life-events hub, the dealer and onboarding landing pages, `sitemap.xml`, `robots.txt`, the manifest, icons and share images. Rendered per request: home, the cars and property lists (filters), cards, the insurance pages, and every page that reads the session.
- Measured with `next build` (first-load JavaScript per route, from `.next/diagnostics/route-bundle-stats.json`; no network needed. Lighthouse needs a browser run against a deployed build and is not part of CI):

| Route | JS uncompressed | JS gzip |
|---|---|---|
| Shared base (home, lists, cards, hubs) | 606 KB | 182 KB |
| Car detail | 631 KB | 190 KB |
| Property detail | 613 KB | 185 KB |
| Account (largest) | 632 KB | 192 KB |
| Not found | 444 KB | 131 KB |

- **Budget:** first-load JS per route at most **700 KB uncompressed / 215 KB gzip** for customer pages (about 10% over today's largest) and at most **200 KB gzip** for the public listing and detail pages. Check it after a dependency or layout change with the table above; CI does not enforce it yet. The shared base is React, Next and the layout (header, assistant launcher), so a new page should add only its own client components.

### Remaining gaps

- CSP: inline scripts allowed (no nonces); no `report-to` endpoint to collect violations; Tap's hosted fields not yet allowed.
- CSRF: Origin / Fetch Metadata guard only, no tokens; no rate limiting or bot defense on the API.
- SEO: one share image for all pages; no `lastmod` in the sitemap (the demo catalog has no dates); the organization's logo and `sameAs` need the real brand assets; life-event bundle pages are `noindex` because they are priced for the session customer.
- Edge headers (CloudFront response headers policy, WAF) are described, not configured: no deployment code exists yet.
- CI reports `npm audit` and `flutter pub outdated` without failing the build; promote them to gates when the baseline is clean.

## 5. Hosting on AWS

```
Route 53 ─► CloudFront (+ WAF) ─┬─► Next.js (SSR + static assets)
                                └─► /api/* ─► Web BFF (session cookies) ─► platform services
```

Today `/api/v1/*` is served by the same Next.js app (route handlers) for both the web and the Flutter app; it splits into a BFF and platform services when the backend grows.

- Domains (until decided): `sahel.bcfc.bh` (app), `www` / `marketplace.bcfc.bh` (SEO pages), `dealers.bcfc.bh`, `api.sahel.bcfc.bh`
- Blue/green deploys with instant rollback (switch the CloudFront origin)
- The web can ship **daily**, faster than app-store releases. Feature flags keep web and mobile functionally in sync

## 6. Definition of Done (every feature)

- [ ] Works on iOS, Android, Huawei, **and Web** (Chrome, Safari, Edge, Firefox; desktop and mobile browsers)
- [ ] Responsive layouts reviewed at 360 px, 768 px, 1280 px, and 1920 px
- [ ] Arabic right-to-left and English verified on every platform
- [ ] Web equivalent defined for any mobile-only capability (table above)
- [ ] Automated tests: Flutter widget/integration tests on mobile + **Playwright** end-to-end on web (desktop and mobile viewports)
- [ ] Business logic lives in `packages/domain` / the API, never only in one app
- [ ] Accessibility: WCAG 2.1 AA (keyboard navigation and screen readers on the web)
- [ ] SEO pages (if any) are server-rendered, have metadata and structured data (schema.org `Car`, `Offer`, `RealEstateListing`), and are in the sitemap (`apps/web/app/sitemap.ts`); private pages are `noindex` and disallowed in `robots.ts`
- [ ] Analytics events are the same on web and mobile
