# 09 — Roadmap

> Timelines assume a team of about 15–20 people (see [10-team-repo-devops.md](10-team-repo-devops.md)) and that partner contracts start **now**. Regulatory approvals are the critical path, not code.

## Phase 0: Discovery & Foundations (Weeks 0–8)

**Goal:** Know exactly what we are building and get every partner moving.

- [x] Decide: **Sahel 2.0** ✅
- [ ] **Sahel tech audit:** current stack, backend, AWS account, users, top features → upgrade vs. rebuild plan
- [ ] Stakeholder workshops: Finance, Islamic, Cards, NMC, TAC, TCL, TRESCO, Insurance, Collections, IT, Risk, Compliance
- [ ] Customer interviews (15–20) and teardowns of Sahel's analytics and reviews
- [ ] Prioritization workshop on [03-crazy-ideas.md](03-crazy-ideas.md)
- [ ] Partner kick-offs: Tap, BENEFIT (CRB / EFTS / Fawri+), iGA (eKey), Tarabut (or another AISP), e-KYC vendor, insurers
- [ ] CBB engagement: outsourcing/cloud notification, digital onboarding, marketplace model
- [ ] Shari'a board: approve the digital Murabaha flow
- [ ] UX: brand, design system, clickable prototype (Figma) of J1, J2, and J5; usability tests
- [ ] Architecture ADRs, AWS landing zone, CI/CD, repository setup
- [ ] Integration audit of the core lending system, card platform, and Sahel backend

**Exit criteria:** signed-off scope for the MVP, a prototype tested with users, partner sandboxes available, and AWS accounts ready.

## Phase 1: MVP ("Car + Finance + Pay") (Months 3–7)

**The thinnest slice that proves the concept, end to end:**

- Onboarding with eKey + CRB + salary verification → **always-on pre-approval**
- **Vehicles:** NMC new cars + TAC used cars (internal supply only), with monthly pricing
- **Islamic/conventional toggle** (vehicle Murabaha + conventional auto loan)
- Personal finance (conventional), with Commodity Murabaha once launched
- Motor insurance comparison (reuse Sahel's motor insurance)
- **Payments:** Tap (cards, Apple Pay, Google Pay, BenefitPay), deposits and installments, autopay with saved cards
- **My Garage**: registration and insurance renewal reminders, installments
- Back-office console (operations queue, manual review)
- Arabic + English, iOS + Android + Huawei (Sahel is on AppGallery) + **Web: full parity from MVP day 1** (Next.js, server-rendered and SEO-ready)
- **Migration:** existing Sahel features (transfers, bill pay, card control, applications, motor and travel insurance) keep working. The release ships as an update to the existing store listings

**Launch:** a closed beta with 500 staff and friendly customers → public launch.

## Phase 2: Marketplace (Months 8–12)

- **Dealer & broker portal** → third-party car dealers and RERA brokers
- **Real estate vertical** (TRESCO + partners) + mortgage conditional approval (Ijara when launched)
- **Credit cards:** digital application, instant virtual card, push provisioning
- Full insurance shelf (home, travel, medical, life) and Takaful
- **Life-Event bundles** (curated)
- Unified **rewards**
- **Suhail / Suhaila 2.0** (read-only agent: answers about your own account data)
- SEO pages extended to real estate, cards, and insurance

## Phase 3: "Crazy" (Months 12–18)

- **Bid For Me** reverse marketplace
- AI trade-in valuation and AI motor claims
- Suhail / Suhaila 2.0 **transactional** (pay, renew, settle) + voice
- Rent-to-own homes; car subscription (TCL)
- Embedded finance API / widget for retailers ("Pay monthly with BCFC")
- Debt-consolidation optimizer (Open Banking)
- Open Banking PISP payments; EFTS direct debit

## Phase 4: Scale (18 months +)

- AR showroom, 3D property tours at scale
- Credit builder, gig-income underwriting
- GCC expansion readiness (multi-currency, multi-regulator)

## Milestone summary

| Milestone | Target |
|---|---|
| Discovery complete, MVP scope signed | Week 8 |
| Prototype tested with customers | Week 8 |
| Partner sandboxes integrated | Month 4 |
| CBB no-objection for cloud / digital onboarding | Month 5 ⚠️ critical path |
| Closed beta | Month 6 |
| Public MVP launch | Month 7 |
| Marketplace (third-party supply + real estate) | Month 12 |
| Crazy features | Month 18 |
