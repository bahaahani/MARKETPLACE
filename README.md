# Sahel 2.0 (BCFC Marketplace)

> **Status:** Prototype. Planning docs plus a working first slice in code: cars, property, cards, insurance, finance and payments (sandbox)
> **Owner:** Bahrain Commercial Facilities Company (BCFC)
> **Platforms:** Flutter mobile (iOS, Android, Huawei) and Next.js web, at **full parity**
> **Payments:** Tap Payments (cards, Click to Pay, Apple Pay, Google Pay, Samsung Pay, BenefitPay) + BENEFIT rails (sandbox for now)

One app that turns big life purchases into a single flow: **find it, finance it, insure it, pay for it, and manage it**, in Arabic and English, with Islamic and conventional options shown side by side.

## Run it

Requirements: Node 22+, Flutter 3.35+ (stable).

```sh
npm install
npm run gen          # regenerate ARB / CSS / Dart from packages/i18n and packages/design-tokens
npm run dev:web      # Next.js web + API v1 on http://localhost:3000  (→ /en or /ar)

cd apps/mobile
flutter pub get
flutter run          # talks to the API above (Android emulator uses 10.0.2.2:3000 automatically)
# flutter run --dart-define=API_BASE_URL=https://<host>   to point at another API
```

## Test it

```sh
npm test -w @sahel/domain                    # pricing engine and rules (Vitest)
npm run build:web && npm run test:e2e -w @sahel/web   # Playwright, desktop + mobile web, EN + AR
cd apps/mobile && flutter analyze && flutter test    # widget + API-contract tests
```

## How the code is organized

| Path | What it is |
|---|---|
| `packages/domain` | **The brain** (TypeScript): conventional / Murabaha / Ijara pricing, APR, affordability (DBR) and pre-approval, catalog and search, insurance comparison, payment state machine. Money is always integer **fils** |
| `api/openapi.yaml` | **API v1 contract**, used by both apps |
| `apps/web` | **Next.js** web app. Its `app/api/v1` route handlers *are* the API for now (the Flutter app calls them too) |
| `apps/mobile` | **Flutter** app (Riverpod, go_router). Renders what the API returns, with no business logic in Dart |
| `packages/i18n` | Arabic + English strings for **both** apps (generated into Flutter ARB files) |
| `packages/design-tokens` | Colors, radius, and spacing for **both** apps (generated into CSS and Dart) |
| `tools/gen.mjs` | The generator that keeps the two apps in sync |

**Parity is tested:** Playwright checks that the web calculator equals the API, and the Flutter tests use recorded API responses plus a money-formatting fixture generated from the TypeScript formatter. See [ADR-0004](docs/adr/0004-web-parity.md).

⚠️ All rates, prices, insurers, and customer data are **illustrative demo data**. Insurer names are fictional. Real values come from BCFC Risk/Treasury, the Shari'a board, and partner integrations.

## Planning documents (read in order)

| # | Document | What it answers |
|---|---|---|
| 00 | [Vision & North Star](docs/00-vision.md) | Why we're building this and what "crazy" means for us |
| 01 | [Market Research](docs/01-market-research.md) | The Bahrain landscape, BCFC group, competitors, regulators |
| 02 | [Product Verticals](docs/02-product-verticals.md) | Features for each vertical, with Islamic and conventional variants |
| 03 | [Crazy Ideas Backlog](docs/03-crazy-ideas.md) | Big ideas, scored and ranked |
| 04 | [Integrations Map](docs/04-integrations.md) | Every external party we connect to, and how |
| 05 | [Payments](docs/05-payments.md) | Tap, BENEFIT, recurring installments, refunds, reconciliation |
| 06 | [Architecture](docs/06-architecture.md) | Apps, backend, data, and APIs |
| 07 | [Security & Compliance](docs/07-security-compliance.md) | CBB rules, PDPL, PCI DSS, Shari'a governance |
| 08 | [User Journeys](docs/08-user-journeys.md) | End-to-end flows for the main journeys |
| 09 | [Roadmap](docs/09-roadmap.md) | Phases, MVP scope, and milestones |
| 10 | [Team, Repo & DevOps](docs/10-team-repo-devops.md) | Repository layout, CI, environments, team |
| 11 | [Open Questions & Decisions](docs/11-open-questions.md) | What is still undecided |
| 12 | [Web Platform](docs/12-web-platform.md) | Web parity in practice |

**Decided so far** ([ADRs](docs/adr/README.md)): Sahel 2.0, GitHub for now, AWS hosting, web parity (Next.js web + Flutter mobile + shared API).

Anything marked **⚠️ VERIFY** in the docs is an assumption that must be confirmed with a partner, the regulator, or BCFC internal teams.
