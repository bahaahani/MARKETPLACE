# 06 — Technical Architecture

> These are **proposals**. Each one becomes an ADR in `docs/adr/` once the team agrees on it.

## 1. High-level view

```
 ┌─────────────────────────── Clients ───────────────────────────┐
 │ Flutter app (iOS / Android / Huawei)   Web (SEO listings)     │
 │ Dealer & Broker portal (Flutter Web)   Back-office (Web)      │
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

## 2. Mobile: Flutter

| Concern | Choice | Why |
|---|---|---|
| Flutter channel | Stable, pinned via FVM | Reproducible builds |
| Structure | **Melos monorepo**: `app/` + feature packages (`feature_cars`, `feature_property`, `feature_finance`, `feature_cards`, `feature_insurance`) + `core_*` packages | Teams own verticals; super-app modularity |
| State | **Riverpod** (or Bloc; pick one) | Testable, scales well |
| Navigation | `go_router` with deep links / universal links | Marketing links, push notifications, dealer QR codes |
| Networking | `dio` + generated OpenAPI client | Typed contracts with the backend |
| Models | `freezed` + `json_serializable` | Immutable data |
| Localization | `flutter_localizations` + ARB files, **full right-to-left support** | Arabic first-class |
| Design system | An in-house `bcfc_ui` package (tokens, components, Storybook via Widgetbook) | Consistency across verticals |
| Secure storage | `flutter_secure_storage` (Keychain/Keystore) | Tokens and keys |
| Biometrics | `local_auth` | Login and transaction signing |
| Device security | Root/jailbreak detection, anti-tamper, obfuscation (`--obfuscate`), RASP (e.g., freeRASP / Talsec, or a commercial option) | CBB and app-security expectations |
| Payments | Tap Flutter SDKs (Checkout, Apple Pay, BenefitPay) | See [05-payments.md](05-payments.md) |
| Push | Firebase Messaging + **Huawei Push Kit** | Sahel is on AppGallery, so we must support HMS |
| Maps | `google_maps_flutter` (+ HMS Map on Huawei) | |
| ID / NFC | CPR chip reading via an NFC plugin / e-KYC vendor SDK | |
| AR / 3D | `model_viewer_plus` / ARKit / ARCore (later phase) | |
| Analytics | Firebase / Amplitude behind an interface | Swappable for PDPL reasons |
| Testing | Unit, widget, golden, and `integration_test` + Patrol | |

### The super-app pattern
- Each vertical is a **feature package** with its own routes, state, and API client.
- **Remote Config + feature flags** turn verticals on or off per segment.
- Consider **server-driven UI** for home-screen widgets and campaigns, so marketing can change layouts without an app release.

### Web
- The **public listings website** (cars and property) needs SEO. Flutter Web is weak at SEO, so use **Next.js** for public pages and Flutter Web only for logged-in portals (dealer and back-office). ⚠️ DECISION
- Domain: is "thevacantwillbe.net" the intended domain, or is it a speech-to-text mix-up of something under bcfc.bh? ⚠️ CONFIRM

## 3. Backend

| Concern | Proposal | Alternatives |
|---|---|---|
| Style | **Modular monolith** first, with strict module boundaries. Extract services later (payments, ledger, and decisioning first) | Microservices from day one (too slow for an MVP) |
| Language | **TypeScript / NestJS** (fast, shares skills with web) **or Kotlin / Spring Boot** (strong in banking) | Go for high-throughput services |
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

The "server we already have": clarify whether it is an EC2 instance, an on-prem server, or the Sahel backend. ⚠️ CONFIRM

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
