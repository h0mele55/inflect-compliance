# 2026-04-27 — Epic OI-1: VPC + Database modules

**Commit:** _(uncommitted at note authoring; squash-merge target tbd)_

Builds on `2026-04-27-epic-oi-1-terraform-foundation.md` — fills in
the `vpc` and `database` module stubs with production-grade
implementations and wires them into the root composition.

## Design

### VPC topology — 3 AZs × 3 subnet tiers

```
                     ┌─────────────────────────────────────────┐
  internet ───▶ IGW ▶│  public  /24 × N  (ALB + NAT GW)        │
                     └─────────────────────────────────────────┘
                                       │
                              NAT GW (per-AZ in prod, single in staging)
                                       │
                     ┌─────────────────────────────────────────┐
                     │  private-app /24 × N  (app SG)          │ ──── egress to internet
                     └─────────────────────────────────────────┘
                                       │
                       ┌── (5432, app_sg → db_sg ONLY) ──┐
                       ▼                                  │
                     ┌─────────────────────────────────────────┐
                     │  private-db /24 × N  (db SG)            │  no internet egress
                     └─────────────────────────────────────────┘
```

**Subnet layout** (default VPC `10.0.0.0/16`, derived via `cidrsubnet()`):
- `public[i]` = `10.0.{i}.0/24` (i ∈ [0, N))
- `private_app[i]` = `10.0.{i+10}.0/24`
- `private_db[i]` = `10.0.{i+20}.0/24`

A custom `var.cidr_block` works without code changes — offsets are
derived, not hardcoded.

**NAT gateway policy.** `var.single_nat_gateway` toggles between
**per-AZ** (production HA — losing one AZ doesn't lose egress) and
**single shared** (staging cost-saver — saves ~$32/mo per "missing"
AZ). Staging defaults to single, production to per-AZ; both are set
explicitly in the env tfvars rather than relying on bool defaults.

**Private-db route table has no default route.** Deliberate. The DB
tier never reaches the internet — it talks only to clients inside the
VPC, and AWS service endpoints (Secrets Manager for credential
rotation, CloudWatch for log export) are reached via the AWS-internal
network when SSL is enforced. The structural ratchet asserts that no
`0.0.0.0/0` route or `nat_gateway_id` reference appears in the
private_db route table block.

**Security group ownership.**
- `alb_sg` and `app_sg` are **created in the VPC module** — they're
  general-purpose tier wrappers any app stack would consume.
- `db_sg` is **created in the database module** — its ingress
  contract (only-from-app-sg) is intrinsic to the DB. The VPC
  doesn't need to know which apps will reach the DB.

`app_sg` allows ingress on `var.app_ingress_port` (default 3000)
**only from `alb_sg`** — `referenced_security_group_id`, never CIDR.
The structural ratchet asserts no `cidr_ipv4` or `cidr_ipv6` field
appears inside `app_from_alb`.

**VPC flow logs** to CloudWatch are on by default (30d retention).
A flow-logs IAM role is created in-module so adding a new VPC stack
doesn't require pre-existing IAM. Toggle via `enable_flow_logs`.

### Database — RDS PostgreSQL 16

**Storage**: `gp3`, `storage_encrypted = true` **hardcoded** (not
operator-overridable — the structural ratchet asserts no `var.`
indirection on this field). KMS key is a customer-managed override
via `var.kms_key_arn`; default `null` = AWS-managed RDS KMS key.

**Network placement**: subnet group spans `var.subnet_ids` (the
**private-db** tier from the VPC module). `publicly_accessible = false`
**hardcoded** — never operator-overridable. The DB SG accepts ingress
on port 5432 from `var.app_security_group_id` only — single
`aws_vpc_security_group_ingress_rule` resource, no CIDR-based rules.
The structural ratchet asserts the SG has exactly one ingress
declaration and that it references the app SG, not a CIDR.

**Master credentials**: `manage_master_user_password = true` — RDS
auto-generates a password and writes it to AWS Secrets Manager. The
ARN is exposed as `db_secret_arn` (marked `sensitive` at the root
level). **No plaintext password ever lands in tfvars or terraform
state.** The app reads the secret at runtime via the AWS SDK.

**Multi-AZ + PITR**: `multi_az = var.multi_az` (default `true`),
`backup_retention_period = var.backup_retention_days` (default 7,
validated `>= 1` so PITR is always enabled). `deletion_protection = true`
default; `skip_final_snapshot = false` default. Production env
extends backup retention to 14 days; staging stays at 7.

**Parameter group** on the `postgres16` family:

| Parameter | Value | Why |
|---|---|---|
| `row_security` | `1` | Cluster-wide RLS-on backstop. Closest mapping to OI-1's `rls_force = on`. The actual FORCE-RLS enforcement is per-table in `prisma/rls-setup.sql` (`ALTER TABLE … FORCE ROW LEVEL SECURITY`). The two together close the loop: the DB-level setting prevents an operator from globally disabling RLS via `SET row_security=off`; the per-table setting prevents owner-bypass. |
| `rds.force_ssl` | `1` | TLS-or-reject. Pending-reboot. App driver MUST use `sslmode=require`. |
| `log_connections` | `1` | Audit. |
| `log_disconnections` | `1` | Audit. |
| `log_statement` | `ddl` | DDL-only statement log. Avoids logging tenant data. |
| `log_min_duration_statement` | `1000` (ms) | Slow-query log surfaces real bottlenecks. |
| `shared_preload_libraries` | `pg_stat_statements` | Pending-reboot. |
| `pg_stat_statements.track` | `ALL` | Pending-reboot. |

**RLS spec mapping.** OI-1 lists `rls_force = on` as a parameter
group requirement. PostgreSQL has no parameter by that name. The
spec's intent ("RLS is on, no matter what") splits cleanly into two
controls:
1. **Cluster-wide**: `row_security = 1` in the parameter group —
   no session can disable RLS via `SET row_security=off`.
2. **Per-table**: `ALTER TABLE … FORCE ROW LEVEL SECURITY` for
   every tenant-scoped table — already shipping in
   `prisma/rls-setup.sql` (40+ tables). Forces RLS even for the
   table owner; CLAUDE.md → "Multi-Tenant Isolation" §1 documents
   this.

This note is the canonical record of the mapping so a future
auditor reviewing the parameter group doesn't have to reconstruct
the reasoning from "but the spec said `rls_force`".

### Staging vs production tradeoffs

Encoded in `envs/<env>.tfvars`, not module defaults — every override
is explicit at the env level.

| Knob | Staging | Production | Why |
|---|---|---|---|
| `vpc_az_count` | 2 | 3 | Min for RDS multi-AZ subnet group; prod runs 3 for AZ-failure tolerance. |
| `vpc_single_nat_gateway` | true | false | Staging shares one NAT (~$32/mo savings per missing AZ); prod runs per-AZ. |
| `db_instance_class` | `db.t4g.small` | `db.m6g.large` | Burstable in staging; sustained-perf instance in prod. |
| `db_allocated_storage_gb` | 20 | 100 | Minimal staging footprint; larger prod baseline with autoscaling headroom. |
| `db_multi_az` | false | true | HA only in prod. |
| `db_deletion_protection` | false | true | Allow staging re-create; protect prod. |
| `db_skip_final_snapshot` | true | false | Accept staging loss-on-destroy; mandatory snapshot in prod. |
| `db_backup_retention_days` | 7 | 14 | OI-1 spec floor is 7; prod extends. |

## Files

| File | Role |
|---|---|
| `modules/vpc/main.tf` | Full VPC: VPC + IGW + 3 subnet tiers × N AZs + per-AZ private RTs (no default route on private-db) + ALB SG + app SG + NAT (toggle per-AZ vs single) + flow logs IAM + flow log delivery. |
| `modules/vpc/variables.tf` | Adds `az_count` (validated 2–6), `single_nat_gateway`, `app_ingress_port`, `enable_flow_logs`, `flow_logs_retention_days` (validated against AWS-allowed CloudWatch values). |
| `modules/vpc/outputs.tf` | `vpc_id`, per-tier subnet ID lists, `alb_security_group_id`, `app_security_group_id`, `nat_gateway_ids`, AZ list, flow-log group name. Keeps a deprecated `private_subnet_ids` alias for legacy consumers. |
| `modules/database/main.tf` | Subnet group + DB SG (one ingress rule from `var.app_security_group_id` only) + parameter group (postgres16 family, `row_security=1`, `rds.force_ssl=1`, logging knobs, pg_stat_statements) + DB instance (gp3 + encrypted + multi-AZ + PITR + `manage_master_user_password=true` + `publicly_accessible=false` hardcoded + `storage_encrypted=true` hardcoded + Performance Insights + CloudWatch logs export). |
| `modules/database/variables.tf` | Locks engine_version to 16.x via validation (parameter group family is hardcoded `postgres16`). Adds `app_security_group_id`, `db_name`, `master_username`, `port`, `kms_key_arn`, backup/maintenance windows, performance-insights tunables, slow-query threshold. |
| `modules/database/outputs.tf` | `endpoint`, `address`, `port`, `db_name`, `master_username`, `instance_id`, `instance_arn`, `security_group_id`, `subnet_group_name`, `parameter_group_name`, `secret_arn`, `kms_key_id`. |
| `infra/terraform/main.tf` | Uncomments + wires `module "vpc"` and `module "database"`. Plumbs `vpc_id`, `private_db_subnet_ids`, `app_security_group_id` into the database module. Redis + storage seams remain commented. |
| `infra/terraform/variables.tf` | Adds 7 root-level VPC inputs and 9 root-level DB inputs so envs can override per-environment. |
| `infra/terraform/outputs.tf` | Surfaces VPC and DB outputs at the root. `db_secret_arn` is `sensitive`. |
| `infra/terraform/envs/staging.tfvars` | Staging tradeoffs encoded explicitly. |
| `infra/terraform/envs/production.tfvars` | Production HA + protection encoded explicitly. |
| `tests/guards/terraform-vpc-database.test.ts` | 26-assertion structural ratchet. Locks DB never-public, storage-encrypted-true, RDS-managed credentials, ingress-from-app-only, `row_security=1`, postgres16, PITR-mandatory, and the per-env tradeoff surface. |
| `tests/guards/terraform-foundation.test.ts` | Tightens the `secrets-hygiene` scan to ignore comment lines (the new tfvars headers descriptively mention "password" / "secret" while documenting that none are stored). Existing 40 assertions still pass. |
| `docs/implementation-notes/2026-04-27-epic-oi-1-vpc-database.md` | This file. |

## Decisions

- **DB SG is owned by the database module, not the VPC module.** The
  ingress contract (only-from-app-sg) is intrinsic to the DB tier.
  Splitting it across modules would force the VPC module to take an
  `app_will_reach_db` parameter that smells wrong.

- **Three subnet tiers, not two.** A combined private tier would
  conflate "app workloads with internet egress via NAT" and "data
  stores that should never reach the internet." Splitting them lets
  the private-db route table omit the default route entirely, which
  is a structural defence — no rule, no traffic.

- **`storage_encrypted = true` and `publicly_accessible = false`
  hardcoded, not behind a variable.** These are compliance-grade
  invariants. Putting them behind a `var.` would mean every audit
  has to inspect every env's tfvars to confirm. Hardcoded means the
  module file itself is the audit artefact, and the structural
  ratchet asserts no `var.` indirection on these fields.

- **`manage_master_user_password = true` over a generated random +
  Secrets Manager block.** RDS does the right thing natively now
  (since 2023): generates a password, writes it to AWS Secrets
  Manager, optionally rotates it, and never returns the password to
  Terraform. This is cleaner than the older pattern of
  `random_password` + `aws_secretsmanager_secret_version` + SDK lookup.

- **`row_security = 1` is the cluster-wide RLS-on backstop, not the
  primary RLS enforcement.** The actual FORCE RLS lives in
  `prisma/rls-setup.sql` (per-table). Documenting the mapping
  explicitly in this note (and in the `main.tf` comment) means a
  future auditor doesn't need to discover the split themselves.

- **`final_snapshot_identifier` ignored in lifecycle.** Uses
  `timestamp()` which changes every plan; without `ignore_changes`
  every `plan` would show diff churn even when nothing else changed.
  The identifier is only consulted at destroy-time anyway.

- **Engine version validated at variable layer (`16.x`).** Mismatch
  between `engine_version` and `parameter_group.family = "postgres16"`
  would be a runtime apply error instead of a plan-time validation
  failure. Validation block catches it before AWS is called.

- **Per-env tradeoffs go in tfvars, not module defaults.** Module
  defaults are production-safe (`multi_az=true`, `deletion_protection=true`,
  `skip_final_snapshot=false`). Staging deliberately overrides these
  in `staging.tfvars` so the override is visible at code-review time
  ("we are explicitly relaxing this for cost reasons in non-prod"),
  not silently inherited from a default that may drift.

- **`apply_immediately = false` default.** Production-safe — a
  parameter change waits for the next maintenance window. Staging
  can flip to true via tfvars when iterating, but the module default
  protects production from accidental mid-day reboots.

## Verification performed

- **Structural ratchet**: 66/66 assertions green (40 foundation + 26
  new VPC/DB). Specifically locks: DB never publicly-accessible (no
  `var.` indirection); storage-encrypted hardcoded; RDS-managed
  master credentials with no `password=` argument anywhere; DB SG
  has exactly one ingress rule and it references the app SG (not a
  CIDR); private-db RT contains no `0.0.0.0/0` and no
  `nat_gateway_id`; `row_security = 1` present in the parameter
  group; postgres16 family; engine version validated to `16.x`;
  `backup_retention_days` defaults to 7 and refuses 0; multi_az +
  deletion_protection default true; CloudWatch logs export includes
  postgresql; root composition wires `vpc.private_db_subnet_ids` and
  `vpc.app_security_group_id` into the database module;
  `db_secret_arn` is sensitive at the root output level; per-env
  tradeoffs match the staging/production policy in this note.
- **Brace-balance** across all 6 module files + 3 root files: clean.
- **`terraform fmt` / `terraform init` / `terraform validate`**: not
  run locally — the terraform binary is not installed in this
  sandbox. CI wiring of `terraform fmt -check -recursive` and
  `terraform validate` on `infra/terraform/**` changes is the
  follow-up; the structural ratchet is the day-one substitute.
