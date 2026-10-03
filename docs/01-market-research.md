# 01 — Market Research

> This is a first pass. Items marked ⚠️ VERIFY need confirmation through BCF internal teams, partner calls, or regulator guidance.

## 1. About us: BCFC group (from beta.bcfc.bh, October 2026)

BCFC was founded in 1983 and is licensed by the CBB. It is listed on Bahrain Bourse (BCFC). Tagline: *"The name Bahrain has trusted."* Call center: **80008000**. Six branches.

### Group map

| Entity | What it does | Website | Role in the marketplace |
|---|---|---|---|
| **BCFC (Finance)** | Personal, vehicle, mortgage, and commercial/SME finance (conventional + Islamic) | bcfc.bh | Lender: the engine of the marketplace |
| **Tasheelat Islamic** | Islamic window. **Vehicle Murabaha is live.** Property **Ijara Muntahia Bittamleek** and personal **Commodity Murabaha** are *coming soon*. Shari'a board: Sheikh Dr. Osama Bahar, Sheikh Dr. Naji Al Arabi, Sheikh Waleed Al Mahmood | /en/tasheelat-islamic/ | Islamic track of every product |
| **IMTIAZ cards** (Mastercard) | World Elite, World, For Her (World/Platinum), Platinum, Platinum Prepaid, UEFA Champions League, Unipal Youth, Corporate World/Executive | /en/imtiaz-cards/ | Cards vertical, rewards currency |
| **National Motor Company (NMC)** | New-vehicle distributor, multi-brand (the site shows Honda, Cadillac, and HAVAL imagery ⚠️ VERIFY the full brand list), parts, after-sales | nmc.com.bh | New-car supply plus service bookings |
| **Tasheelat Automotive Company (TAC)** | Inspected pre-owned cars with in-house financing | tac.com.bh | Used-car supply and trade-ins |
| **Tasheelat Car Leasing (TCL)** | Short- and long-term leasing with maintenance included | tcl.bh | Leasing and car-subscription vertical |
| **Tasheelat Real Estate (TRESCO)** | **RERA Class A** valuations (RICS/IVS, 10,000+ reports, 3–5 days), property sales, rental portfolio (residential, retail, offices, warehouses), managed projects | /en/bcfc-group/tasheelat-real-estate/ | Property supply, valuation, landlord |
| **Tasheelat Insurance** | **Insurance broker** comparing Bahrain insurers: motor (with 24/7 roadside assistance), medical, travel, home, life. Motor and travel insurance are already sold in Sahel | /en/bcfc-group/tasheelat-insurance/ | Insurance comparison vertical |

### Existing digital assets

- **Sahel by BCFC** app (iOS `id6443493467`, Android `com.cbt.bcfc`, Huawei AppGallery). Features: instant transfers, bill payments, account overview, card control, finance applications and repayments, motor and travel insurance.
- **Suhail & Suhaila**: existing AI assistants (in the app and on the website).
- Cards already support **Apple Wallet, Google Pay, and Mastercard Click to Pay**.
- Website: bcfc.bh, with a new site at beta.bcfc.bh.
- Loyalty program plus IMTIAZ Offers (Namshi, Home Centre, Costa, Trip.com, Reel Cinema, UEFA, and others).

**Strategic insight:** BCFC is the only group in Bahrain that is at once a **lender, a new-car distributor, a used-car dealer, a lessor, a RERA Class A valuer and landlord, and an insurance broker**, with a Shari'a board in place. The marketplace stitches these together. **No competitor can replicate the supply side.**

> ✅ DECIDED: the marketplace is **Sahel 2.0**, an evolution of the existing app and its users. Sahel was **built in-house by BCFC**, and BCFC owns the code. See [ADR-0001](adr/0001-sahel-2.0.md).

## 2. Regulators and national infrastructure

| Body | Relevance |
|---|---|
| **Central Bank of Bahrain (CBB)** | Licenses BCF. The CBB Rulebook (Vol. 5 for financing companies, ⚠️ VERIFY), consumer protection, outsourcing and cloud rules, e-KYC, and the Open Banking Framework |
| **CBB Bahrain Open Banking Framework (BOBF)** | Standardized bank APIs. Licensed AISPs and PISPs include **Tarabut**, **Spare**, and **Spire**. BOBF includes Islamic finance considerations |
| **BENEFIT** | The national payment switch: BenefitPay wallet, Fawri and Fawri+ instant transfers, EFTS, and the **Credit Reference Bureau (CRB)** |
| **iGA (Information & eGovernment Authority)** | **eKey 2.0** national digital identity (biometric single sign-on), CPR data, and the Bahrain.bh portal |
| **Ministry of Industry & Commerce: Sijilat** | Commercial registration, used for business loans and to verify dealers |
| **RERA (Real Estate Regulatory Authority)** | Licensing of real estate brokers and developers, off-plan project escrow, and valuers |
| **Survey & Land Registration Bureau (SLRB)** | Title deeds and mortgage registration |
| **General Directorate of Traffic** | Vehicle registration, ownership transfer, and fines |
| **SIO (Social Insurance Organization)** | Salary and employment verification (⚠️ VERIFY API availability) |
| **LMRA** | Work-permit status for expat applicants |
| **Ministry of Housing / Eskan Bank** | Social housing finance schemes (e.g., **Mazaya**), which matter for partnering in mortgages |
| **PDP Authority** | Personal Data Protection Law (Law No. 30 of 2018) |
| **Shari'a supervisory board** | Approves the structure of every Islamic product. CBB generally requires AAOIFI standards ⚠️ VERIFY for a financing company's Islamic window |

## 3. Competitive landscape

### Direct and indirect competitors in Bahrain ⚠️ VERIFY feature claims

| Player | Type | What they do well | Gap we can exploit |
|---|---|---|---|
| Retail banks (NBB, BBK, Al Salam, KFH-Bahrain, BisB, Ahli United/KFH, ila Bank) | Bank apps | Strong deposits and cards; digital personal finance | Single-bank only, no car or property marketplace, no comparison |
| **Al Salam Bank app** (the "Assalam" app referenced) | Islamic bank super-app | Islamic retail, lifestyle features | One bank, one product shelf |
| **ila Bank** (digital bank, BBK group) | Neobank | UX and fast onboarding | No asset marketplace |
| Other consumer finance companies | Lenders | Car and personal loans | Paper-heavy, branch-led |
| Classifieds (OLX-type, Instagram dealers, Expat.com, property portals) | Listings | Traffic and inventory | No financing, no trust layer, no payments |
| Insurers' own apps (GIG, Solidarity, SNIC, Bahrain National, etc.) | Insurance | Policy servicing | One insurer only, no comparison |
| Insurance aggregators (regional) | Comparison | Price comparison | Weak local presence and no financing link |
| GCC super-apps (e.g., Saudi/UAE models: Tabby, Tamara, Careem) | BNPL / super-app | UX and small-ticket BNPL | Not built for big tickets like cars and homes |

Note: **Sahel is BCFC's own app** (Sahel by BCFC), not a competitor. The marketplace builds on it. Kuwait's government app, also called "Sahel," is a good benchmark for a *one app for everything* UX.

### Lessons from regional and global benchmarks

| Benchmark | What to borrow |
|---|---|
| Kuwait **Sahel** | One identity, many services, and notifications as the main UX |
| **Carvana / Cazoo** (US/UK) | Fully online car purchase, 360° photos, and a 7-day return policy |
| **Rocket Mortgage** (US) | "Push button, get mortgage": instant conditional approval |
| **Revolut / Monzo** | Instant virtual cards and spending insights |
| **Policybazaar** (India) | Insurance comparison at scale |
| **Grab / Gojek** | Super-app built around one daily habit, with finance layered on top |
| **Property Finder / Bayut** (GCC) | Property search UX, verified listings, and mortgage calculators |

## 4. Customer segments

| Segment | Needs | Notes |
|---|---|---|
| Young Bahraini professionals (22–35) | First car, credit card, wedding loan | Mobile-first and Arabic/English mixed. The life-event engine fits them best |
| Families (30–50) | Home, second car, education, insurance bundles | Mostly Islamic-preference. Mortgage is the key product |
| Expat professionals | Car, card, rent-to-own | Eligibility limited by salary and employer. LMRA and employer lists matter |
| SMEs and sole proprietors | Business loans, fleet vehicles, cheque discounting | Sijilat integration needed |
| Dealers, brokers, and developers (B2B) | Lead generation, instant financing at the point of sale | The supply side of the marketplace |

## 5. Market gaps = our opportunity

1. **No asset-plus-finance marketplace** exists in Bahrain where you can find a car or home *and* get it financed and insured in one flow.
2. **No transparent Islamic-vs-conventional comparison.** Customers rarely see the same product's profit rate and interest rate side by side.
3. **Paper is still the norm.** eKey, the CRB, and Open Banking make paperless approval possible, but few companies use all three together.
4. **Servicing after purchase is weak.** Nobody owns the "my car" or "my home" relationship after the sale.
5. **Expats are underserved** by fast, clear eligibility checks.

## 6. Research to do next (discovery sprint)

- [ ] 15–20 customer interviews across the segments above
- [ ] An internal data pull: product mix, approval times, drop-off points, and collection channels
- [ ] Partner discovery calls: Tap, BENEFIT (CRB and EFTS), Tarabut, 3–5 insurers, 5 dealers, 3 developers
- [ ] A regulatory consultation with CBB on the digital onboarding, cloud outsourcing, and marketplace model
- [ ] A Shari'a board session on digital Murabaha execution (the asset ownership sequence in an app flow)
- [ ] Teardowns of competitor apps (screens, steps, time to approval)

## Sources

- [CBB Annual Report 2024](https://www.cbb.gov.bh/wp-content/uploads/2025/03/CBB-Annual-Report-2024-English-Draft_-1.pdf)
- [Bahrain Open Finance tracker (Fiskil)](https://www.fiskil.com/open-finance-tracker/bahrain)
- [Pinsent Masons: Bahrain takes the lead on open banking](https://www.pinsentmasons.com/out-law/news/bahrain-takes-lead-open-banking-in-the-middle-east)
- [BCFC new website (beta)](https://beta.bcfc.bh), including [Tasheelat Islamic](https://beta.bcfc.bh/en/tasheelat-islamic/), [Automotive](https://beta.bcfc.bh/en/bcfc-group/automotive/), [Insurance](https://beta.bcfc.bh/en/bcfc-group/tasheelat-insurance/), and [Real Estate](https://beta.bcfc.bh/en/bcfc-group/tasheelat-real-estate/)
- [MarketScreener: BCF company profile](https://uk.marketscreener.com/quote/stock/BAHRAIN-COMMERCIAL-FACILI-6498446/company/)
- [BENEFIT Credit Report service](https://services.bahrain.bh/wps/portal/BenefitReports_en)
- [eKey 2.0](https://services.bahrain.bh/wps/portal/en/BSP/GSX-UI-AllApps/GSX-UI-AppDetails?appID=24)
