# 07 — Security, Compliance & Shari'a Governance

> We need a compliance officer and legal counsel on the project from week 1. Everything below is ⚠️ VERIFY against the current CBB Rulebook and Bahraini law.

## 1. Regulatory map

| Area | Requirement source | Impact on the build |
|---|---|---|
| Licensing scope | CBB Rulebook (financing company module) | Which products we can offer in the marketplace vs. only refer (e.g., other banks' loans → referral / lead-generation agreements) |
| Consumer protection | CBB Business Conduct module | Clear disclosure of APR / profit rate, total cost, fees; cooling-off periods; complaint handling inside the app |
| Digital onboarding / e-KYC | CBB Financial Crime module + e-KYC guidance | Liveness, ID verification, eKey usage, record retention |
| AML / CFT | CBB Financial Crime module; Bahrain AML law | Sanctions / PEP screening, transaction monitoring, suspicious transaction reporting to the FIU |
| Outsourcing & cloud | CBB Outsourcing module | **Notify or seek approval from CBB before putting production on AWS**; data location; audit rights in contracts |
| Cybersecurity | CBB cyber-security risk management module | Penetration tests (annual + major releases), SOC monitoring, incident reporting timelines |
| Open Banking | Bahrain Open Banking Framework | Consent UX standards, consent dashboard, revocation |
| Data protection | **PDPL (Law No. 30 of 2018)** | Lawful basis, consent, data-subject rights (access, deletion), cross-border transfer limits, DPO, breach notification |
| Cards | **PCI DSS v4.0** | Keep scope minimal through Tap tokenization; the card issuer platform is in scope separately |
| e-Contracts | Electronic Communications & Transactions Law | Validity of in-app signature for financing contracts |
| Real estate | RERA rules | Only list properties from licensed brokers and developers; off-plan escrow disclosures |
| Insurance | CBB Insurance module (Tasheelat Insurance as a broker) | Broker disclosures, comparison fairness, commission disclosure |
| Advertising | CBB rules on financial promotions | Representative examples on every "from BHD X / month" claim |
| Accessibility | Best practice | WCAG 2.1 AA |

## 2. Shari'a governance

- Every Islamic product, contract template, app flow, and **the sequence of events** (e.g., in Murabaha, BCFC buys the car, takes ownership, then sells it to the customer) must be **approved by the Shari'a Supervisory Board**: Sheikh Dr. Osama Bahar, Sheikh Dr. Naji Al Arabi, and Sheikh Waleed Al Mahmood.
- The app must **not** show an Islamic offer as "interest." Use profit rate, sale price, and rental.
- Late payment charges on Islamic products go to charity. The ledger needs a separate charity account.
- Commodity Murabaha (Tawarruq) needs a commodity platform integration (e.g., a metals exchange / commodity broker) with the agency and sale steps recorded. ⚠️ VERIFY the provider
- Insurance on Islamic finance should default to **Takaful**.
- An annual Shari'a audit of digital flows means the audit trail must be exportable.

## 3. Security architecture

| Layer | Controls |
|---|---|
| App | Cert pinning, root/jailbreak detection, anti-debug, obfuscation, secure storage, screenshot blocking on sensitive screens, no secrets in the binary |
| Auth | eKey / OIDC, device binding, biometrics, **step-up authentication** (biometric + OTP) for payments, beneficiary changes, and contract signing; session timeouts |
| API | WAF, rate limiting, bot protection, mTLS to partners, signed webhooks, idempotency |
| Data | Encryption at rest (KMS CMKs) and in transit; field-level encryption for CPR, IBAN, and income; tokenization of PII in analytics |
| Access | SSO for staff, least privilege, just-in-time production access, full audit logging |
| Fraud | Device fingerprinting, velocity rules, behavioral biometrics (later), synthetic-ID detection, dealer-collusion monitoring |
| SDLC | SAST, DAST, dependency/SCA scanning, secret scanning, container scanning, threat modeling for every epic, OWASP MASVS L2 for the app |
| Ops | 24/7 SOC (managed), SIEM, incident runbooks, CBB incident reporting |

## 4. Privacy by design

- A **consent ledger** records every data pull (CRB, Open Banking, eKey, location) with purpose, scope, and expiry.
- A **privacy dashboard** in the app shows customers what we hold and who it was shared with, and lets them revoke.
- **Data minimization:** analytics events contain no raw PII.
- **Retention:** contracts and KYC per CBB retention rules; marketing data deleted when consent is withdrawn.
- **AI:** customer data is used only in-region (Bedrock in the same AWS account), never for training third-party models, and the assistant's actions require explicit confirmation.
