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

## 2. Technology: one codebase, plus an SEO layer

| Layer | Technology | Why |
|---|---|---|
| **Customer app (mobile + web)** | **Flutter, one codebase** for iOS, Android, Huawei, and Web | Parity happens automatically. Each feature is written once and tested on all four targets |
| **Public SEO pages** (listings, products, offers, blog) | **Next.js** (server-rendered), sharing the design tokens with Flutter | Flutter Web isn't crawlable enough for Google. These pages hand off to the Flutter web app for "Apply / Reserve / Log in" |
| Dealer portal and back-office | Flutter Web | Reuses the `bcfc_ui` design system and the API clients |

The alternative was a separate web app (e.g., React for everything). That means **building every feature twice** with two teams, and parity drifts. Rejected for the logged-in app.

### Flutter Web specifics
- Build with **WebAssembly (`--wasm`)** for performance, and fall back to JavaScript for older browsers.
- **Deferred loading** per vertical (`deferred as`), so the first load stays small. Target: first meaningful paint < 3 s on 4G.
- **Path URLs** (no `#`) and deep links that match mobile routes in `go_router`, so the same link opens the app on a phone or the website on a desktop.
- Arabic right-to-left and Arabic web fonts preloaded.
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
| Secure token storage (Keychain/Keystore) | **No tokens in localStorage.** Use the **backend-for-frontend (BFF) pattern with HttpOnly, Secure, SameSite cookies** |
| Apple Pay / Google Pay | Apple Pay on Safari, Google Pay on Chrome (Tap Web SDK) |
| BenefitPay | **Tap BenefitPay Web SDK** (QR code to scan with the BenefitPay app) |
| Add card to Apple/Google Wallet (push provisioning) | Not possible on the web. Show "**Add to wallet on your phone**" with a QR code or push to the app; the card details view is secured with step-up auth |
| AR showroom | `<model-viewer>` 3D on desktop; AR via WebXR / Quick Look on supported phones |
| Root/jailbreak detection, RASP | Bot protection, device fingerprinting, CSP, Subresource Integrity, anti-clickjacking |
| Screenshot blocking | Not possible. Mask sensitive data by default (tap to reveal) |
| Home-screen widgets / Siri shortcuts | Installable **PWA** (manifest, icons, offline shell) |

## 4. Web security (in addition to [07-security-compliance.md](07-security-compliance.md))

- Strict **Content Security Policy**, HSTS (preload), `X-Frame-Options: DENY` / `frame-ancestors 'none'`
- HttpOnly session cookies, CSRF protection, short sessions with idle timeout (e.g., 5 minutes on money screens)
- Payment pages: card fields are hosted by Tap (iframe / Tap Card SDK). **Card data never touches our web origin**, which keeps PCI scope minimal
- Bot defense on sign-up, login, and pre-approval (AWS WAF Bot Control + CAPTCHA fallback)
- Penetration tests cover web **and** mobile every release cycle
- Cookie consent banner and PDPL-compliant analytics

## 5. Hosting on AWS

```
Route 53 ─► CloudFront (+ WAF) ─┬─► S3: Flutter web build (static, versioned)
                                ├─► Next.js SSR (Amplify Hosting, or Lambda@Edge / ECS)
                                └─► /api/* ─► Web BFF (session cookies) ─► platform services
```

- Domains (until decided): `sahel.bcfc.bh` (app), `www` / `marketplace.bcfc.bh` (SEO pages), `dealers.bcfc.bh`, `api.sahel.bcfc.bh`
- Blue/green deploys with instant rollback (switch the CloudFront origin)
- The web can ship **daily**, faster than app-store releases. Feature flags keep web and mobile functionally in sync

## 6. Definition of Done (every feature)

- [ ] Works on iOS, Android, Huawei, **and Web** (Chrome, Safari, Edge, Firefox; desktop and mobile browsers)
- [ ] Responsive layouts reviewed at 360 px, 768 px, 1280 px, and 1920 px
- [ ] Arabic right-to-left and English verified on every platform
- [ ] Web equivalent defined for any mobile-only capability (table above)
- [ ] Automated tests: Flutter `integration_test` on mobile + **Playwright** end-to-end on web
- [ ] Accessibility: WCAG 2.1 AA (keyboard navigation and screen readers on the web)
- [ ] SEO pages (if any) are server-rendered, have metadata and structured data (schema.org `Car`, `Offer`, `RealEstateListing`), and are in the sitemap
- [ ] Analytics events are the same on web and mobile
