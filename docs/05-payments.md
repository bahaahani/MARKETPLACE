# 05 — Payments

## Payment methods (via Tap Payments)

| Method | Use cases | Flutter integration | Notes |
|---|---|---|---|
| **Visa / Mastercard (debit & credit)** | Deposits, installments, insurance premiums | Tap Checkout / Card SDK | 3-D Secure required |
| **Click to Pay** (Visa / Mastercard Secure Remote Commerce) | Faster card checkout with no typing | Via Tap ⚠️ VERIFY Tap support in Bahrain | |
| **Apple Pay** | All one-off payments | `tap_apple_pay_flutter` / Tap Checkout | Needs an Apple merchant ID and domain verification for web |
| **Google Pay** | All one-off payments | Tap Checkout | |
| **Samsung Pay** | All one-off payments | ⚠️ VERIFY Tap support and the SDK | |
| **BenefitPay** | The most-used local wallet: deposits and installments | `benefit_pay_flutter` (Tap) | Essential for adoption in Bahrain |
| **BENEFIT debit cards** | Local debit | Through Tap ⚠️ VERIFY | |

## Money in: collection flows

| Flow | Method | Mechanism |
|---|---|---|
| Car or property **reservation deposit** | Any of the above | Tap Charge (authorize → capture on confirmation, or void) |
| **Down payment** | Any; large amounts → bank transfer / Fawri+ | Tap or a virtual IBAN reference |
| **Insurance premium** | Any | Tap Charge |
| **Monthly installments** | (1) Saved card / Apple Pay token with merchant-initiated transactions; (2) BenefitPay; (3) EFTS direct debit; (4) Open Banking PISP | Tap **saved cards + recurring** (agreement ID / MIT) |
| **Early settlement** | Any | Tap Charge, then a core lending system update |
| **Rent collection** (landlord tools) | Any | Tap Charge with split payout ⚠️ VERIFY Tap marketplace/split support |

### Autopay design

- The customer opts in to autopay and picks a source (card token, BenefitPay, or bank direct debit).
- Charge on the due date minus 1 day, with smart retries (D+1, D+3, D+5) and notifications before each.
- On failure: push → WhatsApp → SMS → collections queue.
- **Islamic products:** late charges are booked to a charity account and shown that way in the app.

## Money out: disbursement flows

| Flow | Mechanism |
|---|---|
| Personal loan disbursement | Fawri+ to the customer's IBAN (via BCF's settlement bank) |
| Car / home finance | Paid to the dealer or developer (Fawri+ / EFTS), never to the customer |
| Refunds | Tap Refund API back to the original method |
| Partner commissions | Monthly batch through EFTS |
| Insurance claim payouts | Insurer → customer (outside our ledger, tracked only) |

## Architecture

```
Flutter App ──(Tap SDK: tokenize / Apple Pay / BenefitPay)──► Tap
     │                                                      │
     ▼                                                      ▼ webhooks (signed)
Payments Service (backend) ◄────────────────────────────────┘
     │  - creates charges server-side (secret key never in the app)
     │  - idempotency keys on every call
     │  - payment state machine: INITIATED → AUTHORIZED → CAPTURED → SETTLED / FAILED / REFUNDED
     ▼
Ledger Service (double-entry) ──► Core Lending (post installment) ──► ERP / GL
     │
     └─► Reconciliation job (daily): Tap settlement report vs. ledger vs. bank statement
```

### Rules

1. **Never** put Tap secret keys in the app. The app only uses the publishable key and SDK tokens.
2. Charges are created **server-side**. The app confirms the payment and the backend **verifies it via webhook + API retrieve** before marking anything paid.
3. Webhook signatures are verified (hashstring) and processing is idempotent.
4. Money values use **integer fils** (1 BHD = 1000 fils, three decimals) or a decimal type. **Never floats.**
5. A double-entry ledger is the single source of truth for money movement in the platform.
6. **PCI DSS scope reduction:** raw card numbers never touch our servers, because we only handle Tap tokens. That keeps us at SAQ A / A-EP ⚠️ VERIFY with a QSA.

## Open payment questions

- [ ] Tap pricing per method, settlement timing, and the settlement bank
- [ ] Does Tap support Samsung Pay and Click to Pay in Bahrain today?
- [ ] Recurring / MIT support for BenefitPay (or only card tokens)?
- [ ] Split payments / marketplace payouts (dealer deposits held in escrow)?
- [ ] Ceilings on transaction size for Apple Pay / BenefitPay (affects down payments)
- [ ] EFTS direct-debit mandate onboarding: can it be fully digital?
