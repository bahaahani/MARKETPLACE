# ADR-0002: GitHub for source control (for now)

- **Status:** Accepted (2026-10-03)
- **Deciders:** BCFC management

## Context
BCFC has access to both GitLab and GitHub. Regulated code may eventually need to stay on BCFC-controlled infrastructure.

## Decision
Use **GitHub** (`bahaahani/marketplace`) for planning and source code for now, with **GitHub Actions** for CI/CD.

## Consequences
- ✅ Fast start, strong ecosystem and AI tooling.
- ⚠️ Revisit if Compliance or CBB requires self-hosted source control. Git history migrates cleanly to GitLab.
- Keep CI pipelines simple and portable (scripts in `tools/`, thin workflow files) to limit lock-in.
- Turn on branch protection, required reviews, secret scanning, and Dependabot from the first commit of code.
