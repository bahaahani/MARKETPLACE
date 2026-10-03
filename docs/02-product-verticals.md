# 02 — Product Verticals

Every vertical plugs into the same core: **Identity → Profile → Pre-approval → Offer → Contract → Payment → Servicing**.

## Islamic vs. conventional: the dual-track rule

Every financing product has an Islamic and a conventional variant, presented **side by side** with a single toggle.

| Need | Conventional | Islamic structure (subject to Shari'a board approval) |
|---|---|---|
| Car finance | Auto loan (interest) | **Murabaha** (cost-plus sale) or **Ijara Muntahia Bittamleek** (lease-to-own) |
| Personal finance | Personal loan | **Tawarruq** (commodity Murabaha) |
| Home finance | Mortgage | **Ijara Muntahia Bittamleek**, **Musharaka Mutanaqisa** (diminishing partnership), or **Murabaha** |
| Credit card | Interest-bearing card | Fee-based or **Ujrah** card, or a Tawarruq-backed card |
| Insurance | Conventional insurance | **Takaful** (cooperative) |
| Late payment | Late interest | Fixed late charge **donated to charity** (shown transparently) |

**Current status (from bcfc.bh):** Vehicle **Murabaha** is live. Property **Ijara Muntahia Bittamleek** and personal **Commodity Murabaha** are coming soon. Islamic cards and a Takaful-only filter are still to be defined with the Shari'a board.

**Implication for engineering:** the product engine must model *contract type* as a first-class concept, not a flag. Murabaha requires BCF to **own the asset before selling it on**, so the app flow needs a real "asset purchase → ownership → sale" sequence with timestamps and an audit trail.

---

## 1. 🚗 Vehicles marketplace

### Supply

- **New cars:** National Motor Company (group) first, then other agencies through the dealer portal or API.
- **Used cars:** Tasheelat Automotive Company (inspected stock), Tasheelat Car Leasing lease returns, BCFC repossessed stock, certified dealers, and later peer-to-peer listings.
- **Leasing and subscription:** Tasheelat Car Leasing.

### Features

- Search and filters (make, model, year, price, **monthly installment**, Islamic/conventional, fuel type, body type)
- 360° photos and video walk-arounds, with a verified inspection report for used cars
- **"Price on my profile":** every listing shows *your* monthly payment once you're pre-approved
- Test-drive booking (at the showroom or at home)
- **Instant trade-in valuation:** the customer enters the car's plate and mileage and uploads photos, and AI returns a price range
- Reserve with a deposit through Tap
- Digital purchase: finance, insurance, and registration in one flow
- Delivery tracking

### Finance

- Down-payment slider, tenure slider, and balloon option (conventional only)
- Ijara or Murabaha toggle
- Insurance quote auto-attached (motor or Takaful, comprehensive or third-party)

---

## 2. 💰 Personal finance

- Product types: personal loan or Tawarruq, a wedding package, education, travel, medical, and **debt consolidation / buyout**
- **Eligibility check in 60 seconds** using eKey identity, the CRB report, and salary verification (Open Banking or a salary certificate)
- Clear display of APR or profit rate, total cost, and the installment schedule
- e-signature of the contract (⚠️ VERIFY legal acceptance of e-signatures for financing contracts under the Bahrain Electronic Communications & Transactions Law)
- Disbursement to the customer's IBAN through Fawri+ (instant)
- Early settlement calculator and top-up offers

---

## 3. 💳 Credit cards

- Product shelf: the IMTIAZ Mastercard family (World Elite, World, For Her, Platinum, Prepaid, UEFA, Unipal Youth, Corporate) plus future co-brands (e.g., an NMC car-owner card)
- Apply → instant decision → **virtual card issued instantly** → **push-provisioned to Apple Pay, Google Pay, or Samsung Pay** inside the app
- Card controls: freeze or unfreeze, limits, online/abroad toggles, view PIN, and replace card
- Spend insights and loyalty points across all verticals ("earn points on your car service")
- Convert a large purchase into installments (Easy Payment Plan)
- ⚠️ VERIFY the card processor and issuer platform (BENEFIT, a third-party processor, or in-house) and whether it supports tokenization and push provisioning

---

## 4. 🏠 Real estate

### Supply

- **TRESCO** properties for sale and its rental portfolio (residential, retail, offices, warehouses)
- Partner developers (off-plan and ready), RERA-licensed brokers, and private sellers (verified)
- Rentals

### Features

- Map-based search, filters, and "monthly cost" filters
- Virtual tours (Matterport-style), floor plans, and neighborhood data (schools, mosques, commute)
- Valuation request (**TRESCO, RERA Class A**, 3–5 days), with the report delivered in the app and auto-attached to the mortgage application
- Book a viewing
- Off-plan projects: payment plans and escrow transparency (RERA)
- **Rent-to-own** (Ijara Muntahia Bittamleek on residential property)
- Landlord tools: list a property, screen tenants, collect rent through Tap or BenefitPay

---

## 5. 🕌 Home finance (mortgages)

- **Conditional approval in the app** ("you can borrow up to BHD X") before the customer even picks a property
- Islamic (Ijara, Diminishing Musharaka, Murabaha) and conventional, side by side
- Calculators: affordability, debt-burden ratio (DBR) (⚠️ VERIFY the current CBB DBR limits), and rent vs. buy
- A document checklist with progress tracking (valuation, title deed, NOC)
- Integration with government housing schemes (**Mazaya**, Eskan Bank) ⚠️ VERIFY eligibility for BCF to participate
- Milestone tracker: application → valuation → offer → signing → registration at SLRB → disbursement

---

## 6. 🛡️ Insurance & Takaful

- **Lines:** motor, home, life, travel, medical, domestic helper, and device
- **Comparison mode:** Tasheelat Insurance is a **broker**, so the app shows quotes from multiple Bahrain insurers side by side. Motor and travel insurance are already sold in Sahel, so reuse those integrations
- Buy and pay in 2 minutes, with the policy PDF in the app vault
- Renewal reminders and one-tap renewal
- **Claims:** First Notice of Loss with photos, AI damage estimation (motor), garage booking, and status tracking
- Auto-attached to car and home finance flows (bundle discount)

---

## 7. Cross-cutting features (the "OS" of the app)

| Feature | Description |
|---|---|
| **Unified profile** | eKey-verified identity, employment, income, family, and documents |
| **Document vault** | CPR, salary certificate, contracts, and policies, all encrypted and reused across applications |
| **Pre-approval wallet** | "You're pre-approved for: car up to BHD X, personal up to BHD Y, card limit Z" |
| **My Assets** | Cars and properties owned or financed, with value tracking, renewals, and service |
| **Payments hub** | All installments, due dates, autopay, early payoff, and receipts |
| **Rewards** | Unified points across all verticals |
| **Notifications** | Push, SMS, WhatsApp, and email, with smart timing |
| **Support** | AI concierge, live chat, call-back, and branch appointment booking |
| **Referrals** | Refer friends; agent and partner commissions |
| **Accessibility** | Arabic right-to-left, font scaling, screen readers, and a senior mode |
