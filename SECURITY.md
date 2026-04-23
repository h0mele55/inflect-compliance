# Security policy

Inflect Compliance handles audit-grade evidence, control records, and
identity material on behalf of its tenants. We treat security
researchers as partners. This document explains how to report a
vulnerability, what to expect from us in return, and the safe-harbour
commitments that apply to good-faith research.

## Reporting a vulnerability

Email **security@inflect-compliance.example** with a description of
the issue. PGP key:
[https://inflect-compliance.example/.well-known/pgp.txt](https://inflect-compliance.example/.well-known/pgp.txt).

If GitHub Security Advisories are enabled for this repository, you may
also use [Report a vulnerability](../../security/advisories/new) to file
the report privately.

A complete report typically includes:

- A clear description of the vulnerability and its impact.
- Steps to reproduce, including any required configuration, test
  accounts, or sample payloads.
- The affected commit SHA, deployment, or version where you observed
  the behaviour.
- Your contact details for follow-up — anonymous reports are accepted
  but slow down triage.

Please **do not** open a public GitHub issue, pull request, or
discussion thread for a suspected vulnerability. Public disclosure
before a fix is available puts our users at risk.

## What to expect from us

| Phase | Target |
| --- | --- |
| Acknowledgement of receipt | Within 2 business days |
| Initial triage + severity assessment | Within 5 business days |
| Status updates | At least weekly while the issue is open |
| Fix availability | 30 days for high/critical, 90 days for medium/low (best effort) |
| Public disclosure | Coordinated with reporter once a fix has shipped |

We will keep you informed throughout. If we cannot reproduce the issue
or believe it falls outside scope, we will explain our reasoning rather
than going silent.

## Scope

In scope:

- The Inflect Compliance Next.js application (`src/`), API routes
  (`src/app/api/`), background jobs (`src/app-layer/jobs/`), and the
  Prisma schema (`prisma/schema.prisma`).
- The Docker images we publish for self-hosted deployments.
- Authentication, authorization, multi-tenancy, audit-trail, and
  session-management surfaces.
- Any cryptographic or key-management code under `src/lib/security/`.

Out of scope:

- Issues that require a compromised host, browser, or local
  filesystem (e.g. "if I have your `.env` file I can decrypt your data").
- Vulnerabilities in third-party services we integrate with — please
  report those to the upstream provider.
- Denial-of-service attacks against shared staging environments.
- Findings produced by automated scanners with no demonstrated impact
  (missing security headers on `/login`, version-disclosure in
  `User-Agent`, etc.) — please verify exploitability before reporting.
- Social engineering of staff, users, or contractors.
- Physical attacks against any infrastructure.

## Safe harbour

We commit not to pursue legal action against researchers who:

1. Make a good-faith effort to comply with this policy.
2. Avoid privacy violations, destruction of data, and interruption or
   degradation of our services.
3. Only test against accounts they own or have explicit written
   permission to test.
4. Give us a reasonable opportunity to fix the issue before any public
   disclosure.

This safe harbour applies to civil and criminal liability we could
otherwise pursue under applicable computer-misuse statutes for the
acts of accessing, probing, and reporting the vulnerability.

## Recognition

With your permission we will publicly thank you in the release notes
for the fix and add your name to a future
`docs/security-acknowledgements.md`. If you prefer to remain anonymous,
say so in the report and we will honour that.

## Defences in this codebase

For context — useful when scoping reports — the application currently
implements:

- Postgres row-level security with a per-tenant context binding (Epic
  A.1) and an application-layer `tenantId` filter on every repository
  query.
- API rate-limiting on every mutation endpoint (Epic A.2) and
  progressive-delay brute-force protection on the credentials provider
  (Epic A.3).
- Field-level encryption at rest for business content (Epic B), with
  per-tenant DEKs wrapped by a master KEK and a documented rotation
  flow.
- Permission-key based API authorisation independent of UI checks
  (Epic C.1), enforced by `requirePermission(...)` and a CI guardrail
  (`tests/guardrails/api-permission-coverage.test.ts`).
- Local + CI secret detection (Epic C.2) — Husky pre-commit hook plus
  `tests/guardrails/no-secrets.test.ts`.
- Session hardening (Epic C.3) — operational session table, configurable
  concurrent-session limits, max-duration enforcement, per-session
  revocation from the admin UI.
- Outbound audit-event streaming (Epic C.4) for SIEM integration with
  HMAC-SHA256 signing and per-tenant configuration.
- Server-side rich-text sanitisation (Epic C.5) on every write path
  that accepts HTML.

If you discover a way around any of the above, please flag it
prominently in your report. Operator runbooks:
- [`docs/epic-c-security.md`](./docs/epic-c-security.md) — Epic C
  defense-in-depth controls (permission middleware, secret detection,
  session hardening, audit streaming, sanitisation).
- [`docs/epic-d-completeness.md`](./docs/epic-d-completeness.md) —
  Epic D remediations (`UserSession` RLS, encrypted-field
  sanitisation, legacy-admin-route migration).
