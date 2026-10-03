# 11 — Open Questions & Decisions

Please answer these (or assign an owner) before Phase 1 starts. **Bold** marks blockers.

## Strategy

| # | Question | Owner | Status |
|---|---|---|---|
| S1 | **Is this Sahel 2.0 (an evolution of Sahel by BCFC) or a new marketplace app that links to Sahel?** Recommendation: **Sahel 2.0**, a rebuild in Flutter that keeps the brand, users, and store listings. One app beats two | Management | ✅ **Decided: Sahel 2.0** ([ADR-0001](adr/0001-sahel-2.0.md)) |
| S2 | Who built Sahel (`com.cbt.bcfc`)? Who owns the source code, and what technology is it built with? Can its backend APIs be reused? | IT | ✅ **Built in-house by BCFC; we own the code.** Next: the tech-stack audit (see N1 below) |
| S3 | Is the marketplace open to **third-party lenders, banks, and insurers**, or BCFC-group only at first? | Management | Open |
| S4 | Is there a brand name for the marketplace, or is it simply "Sahel"? | Marketing | Open |
| S5 | What is "thevacantwillbe.net"? Is it the target domain, or should we use something under bcfc.bh? | IT | ❓ Unknown. **Use bcfc.bh subdomains until decided** (e.g., `sahel.bcfc.bh`, `api.sahel.bcfc.bh`) |

## Regulatory & Shari'a

| # | Question | Owner | Status |
|---|---|---|---|
| R1 | **Does BCFC's CBB license allow the marketplace model (referring to or listing other institutions' products)?** | Compliance | ✅ Yes (per management). Get written confirmation from Compliance on file |
| R2 | **CBB cloud outsourcing: what notifications or approvals do we need to run on AWS me-south-1?** | Compliance / IT | ✅ Yes, AWS is allowed (per management). File the CBB outsourcing notification paperwork |
| R3 | Does the Shari'a board approve a fully digital Murabaha sequence (purchase → ownership → sale) with e-signature? | Shari'a |
| R4 | Are e-signatures legally accepted for financing contracts and mortgages? Are wet signatures or a notary still needed for SLRB? | Legal |
| R5 | What are the current DBR caps and other affordability rules we must enforce? | Risk |

## Integrations

| # | Question | Owner | Status |
|---|---|---|---|
| I1 | **What is the process and timeline for eKey 2.0 federation for a private company?** | IT |
| I2 | Is the CRB API already used by BCFC? Is real-time access available? | Risk |
| I3 | Which Open Banking AISP (Tarabut, Spare, or Spire)? Commercials? | Product |
| I4 | **Core lending system: vendor, API capabilities, and real-time vs. batch** | IT |
| I5 | Card issuing platform for IMTIAZ: can it do instant virtual cards and push provisioning? | Cards |
| I6 | Tap: Samsung Pay, Click to Pay, recurring BenefitPay, split payouts, transaction limits | Payments |
| I7 | Do Traffic Directorate, RERA, SLRB, SIO, and LMRA have B2B APIs? | IT |
| I8 | Which insurers have quoting/binding APIs today (Sahel already sells motor and travel insurance)? | Insurance |
| I9 | NMC / TAC / TCL: dealer management system (DMS) and inventory systems? | Automotive |
| I10 | What is "the server we already have"? (EC2, on-prem, or Sahel's backend?) | IT | ✅ **AWS** ([ADR-0003](adr/0003-aws-hosting.md)) |

## Technical decisions (become ADRs)

| # | Decision | Proposal |
|---|---|---|
| T1 | Source control | ✅ **GitHub for now** ([ADR-0002](adr/0002-source-control-github.md)); GitLab migration possible later |
| T2 | Backend language | ✅ TypeScript for now (API v1 in Next.js route handlers, shared `packages/domain`) |
| T3 | Flutter state management | ✅ Riverpod + go_router |
| T4 | Compute | ECS Fargate |
| T5 | Web | ✅ **Web parity mandatory; web is Next.js, mobile is Flutter** ([ADR-0004](adr/0004-web-parity.md)) |
| T6 | Auth | Keycloak/Cognito + eKey federation |
| T7 | Workflow engine | Step Functions vs. Temporal |
| T8 | AI | Bedrock (in-region) for Suhail/Suhaila 2.0 |
| T9 | Build vs. buy: decision engine, loan origination system (LOS) | Evaluate vendors during Phase 0 |

## New questions from the decisions (round 2)

Because Sahel 2.0 is decided and Sahel was built in-house, these are now the most important:

| # | Question | Owner | Status |
|---|---|---|---|
| N1 | **What is Sahel's current tech stack?** (mobile: Flutter, native, React Native? backend language? database?) This decides whether it's an *upgrade* or a *rebuild* | IT | Open |
| N2 | **Is Sahel's backend already on AWS?** Which account and region? | IT | Open |
| N3 | Are the Sahel developers available to join the Sahel 2.0 team? | IT / HR | Open |
| N4 | How many active Sahel users are there, and what are the top features by usage? (These must not break during migration) | Product | Open |
| N6 | Does Sahel have a web channel today? If so, what does it do and what is it built with? | IT | Open |
| N7 | Does iGA support eKey 2.0 login on the web for private companies (redirect or QR code)? | IT | Open |
| N5 | Can the Sahel 2.0 release keep the same store listings and bundle IDs (`com.cbt.bcfc`, iOS `id6443493467`) so users just get an update? | IT | Open. See P10 below: the prototype still uses `bh.bcfc.sahel` |

## Questions raised by the prototype

Building the sandbox prototype ([13-prototype-status.md](13-prototype-status.md)) surfaced these business and product decisions. The code currently makes a placeholder choice for each one (stated in the last column); none of them should go to production without an owner's answer.

| # | Question | Owner | What the prototype does today |
|---|---|---|---|
| P1 | **Payment amount binding:** for each payment purpose, which server-side record fixes the amount the customer may pay? Should the API refuse any amount that does not match it? | Payments / Product | Every purpose but installments is bound. Insurance premiums and early settlements: a policy is issued / a contract settled only if the captured amount equals the server quote. Reservation deposits and valuation fees: the server prices them (`GET /payments/price`) and `POST /payments` refuses any other amount (422 `AMOUNT_MISMATCH`). Installments still accept the amount the client sends |
| P2 | **Idempotency-key reuse with a different body:** if a client repeats an `Idempotency-Key` with a different amount or purpose, should we return the original result or reject it (e.g., 422)? | Payments / IT | Returns the original payment or application unchanged, without comparing the bodies. Keys are scoped per customer |
| P3 | **Dealer visibility of headroom:** may a dealer see the customer's maximum monthly installment (`maxMonthly`), or only the vehicle finance limit? | Compliance (PDPL) / Product | The dealer sees first name, vehicle limit, **maximum monthly installment**, and validity |
| P4 | **Card limit rule:** how is an instant card limit set? | Cards / Risk | 2× monthly salary, capped at BHD 15,000, and nothing without DBR headroom; a per-card minimum salary |
| P5 | **Islamic pre-approval:** the indicative pre-approval prices every line at the **conventional** rate. Should Islamic customers see a limit derived from Murabaha / Ijara pricing instead? | Risk / Shari'a | One limit per product line, derived from the conventional APR at the longest tenure. Home finance decisions (Ijara too) use this home limit; the Ijara and conventional home rates are equal today (6.0%), so it only matters once they differ |
| P6 | **Down-payment cap:** the calculator stops at a 90% down payment, but the pricing engine accepts any down payment below the price. Which is the rule, and should it be the same for every line and structure? | Product / Risk | 90% cap in the calculator limits only; the API quote and finance applications (vehicle and home) accept more |
| P7 | **Ibra' rule:** what rebate on unearned profit does BCFC grant on Murabaha early settlement, and how is unearned profit computed? (Ibra' is discretionary and cannot be a contract condition) | Shari'a board | 100% of unearned profit on a straight-line basis, as of the last paid installment |
| P8 | **Early-settlement fee:** what fee (if any) applies to conventional early settlement under current CBB rules? | Risk / Compliance | 1% of the remaining principal |
| P9 | **Refunds for captured but unbound policy payments:** if a premium is captured but the policy cannot be issued (quote expired, amount mismatch, insurer refusal), who refunds it, how fast, and how is it reconciled? | Payments / Insurance / Finance | No refund flow. The payment stays captured and the API returns an error (e.g., 410 quote expired, 422 mismatch) |
| P10 | **Bundle IDs for the update:** the Flutter app must ship as `com.cbt.bcfc` on Android and as App Store id `6443493467` on iOS so Sahel users get Sahel 2.0 as an update. Who holds the signing keys and store accounts? | IT | Bundle ID is `bh.bcfc.sahel` (Android and iOS) |
| P11 | Other placeholders needing sign-off: DBR cap (50%), rate cards, the HIGH_DBR_UTILISATION referral rule (80% of headroom), insurance pricing, valuation fee (BHD 150), reservation deposit (BHD 100) | Risk / Treasury / Product / Insurance | Full list with code locations: [13-prototype-status.md § 3](13-prototype-status.md#3-placeholders-that-need-business-sign-off) |

## Next steps (this week)

1. Review these documents with the leadership team and mark up the ⚠️ VERIFY items.
2. Answer N1–N5, I1, and I4. These are now the critical-path blockers.
3. Run the crazy-ideas prioritization workshop (2 hours).
4. Start commercial conversations with Tap, BENEFIT, iGA, and an AISP.
5. Kick off a 2-week design sprint for the onboarding + car-buying prototype.
