# Sahel 2.0 (BCFC Marketplace)

> **Status:** Working **prototype**. Planning docs plus a sandbox slice in code: onboarding and pre-approval, cars, property, cards, finance applications, insurance, life-event bundles, early settlement, payments, and a dealer portal. **Not production**: see [Sandbox, not production](#️-sandbox-not-production) and [13-prototype-status.md](docs/13-prototype-status.md)
> **Owner:** Bahrain Commercial Facilities Company (BCFC)
> **Platforms:** Flutter mobile (iOS, Android, Huawei) and Next.js web, at **full parity**
> **Payments:** Tap Payments (cards, Click to Pay, Apple Pay, Google Pay, Samsung Pay, BenefitPay) + BENEFIT rails (simulated by a sandbox gateway today)

One app that turns big life purchases into a single flow: **find it, finance it, insure it, pay for it, and manage it**, in Arabic and English, with Islamic and conventional options shown side by side.

## What's built

Every customer feature works on **web and mobile**, in **English and Arabic (RTL)**, against the same API v1. Everything runs in a **sandbox**: no real login, no partner calls, data in memory. Full matrix: [docs/13-prototype-status.md](docs/13-prototype-status.md).

| Feature | Web | Mobile | Sandbox caveats |
|---|---|---|---|
| **Marketplace: cars and property** | ✅ Search, filters, detail pages with "from BHD X / month", Islamic vs conventional comparison | ✅ | Demo catalog |
| **Finance calculator** (conventional, Murabaha, Ijara) | ✅ | ✅ | Illustrative rates. Slider ranges, steps and defaults come from `GET /api/v1/config` |
| **Onboarding + pre-approval** (J1) | ✅ eKey step, consent, salary and obligations, pre-approval | ✅ | eKey simulated (any valid 9-digit CPR gives a fictional identity). Obligations are self-declared, no CRB / Open Banking call |
| **Instant IMTIAZ card** (J3) | ✅ Eligibility, decision, masked virtual card, **My cards** on the account page | ✅ | No issuer or processor. Card number is always masked. "Add to wallet" is simulated |
| **Apply for finance** (vehicle and personal; conventional and Murabaha) | ✅ Apply, decision (approve / refer / decline with reasons), accept, timeline | ✅ | Placeholder credit rules. Accepting e-signs and runs fulfilment to the end in one step. The Murabaha sequence (BCFC buys → owns → sells) is recorded in order |
| **Home finance** (J4; conventional and Ijara Muntahia Bittamleek) | ✅ Apply from a property for sale, decision, accept, timeline; conventional waits for the TRESCO valuation fee | ✅ | Price from the catalog. Ijara: BCFC buys → lease starts; ownership transfers after the final rental (a future step). No real valuation, purchase or registration |
| **Life-event bundles** (married, new baby, new job, ...) | ✅ Islamic / conventional bundle with budget check | ✅ | Placeholder amounts and premiums; some items are "coming soon" |
| **Early settlement + autopay** ("My installments") | ✅ Settlement quote (fee or Ibra'), pay through checkout, autopay toggle | ✅ | Placeholder fee (1%) and Ibra' rule. Paying the exact quoted amount closes the contract for that customer ("Settled on…") and takes its installment off the obligations used for pre-approval and decisions. Autopay is a stored flag only |
| **Insurance: motor, travel, home** + **My policies** | ✅ Compare (cheapest first, Takaful filter), hold a quote, pay, policy issued | ✅ | Fictional insurers, illustrative pricing. A policy is issued only for a captured payment that matches the held quote |
| **Checkout** (reservation deposit, valuation fee, premiums, settlement) | ✅ All Tap methods, sandbox confirm | ✅ | Sandbox gateway; no money moves. Deposits and valuation fees are priced by the server (`GET /api/v1/payments/price`); other amounts are refused |
| **Dealer & broker portal** (J7) | ✅ Inventory with monthly prices, leads board, showroom: redeem a customer's pre-approval code and build an offer | Customer side only (share pre-approval code from the account screen) | No staff login (anyone can act as any dealer). Offers are not pushed to the customer's app. Web-first by design (desktop in showrooms) |
| **Back-office console** (staff) | ✅ `/backoffice`: KPIs, credit officer review of referred applications, refunds of premiums that never became a policy, audit log | Customer side only ("Reviewed by credit officer" on the application) | No staff login (pick a role). Audit log in memory; refunds move no money. Web-only staff tool |
| **Instant trade-in → down payment** | ✅ `/trade-in` (entries on the cars page and My Garage): range, breakdown, instant offer valid 7 days; "Use my trade-in" on a car page sets the calculator's down payment | ✅ `/trade-in` | ⚠️ Deterministic rules model, **not AI**, demo reference prices. Plate shown masked only. Credited at delivery (not yet on the application) |
| **Sandbox customer session** | ✅ HttpOnly cookie | ✅ `X-Sahel-Session` header | Stands in for eKey / OIDC login. Each session starts as the demo customer until onboarding |
| **Motor claims** (J6, First Notice of Loss) | ✅ "I had an accident" from My Garage and My policies: form with photos, claim page with status timeline, damage estimate, garage booking, replacement car card; **My claims** on the account page | ✅ | ⚠️ Photos are validated (JPEG / PNG / WebP by magic bytes, size-capped) then discarded: only type and size are kept. The estimate is a fixed rules table, **not AI**. Demo garages; replacement car is information only. Assessment is driven by a sandbox "advance" button |
| **IMTIAZ Points Everywhere** (ideas #13, #21) | ✅ `/rewards` (entries on home and the account page): balance, tier (Silver / Gold / Platinum) and progress, earned / burned history with its source, earn rules, catalogue with redeem → confirm, My vouchers | ✅ `/rewards` | ⚠️ Placeholder earn / burn rates, bonuses, tiers and catalogue; demo partners are fictional. Points are **derived** from existing data (captured payments, first card, autopay, good-payer streaks from the demo history, refunds reversed), not booked by the payment flow. Voucher codes shown once, then masked; vouchers have no real value |
| **Suhail & Suhaila 2.0** (J8) | ✅ Chat button on customer pages: balance, next installment, settlement quote, cars by monthly budget, pre-approval, policies, cards, handoff; EN + AR (Gulf phrasings) | ✅ `/assistant` (home app bar) | ⚠️ Rules-based, no language model (`AssistantBrain` interface ready for an in-region model). Actions are links the customer confirms in the normal UI. Memory and rate limit in server memory |
| **Notifications inbox, reminders + preferences** (after-purchase) | ✅ Bell with unread badge in the customer header, `/notifications` (today / this week / earlier, each item opens its page), settings per category and channel with quiet hours | ✅ Bell in the home app bar, `/notifications`, `/notifications/preferences` | ⚠️ Derived from the customer's data on every read (installments, autopay, policies, My Garage, claims, applications, cards, trade-in, pre-approval and consent); only read / dismissed ids and preferences are kept, in memory. **Nothing is sent**: push, SMS, WhatsApp and email are modelled ("would send via…"). Overdue-payment notices cannot be fully switched off (CBB placeholder) |

Not built yet (planned in the docs): real login (customer and staff), a language model behind Suhail / Suhaila, real push / SMS / WhatsApp / email delivery, Huawei-specific services.

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

The API keeps everything in memory: restarting the web server forgets sessions, applications, cards, payments, and policies.

## Test it

```sh
npm test -w @sahel/domain                  # Vitest: pricing, rules, stores, session isolation
npm run typecheck                          # TypeScript, all workspaces
npm run build:web && npm run test:e2e -w @sahel/web   # Playwright, desktop + mobile web (Pixel 7), EN + AR
cd apps/mobile && flutter analyze && flutter test    # widget + API-contract tests
```

- Playwright starts `next start` on port **3100** (override with `PORT`) and reuses a server already running there, so build first. Set `PW_CHROMIUM_PATH` to use a preinstalled Chromium.
- CI (`.github/workflows/ci.yml`) runs all of the above, and fails if `npm run gen` output is not committed.

| Where | What is covered |
|---|---|
| `packages/domain/test/*.test.ts` | Pricing and APR, catalog and search, onboarding, cards, origination (decision rules, Murabaha order, idempotency), dealer tokens, bundles, settlement, insurance and policy binding, the session store and per-customer isolation, API error mapping |
| `apps/web/e2e/*.spec.ts` | One spec per feature (marketplace, onboarding, cards, applications, dealer, life events, settlement, insurance, session) plus API validation: UI figures must equal API figures, Arabic pages must be RTL, bad requests must be 4xx, data must be private to its session |
| `apps/mobile/test/*_test.dart` | Widget tests per feature, driven by recorded API responses in `test/fixtures/` (contract tests), plus a money-formatting fixture generated from the TypeScript formatter |

## How the code is organized

| Path | What it is |
|---|---|
| `packages/domain` | **The brain** (TypeScript). Money is always integer **fils**. Modules below |
| `api/openapi.yaml` | **API v1 contract**, used by both apps |
| `apps/web` | **Next.js** web app. Its `app/api/v1` route handlers *are* the API for now (the Flutter app calls them too) |
| `apps/web/lib/session.ts`, `session-store.ts` | ⚠️ Sandbox customer session: cookie (web) or `X-Sahel-Session` header (mobile), in memory |
| `apps/web/lib/api.ts` | Response helpers and the in-memory sandbox stores (payments, applications, cards, leads, share tokens, contract settings) |
| `apps/web/lib/policy-store.ts` | In-memory insurance quotes and policies per session customer |
| `apps/web/components` | Client components (calculator, onboarding wizard, checkout, dealer showroom, ...) |
| `apps/mobile` | **Flutter** app (Riverpod, go_router). `lib/features/<feature>` per screen group; `lib/core` has the API client, session header, models and repository. No business logic in Dart |
| `packages/i18n` | Arabic + English strings for **both** apps (generated into Flutter ARB files) |
| `packages/design-tokens` | Colors, radius, and spacing for **both** apps (generated into CSS and Dart) |
| `tools/gen.mjs` | The generator that keeps the two apps in sync |

**`packages/domain/src` modules**

| Module | What it does |
|---|---|
| `pricing.ts`, `rates.ts`, `money.ts` | Conventional / Murabaha / Ijara quotes, APR, calculator limits; ⚠️ illustrative rate cards and the DBR cap |
| `affordability.ts` | DBR headroom and indicative pre-approval (per product line, plus card limit) |
| `onboarding.ts`, `customer.ts`, `account.ts` | Sandbox eKey, consent, pre-approval; customer profile and "My account" overview |
| `config.ts` | Product rules for the apps (`GET /api/v1/config`) |
| `catalog.ts`, `search.ts` | Demo cars and properties, search and filters |
| `cards.ts` | Card eligibility, instant decision, sandbox issuer |
| `origination.ts` | Finance applications: decision rules, status machine, Murabaha and Ijara sequences, idempotency |
| `bundles.ts` | Life-event bundles |
| `settlement.ts` | Early-settlement quotes (conventional fee, Murabaha Ibra', Ijara) and autopay settings |
| `insurance*.ts`, `policies.ts` | Motor, travel and home quotes; held policy quotes bound to captured payments |
| `payments.ts`, `payment-amounts.ts` | Payment state machine and the sandbox gateway; server-priced amounts (deposit, ⚠️ valuation fee) |
| `home-finance.ts` | Home finance applications from the catalog (conventional, Ijara) |
| `claims.ts` | Motor claims (FNOL): validation, status machine, ⚠️ rules-based damage estimate (not AI), demo garages, replacement car offer, sandbox claim store |
| `dealer.ts` | Dealer inventory, leads pipeline, pre-approval share tokens, offers |
| `backoffice.ts` | Back office: staff roles and auth plug-in, credit review queue and decisions, premium refunds, audit log, KPIs |
| `assistant/` | Suhail & Suhaila: Arabic normalization, EN / AR intent rules, read-only tools over existing domain functions, replies with cards and actions, PII redaction, rate limit and conversation memory; ⚠️ `RulesBrain` until an LLM brain is plugged in |

**Parity is tested:** Playwright checks that web figures equal the API, and the Flutter tests use recorded API responses plus a money-formatting fixture generated from the TypeScript formatter. Product rules the app needs (slider ranges, steps, defaults, consent period, insurance form limits, reservation deposit) come from `GET /api/v1/config`, not from Dart. See [ADR-0004](docs/adr/0004-web-parity.md).

## ⚠️ Sandbox, not production

Do not put this in front of real customers. In particular:

- **In-memory stores.** Sessions, applications, cards, payments, policies, leads, and autopay settings live in the web server's memory and are lost on restart. There is no database.
- **No real login.** The session is a sandbox stand-in for eKey / OIDC. Each session starts as a fictional demo customer. The dealer portal has **no staff login** at all.
- **No real integrations.** No eKey 2.0 (iGA), no Credit Reference Bureau, no Open Banking (AISP), no Tap Payments, no card issuer or wallet provisioning, no insurer APIs, no core lending system, no e-signature provider.
- **No money moves.** The payment gateway is simulated; "confirm" stands in for Tap's verified webhook. There are no refunds or reconciliation.
- **Illustrative numbers.** Rates, the DBR cap, credit rules, card limits, settlement fee and Ibra', insurance pricing, fees, and deposits are **placeholders** pending BCFC Risk, Treasury, Product, the Shari'a board, and CBB rules. See the list in [13-prototype-status.md](docs/13-prototype-status.md#3-placeholders-that-need-business-sign-off).
- **Fictional data.** Insurers, customers, dealers, listings, and contracts are demo data.
- **No production hardening.** No audit logging, rate limiting, WAF, or monitoring.
- **App identity.** The Flutter app's bundle ID is `bh.bcfc.sahel`; it must become `com.cbt.bcfc` (Android) and App Store id `6443493467` to ship as a Sahel update.

## Planning documents (read in order)

| # | Document | What it answers |
|---|---|---|
| 00 | [Vision & North Star](docs/00-vision.md) | Why we're building this and what "crazy" means for us |
| 01 | [Market Research](docs/01-market-research.md) | The Bahrain landscape, BCFC group, competitors, regulators |
| 02 | [Product Verticals](docs/02-product-verticals.md) | Features for each vertical, with Islamic and conventional variants |
| 03 | [Crazy Ideas Backlog](docs/03-crazy-ideas.md) | Big ideas, scored and ranked |
| 04 | [Integrations Map](docs/04-integrations.md) | Every external party we connect to, and how |
| 05 | [Payments](docs/05-payments.md) | Tap, BENEFIT, recurring installments, refunds, reconciliation |
| 06 | [Architecture](docs/06-architecture.md) | Apps, backend, data, and APIs (target and what runs today) |
| 07 | [Security & Compliance](docs/07-security-compliance.md) | CBB rules, PDPL, PCI DSS, Shari'a governance |
| 08 | [User Journeys](docs/08-user-journeys.md) | End-to-end flows for the main journeys |
| 09 | [Roadmap](docs/09-roadmap.md) | Phases, MVP scope, and milestones (with what the prototype already shows) |
| 10 | [Team, Repo & DevOps](docs/10-team-repo-devops.md) | Repository layout, CI, environments, team |
| 11 | [Open Questions & Decisions](docs/11-open-questions.md) | What is still undecided, including questions raised by the prototype |
| 12 | [Web Platform](docs/12-web-platform.md) | Web parity in practice |
| 13 | [Prototype Status](docs/13-prototype-status.md) | What is built, what is a placeholder, and the gap to production |

**Decided so far** ([ADRs](docs/adr/README.md)): Sahel 2.0, GitHub for now, AWS hosting, web parity (Next.js web + Flutter mobile + shared API).

Anything marked **⚠️ VERIFY** in the docs is an assumption that must be confirmed with a partner, the regulator, or BCFC internal teams.
