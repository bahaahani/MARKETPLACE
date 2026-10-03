# BCF Marketplace — Planning Repository

> **Status:** Planning / discovery (no code yet)
> **Owner:** Bahrain Commercial Facilities Company (BCF / "Bahrain Credit")
> **Platform:** Flutter (iOS, Android, Web) on AWS
> **Payments:** Tap Payments (cards, Click to Pay, Apple Pay, Google Pay, Samsung Pay, BenefitPay) + BENEFIT rails

One app that turns big life purchases into a single flow: **find it, finance it, insure it, pay for it, and manage it**, in Arabic and English, with Islamic and conventional options shown side by side.

The verticals are:

| Vertical | What the customer does |
|---|---|
| 🚗 Vehicles | Browse new and used cars, trade in, book a test drive, buy |
| 💳 Personal & car finance | Get instant pre-approval, choose Islamic or conventional, sign digitally |
| 🏦 Credit cards | Apply, get a virtual card on the spot, add it to Apple Pay or Google Pay |
| 🏠 Real estate | Browse, buy, rent, or rent-to-own property |
| 🕌 Mortgages | Islamic (Ijara, Musharaka, Murabaha) and conventional |
| 🛡️ Insurance & Takaful | Motor, home, life, travel, and medical; quote, buy, claim |

## Read in this order

| # | Document | What it answers |
|---|---|---|
| 00 | [Vision & North Star](docs/00-vision.md) | Why we're building this and what "crazy" means for us |
| 01 | [Market Research](docs/01-market-research.md) | The Bahrain landscape, competitors, regulators, and gaps |
| 02 | [Product Verticals](docs/02-product-verticals.md) | Features for each vertical, with Islamic and conventional variants |
| 03 | [Crazy Ideas Backlog](docs/03-crazy-ideas.md) | Big ideas, scored and ranked |
| 04 | [Integrations Map](docs/04-integrations.md) | Every external party we connect to, and how |
| 05 | [Payments](docs/05-payments.md) | Tap, BENEFIT, recurring installments, refunds, reconciliation |
| 06 | [Architecture](docs/06-architecture.md) | Flutter app, AWS backend, data, and APIs |
| 07 | [Security & Compliance](docs/07-security-compliance.md) | CBB rules, PDPL, PCI DSS, Shari'a governance |
| 08 | [User Journeys](docs/08-user-journeys.md) | End-to-end flows for the main journeys |
| 09 | [Roadmap](docs/09-roadmap.md) | Phases, MVP scope, and milestones |
| 10 | [Team, Repo & DevOps](docs/10-team-repo-devops.md) | GitLab vs. GitHub, CI/CD, environments, team |
| 11 | [Open Questions & Decisions](docs/11-open-questions.md) | What we must decide before writing code |

## Conventions

- Anything marked **⚠️ VERIFY** is an assumption. It must be confirmed with the partner, the regulator, or BCF internal teams before we build on it.
- Architecture decisions are recorded as ADRs under `docs/adr/` once they are made.
