# ADR-0004: Web parity — every feature ships on web and mobile

- **Status:** Accepted (2026-10-03)
- **Deciders:** BCFC management

## Context
Management requires that anything built for the mobile app is also available on the web. Customers must be able to do everything in a browser that they can do in the Sahel app.

## Decision
1. **Web parity is mandatory.** A feature is done only when it works on iOS, Android, Huawei, and Web.
2. **One Flutter codebase** for the customer app across mobile and web. We don't build features twice.
3. **Next.js** only for public, SEO-indexed pages (listings, products, calculators), which hand off to the Flutter web app for logged-in actions.
4. Mobile-only capabilities (NFC, wallet push provisioning, biometrics, push notifications) must have a defined **web equivalent** (passkeys, upload + web liveness, QR handoff, Web Push). See [12-web-platform.md](../12-web-platform.md).

## Consequences
- ✅ Parity by construction; one team per vertical delivers to every platform.
- ✅ The web can release daily, so fixes reach users faster.
- ⚠️ Flutter Web bundle size and first-load time need active management (WebAssembly, deferred loading, performance budgets).
- ⚠️ Web security differs from mobile (cookies, CSP, bots). The BFF pattern is mandatory; no tokens in browser storage.
- ⚠️ QA effort grows: Playwright web tests are added to every feature's definition of done.
- ➡️ The Sahel tech audit (N1) must also cover whether a Sahel web channel exists today.
