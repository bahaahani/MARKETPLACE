# 09 — Roadmap

> **Prototype ✅** marks items the sandbox prototype in this repository already demonstrates (web + mobile, in-memory, simulated partners). That is a working demo for user testing and alignment, **not** production delivery: see [13-prototype-status.md](13-prototype-status.md) for the gaps.

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
- [ ] UX: brand, design system, clickable prototype (Figma) of J1, J2, and J5; usability tests. **Prototype ✅** a working coded prototype of J1, J2, J3, J5 and J7 exists (web + mobile, sandbox); usability tests still to do
- [ ] Architecture ADRs, AWS landing zone, CI/CD, repository setup. **Prototype ✅** ADRs 0001–0004, monorepo and GitHub Actions CI (domain, web, mobile tests); AWS landing zone and deploy pipeline still to do
- [ ] Integration audit of the core lending system, card platform, and Sahel backend

**Exit criteria:** signed-off scope for the MVP, a prototype tested with users, partner sandboxes available, and AWS accounts ready.

## Phase 1: MVP ("Car + Finance + Pay") (Months 3–7)

**The thinnest slice that proves the concept, end to end:**

- Onboarding with eKey + CRB + salary verification → **always-on pre-approval**. **Prototype ✅** (eKey, CRB and Open Banking simulated; obligations self-declared)
- **Vehicles:** NMC new cars + TAC used cars (internal supply only), with monthly pricing. **Prototype ✅** (demo catalog, reservation deposit, apply for finance)
- **Islamic/conventional toggle** (vehicle Murabaha + conventional auto loan). **Prototype ✅** including the Murabaha sequence (BCFC buys → owns → sells) on the application timeline; illustrative rates
- Personal finance (conventional), with Commodity Murabaha once launched. **Prototype ✅** both structures (placeholder credit rules)
- Motor insurance comparison (reuse Sahel's motor insurance). **Prototype ✅** compare and buy, policy bound to a captured payment (fictional insurers)
- **Payments:** Tap (cards, Apple Pay, Google Pay, BenefitPay), deposits and installments, autopay with saved cards. **Prototype ✅** checkout for every method against a sandbox gateway; autopay is an on/off flag only (no saved cards, no scheduled charges)
- **My Garage**: registration and insurance renewal reminders, installments. **Prototype ✅** account page with demo installments, garage, early settlement (placeholder fee / Ibra'); no reminders yet
- Back-office console (operations queue, manual review). Not started (referred applications have no review queue yet)
- Arabic + English, iOS + Android + Huawei (Sahel is on AppGallery) + **Web: full parity from MVP day 1** (Next.js, server-rendered and SEO-ready). **Prototype ✅** web + Flutter parity in EN and AR (RTL), tested; Huawei-specific services not yet
- **Migration:** existing Sahel features (transfers, bill pay, card control, applications, motor and travel insurance) keep working. The release ships as an update to the existing store listings

**Launch:** a closed beta with 500 staff and friendly customers → public launch.

## Phase 2: Marketplace (Months 8–12)

- **Dealer & broker portal** → third-party car dealers and RERA brokers. **Prototype ✅** web portal: inventory, leads board, showroom offers from a customer's shared pre-approval code (no staff login)
- **Real estate vertical** (TRESCO + partners) + mortgage conditional approval (Ijara when launched). **Prototype ✅** listings, conventional vs Ijara calculator, valuation fee; no home finance application yet
- **Credit cards:** digital application, instant virtual card, push provisioning. **Prototype ✅** application, instant masked virtual card, My cards; provisioning simulated
- Full insurance shelf (home, travel, medical, life) and Takaful. **Prototype ✅** travel and home (plus motor), My policies, Takaful filter; medical and life not yet
- **Life-Event bundles** (curated). **Prototype ✅** (placeholder amounts and premiums)
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
| Coded sandbox prototype (web + mobile, EN + AR) | **Prototype ✅** done ([13-prototype-status.md](13-prototype-status.md)) |
| Discovery complete, MVP scope signed | Week 8 |
| Prototype tested with customers | Week 8 |
| Partner sandboxes integrated | Month 4 |
| CBB no-objection for cloud / digital onboarding | Month 5 ⚠️ critical path |
| Closed beta | Month 6 |
| Public MVP launch | Month 7 |
| Marketplace (third-party supply + real estate) | Month 12 |
| Crazy features | Month 18 |
