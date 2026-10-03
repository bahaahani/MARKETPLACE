# 03 — Crazy Ideas Backlog

Each idea is scored with **ICE**: Impact × Confidence × Ease, each from 1 to 10. Higher is better. The scores are first-pass guesses for us to argue about in a workshop.

## 🏆 Tier 1: Signature ideas (these define the brand)

### 1. "Bid For Me": a reverse marketplace
The customer posts a request like *"Family SUV, 2023+, under BHD 220/month, Islamic financing, with Takaful."* Dealers respond with cars, and the finance and insurance are priced automatically on the customer's profile. The customer gets ranked offers within hours.
- **Why it's crazy:** it flips car buying. Sellers come to you.
- **Dependencies:** dealer portal, pre-approval engine, insurance quoting API
- **ICE:** 9 × 6 × 5 = **270**

### 2. Life-Event Engine
When a customer signals a life event, the app assembles a bundle:
- 💍 *Getting married* → wedding finance, a car, home rent-to-own, health Takaful for two
- 👶 *New baby* → a family car upgrade, life cover, an education savings plan
- 💼 *New job / salary increase* → card limit upgrade, a car, debt consolidation
- 🏠 *First home* → mortgage pre-approval, home insurance, furniture financing through partners

**ICE:** 8 × 7 × 6 = **336**

### 3. Approved before you sit down: an always-on pre-approval
With the customer's consent, we refresh their credit profile (CRB + Open Banking) monthly, so every price in the app is a **real, personal monthly figure**. When they walk into a partner showroom, the dealer scans the customer's QR code and sees "Pre-approved up to BHD 18,000." No forms.
- **ICE:** 10 × 7 × 6 = **420** ⭐ highest

### 4. Instant virtual card into Apple Pay or Google Pay in 90 seconds
Apply → approved → card in the wallet → tap to pay at the store, in under 2 minutes.
- **ICE:** 8 × 6 × 5 = **240** (depends on the card issuer platform)

### 5. Suhail & Suhaila 2.0: from chatbot to agent
BCFC already has the **Suhail and Suhaila** assistants. Upgrade them into bilingual voice and chat agents (Bahraini Arabic and English) that can *act*: "Pay my installment," "How much do I still owe on the car?", "Renew my insurance with the cheapest quote," "Find me a 3-bed villa in Saar under 300 a month." It is grounded in the customer's own data, and every action requires explicit confirmation.
- **ICE:** 9 × 6 × 5 = **270**

## 🚀 Tier 2: Strong differentiators

| # | Idea | Description | ICE |
|---|---|---|---|
| 6 | **AI trade-in valuation** | Photos plus the plate number give an instant price range, and the trade-in becomes the down payment | 8×6×6 = 288 |
| 7 | **AI claims (motor)** | Photograph the damage to get an estimate, a garage booking, and a replacement car in minutes | 7×5×5 = 175 |
| 8 | **My Garage** | A digital twin of each car: registration expiry, insurance, service history, fines (if an API exists), resale value tracking | 8×7×7 = 392 |
| 9 | **My Home** | Property value tracking, mortgage balance, equity, home-insurance renewal, maintenance marketplace | 7×6×6 = 252 |
| 10 | **Islamic/conventional transparency toggle** | Flip any product to see both structures, the total cost, and a plain-language explanation | 8×9×8 = 576 ⭐ quick win |
| 11 | **Rent-to-own homes** | Ijara-based housing for young families and expats who can't get a mortgage yet | 9×5×4 = 180 |
| 12 | **Debt consolidation optimizer** | With Open Banking consent, see all debts and get one offer that cuts the monthly total | 8×6×6 = 288 |
| 13 | **Unified rewards ("IMTIAZ Points Everywhere")** | Earn on installments paid on time, insurance, services, and referrals; burn on service, fuel, and partners | 7×7×6 = 294 |
| 14 | **Dealer & broker super-portal (B2B)** | Inventory, leads, instant financing at the point of sale, commissions dashboard | 8×7×5 = 280 |
| 15 | **Embedded finance API / widget** | Partners (furniture, electronics, travel agencies, clinics) embed "Pay monthly with Bahrain Credit" | 8×6×5 = 240 |

## 🧪 Tier 3: Moonshots (explore later)

| # | Idea | Note |
|---|---|---|
| 16 | **AR showroom** | Place a car in your driveway at full scale, then switch colors and trims |
| 17 | **Credit builder for expats and young people** | Small secured card or loan that builds a CRB history |
| 18 | **Family / group accounts** | Parents co-sign or guarantee for children; spouses see shared assets |
| 19 | **Car subscription** | All-inclusive monthly fee (car, insurance, service) with swaps every 12 months |
| 20 | **Fractional real estate investment** | Sukuk-like small-ticket property investing (heavy regulatory lift) |
| 21 | **Behavioral pricing** | On-time payers earn rate reductions automatically ("good payer cashback") |
| 22 | **Voice-first installments** | "Hey Siri, pay my Bahrain Credit installment" via App Intents / Android Shortcuts |
| 23 | **Wear OS / Apple Watch** | Due-date nudges and quick pay |
| 24 | **Zakat calculator plus a charity marketplace** | Islamic finance value-add; late-payment charity donations shown transparently |
| 25 | **EV transition program** | EV financing, charger installation at home, and green-rate discounts |
| 26 | **Gig-income underwriting** | Underwrite freelancers using cash flow from Open Banking instead of a salary certificate |

## Recommended MVP picks

From the scores above, the MVP should carry:
1. **#3 Always-on pre-approval** (the foundation for everything else)
2. **#10 Islamic/conventional toggle** (cheap and signature)
3. **#8 My Garage** (drives retention and ties to collections)
4. **#2 Life-Event Engine, lite**: a curated bundles screen, not AI yet
5. **#14 Dealer portal, lite** (needed for vehicle supply)

The rest is sequenced in [09-roadmap.md](09-roadmap.md).
