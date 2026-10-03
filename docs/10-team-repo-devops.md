# 10 — Team, Repository & DevOps

## 1. GitLab or GitHub?

This planning repository lives on **GitHub** (`bahaahani/marketplace`) for now. Both work. The choice for production source code:

| | GitLab (self-managed or SaaS) | GitHub |
|---|---|---|
| Already available to BCFC | ✅ (stated) | ✅ |
| Self-hosting in BCFC's AWS (data residency) | ✅ Easy (GitLab self-managed on EC2/EKS in me-south-1) | ⚠️ GitHub Enterprise Server only |
| Built-in CI/CD | ✅ GitLab CI | ✅ GitHub Actions |
| Security scanning | ✅ Ultimate tier | ✅ GitHub Advanced Security |
| Ecosystem / AI tooling | Good | Very strong |

✅ **Decision: GitHub for now** ([ADR-0002](adr/0002-source-control-github.md)). We'll revisit a move to BCFC-hosted GitLab if Compliance or CBB requires source code to stay on BCFC infrastructure. Git history moves over cleanly either way, so keep CI definitions simple (GitHub Actions) and avoid deep lock-in.

## 2. Repository layout (proposed)

```
MARKETPLACE/                  # (current, see README)
├── docs/                     # planning set + ADRs
├── api/openapi.yaml          # API v1 contract (source of truth for web + mobile)
├── packages/
│   ├── domain/               # TypeScript: pricing engine, rules, catalog, payments (Vitest)
│   ├── i18n/                 # en/ar strings, shared by both apps
│   └── design-tokens/        # colors, radius, spacing
├── apps/
│   ├── web/                  # Next.js: full web app + API v1 route handlers (Playwright)
│   └── mobile/               # Flutter: iOS / Android / Huawei (flutter test)
└── tools/gen.mjs             # generates ARB, CSS and Dart from the shared packages
```
Later additions: `apps/dealer-portal` and `apps/backoffice` (Next.js), `services/platform` when the API moves out of Next.js, `integrations/` adapters.

Monorepo vs. multiple repos: start as a **monorepo** for speed, and split if teams or permissions require it.

## 3. Branching & quality gates

- Trunk-based development, short-lived branches, merge requests (MRs) with at least 1 reviewer (2 for payments, ledger, and security)
- Conventional commits; semantic versioning for the app
- Required checks: lint, format, unit and widget tests, golden tests, SAST, dependency scan, secret scan, OpenAPI contract tests, coverage ≥ 80% on domain modules

## 4. Environments

| Environment | Purpose | Data |
|---|---|---|
| `local` | Developer machines with mock partners | Synthetic |
| `dev` | Integrated, deployed on every merge | Synthetic + partner sandboxes |
| `staging` / UAT | Business UAT, partner certification, penetration testing | Masked |
| `prod` | Live | Real |
| `dr` | Disaster recovery | Replica |

## 5. Mobile release pipeline

- Flavors: `dev`, `staging`, `prod` (separate bundle IDs / app names)
- CI builds: **GitHub Actions** (macOS runners) or Codemagic → TestFlight, Play Internal Testing, AppGallery testing
- Signing keys stored in the CI vault, never in the repo
- Staged rollouts (1% → 10% → 50% → 100%) with a crash-free sessions gate ≥ 99.5%
- Forced-update mechanism via Remote Config (security fixes)

### Web release pipeline
- On every merge to main: Next.js build → Playwright end-to-end tests → deploy to `dev`
- Promote the same artifact to `staging` → `prod` (blue/green, instant rollback)
- Performance budget enforced in CI (Lighthouse CI): first load < 3 s on 4G
- Web and mobile versions are tied to the same feature flags, so features switch on together

## 6. Team (MVP)

| Role | Count |
|---|---|
| Product owner (BCFC) | 1 |
| Product managers (Finance, Marketplace) | 2 |
| UX/UI designers (bilingual, right-to-left experience) | 2 |
| Flutter engineers (mobile) | 4 |
| Next.js / React engineers (web) | 3–4 |
| Backend engineers | 4–5 |
| DevOps / cloud / SRE | 1–2 |
| QA / automation (mobile + web, Playwright) | 2–3 |
| Security engineer | 1 |
| Data / ML engineer | 1 (Phase 2+) |
| Business analysts (lending, Islamic, insurance) | 2 |
| Compliance / Shari'a liaison | Part-time, embedded |

Delivery model options: an in-house core team + partner agency, or a full agency (e.g., the Sahel vendor). ⚠️ DECISION
