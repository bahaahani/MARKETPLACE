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
| **API v1** | Next.js route handlers in `apps/web/app/api/v1/*`, contract in `api/openapi.yaml`. The **Flutter app calls the same handlers** (`API_BASE_URL`, default `localhost:3000`, `10.0.2.2:3000` on the Android emulator) | CORS is open (`*`) for the app and dev builds |
| Customer session | **Web:** opaque random id in the `sahel_session` cookie (HttpOnly, SameSite=Lax, Secure on HTTPS); page scripts never see it. **Mobile:** `X-Sahel-Session` header; the app sends `new` until the API returns an id, then sends that id. Code: `apps/web/lib/session.ts` | Stand-in for eKey / OIDC login; sessions are in memory |
| Product rules for Flutter | **`GET /api/v1/config`** returns calculator ranges, steps and defaults, the customer's personal finance range, consent scopes and validity, insurance form limits, and the reservation deposit. The web imports the same values from `packages/domain` | The property valuation fee is still hard-coded in both apps |
| Dealer portal | `/[locale]/dealer/*` pages and `/api/v1/dealer/*` | No staff login: the URL picks the dealership |
| Security headers | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` (`next.config.ts`) | No CSP, HSTS, CSRF tokens, rate limiting, or bot defense yet (see section 4) |
| SEO | Per-page metadata; schema.org JSON-LD on car detail pages | No sitemap, no `RealEstateListing` / `Offer` markup yet |
| Tests | Playwright in `apps/web/e2e`, desktop Chrome and Pixel 7 viewports, EN and AR | – |

### Next.js specifics
- **Locale in the URL** (`/en/...`, `/ar/...`), with `<html dir="rtl">` for Arabic and logical CSS properties (`ms-`, `me-`, `text-start`) so layouts mirror automatically.
- Listings and product pages are **server-rendered / statically generated**, carry schema.org JSON-LD, and work without JavaScript (filters are plain GET forms).
- Personalized pages (home, account) render per request.
- **Same paths as the mobile routes** (e.g., `/cars/{id}`, `/checkout?purpose=&amount=&reference=`), so a shared link can open the right screen on either channel (deep-link / universal-link setup on mobile is still to do).
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
| Secure token storage (Keychain/Keystore) | **No tokens in localStorage.** Use the **backend-for-frontend (BFF) pattern with HttpOnly, Secure, SameSite cookies**. The sandbox session already follows this (HttpOnly cookie); the mobile app keeps its session id in memory until real login brings secure storage |
| Apple Pay / Google Pay | Apple Pay on Safari, Google Pay on Chrome (Tap Web SDK) |
| BenefitPay | **Tap BenefitPay Web SDK** (QR code to scan with the BenefitPay app) |
| Add card to Apple/Google Wallet (push provisioning) | Not possible on the web. Show "**Add to wallet on your phone**" with a QR code or push to the app; the card details view is secured with step-up auth |
| AR showroom | `<model-viewer>` 3D on desktop; AR via WebXR / Quick Look on supported phones |
| Root/jailbreak detection, RASP | Bot protection, device fingerprinting, CSP, Subresource Integrity, anti-clickjacking |
| Screenshot blocking | Not possible. Mask sensitive data by default (tap to reveal) |
| Home-screen widgets / Siri shortcuts | Installable **PWA** (Next.js manifest, icons, offline shell) |

## 4. Web security (in addition to [07-security-compliance.md](07-security-compliance.md))

- Strict **Content Security Policy**, HSTS (preload), `X-Frame-Options: DENY` / `frame-ancestors 'none'`
- HttpOnly session cookies, CSRF protection, short sessions with idle timeout (e.g., 5 minutes on money screens)
- Payment pages: card fields are hosted by Tap (iframe / Tap Card SDK). **Card data never touches our web origin**, which keeps PCI scope minimal
- Bot defense on sign-up, login, and pre-approval (AWS WAF Bot Control + CAPTCHA fallback)
- Penetration tests cover web **and** mobile every release cycle
- Cookie consent banner and PDPL-compliant analytics

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
- [ ] SEO pages (if any) are server-rendered, have metadata and structured data (schema.org `Car`, `Offer`, `RealEstateListing`), and are in the sitemap
- [ ] Analytics events are the same on web and mobile
