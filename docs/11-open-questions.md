# 11 — Open Questions & Decisions

Please answer these (or assign an owner) before Phase 1 starts. **Bold** marks blockers.

## Strategy

| # | Question | Owner | Status |
|---|---|---|---|
| S1 | **Is this Sahel 2.0 (an evolution of Sahel by BCFC) or a new marketplace app that links to Sahel?** Recommendation: **Sahel 2.0**, a rebuild in Flutter that keeps the brand, users, and store listings. One app beats two | Management | Open |
| S2 | Who built Sahel (`com.cbt.bcfc`)? Who owns the source code, and what technology is it built with? Can its backend APIs be reused? | IT | Open |
| S3 | Is the marketplace open to **third-party lenders, banks, and insurers**, or BCFC-group only at first? | Management | Open |
| S4 | Is there a brand name for the marketplace, or is it simply "Sahel"? | Marketing | Open |
| S5 | What is "thevacantwillbe.net"? Is it the target domain, or should we use something under bcfc.bh? | IT | Open |

## Regulatory & Shari'a

| # | Question | Owner |
|---|---|---|
| R1 | **Does BCFC's CBB license allow the marketplace model (referring to or listing other institutions' products)?** | Compliance |
| R2 | **CBB cloud outsourcing: what notifications or approvals do we need to run on AWS me-south-1?** | Compliance / IT |
| R3 | Does the Shari'a board approve a fully digital Murabaha sequence (purchase → ownership → sale) with e-signature? | Shari'a |
| R4 | Are e-signatures legally accepted for financing contracts and mortgages? Are wet signatures or a notary still needed for SLRB? | Legal |
| R5 | What are the current DBR caps and other affordability rules we must enforce? | Risk |

## Integrations

| # | Question | Owner |
|---|---|---|
| I1 | **What is the process and timeline for eKey 2.0 federation for a private company?** | IT |
| I2 | Is the CRB API already used by BCFC? Is real-time access available? | Risk |
| I3 | Which Open Banking AISP (Tarabut, Spare, or Spire)? Commercials? | Product |
| I4 | **Core lending system: vendor, API capabilities, and real-time vs. batch** | IT |
| I5 | Card issuing platform for IMTIAZ: can it do instant virtual cards and push provisioning? | Cards |
| I6 | Tap: Samsung Pay, Click to Pay, recurring BenefitPay, split payouts, transaction limits | Payments |
| I7 | Do Traffic Directorate, RERA, SLRB, SIO, and LMRA have B2B APIs? | IT |
| I8 | Which insurers have quoting/binding APIs today (Sahel already sells motor and travel insurance)? | Insurance |
| I9 | NMC / TAC / TCL: dealer management system (DMS) and inventory systems? | Automotive |
| I10 | What is "the server we already have"? (EC2, on-prem, or Sahel's backend?) | IT |

## Technical decisions (become ADRs)

| # | Decision | Proposal |
|---|---|---|
| T1 | Source control | GitLab (BCFC-hosted) for production code |
| T2 | Backend language | NestJS (TypeScript) or Kotlin/Spring. Decide based on team skills |
| T3 | Flutter state management | Riverpod |
| T4 | Compute | ECS Fargate |
| T5 | Public web | Next.js for SEO; Flutter Web for portals |
| T6 | Auth | Keycloak/Cognito + eKey federation |
| T7 | Workflow engine | Step Functions vs. Temporal |
| T8 | AI | Bedrock (in-region) for Suhail/Suhaila 2.0 |
| T9 | Build vs. buy: decision engine, loan origination system (LOS) | Evaluate vendors during Phase 0 |

## Next steps (this week)

1. Review these documents with the leadership team and mark up the ⚠️ VERIFY items.
2. Answer S1, S2, R1, R2, I1, and I4. These are the critical-path blockers.
3. Run the crazy-ideas prioritization workshop (2 hours).
4. Start commercial conversations with Tap, BENEFIT, iGA, and an AISP.
5. Kick off a 2-week design sprint for the onboarding + car-buying prototype.
