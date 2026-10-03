# ADR-0003: Host on AWS

- **Status:** Accepted (2026-10-03)
- **Deciders:** BCFC management

## Context
BCFC already has a server and full access on AWS. Management confirms that the CBB license and cloud usage allow this.

## Decision
Host Sahel 2.0 on **AWS**, with **me-south-1 (Bahrain)** as the primary region for data residency.

## Consequences
- ✅ In-country data residency; managed services (Aurora, OpenSearch, Bedrock, etc.).
- ➡️ Audit the existing AWS account (what runs there, region, whether Sahel's backend is there) before designing the multi-account landing zone (see [06-architecture.md](../06-architecture.md) §4).
- ➡️ Compliance files the CBB outsourcing notification and keeps written confirmation on file.
- ⚠️ Pick a DR region / strategy that stays within CBB data-location rules.
