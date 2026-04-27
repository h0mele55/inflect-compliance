# 2026-04-27 — Epic OI-1: Terraform foundation + remote state

**Commit:** _(uncommitted at note authoring; squash-merge target tbd)_

## Design

Production-grade Terraform scaffold under `infra/terraform/` with
remote state in **S3** + **DynamoDB locking**, separated **per
environment**. Three deliberate splits:

```
infra/terraform/
├── (root module)        ← target stack: vpc + db + redis + storage modules
├── bootstrap/           ← one-shot, local-state, creates the bucket + table
├── modules/<name>/      ← input/output contracts for vpc/database/redis/storage
└── envs/<env>.{backend.hcl,tfvars}
```

**1. Partial backend config (not a hardcoded backend).** `backend.tf`
is `backend "s3" {}` — empty. Real bucket / key / region /
dynamodb_table values arrive at `terraform init` time via
`-backend-config=envs/<env>.backend.hcl`. This is the canonical
pattern for true per-env state separation. Workspaces share the
bucket-level IAM scope, which makes blast-radius isolation
impossible — separate backend keys + per-env buckets win.

**2. Separate state buckets per environment.** Bootstrap creates
`inflect-compliance-tfstate-staging` and
`inflect-compliance-tfstate-production` as distinct buckets, with
the lock table shared. The S3 backend computes a per-state `LockID`
so cross-env contention is architecturally impossible despite the
shared table. The split bucket model means an IAM principal scoped
to `arn:aws:s3:::inflect-compliance-tfstate-staging/*` literally
cannot read or mutate production state — defence in depth beyond
"we promise the role can't reach the prod key".

**3. Bootstrap is a separate stack with local state.** Chicken-and-egg:
the root module's `backend "s3"` block reads the bucket the bootstrap
stack creates. The bootstrap stack therefore uses local state — its
own `terraform.tfstate` ends up on the operator's machine. README
documents archiving it offline; the resources can be re-imported via
`terraform import` if lost.

**4. Module placeholders, not module implementations.** Each child
module (`vpc`, `database`, `redis`, `storage`) ships with its
input/output contract locked in `variables.tf` + `outputs.tf`, but
`main.tf` is comment-only (a scope summary for the follow-up epic).
Outputs return `null` literals so `terraform validate` passes today
without resources existing. The root `main.tf` carries
**commented-out** `module "<name>" { ... }` blocks — uncommenting one
is the seam where a real module lands.

**5. AWS provider with `default_tags`.** `providers.tf` wires
`default_tags { tags = local.common_tags }` so every taggable
resource auto-acquires the project / environment / owner / cost
center labels. Cost dashboards and audit queries get a stable
filter dimension on day one.

**6. Secrets stay out of tfvars.** Committed `envs/<env>.tfvars`
hold non-sensitive config (region, owner tag, project name).
Secrets travel via `TF_VAR_<name>` env vars or
`data "aws_secretsmanager_secret_version"` blocks. The structural
ratchet greps tfvars for `password=`, `api_key=`, etc. and fails CI
on a hit. `.gitignore` excludes `*.secret.tfvars`, `*.auto.tfvars`,
all `*.tfstate*`, and all `*.tfplan*` at both repo-root and
infra/terraform/ scope.

## Files

| File | Role |
|---|---|
| `infra/terraform/versions.tf` | Pins `terraform >= 1.6, < 2.0`; AWS `>= 5.0, < 6.0`; random + null helpers. |
| `infra/terraform/providers.tf` | AWS provider, region from var, `default_tags` from `local.common_tags`. |
| `infra/terraform/backend.tf` | Empty `backend "s3" {}` partial config; usage docs in header. |
| `infra/terraform/main.tf` | Locals (name_prefix, base_tags merge into common_tags). Commented module wiring for vpc/database/redis/storage. |
| `infra/terraform/variables.tf` | `environment` (validated staging\|production), `aws_region`, `project`, `owner`, `cost_center`, `additional_tags`. |
| `infra/terraform/outputs.tf` | Surfaces `environment`, `aws_region`, `name_prefix`, `common_tags`. |
| `infra/terraform/.gitignore` | Per-tree ignores for `.terraform/`, `*.tfstate*`, `*.tfplan*`, `*.secret.tfvars`, `*.auto.tfvars`. |
| `infra/terraform/Makefile` | `make {fmt,validate,init,plan,apply,destroy,output} ENV=<env>` ergonomic wrapper. |
| `infra/terraform/README.md` | Operator runbook: layout, env separation model, first-time setup, switching envs, secrets policy, CI integration. |
| `infra/terraform/envs/staging.backend.hcl` | bucket + key + region + dynamodb_table + encrypt for staging. |
| `infra/terraform/envs/staging.tfvars` | Non-sensitive staging values. |
| `infra/terraform/envs/production.backend.hcl` | Same shape, separate bucket + key. |
| `infra/terraform/envs/production.tfvars` | Non-sensitive production values. |
| `infra/terraform/bootstrap/{versions,main,variables,outputs}.tf` | One-shot stack creating per-env state buckets (versioning + SSE + public-access block + 90d noncurrent expiry) and a single DynamoDB lock table (PAY_PER_REQUEST + PITR + SSE). |
| `infra/terraform/bootstrap/README.md` | Bootstrap runbook: when to run, what to archive after, how to add a new env. |
| `infra/terraform/modules/{vpc,database,redis,storage}/{main,variables,outputs}.tf` | Stub modules. variables.tf locks the input contract; outputs.tf returns null literals. main.tf is a comment-only scope summary. |
| `tests/guards/terraform-foundation.test.ts` | 40-assertion structural ratchet. Locks file presence, AWS provider pin, partial-backend invariant, per-env state isolation, bootstrap shape, module 3-file contract, secrets hygiene. |
| `docs/implementation-notes/2026-04-27-epic-oi-1-terraform-foundation.md` | This file. |
| `.gitignore` (root) | Defence-in-depth globs in case an operator runs terraform from outside `infra/terraform/`. |

## Decisions

- **Partial backend config over `backend "s3" { bucket = "..." }`.**
  Hardcoded backend values force per-env duplication of `backend.tf`
  itself (or workspaces). Partial config keeps a single root module
  + one tiny `*.backend.hcl` per environment. Accepted cost: every
  `terraform init` after switching env needs `-reconfigure`.

- **Separate state buckets per env, single lock table.** The lock
  table is content-addressed by `LockID` — it does not need
  per-env partitioning. The buckets do, because IAM policies bind
  to bucket ARNs.

- **Bootstrap as a separate stack, local state.** The alternative —
  pre-creating the bucket+table by hand or via CloudFormation —
  loses the "everything is Terraform" property. A separate stack
  with local state preserves it; the operational cost is one
  archived `terraform.tfstate` file per AWS account.

- **`force_destroy = false` on state buckets.** A `terraform destroy`
  on the bootstrap stack should not cascade-delete state of running
  environments. Override only when the operator has manually
  emptied the bucket and confirmed no env depends on it.

- **AWS provider pinned to `>= 5.0, < 6.0`.** Major-version floor is
  the prompt's explicit requirement; the upper bound prevents a
  silent jump to the v6 line whenever it ships.

- **Module stubs over a deferred PR for placeholders.** Empty file
  trees would invite `terraform validate` failures the moment
  someone runs it. Stubs with locked variable surfaces + null
  outputs keep validate green and let module implementations land
  one at a time as separate PRs without blocking the foundation.

- **No CI wiring yet.** `terraform fmt -check -recursive` and
  `terraform validate` should run in CI on changes under
  `infra/terraform/**` — that's a follow-up. The 40-assertion guard
  test is the day-one safety net; it costs nothing in CI time.

- **Production cost-center / owner default to `engineering` /
  `platform`.** Stub values; expected to drift as ownership solidifies.
  They're not on the secrets-hygiene scan because they're labels, not
  credentials.
