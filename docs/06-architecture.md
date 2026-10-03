# 06 — Technical Architecture

> These are **proposals**. Each one becomes an ADR in `docs/adr/` once the team agrees on it.
> Section 1.1 describes what the **prototype actually runs today**; everything else is the target architecture.

## 1. High-level view

```
 ┌─────────────────────────── Clients ───────────────────────────┐
 │ Flutter app: iOS / Android / Huawei                           │
 │ Next.js web: full customer app + SEO pages                    │
 │ Dealer & Broker portal (Next.js)       Back-office (Next.js)  │
 └───────────────┬───────────────────────────────────────────────┘
                 │ HTTPS (TLS 1.2+/1.3, cert pinning in the app)
        ┌────────▼─────────┐
        │ CloudFront + WAF │  (+ AWS Shield, bot control)
        └────────┬─────────┘
        ┌────────▼─────────┐
        │ API Gateway / BFF│  mobile BFF · partner API · portal BFF
        └────────┬─────────┘
 ┌───────────────▼──────────────────────────────────────────────────────┐
 │          Domain services (modular monolith → split later)            │
 │ Identity · Customer Profile · Consent · Catalog (Cars/Property)      │
 │ Pricing & Offers · Origination (Loan/Murabaha/Ijara) · Decisioning   │
 │ Insurance · Cards · Payments · Ledger · Documents · Notifications    │
 │ Rewards · Partner (Dealer/Broker) · Search · AI Concierge            │
 └───────┬──────────────────┬───────────────────────┬───────────────────┘
         │ events (EventBridge / MSK)                │
 ┌───────▼───────┐  ┌───────▼────────┐  ┌───────────▼──────────────────┐
 │ Aurora Postgres│  │ OpenSearch     │  │ Integration layer (adapters) │
 │ Redis (cache)  │  │ (listings)     │  │ Tap · BENEFIT · CRB · eKey   │
 │ S3 (docs, KMS) │  │                │  │ Tarabut · Insurers · Core    │
 └────────────────┘  └────────────────┘  │ lending · Sahel backend · NMC│
                                          └──────────────────────────────┘
```

## 1.1 What runs today (prototype)

The target picture above is not built yet. The sandbox prototype ([13-prototype-status.md](13-prototype-status.md)) is deliberately small:

```
 Flutter app (iOS / Android)                      Browser
   │  X-Sahel-Session header                         │  sahel_session cookie (HttpOnly, SameSite=Lax)
   │  GET /api/v1/config  → product rules            │
   └──────────────┬──────────────────────────────────┘
                  ▼
   apps/web (Next.js) ── app/[locale]/*  pages (server-rendered, import packages/domain directly)
                     └── app/api/v1/*    API v1 route handlers (contract: api/openapi.yaml)
                              │
                              ▼
                      packages/domain  (pricing, rules, decisions, state machines; integer fils)
                              │
                              ▼
                      In-memory sandbox stores (lost on restart): sessions, payments, applications,
                      cards, share tokens, leads, contract settings, policies
```

| Concern | Today | Target |
|---|---|---|
| API | **API v1 as Next.js route handlers** in `apps/web/app/api/v1`, called by the web's client components and by the Flutter app. Responses are `{ data }` or `{ error: { code, message } }` | Same contract, moved to a dedicated service when needed |
| Business rules | `packages/domain` (TypeScript), imported by the web and by the route handlers. Flutter has none: it renders API responses and reads product rules (calculator ranges, steps, defaults, personal finance range, consent period, insurance form limits, reservation deposit) from **`GET /api/v1/config`** | Same |
| Customer identity | ⚠️ **Sandbox session**: an opaque random id. Web: HttpOnly cookie `sahel_session`. Mobile: `X-Sahel-Session` header (`new` until the API returns an id). Unknown or expired ids get a new session. Every session starts as the demo customer; onboarding switches it to the customer's own numbers. Data is private per session (another session gets 404) | OIDC provider federated with eKey 2.0; web BFF with HttpOnly cookies; tokens in secure storage on mobile |
| Partner identity | ⚠️ None: the dealer portal URL picks the dealership. `DealerAuthProvider` is the plug-in point for partner SSO | Partner SSO with roles |
| Data | ⚠️ In-memory stores in the Next.js process (`apps/web/lib/api.ts`, `lib/policy-store.ts`, `lib/session-store.ts`) | Aurora PostgreSQL, one schema per module |
| Integrations | ⚠️ All simulated in `packages/domain`: eKey, CRB, Open Banking, Tap (sandbox gateway), card issuer, insurers, core lending | Adapters in the integration layer |
| Idempotency | `Idempotency-Key` required on `POST /payments` and `POST /applications`, scoped per customer | Same, persisted, with a policy for reuse with a different body (see [11](11-open-questions.md), P2) |
| Tests | Vitest (`packages/domain/test`), Playwright (`apps/web/e2e`), Flutter widget tests on recorded API fixtures (`apps/mobile/test`); all in GitHub Actions CI | Plus integration, load, and security tests |

## 2. Mobile: Flutter

| Concern | Choice | Why |
|---|---|---|
| Flutter channel | Stable, pinned via FVM | Reproducible builds |
| Structure | One Flutter package with `lib/features/<vertical>` folders today; split into feature packages (Melos / pub workspaces) when teams grow | Teams own verticals; super-app modularity |
| State | **Riverpod** (or Bloc; pick one) | Testable, scales well |
| Navigation | `go_router` with deep links / universal links | Marketing links, push notifications, dealer QR codes |
| Networking | `dio` + generated OpenAPI client | Typed contracts with the backend. Today: `package:http` with a hand-written client (`lib/core/api/api_client.dart`) and hand-written models, checked against recorded API fixtures |
| Models | `freezed` + `json_serializable` | Immutable data |
| Localization | `flutter_localizations` + ARB files, **full right-to-left support** | Arabic first-class |
| Design system | Tokens from `packages/design-tokens` (generated into Dart and CSS) + shared widgets; Widgetbook later | Same look on web and mobile |
| Secure storage | `flutter_secure_storage` (Keychain/Keystore) | Tokens and keys |
| Biometrics | `local_auth` | Login and transaction signing |
| Device security | Root/jailbreak detection, anti-tamper, obfuscation (`--obfuscate`), RASP (e.g., freeRASP / Talsec, or a commercial option) | CBB and app-security expectations |
| Payments | Tap Flutter SDKs (Checkout, Apple Pay, BenefitPay) | Web uses the Tap Web SDKs. See [05-payments.md](05-payments.md) |
| Push | Firebase Messaging + **Huawei Push Kit** | Sahel is on AppGallery, so we must support HMS |
| Maps | `google_maps_flutter` (+ HMS Map on Huawei) | |
| ID / NFC | CPR chip reading via an NFC plugin / e-KYC vendor SDK | |
| AR / 3D | `model_viewer_plus` / ARKit / ARCore (later phase) | |
| Analytics | Firebase / Amplitude behind an interface | Swappable for PDPL reasons |
| Testing | Unit, widget, golden, and `integration_test` + Patrol (mobile); **Playwright** (web); Vitest (`packages/domain`) | Parity is tested, not assumed. Today: Flutter widget tests on recorded API fixtures, Playwright, Vitest (no golden or Patrol tests yet) |

### The super-app pattern
- Each vertical is a **feature package** with its own routes, state, and API client.
- **Remote Config + feature flags** turn verticals on or off per segment.
- Consider **server-driven UI** for home-screen widgets and campaigns, so marketing can change layouts without an app release.

### Web
- ✅ **Web parity is mandatory, and the web is Next.js** ([ADR-0004](adr/0004-web-parity.md)). Flutter covers mobile only. Pricing, rules, strings, and tokens are shared through `packages/*` and API v1. Details: [12-web-platform.md](12-web-platform.md).
- Domain: not decided yet. **Use bcfc.bh subdomains by default** (e.g., `sahel.bcfc.bh` for web, `api.sahel.bcfc.bh` for the API).

## 3. Backend

| Concern | Proposal | Alternatives |
|---|---|---|
| Style | **Modular monolith** first, with strict module boundaries. Extract services later (payments, ledger, and decisioning first) | Microservices from day one (too slow for an MVP) |
| Language | **TypeScript** (shares `packages/domain` with the Next.js web app; today the API runs as Next.js route handlers) | Kotlin / Spring Boot if the team prefers JVM later |
| API | REST + OpenAPI 3.1 (contract-first). GraphQL BFF optional for the app home screen | |
| Database | **Aurora PostgreSQL** (Multi-AZ), one schema per module | |
| Search | **OpenSearch** for car and property listings (geo, facets, Arabic analyzers) | |
| Cache / queues | ElastiCache Redis, SQS, **EventBridge** (or MSK Kafka at scale) | |
| Workflows | **AWS Step Functions** or **Temporal** for long-running origination (mortgage = weeks) | Camunda |
| Decision engine | Rules + scorecards (versioned) with an ML model later; e.g., an in-house rules DSL, or a vendor (FICO, Provenir, Experian PowerCurve) | |
| Ledger | Double-entry ledger service, append-only, in integer fils | |
| Documents | S3 (SSE-KMS), virus scanning, presigned URLs, retention policies | |
| AI | **Amazon Bedrock** (Claude) for Suhail/Suhaila 2.0 with RAG (Bedrock Knowledge Bases), tool calling into domain APIs, guardrails | |
| Auth | Own OIDC provider (**Keycloak** or **Amazon Cognito**) federated with **eKey 2.0**. Device binding, step-up auth for money movement | |

### Key domain models
`Customer`, `Consent`, `Application`, `Offer`, `Contract` (type: LOAN | MURABAHA | IJARA_MB | MUSHARAKA | TAWARRUQ | CARD), `Asset` (Vehicle | Property), `Listing`, `Partner`, `Policy`, `Payment`, `LedgerEntry`, `InstallmentSchedule`, `RewardTxn`.

## 4. AWS infrastructure

| Item | Proposal |
|---|---|
| Region | **me-south-1 (Bahrain)** primary, for data residency. Choose a DR region based on CBB outsourcing and data-location rules ⚠️ VERIFY |
| Accounts | AWS Organizations + Control Tower: `security`, `log-archive`, `shared-services`, `dev`, `staging`, `prod`, `dr` |
| Network | VPC per environment, private subnets, NAT, VPC endpoints, PrivateLink to partners where possible; site-to-site VPN / Direct Connect to BCFC's data center (core lending) |
| Compute | **ECS Fargate** (simpler) or **EKS** (if the team has Kubernetes skills) |
| Infrastructure as code | **Terraform** (or AWS CDK), all infrastructure in git |
| Secrets | AWS Secrets Manager + KMS (customer-managed keys), HSM (CloudHSM) for signing keys if needed |
| Edge | CloudFront + AWS WAF + Shield Advanced |
| Observability | CloudWatch + OpenTelemetry → Grafana / Datadog; X-Ray tracing; PagerDuty / Opsgenie |
| Security | GuardDuty, Security Hub, Inspector, Macie (PII in S3), CloudTrail (org-wide), Config rules |
| Backup / DR | AWS Backup, Aurora cross-region replicas, RPO ≤ 15 min, RTO ≤ 4 h (targets ⚠️ align with CBB BCM requirements) |

✅ The existing server is on **AWS** ([ADR-0003](adr/0003-aws-hosting.md)). Next: audit that account (region, what runs there, and whether Sahel's backend is there) before designing the landing zone.

## 5. Non-functional requirements

| NFR | Target |
|---|---|
| Availability | 99.9% (MVP), 99.95% (GA) |
| API latency (p95) | < 300 ms reads, < 800 ms writes (excluding partner calls) |
| App cold start | < 2.5 s on a mid-range Android device |
| App size | < 60 MB download |
| Peak load | Designed for 10× normal on campaign days (e.g., Ramadan, motor show) |
| Accessibility | WCAG 2.1 AA |
| Languages | Arabic (right-to-left) and English, everywhere |
