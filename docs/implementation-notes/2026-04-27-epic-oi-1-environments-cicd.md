# 2026-04-27 — Epic OI-1: Environments + CI/CD

**Commit:** _(uncommitted at note authoring; squash-merge target tbd)_

Builds on the prior three Epic OI-1 notes (foundation, VPC+DB,
Redis+Storage). Closes the epic by:

1. Restructuring per-env config into `environments/<env>/` directories
   per the OI-1 spec.
2. Adding `.github/workflows/terraform.yml` — plan-on-PR with sticky
   comments, auto-apply staging on push-to-main, manual-approval-gated
   production apply.

## Design

### Environment layout

```
infra/terraform/environments/
├── staging/
│   ├── backend.hcl          ← partial S3 backend config
│   ├── terraform.tfvars     ← non-sensitive var values for staging
│   └── README.md            ← env-scoped operator notes (IAM/OIDC, GH Environment setup)
└── production/
    ├── backend.hcl
    ├── terraform.tfvars
    └── README.md
```

The OI-1 spec explicitly calls out
`infra/terraform/environments/staging/` and
`infra/terraform/environments/production/` paths. This is the
canonical layout. The previous flat layout
(`envs/<env>.{backend.hcl,tfvars}`) was migrated; the structural
ratchet asserts the legacy `envs/` directory no longer exists, so a
future PR cannot accidentally re-introduce the flat layout.

The shared **root module** at `infra/terraform/` is unchanged — DRY
preserved, only the per-env config indirection moved. Wrapper-module
patterns (separate `main.tf` per env) were rejected: heavy
duplication, easy to drift, no isolation gain over partial-backend
per-env state.

### CI workflow — `.github/workflows/terraform.yml`

```
                 PR (infra/terraform/**)
                        │
                        ▼
              ┌────────────────────┐
              │  fmt + validate    │   (no AWS creds; -backend=false)
              └─────────┬──────────┘
                        │
                ┌───────┴───────┐
                ▼               ▼
       ┌─────────────┐   ┌─────────────┐
       │ Plan staging│   │Plan prod    │   matrix, parallel
       └──────┬──────┘   └──────┬──────┘
              │                  │
              └────────┬─────────┘
                       ▼
            Sticky PR comment per env  +  GITHUB_STEP_SUMMARY


             push to main (infra/terraform/**)
                        │
                        ▼
              ┌────────────────────┐
              │  fmt + validate    │
              └─────────┬──────────┘
                        ▼
              ┌────────────────────┐
              │  apply: staging    │   environment=staging (no reviewers)
              └─────────┬──────────┘
                        ▼
              ┌────────────────────┐
              │  apply: production │   environment=production
              │  (PAUSED until     │   (required reviewers MANDATORY)
              │   reviewer         │
              │   approves)        │
              └────────────────────┘
```

**OIDC auth**, no long-lived AWS keys. Each GitHub Environment
(`staging` / `production`) holds one secret: `AWS_ROLE_TO_ASSUME` —
the ARN of an IAM role whose trust policy allows assume-from-OIDC
for this repo. The structural ratchet asserts the workflow has no
inline ARN value and no `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
references.

**Plan visibility** — three layers:
1. **Sticky PR comment** per env, marker `<!-- terraform-plan:<env> -->`
   so the two plans don't overwrite each other. Updates if a previous
   comment exists; creates otherwise.
2. **`GITHUB_STEP_SUMMARY`** dump for the workflow run page.
3. **Workflow log** — full plan via `terraform plan -no-color` to
   stdout for searchable history.

PR comment is truncated at 60KB to fit GitHub's ~65KB limit; the
workflow log keeps the full output.

**Plan exit-code handling.** `terraform plan -detailed-exitcode`
returns `0` (no changes), `1` (error), or `2` (changes pending).
The job treats 0 + 2 as success (so the comment posts even when a
plan with diffs is the expected state) and only fails on 1. The
status badge in the comment distinguishes:

| Exit | Status |
|---|---|
| 0 | ✅ No changes |
| 2 | 🟡 Changes pending |
| 1 | ❌ Plan failed |

**Concurrency**:
- `terraform-staging` group on apply-staging
- `terraform-production` group on apply-production
- `cancel-in-progress: false` everywhere — never cancel an in-flight
  apply (would corrupt state and require lock release).

**Production gate semantics.**
- On `push to main`: production apply `needs: [apply-staging]` and
  the if-condition requires `needs.apply-staging.result == 'success'`.
  Canary path — staging always runs first, prod waits.
- On `workflow_dispatch` with `environment=production`: the
  `always() && (... || dispatch-production)` if-expression bypasses
  the staging dependency. Escape hatch for prod-only changes (rare).
- The **manual approval gate** itself is not in the workflow file —
  it lives in the GitHub Environment's protection rules ("Required
  reviewers"). The workflow's only contribution is `environment:
  production`, which is what triggers the gate. This is documented
  as a setup prerequisite in `environments/production/README.md`.

**Fork PRs** are skipped at the plan job
(`github.event.pull_request.head.repo.fork == false`). OIDC tokens
don't issue to forks, so the configure-aws-credentials step would
fail. Maintainers can repost from a branch.

**Path filters** scope the workflow to `infra/terraform/**` and the
workflow file itself — no wasted CI minutes on app-only changes.

### Complementary to existing deploy.yml

| Workflow | Purpose | Triggers |
|---|---|---|
| `terraform.yml` | Provisions infrastructure (RDS, ElastiCache, S3, VPC, IAM, Secrets) | `infra/terraform/**` changes |
| `deploy.yml` | Ships application Docker image to provisioned compute | Manual + (currently disabled) auto-on-CI-pass |
| `ci.yml` | Tests + lints the application code | App changes |

The two delivery workflows share nomenclature (GitHub Environments
named `staging` / `production`) but use independent secrets.
`terraform.yml` consumes `AWS_ROLE_TO_ASSUME` (per env). `deploy.yml`
consumes `DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_SSH_KEY` /
`DEPLOY_PATH` (the SSH-based VM deploy). They don't conflict and can
co-exist indefinitely.

## Files

| File | Status |
|---|---|
| `infra/terraform/environments/staging/backend.hcl` | Moved from `envs/staging.backend.hcl` |
| `infra/terraform/environments/staging/terraform.tfvars` | Moved from `envs/staging.tfvars` |
| `infra/terraform/environments/staging/README.md` | New — env operator notes (IAM/OIDC + GH Environment setup) |
| `infra/terraform/environments/production/backend.hcl` | Moved from `envs/production.backend.hcl` |
| `infra/terraform/environments/production/terraform.tfvars` | Moved from `envs/production.tfvars` |
| `infra/terraform/environments/production/README.md` | New — same as staging plus required-reviewers callout |
| `infra/terraform/envs/` | **Deleted** (legacy flat layout) |
| `infra/terraform/Makefile` | Path rewrite: `envs/$(ENV).backend.hcl` → `environments/$(ENV)/backend.hcl`; same for tfvars |
| `infra/terraform/README.md` | Layout diagram + "First-time setup" + "Switching environments" + "Secrets policy" sections updated to new paths; new "CI integration" section documenting the workflow's gating model + setup prereqs |
| `.github/workflows/terraform.yml` | New — fmt-validate, plan (PR, matrix×2 with sticky comments), apply-staging (push, env=staging), apply-production (push needs staging OR dispatch=production, env=production for required-reviewers gate), OIDC, concurrency, path filters, fork-PR opt-out |
| `tests/guards/terraform-workflow.test.ts` | New 24-assertion structural ratchet — parses YAML, asserts triggers/jobs/gating model/OIDC/secret hygiene/env directory layout |
| `tests/guards/terraform-foundation.test.ts` | Path rewrite for env directory layout (existing 40 assertions preserved) |
| `tests/guards/terraform-vpc-database.test.ts` | Path rewrite |
| `tests/guards/terraform-redis-storage.test.ts` | Path rewrite |
| `docs/implementation-notes/2026-04-27-epic-oi-1-environments-cicd.md` | This file |

## Decisions

- **Directory-per-env, not flat-file-per-env.** The OI-1 spec is
  explicit about the path. Directory layout also scales better when
  per-env additions appear later (e.g. env-scoped data sources for
  consuming external state, env-scoped overrides). The `terraform.tfvars`
  filename matters — Terraform auto-loads it under standard
  conventions when run from the env directory; we still pass it
  explicitly via `-var-file` so the working directory stays at the
  shared root.

- **Shared root + partial backend, not per-env wrapper modules.**
  Wrapper modules duplicate the root composition's `module "vpc"
  ...` blocks per env — easy to drift (one env gets a new flag, the
  other doesn't). Partial backend config + per-env tfvars achieves
  the same isolation (separate state, separate IAM principal) with
  zero duplication.

- **OIDC over long-lived keys.** GitHub's
  `aws-actions/configure-aws-credentials@v4` exchanges the workflow's
  OIDC token for short-lived AWS creds via STS AssumeRoleWithWebIdentity.
  The IAM role's trust policy can pin to specific repos, branches,
  or PRs — much tighter than a static access key. The structural
  ratchet asserts no AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY refs
  anywhere in the workflow.

- **`environment: production` IS the manual-approval gate.** GitHub's
  required-reviewers protection rule is configured on the
  Environment, not in the workflow file. The workflow's only
  contribution is referencing the environment by name. This is a
  load-bearing assumption: if an operator deletes the production
  environment in repo settings, OR removes the required-reviewer
  rule, prod becomes auto-apply. There's no way to assert the
  protection rule from inside the workflow file. Mitigation: the
  prereq is documented prominently in
  `environments/production/README.md` ("**Required**: Required
  reviewers (≥ 1) — this IS the manual-approval gate").

- **Plan PR comment uses sticky markers, not always-create.** A
  re-run of the workflow on a PR (e.g. after a force-push) without
  stickiness would create N comments per env. The marker
  `<!-- terraform-plan:<env> -->` lets the comment step find and
  update the existing one.

- **Plan output truncated at 60KB.** GitHub's PR comment body limit
  is ~65KB. The workflow log retains the full plan.
  `head -c 60000` is the simplest truncation; for very large plans,
  reviewers click through to the workflow run's STEP_SUMMARY (no
  size limit) or the raw log.

- **Plan job gated to non-fork PRs.** OIDC tokens never issue to
  fork PRs. Without the gate, the configure-aws-credentials step
  would fail and the comment would say "plan failed" — confusing
  noise. Skipping the job entirely is cleaner.

- **`fail-fast: false` on the plan matrix.** Both env plans should
  surface independently. If staging plan fails, the production plan
  still runs and posts its comment.

- **Production-only dispatch path.** Without the
  `(workflow_dispatch && inputs.environment == 'production')` arm,
  an operator would have to push a no-op commit to main to trigger
  a production-only apply (because the canary path requires staging
  first). The escape hatch is rare-use but real.

- **No destroy workflow yet.** Operators run destroy locally with
  full credentials. A `workflow_dispatch` destroy with a
  confirmation input is a future enhancement; the bar for a
  recoverable mistake is much lower than for apply, and the audit
  trail of "who clicked destroy" is less valuable than the audit
  trail of "who approved a real change."

## Verification performed

- **Structural ratchet**: 121/121 green across all four terraform
  guards (40 foundation + 26 VPC/DB + 31 Redis/Storage + 24
  workflow). Specifically locks: workflow YAML parses; triggers
  pull_request + push-to-main + workflow_dispatch; plan job is
  PR-only and skipped on forks, matrixed across both envs with
  fail-fast=false; plan job has id-token:write + pull-requests:write
  permissions and binds to a per-matrix environment; plan output is
  captured to a file and posted via github-script with sticky
  marker; plan also dumped to STEP_SUMMARY; staging apply runs on
  push-to-main OR dispatch=staging, binds to environment=staging;
  production apply binds to environment=production (the gate);
  production needs apply-staging on push (canary) but bypasses on
  dispatch=production; both apply jobs have OIDC + per-env
  concurrency groups + cancel-in-progress=false; AWS_ROLE_TO_ASSUME
  comes from secrets (not inline ARN); no AWS_ACCESS_KEY_ID /
  AWS_SECRET_ACCESS_KEY values; configure-aws-credentials@v4;
  environments/<env>/{backend.hcl,terraform.tfvars,README.md} all
  exist; legacy envs/ directory is gone.
- **YAML lint**: file parses cleanly with `js-yaml`; jobs list is
  exactly `[fmt-validate, plan, apply-staging, apply-production]`;
  triggers are exactly `[pull_request, push, workflow_dispatch]`.
- **`terraform fmt` / `init` / `validate` / `plan`**: not run —
  terraform binary not installed in this sandbox; plan needs AWS
  creds + a real state bucket. The 121-assertion ratchet is the
  day-one substitute.
- **Path rewrite verified**: no remaining `infra/terraform/envs/`
  references in any of the 4 ratchet test files; Makefile `BACKEND_CFG`
  + `TFVARS` point at new paths; root README all 6 path references
  updated.
- **Workflow file is reviewer-friendly**: 4 jobs total, each with a
  named header comment block explaining its role; concurrency +
  timeouts on every long-running job; permissions declared per-job
  (least privilege).
