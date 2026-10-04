# 13 — Prototype Status

> **What this is:** an honest inventory of the Sahel 2.0 prototype in this repository: what works, what is a placeholder, and what stands between it and production.
> **What it is not:** a production system. Everything below runs in a **sandbox**: in-memory data, simulated partners, illustrative numbers.
> Source of truth is the code. Placeholders were collected by searching for ⚠️ in `packages/` and `apps/`. Keep this page updated when a feature merges.

## 1. Feature matrix

**Legend:** ✅ built (sandbox) · 🟡 partial · ➖ not applicable by design · ❌ not built

| Feature | Journey | Web | Mobile | API v1 | Tests | Notes |
|---|---|---|---|---|---|---|
| Car and property listings, search, filters, detail pages | J2, J4 | ✅ | ✅ | ✅ `/vehicles`, `/properties` | Domain, Playwright, Flutter | Demo catalog (NMC, TAC, a partner dealer, a broker) |
| Finance calculator: conventional, Murabaha, Ijara side by side | J2, J4 | ✅ | ✅ | ✅ `/quotes/finance` | Domain, Playwright (UI = API), Flutter | Illustrative rate cards |
| Product rules for the apps | all | ✅ (imports `packages/domain`) | ✅ (reads `/config`) | ✅ `GET /config` | Playwright, Flutter fixtures | Calculator ranges, steps and defaults, personal finance range, consent period, insurance form limits, reservation deposit |
| Reserve a car (deposit) | J2 | ✅ | ✅ | ✅ `/payments`, `/payments/price` | Domain, Playwright | Deposit amount is a placeholder; any other amount is 422 `AMOUNT_MISMATCH` |
| Request a property valuation (fee) | J4 | ✅ | ✅ | ✅ `/payments`, `/payments/price` | Domain, Playwright, Flutter | Fee priced by the server (`payment-amounts.ts`); any other amount is 422 `AMOUNT_MISMATCH` |
| Checkout (Tap methods: card, Apple / Google / Samsung Pay, BenefitPay) | J5 | ✅ | ✅ | ✅ `/payments`, `/payments/{id}/confirm` | Domain, Playwright | Sandbox gateway; confirm stands in for Tap's webhook |
| Onboarding: eKey step, consent, salary and obligations, pre-approval | J1 | ✅ | ✅ | ✅ `/onboarding/ekey`, `/onboarding/pre-approval` | Domain, Playwright, Flutter | eKey, CRB and Open Banking simulated |
| Sandbox customer session | all | ✅ HttpOnly cookie | ✅ `X-Sahel-Session` header | ✅ | Domain (store, isolation), Playwright | Stand-in for login; data is private per session |
| Card catalog and instant IMTIAZ card | J3 | ✅ | ✅ | ✅ `/cards`, `/cards/{id}/apply` | Domain, Playwright, Flutter | Masked virtual card; wallet provisioning simulated |
| My cards | J3 | ✅ | ✅ | ✅ `/me/cards`, `/me/cards/{id}` | Playwright, Flutter | |
| Apply for vehicle finance (conventional / Murabaha) | J2 | ✅ | ✅ | ✅ `/applications` | Domain, Playwright, Flutter | Decision, accept, timeline; Murabaha steps recorded in Shari'a order |
| Apply for personal finance (conventional / commodity Murabaha) | – | ✅ | ✅ | ✅ `/applications` | Domain, Playwright, Flutter | Rate card still labels Commodity Murabaha "coming soon" |
| Home finance application (Ijara / conventional) | J4 | ✅ | ✅ | ✅ `/applications` (`productLine: home`) | Domain, Playwright, Flutter | Price from the catalog; decision on the session customer's DBR and home pre-approval. Ijara: BCFC buys → lease starts (ownership transfers after the final rental, shown as a future step). Conventional: valuation confirmed only with a captured TRESCO valuation fee, then paid out |
| Credit officer review of referred applications | – | ✅ back office | ✅ customer sees "Reviewed by credit officer" | ✅ `/backoffice/applications`, `/backoffice/applications/{id}/decision` | Domain, Playwright, Flutter | REFERRED → APPROVED / DECLINED with a mandatory internal note (audit log). Queue across every customer; salary and obligations for credit officers only |
| Life-event bundles | – | ✅ | ✅ | ✅ `/life-events`, `/life-events/{id}/bundle` | Domain, Playwright, Flutter | Placeholder amounts and premiums; some items "coming soon" |
| My installments, garage, rewards balance (account) | J5 | ✅ | ✅ | ✅ `/me` | Playwright, Flutter | Demo contracts for every customer until core lending is integrated |
| Early settlement quote and "settle now" | – | ✅ | ✅ | ✅ `/me/contracts/{id}/settlement-quote` | Domain, Playwright, Flutter | Paying the exact quote through checkout marks the contract settled (per customer); wrong amount → 422, repeat → 409 `ALREADY_SETTLED`. A settled contract no longer counts as an obligation (pre-approval, card eligibility, bundles, decisions) |
| Autopay on / off | J5 | ✅ | ✅ | ✅ `PATCH /me/contracts/{id}` | Playwright, Flutter | A stored flag; nothing is charged on a schedule |
| Motor insurance comparison and purchase | – | ✅ | ✅ | ✅ `/insurance/motor-quotes`, `/policies/*` | Domain, Playwright, Flutter | |
| Travel insurance comparison and purchase | – | ✅ | ✅ | ✅ `/insurance/travel-quotes`, `/policies/*` | Domain, Playwright, Flutter | |
| Home insurance comparison and purchase (incl. from a listing) | J4 | ✅ | ✅ | ✅ `/insurance/home-quotes`, `/policies/*` | Domain, Playwright, Flutter | Suggested sums insured are rules of thumb |
| Instant trade-in valuation → down payment (idea #6) | J2 | ✅ `/{locale}/trade-in`, "Use my trade-in" on car pages | ✅ `/trade-in` | ✅ `POST /trade-in/valuations`, `GET` / `DELETE /me/trade-in`, `GET /config` `tradeIn` | Domain, Playwright, Flutter | ⚠️ Deterministic **rules model, not AI** (reference price per model year from a demo table derived from the catalog, then age, mileage, condition, accident, dealer margin). Range on a BHD 100 grid; the low end is the instant offer, valid 7 Bahrain days, one per session. Plate validated and only ever shown masked. Using it sets the calculator's down payment to min(offer, maximum down payment); credited at delivery (nothing is recorded on the application yet). No photos, plate lookup or inspection |
| Policies bound to payments, My policies | – | ✅ | ✅ | ✅ `/policies/quotes`, `/policies/confirm`, `/me/policies` | Domain, Playwright, Flutter | Issued only for a CAPTURED payment whose amount and reference match the held quote |
| Share pre-approval with a dealer (customer side) | J7 | ✅ | ✅ | ✅ `/me/preapproval-token` | Domain, Playwright | 15-minute code, minimal data |
| Dealer & broker portal: inventory, leads board, showroom offer | J7 | ✅ | ➖ web-first | ✅ `/dealer/*` | Domain, Playwright | No staff login; offers are not pushed to the customer |
| Arabic (RTL) and English | all | ✅ | ✅ | ✅ localized fields | Playwright (RTL checks), Flutter | |
| Real login (eKey / OIDC, passkeys, biometrics) | J1 | ❌ | ❌ | ❌ | – | |
| Back-office console | – | ✅ `/{locale}/backoffice` | ➖ web-only staff tool | ✅ `/backoffice/*` | Domain, Playwright | ⚠️ No staff login: pick a role (credit officer, operations, compliance viewer); one `staffSession()` check per route (401 / 403). KPIs, credit review, refunds of premiums without a policy (idempotent), audit log (in memory, filterable) |
| Suhail & Suhaila 2.0 assistant | J8 | ✅ chat button on customer pages | ✅ `/assistant` | ✅ `POST /assistant/messages` | Domain, Playwright, Flutter | ⚠️ Rules-based (`RulesBrain`), no language model yet. Read-only tools over the session customer's data (balance, next installment, settlement quote, cars by budget, pre-approval, policies, cards, handoff); actions are links the customer confirms. PII redaction, input cap, rate limit and memory in server memory |
| Motor claims (First Notice of Loss), My claims | J6 | ✅ | ✅ | ✅ `/claims`, `/claims/{id}`, `/claims/{id}/garage`, `/me/claims`; ⚠️ `/claims/{id}/advance` (sandbox only) | Domain, Playwright, Flutter | On an ACTIVE motor policy of the session customer (another customer's policy or claim is 404). SUBMITTED → UNDER_ASSESSMENT → APPROVED / REJECTED → REPAIR_BOOKED → SETTLED (total loss: APPROVED → SETTLED). Photos validated by magic bytes then discarded (metadata only). Estimate is a rules table, not AI. Demo garages (agency only with agency repair); replacement car from Tasheelat Car Leasing is an info card |
| IMTIAZ Points Everywhere: earn, tiers, redeem (ideas #13, #21) | – | ✅ `/{locale}/rewards` | ✅ `/rewards` | ✅ `GET /me/rewards`, `GET /rewards/catalogue`, `GET` / `POST /me/rewards/redemptions` | Domain, Playwright, Flutter | ⚠️ Sandbox. Ledger derived on every read (`rewards.ts`, pure): demo `rewardsPoints` as opening balance; captured payments by purpose (installment on time > late; premium only once it issued a policy; deposit / valuation fee once per reference; settlement 0); welcome bonus on the first card; autopay bonus once per contract; good-payer bonus every 6 consecutive on-time installments (demo history + session payments); refunded payment → reversal. Tier from the last 12 months (not the opening balance). Redemption: per session, Idempotency-Key, 422 `INSUFFICIENT_POINTS`; code returned once, then masked (last 4). "BHD 10 off your next installment" is only a credit voucher (no payment change) |
| Notifications inbox, reminders and preferences | – | ✅ header bell, `/{locale}/notifications`, `/{locale}/notifications/preferences` | ✅ home app bar bell, `/notifications`, `/notifications/preferences` | ✅ `GET /me/notifications`, `/me/notifications/unread-count`, `POST /me/notifications/{id}/read`, `/me/notifications/read-all`, `/me/notifications/{id}/dismiss`, `GET` / `PUT /me/notification-preferences` | Domain, Playwright, Flutter | ⚠️ Derived on every read by a pure function over the session customer's data (Bahrain dates): installment due in 0..3 days or overdue, autopay off, settlement completed, registration / garage motor insurance ending in 30 days, policies ending in 30 days or ended, claim status, application decision or next action, card issued, trade-in offer ending in 2 days, pre-approval / consent ending in 7 days. Stable ids (type + entity + period) keep read / dismissed state. Same deep link on web and mobile. **Nothing is sent** (push, SMS, WhatsApp, email modelled; quiet hours defer). Overdue notices are mandatory (P22) |

Where the tests live: `packages/domain/test` (Vitest), `apps/web/e2e` (Playwright, desktop and Pixel 7 viewports), `apps/mobile/test` (Flutter widget tests on recorded API fixtures in `test/fixtures`). CI runs all three.

## 2. How the sandbox works

| Piece | Sandbox behavior | Code |
|---|---|---|
| Customer session | Opaque random id; web: `sahel_session` cookie (HttpOnly, SameSite=Lax, Secure on HTTPS); mobile: `X-Sahel-Session` header (`new` until the API returns an id; kept in memory in the app). Unknown or expired ids get a new session; idle sessions expire and the store is size-capped | `apps/web/lib/session.ts`, `session-store.ts`, `apps/mobile/lib/core/api/session.dart` |
| Customer data | Every session starts as the fictional demo customer. Onboarding replaces salary, obligations and pre-approval with the customer's own (self-declared) numbers. Contracts, garage and rewards stay demo data | `packages/domain/src/customer.ts` |
| Stores | Payments, applications, cards, share tokens, leads, contract settings, policies: in-memory singletons on the Next.js server, lost on restart. Scoped per session customer; another session gets 404 | `apps/web/lib/api.ts`, `apps/web/lib/policy-store.ts` |
| Idempotency | `Idempotency-Key` header (or body field) required on payments and applications, scoped per customer. A repeated key returns the **original** result | `packages/domain/src/payments.ts`, `origination.ts` |
| Payments | Create → confirm (captured). No money moves. Deposits and valuation fees must carry the server amount (`GET /payments/price`, else 422 `AMOUNT_MISMATCH`). Back-office Operations can refund a captured premium that never became a policy (CAPTURED → REFUNDED, idempotent); no voids | `packages/domain/src/payments.ts`, `backoffice.ts` |

## 3. Placeholders that need business sign-off

Each item is marked ⚠️ in the code. None of these values may go live without the named owner signing off.

| # | Placeholder | Current value | Where | Owner |
|---|---|---|---|---|
| P1 | **DBR cap** | 50% of monthly salary | `rates.ts` `DBR_CAP_PCT` | Risk ⚠️ VERIFY against current CBB rules |
| P2 | **Rates** | Vehicle: 6.5% conventional APR, 3.5% Murabaha flat. Personal: 7.5% / 4.0%. Home: 6.0% conventional, 3.25% Murabaha flat, 6.0% Ijara. Tenures and minimum down payments per line | `rates.ts` `RATE_CARDS` | Treasury, Risk, Shari'a board |
| P3 | Calculator limits | Maximum down payment 90% of price (calculator); listing defaults (20% down, 60 / 48 / 240 months) | `pricing.ts` `financeLimits`, `rates.ts` | Product |
| P4 | **Credit decision rules** | DBR_EXCEEDED → decline; AMOUNT_ABOVE_PREAPPROVAL → refer; **HIGH_DBR_UTILISATION** → refer when the new installment uses more than **80%** of the remaining DBR headroom | `origination.ts` `decide`, `REFER_ABOVE_HEADROOM_PCT` | Credit Risk |
| P5 | Minimum personal finance | BHD 500; slider default BHD 5,000, step BHD 100 | `origination.ts`, `config.ts` | Product |
| P6 | Pre-approval | Full DBR headroom at the longest tenure, priced at the **conventional** rate for every structure; valid 30 days | `affordability.ts` `preApprove` | Risk |
| P7 | **Card limit rule** | 2× monthly salary, capped at BHD 15,000, zero without DBR headroom; per-card minimum salary | `affordability.ts`, `cards.ts` | Cards, Risk |
| P8 | **Early-settlement fee** (conventional) | **1%** of remaining principal | `settlement.ts` `EARLY_SETTLEMENT_FEE_PCT` | Risk ⚠️ VERIFY with CBB rules |
| P9 | **Ibra' rule** (Murabaha) | **100%** of unearned profit (straight-line) rebated; figures as of the last paid installment | `settlement.ts` `IBRA_REBATE_PCT` | Shari'a board (Ibra' is discretionary; it cannot be a contract condition) |
| P10 | Settlement quote validity | 7 days | `settlement.ts` | Operations |
| P11 | **Insurance pricing** | Demo rates for fictional insurers (motor, travel, home); travel limits (180-day trip, 365 days ahead, Schengen medical ≈ BHD 12,000); home sums insured limits; suggested cover (buildings at 60% of sale price) | `insurance*.ts` | Tasheelat Insurance, partner insurers |
| P12 | Policy quote hold | 24 hours | `policies.ts` `POLICY_QUOTE_TTL_MS` | Insurance |
| P13 | Bundle rules | Wedding finance BHD 5,000, furniture BHD 4,000; home cover 0.08% of value / year; life / family Takaful BHD 9 / month | `bundles.ts` | Product, Insurance |
| P14 | **Valuation fee** | BHD 150, priced by the server (`GET /payments/price`) | `payment-amounts.ts` `VALUATION_FEE_FILS` | Real estate (TRESCO) |
| P15 | **Reservation deposit** | BHD 100 | `config.ts` `RESERVATION_DEPOSIT_FILS` | Automotive (NMC / TAC) |
| P16 | Consent validity | 90 days for CRB and Open Banking | `onboarding.ts` | Compliance ⚠️ VERIFY with CBB Open Banking rules |
| P17 | Pre-approval share code | 15 minutes, 8 characters | `dealer.ts` | Product, Compliance |
| P18 | Back office | Role permissions (`ROLE_PERMISSIONS`), minimum note length (5), premium refundable after **0 minutes** (`ORPHAN_PREMIUM_MIN_AGE_MS`) | `backoffice.ts` | Credit Risk, Operations, Compliance |
| P19 | **Trade-in model** | Reference prices (catalog new cars, otherwise illustrative); depreciation 10% current model year, 15% first year then 12% / year; −1% per 5,000 km (max −40%); condition +4% / 0 / −8% / −20%; accident −12%; dealer margin −10%; range −7% / +5%; offer valid 7 days; up to 15 model years old, 500,000 km | `tradein.ts` `TRADE_IN_MODEL` | Tasheelat Automotive pricing desk |
| P20 | **Motor claims** | Damage estimate table by type and severity (e.g. collision moderate BHD 600 ± 20%; theft and severe fire = total loss at the insured value); claims within **30 days** of the incident; police report mandatory for theft; third-party cover only for collision / other with a third party; at most 6 photos of 400 KB; replacement car up to 14 days; demo garages | `claims.ts` | Tasheelat Insurance, partner insurers |
| P21 | **IMTIAZ points** | Points per BHD: installment on time 10, late 2, insurance premium 5, valuation fee 3, reservation deposit 2, early settlement 0; welcome card bonus 2,000; autopay 500 per contract; good payer 1,000 every 6 on-time installments; tiers on 12-month points: Silver 0, Gold 5,000, Platinum 15,000; catalogue costs (e.g. BHD 10 installment credit 2,200, BHD 5 fuel 1,500, BHD 15 Takaful 3,000) and validity; demo partners | `rewards.ts` (`REWARDS_EARN_RATES`, `REWARDS_TIERS`, `REWARDS_CATALOGUE`) | Cards / Marketing, Finance, partner agreements |
| P22 | **Notifications** | Thresholds: installment due ≤ 3 days, autopay reminder ≤ 7 days, registration / insurance / policy ≤ 30 days (expired shown 30 days), trade-in ≤ 2 days, pre-approval / consent ≤ 7 days; defaults push for all, SMS for payments, email for documents, WhatsApp opt-in; quiet hours 22:00–07:00 Bahrain; **overdue payments mandatory** (at least one channel; CBB consumer-protection placeholder) | `notifications.ts` `NOTIFICATION_RULES`, `defaultNotificationPreferences`, `MANDATORY_NOTIFICATION_CATEGORIES` | Product, Operations, Compliance ⚠️ VERIFY with the CBB Rulebook and PDPL (WhatsApp consent) |

## 4. Privacy decisions pending

| # | Decision | What the prototype does today |
|---|---|---|
| D1 | **Should a dealer see the customer's monthly headroom (`maxMonthly`)?** | Redeeming a share code shows the dealer the first name, vehicle finance limit, **maximum monthly installment**, and validity. No salary, CPR, obligations, contracts or contact details. Headroom lets a dealer infer a lot about income; Compliance should confirm this is minimal enough under PDPL |
| D2 | Consent for dealer sharing | Sharing is an explicit customer action (generate a code) but there is no recorded consent artifact |
| D3 | Masked CPR | The eKey step returns a masked CPR; confirm what may be stored and shown |
| D4 | Data retention | Nothing is persisted today. Retention periods for applications, declined decisions, and quotes are undecided |

## 5. Gap list to production

| Area | Gap | Notes |
|---|---|---|
| **Identity** | Real auth: eKey 2.0 federation (OIDC), our own OIDC provider, device binding, step-up for money movement; passkeys on web; secure token storage on mobile | Replace `lib/session.ts` and the mobile session header. See [06](06-architecture.md), [12](12-web-platform.md) |
| **Partner auth** | Dealer / broker staff login (partner SSO), roles, per-dealer data access | `DealerAuthProvider` is the plug-in point in `apps/web/lib/api.ts` |
| **Persistence** | A database (Aurora PostgreSQL) for sessions, applications, cards, policies, payments, leads; migrations; backups | Every store is in memory today |
| **Payments** | Tap server integration and verified webhooks; **refunds and reconciliation** (the sandbox back office lists and refunds **captured premium payments that never bind to a policy**, but no money moves and there is no reconciliation); voids; settlement payments that close contracts in core lending (the prototype only marks them settled in memory, and takes their installments off the obligations); scheduled autopay charges; server-side amount binding for installments (deposits and valuation fees are priced by the server; premiums and settlements are bound to their held quotes) | See [05](05-payments.md) |
| **Credit data** | CRB pull under consent, Open Banking (AISP) income and obligations, salary verification | Obligations are self-declared today |
| **Decisioning** | Real decision engine and credit policy; credit officer queue for referred applications | |
| **Core lending** | Contracts, schedules, settlement figures, and autopay from the core lending system; real fulfilment steps (with evidence) for the Murabaha and Ijara sequences (purchase, lease registration, ownership transfer at the end of the lease); a real TRESCO valuation report; disbursement | Accept runs the steps instantly today (Ijara stops at the lease; conventional home finance waits for a captured valuation fee) |
| **E-signature** | Signed contract documents with eKey identity | |
| **Cards** | Issuer / processor integration, real PANs (never in our origin), push provisioning | |
| **Insurance** | Insurer / broker APIs for quoting, binding, policy documents; lodging claims with the insurer, its assessor's decision and real damage assessment; encrypted storage for claim photos and police reports; garage network and replacement car booking | Claims are in memory and photos are discarded today |
| **Audit logging** | Who did what, when, for every decision, consent, payment, and dealer action | Back-office actions (sign-in, credit decisions, refunds) are logged in memory today; needs an append-only store and coverage of customer and dealer actions |
| **Abuse protection** | Rate limiting, WAF / bot control, CAPTCHA on onboarding and share-code redemption; CSP, HSTS, CSRF protection; restrict API CORS (open to `*` today for the app) | |
| **Operations** | Staff SSO and roles for the back-office console (`StaffAuthProvider` is the plug-in point in `apps/web/lib/backoffice-api.ts`); monitoring, alerting, observability | |
| **Mobile release** | Bundle IDs `com.cbt.bcfc` / App Store id `6443493467`, signing, Huawei (HMS) build, obfuscation, RASP | Currently `bh.bcfc.sahel` |
| **Hosting** | AWS landing zone, CI/CD to environments, a dedicated API service when needed | The API runs inside Next.js today |
