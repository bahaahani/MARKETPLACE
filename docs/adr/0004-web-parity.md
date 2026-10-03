# ADR-0004: Web parity — Flutter for mobile, Next.js for web, one shared API

- **Status:** Accepted (2026-10-03). Revised the same day: the web is **Next.js**.
- **Deciders:** BCFC management

## Context
Management requires that anything built for the mobile app is also available on the web. Management also decided that **the web will be built with Next.js**, and the mobile app with **Flutter**.

## Decision
1. **Web parity is mandatory.** A feature is done only when it works on iOS, Android, Huawei (Flutter) **and** the web (Next.js).
2. **Two UIs, one brain.** Everything that must match lives in shared sources, not duplicated in each app:
   | Shared source | Used by web | Used by mobile |
   |---|---|---|
   | `packages/domain` (TypeScript): pricing engine (conventional / Murabaha / Ijara), affordability, catalog, search, payments state machine | Imported directly | Through the API |
   | **API v1** (`api/openapi.yaml`, served from `apps/web/app/api/v1` for now) | Yes | Yes |
   | `packages/i18n` (en/ar strings) | Imported directly | Generated into ARB files (`npm run gen`) |
   | `packages/design-tokens` | Generated into CSS | Generated into Dart |
3. Business logic (rates, eligibility, money math) is **never** written in Dart. Flutter renders what the API returns.
4. **Parity is tested:** the web E2E tests check that the web calculator equals the API, and the Flutter tests use recorded API responses plus a money-formatting fixture generated from the TypeScript formatter.

## Consequences
- ✅ Numbers, text, and colors cannot drift between channels.
- ✅ Next.js gives SEO (server-rendered listings, schema.org data) and fast web releases.
- ⚠️ Two UI codebases, so each feature is built twice at the UI layer. The definition of done includes both.
- ⚠️ Mobile-only capabilities (NFC, wallet push provisioning, biometrics) still need web equivalents. See [12-web-platform.md](../12-web-platform.md).
