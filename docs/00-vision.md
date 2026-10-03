# 00 — Vision & North Star

## The one-liner

> **"Everything you'll ever buy on installments in Bahrain, approved in minutes, in one app."**

## The problem today

A Bahraini resident buying a car today:

1. Visits 3–5 showrooms, or scrolls classifieds and Instagram.
2. Gets a quote, then goes to a bank or finance company and hands over paper: salary certificate, CPR, bank statements.
3. Waits days for approval.
4. Shops separately for insurance.
5. Registers the car through separate government channels.
6. Pays installments through yet another channel, then forgets about renewals until it's too late.

Every step is a separate company, a separate app or branch visit, and the same documents uploaded again. Buying a home is the same, only slower and with more paper.

**BCFC already owns the pieces:** BCFC Finance, Tasheelat Islamic, IMTIAZ cards, National Motor Company (new cars), Tasheelat Automotive (used cars), Tasheelat Car Leasing, TRESCO (real estate, a RERA Class A valuer), and Tasheelat Insurance (a broker). It also already has a customer app, **Sahel by BCFC**, and AI assistants **Suhail & Suhaila**. No competitor in Bahrain can stitch all of this together under one roof.

**The marketplace is the next leap for Sahel:** from *managing your BCFC finance* to *buying your life's big things*.

## North Star

**Time from "I want this" to "it's mine and it's paid for": under 15 minutes for a car, under 72 hours for a home.**

## Supporting metrics

| Metric | Target (Year 1) |
|---|---|
| Digital share of new BCF loans | ≥ 40% |
| Median time to pre-approval | < 3 minutes |
| Median time to disbursement (personal loan) | < 24 hours |
| Products per customer (cross-sell) | ≥ 1.8 |
| App rating (iOS and Android) | ≥ 4.6 |
| Monthly active users / total customers | ≥ 50% |
| Installments collected digitally | ≥ 70% |

## Design principles

1. **One identity, one profile, one consent.** Log in with eKey or biometrics. We never ask for a document we already have or can fetch with the customer's consent.
2. **Islamic and conventional side by side.** Every financing product shows both options transparently, so the customer chooses. We don't bury one behind the other.
3. **Show the real monthly cost everywhere.** Every car, home, and card displays "from BHD X / month" based on *this* customer's pre-approved profile.
4. **The marketplace is open.** BCF products are first-class citizens, but partner banks, insurers, dealers, and developers can list too. We win on experience, not lock-in.
5. **Bilingual from day one.** Arabic in full right-to-left layout and English are equal. Neither is a translation afterthought.
6. **After purchase is where loyalty is built.** Renewals, service, claims, and early payoff all live in the app.
7. **Regulator-ready by design.** CBB, PDPL, PCI DSS, and Shari'a compliance are architecture inputs, not a final checklist.
8. **Web parity, always.** Everything the mobile app does, the website does too. A feature isn't done until it works on iOS, Android, Huawei, **and Web** ([ADR-0004](adr/0004-web-parity.md)).

## What "crazy" means for us

We're not building a loan-application form inside an app. "Crazy" means:

- **Reverse marketplace:** the customer posts "I want a 2024 SUV under BHD 250/month," and dealers and lenders compete for them.
- **Life-event bundles:** "Just got married," "New job," and "First home" each trigger one bundled offer across all the verticals.
- **Instant everything:** a virtual credit card in Apple Pay seconds after approval, and a car loan approved while you sit in the test-drive seat.
- **Suhail & Suhaila, upgraded** from FAQ bots into agents that speak Bahraini Arabic and actually *do* things.

The full ranked list is in [03-crazy-ideas.md](03-crazy-ideas.md).

## Out of scope (for now)

- Deposit-taking or current accounts (BCF is not a retail bank). ⚠️ VERIFY against BCF's license category.
- Crypto or digital assets.
- Markets outside Bahrain. The architecture should still allow GCC expansion later.
