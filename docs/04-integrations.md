# 04 — Integrations Map

> Each integration needs: a contract or agreement → a sandbox → certification → production. Plan **8–16 weeks** of lead time for regulated parties (BENEFIT, CRB, iGA). Start the commercial conversations now, in parallel with design.

## Overview

```
                         ┌──────────────────────────┐
                         │     BCF Marketplace       │
                         │   (Integration Layer)     │
                         └────────────┬─────────────┘
   ┌───────────────┬──────────────┬───┴────────┬──────────────┬────────────────┐
 Identity        Credit &       Payments      Assets         Insurance       Internal
 eKey 2.0        CRB (BENEFIT)  Tap           Dealers        Insurers        Core lending
 CPR/iGA         Open Banking   BENEFIT/EFTS  Developers     Takaful cos.    Card processor
 LMRA, SIO       (Tarabut etc.) Fawri+        RERA, SLRB     Garages         CRM / ERP
                                              Traffic Dept.                  Collections
```

## 1. Identity & KYC

| Partner | Purpose | Method | Priority | Notes |
|---|---|---|---|---|
| **iGA eKey 2.0** | National digital identity login and verified CPR data | OIDC/SAML federation ⚠️ VERIFY private-sector onboarding process | P0 | Removes manual KYC. Request access from iGA early |
| **CPR / Smartcard reader** | Fallback ID verification | NFC chip read in Flutter + liveness | P1 | Covers people who don't use eKey |
| **e-KYC vendor** (e.g., Uqudo, Onfido, Sumsub) | OCR, liveness, face match, and AML screening | SDK + API | P0 | Uqudo has strong GCC ID coverage ⚠️ VERIFY |
| **AML/sanctions screening** (e.g., Refinitiv World-Check, Dow Jones, LexisNexis) | PEP and sanctions checks | API | P0 | Required by the CBB AML module |
| **LMRA** | Work-permit status for expats | ⚠️ VERIFY whether an API exists | P2 | |
| **SIO** | Employment and salary verification | ⚠️ VERIFY | P2 | Could replace the salary certificate |

## 2. Credit & financial data

| Partner | Purpose | Method | Priority |
|---|---|---|---|
| **BENEFIT Credit Reference Bureau** | Credit report and score, existing obligations, DBR | API (BCF is likely already a member) | P0 |
| **Open Banking AISP: Tarabut / Spare / Spire** | Salary detection, transaction-based affordability, debt discovery | REST via a licensed AISP, under the BOBF consent flow | P0 |
| **Open Banking PISP** | Pay installments directly from a bank account | Via PISP | P2 |

## 3. Payments

See [05-payments.md](05-payments.md). In summary:

| Partner | Purpose | Priority |
|---|---|---|
| **Tap Payments** | Cards, Apple Pay, Google Pay, Samsung Pay, Click to Pay, BenefitPay, tokenization, recurring payments | P0 |
| **BENEFIT Fawri+** | Instant loan disbursement to the customer's IBAN | P0 (via BCF's bank) |
| **BENEFIT EFTS direct debit** | Recurring installment collection from bank accounts | P1 ⚠️ VERIFY |

## 4. Vehicles

| Partner | Purpose | Method |
|---|---|---|
| **National Motor Company** (group) | New-car inventory, pricing, test drives, service bookings | Internal DMS integration |
| **Tasheelat Automotive Company** (group) | Used-car inventory and inspection reports | Internal integration |
| **Tasheelat Car Leasing** (group) | Lease and subscription offers, fleet | Internal integration |
| Partner dealers (all major Bahrain agencies) | Inventory feed and leads | Dealer portal (manual) → CSV/feed → API |
| **General Directorate of Traffic** | Registration, ownership transfer, fines | ⚠️ VERIFY whether a B2B API exists. Fall back to deep links into government apps |
| Vehicle history / inspection partners | Used-car inspection reports | API or uploaded PDF |
| Valuation data | Trade-in pricing | Internal sales data + ML model + market scraping (legal review needed) |

## 5. Real estate

| Partner | Purpose | Method |
|---|---|---|
| **TRESCO** (group) | Properties for sale and rent, valuation orders and reports | Internal integration |
| Developers | Off-plan inventory and payment plans | Portal + feed |
| RERA-licensed brokers | Listings | Portal; verify the license number against RERA |
| **RERA** | Broker and developer license verification; escrow info | ⚠️ VERIFY whether an API exists |
| **SLRB** | Title-deed verification and mortgage registration | ⚠️ VERIFY the e-service integration |
| **Ministry of Housing / Eskan Bank (Mazaya)** | Subsidized housing finance | Partnership ⚠️ VERIFY |
| Maps (Google Maps / Mapbox) | Property maps and commute times | SDK |
| Virtual tours (Matterport or similar) | 3D tours | Embed |

## 6. Insurance & Takaful

| Partner | Purpose | Method |
|---|---|---|
| Local insurers and Takaful operators (e.g., GIG Bahrain, Solidarity, Bahrain National, SNIC, Takaful International — ⚠️ VERIFY current list) | Quote → bind → issue policy → claims | REST APIs where available; otherwise a broker platform or manual back-office |
| **Bahrain Insurance Association / motor database** | Motor policy verification ⚠️ VERIFY | |
| Garages network | Claims repair booking | Partner portal |

## 7. Internal BCF systems ⚠️ VERIFY all of these with BCF IT

| System | Purpose | Integration pattern |
|---|---|---|
| **Sahel by BCFC** (existing app and backend; `com.cbt.bcfc`) | Existing customers, logins, transfers, bill pay, card control, motor and travel insurance | Reuse its backend APIs or migrate. ⚠️ VERIFY the vendor and code ownership |
| **Suhail & Suhaila** (AI assistants) | Existing chatbot | Extend them or rebuild on Bedrock |
| Core lending / loan management system | Loan origination, schedules, balances | API façade over the core system. Event streaming if possible |
| Card management system / processor | Card issuance, controls, tokenization | API |
| CRM | 360° customer view, leads | Bi-directional sync |
| ERP / GL | Accounting, reconciliation | Batch + events |
| Collections system | Arrears and dunning | Events |
| Document management | Contracts and archive | S3 + metadata sync |

## 8. Platform services

| Service | Option(s) |
|---|---|
| Push notifications | Firebase Cloud Messaging + APNs |
| SMS / OTP | A local Bahrain SMS aggregator (Batelco, Zain, or STC business) or AWS SNS / Pinpoint |
| WhatsApp | Meta WhatsApp Business API (via a BSP) |
| Email | AWS SES |
| e-Signature | ⚠️ VERIFY local legal acceptance; options include in-app signing with a PKI certificate, or a DocuSign / Adobe Sign equivalent |
| Analytics | Firebase Analytics / Amplitude / Mixpanel (check PDPL data residency) |
| Crash reporting | Firebase Crashlytics / Sentry |
| Feature flags and A/B testing | LaunchDarkly / Firebase Remote Config / Unleash (self-hosted) |
| Maps | Google Maps |
| LLM (AI concierge) | AWS Bedrock (keep data in the AWS region and account) |

## Integration principles

1. **Anti-corruption layer:** every external partner sits behind an internal adapter interface. The app never talks to a partner directly, except through payment SDKs.
2. **Async by default:** use webhooks and events, with an outbox pattern and idempotency keys.
3. **Graceful degradation:** if the CRB is down, fall back to a manual-review queue rather than blocking the customer.
4. **Contract tests** for every adapter, plus a sandbox mock server for local development.
5. **Consent ledger:** every data pull (CRB, Open Banking, eKey) is tied to a recorded, time-bound customer consent.
