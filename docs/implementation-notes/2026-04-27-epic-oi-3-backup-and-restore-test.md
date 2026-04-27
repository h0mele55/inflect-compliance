# 2026-04-27 — Epic OI-3: Backup posture + automated restore validation

**Commit:** _(uncommitted at note authoring; squash-merge target tbd)_

Closes Epic OI-3's backup/DR layer. Builds on the prior three OI-3
notes (readyz dependency checks; repository tracing + dashboards;
alerting + uptime). Adds:

1. Verification of the **managed RDS PITR posture** at the IaC layer
   (validation refuses `backup_retention_days = 0`, production runs
   with 14-day retention, snapshots inherit `storage_encrypted = true`)
2. **`infra/scripts/restore-test.sh`** — operationally trustworthy
   monthly restore validation: identify latest snapshot → restore to
   ephemeral instance → validate via 7 psql checks → tear down
3. **`infra/scripts/pg-dump-to-s3.sh`** — self-hosted fallback for
   the docker-compose path (which still ships in `deploy/docker-compose.prod.yml`)
4. **`.github/workflows/restore-test.yml`** — monthly schedule

## Backup strategy implemented

**Primary path: managed RDS PITR** (Epic OI-1 module, already
shipping):

| Property | Production | Staging | Source |
|---|---|---|---|
| `backup_retention_days` | 14 | 7 | per-env tfvars |
| `backup_window` | `03:00-04:00` UTC | same | DB module default |
| `storage_encrypted` | `true` (HARDCODED) | `true` | DB module main.tf, line 146 |
| `multi_az` | `true` | `false` | per-env tfvars |
| `deletion_protection` | `true` | `false` | per-env tfvars |
| `skip_final_snapshot` | `false` | `true` | per-env tfvars |
| Validation | `backup_retention_days >= 1` (refuses 0) | same | DB module variables.tf |

PITR is implicit while `backup_retention_period > 0`. AWS keeps:
- Continuous transaction logs for the last `backup_retention_days`
- Daily automated snapshots within the same window

Restore-to-point-in-time covers any second within the retention
window, automated snapshot covers any moment a daily backup was
taken (5-minute granularity at most).

**Fallback path: `pg_dump` → S3** for the deploy/docker-compose
self-hosted runtime that still ships in the repo. Gzip + custom
format + optional GPG encryption layered on top of S3 SSE-S3.
30-day retention enforced server-side via S3 lifecycle (the chart's
storage module's lifecycle config is the canonical place to wire
this; the script's docstring documents the operator action).

## Restore-test design

`infra/scripts/restore-test.sh` (~210 lines) executes the full
identify → restore → validate → teardown cycle. **Cleanup is
trap-registered on EXIT, INT, and TERM** — even a script crash
or operator Ctrl-C tears the temporary instance down.

### Lifecycle

```
1. Resolve $TIMESTAMP + unique restore-target name
   (timestamped: collision-proof under concurrent runs)
   │
   ▼
2. trap cleanup EXIT INT TERM
   │
   ▼
3. Find latest automated snapshot via:
     aws rds describe-db-snapshots
       --snapshot-type automated
       --query 'sort_by(DBSnapshots, &SnapshotCreateTime) | [-1]'
   │
   ▼
4. Restore to temporary instance:
     aws rds restore-db-instance-from-db-snapshot
       --no-multi-az                  (cost: HA isn't needed for the test)
       --no-publicly-accessible       (security: never expose)
       --no-deletion-protection       (cleanup must always succeed)
       --vpc-security-group-ids ...   (operator-supplied)
       --db-subnet-group-name ...     (operator-supplied)
       --tags Component=restore-test  (audit trail)
   │
   ▼
5. aws rds wait db-instance-available
   │
   ▼
6. Read source's master password from Secrets Manager + connect via
   psql with sslmode=require
   │
   ▼
7. Run 7 validation checks:
     ✓ Connectivity (SELECT 1)
     ✓ Tenant table reachable + COUNT
     ✓ User table reachable + COUNT
     ✓ AuditLog has rows from within 14d of snapshot
        (catches "snapshot is empty / very old / corrupted" failures)
     ✓ RLS tenant_isolation policy on Risk
        (catches "FORCE RLS lost during restore" — would silently
         disable per-tenant isolation if missed)
     ✓ app_user role exists
     ✓ Prisma migrations table populated
   │
   ▼
8. cleanup() runs via trap:
     aws rds delete-db-instance
       --skip-final-snapshot         (PITR window is the canonical
                                       recovery surface; no point
                                       creating snapshot of a test)
       --delete-automated-backups    (avoid leaking test backups
                                       into cost)
   │
   ▼
9. Exit code propagates: 0 = pass, non-zero = fail
```

### Validation choices

The 7 psql checks are deliberately lightweight — they confirm:
- Database is reachable
- Schema is intact (table existence)
- Snapshot wasn't empty (recent rows in AuditLog)
- Multi-tenancy didn't break (RLS policies survived)
- Migrations are applied (Prisma's `_prisma_migrations` table)
- The app's runtime role exists (`app_user`)

What's deliberately NOT in the validation:
- Booting the actual app pod against the restored DB. Way too slow
  + flaky. The structural checks above prove the DB-level recovery
  is sound; "the app boots against this" is what every regular
  deploy tests.
- Row-by-row data comparison. The 14-day-old AuditLog row
  threshold catches "snapshot is genuinely empty / corrupted"
  without doing full diff (which would also be unreliable since
  prod is constantly changing).

### Network prerequisite

The chart's DB module hardcodes `publicly_accessible=false` on the
source. The script preserves that on the temporary instance — never
softens it for "convenience". So the runner executing the script
**must be in the VPC** to reach port 5432. Practical options:

- Self-hosted GitHub Actions runner inside the VPC (recommended;
  the workflow's `runs-on:` line has a comment to swap to
  `[self-hosted, vpc-prod]`)
- EC2 jumpbox + SSH-driven invocation of the script
- In-cluster Kubernetes Job (uses the chart's existing app SG)

The workflow as shipped uses `ubuntu-latest` for ease of
demonstration; production operators are expected to swap to a
self-hosted runner before relying on the schedule.

## Encryption / retention posture

| Layer | Encryption | Retention |
|---|---|---|
| RDS at-rest | `storage_encrypted=true` (HARDCODED in DB module) | n/a |
| RDS automated snapshots | inherit at-rest encryption + are themselves encrypted | `backup_retention_days` (7 staging / 14 production) |
| RDS final snapshot on destroy | encrypted | indefinite (manual delete; we set `skip_final_snapshot=false` in prod) |
| S3 SSE on the chart's storage bucket | `AES256` (HARDCODED in storage module) | per-bucket lifecycle |
| pg_dump fallback uploads | S3 SSE + optional GPG | 30 days via S3 lifecycle (operator-wired) |
| Test restore temporary instance | encrypted (inherits from source snapshot) | none — deleted by cleanup trap with `--skip-final-snapshot --delete-automated-backups` |

## Files

| File | Status | Notes |
|---|---|---|
| `infra/scripts/restore-test.sh` | **New** | ~210-line bash script. `set -euo pipefail`, trap cleanup on EXIT/INT/TERM, timestamped unique names, AWS-native commands only (no in-cluster kubectl), 7 psql validation checks, sslmode=require, secrets via Secrets Manager (no plaintext) |
| `infra/scripts/pg-dump-to-s3.sh` | **New** | ~120-line self-hosted fallback. pg_dump custom format + compress 9, optional GPG encryption, head-object verification post-upload, aborts on small-dump (catches silently-failed dumps before upload), 30-day retention documented |
| `.github/workflows/restore-test.yml` | **New** | Schedule `0 4 1 * *` (4am UTC, 1st of month) + `workflow_dispatch` for manual runs. OIDC auth via `secrets.AWS_ROLE_TO_ASSUME`. `environment: production` gate. Concurrency group `restore-test` with `cancel-in-progress: false`. Workflow summary on failure includes orphan-detection hint |
| `tests/guards/oi-3-backup-restore.test.ts` | **New** | 32-assertion structural ratchet (3 PITR/IaC posture, 12 restore-test.sh shape, 7 pg-dump-to-s3.sh shape, 9 workflow scheduling) |
| `docs/implementation-notes/2026-04-27-epic-oi-3-backup-and-restore-test.md` | **New** | This file |

## Decisions

- **PITR-only at the IaC layer for managed RDS, not pg_dump.** RDS
  PITR is the AWS-native primitive. Adding pg_dump on top of PITR
  for managed deployments would create two-sources-of-truth + extra
  cost without adding recovery options PITR doesn't already
  provide. The fallback script exists for the docker-compose path
  that ships separately; not the production-recommended one.

- **Restore test runs MONTHLY, not weekly.** Weekly would burn AWS
  cost (~$30/month for the temporary instance during its short
  life × 4 = $120/month) and noise (most weeks the test passes;
  the marginal signal is low). Monthly catches IAM/network/schema
  drift within an SLA-acceptable window. Operators with a tighter
  RPO can adjust the cron expression.

- **Cleanup via `trap`, not via the workflow's "always() run
  cleanup step" pattern.** The script-level trap fires on:
  - Successful exit (cleanup runs after validation)
  - Failure exit (cleanup runs after error)
  - SIGTERM (cleanup runs when the workflow times out)
  - SIGINT (cleanup runs when an operator Ctrl-C's a manual run)
  
  GitHub's "if: always()" runs only on workflow termination — it
  misses the script-internal kill scenario. Bash trap is the
  smaller, more reliable surface.

- **`--skip-final-snapshot --delete-automated-backups` on cleanup.**
  - `--skip-final-snapshot`: PITR on the source covers all recovery
    needs; another snapshot of a test restore is just noise.
  - `--delete-automated-backups`: prevents the test's own
    automated backup retention (which we set to 0 implicitly) from
    leaking into cost.

- **Source's master password from Secrets Manager, not env var.**
  Restored RDS instances inherit the snapshot's master credential.
  The same password the source uses opens the restored instance —
  reading it from Secrets Manager (the canonical OI-1 secret
  store) means no plaintext credentials ever land in the workflow's
  env or the runner's filesystem.

- **`sslmode=require` on the validation connection.** The chart's
  DB module sets `rds.force_ssl=1` in the parameter group; the
  validation connection respects that. `sslmode=require` is
  the right level — `verify-full` would require shipping the RDS
  CA bundle into the runner (extra wiring), and the encryption
  guarantee is the same.

- **Tag the temporary instance with `Component=restore-test`.**
  Cost-allocation tagging — the test instance lives ~30 minutes
  per month, but if a cleanup somehow misses it (catastrophic
  bash failure), the tag makes orphan-detection one CLI call
  away. The workflow summary's failure hint surfaces the exact
  command.

- **GPG layer optional in pg-dump-to-s3.sh.** S3 SSE-S3 is
  sufficient for "data is encrypted at rest in AWS"; GPG layered
  on top defends against an AWS-side breach (server-side encryption
  is per-tenant key-encrypted with AWS-managed KMS keys, which AWS
  could in principle access — GPG is operator-key-encrypted and
  AWS-blind). For most threat models, SSE-S3 is enough; for
  high-compliance tenants (FedRAMP-aligned), GPG is the additional
  layer.

- **`pg_dump --format=custom`, not plain SQL.** Custom format
  preserves table dependencies and is restorable via `pg_restore`
  with selective options (e.g. specific tables, schema-only). Plain
  SQL is line-by-line which is brittle for partial-restore.

- **Aborts on suspiciously small dump.** A pg_dump that emits <1KB
  almost certainly failed (the smallest valid dump of a populated
  schema is ~10KB+ from headers alone). Catching this BEFORE upload
  avoids overwriting good backups with garbage. Pragmatic threshold;
  operators tune up if their schema is smaller.

## Verification performed

- **Bash syntax** (`bash -n`): both scripts parse cleanly.
- **YAML parse**: `restore-test.yml` round-trips through `js-yaml`;
  declares the expected triggers (`schedule` + `workflow_dispatch`)
  and a single job (`restore-test`).
- **Structural ratchet** at `tests/guards/oi-3-backup-restore.test.ts`
  — **32/32 green**. Locks:
  - PITR posture: variable validation refuses 0; production tfvars
    set `db_backup_retention_days >= 7`; storage_encrypted hardcoded
  - restore-test.sh: bash strict mode; trap cleanup on EXIT/INT/TERM;
    `--skip-final-snapshot --delete-automated-backups` on teardown;
    `--no-publicly-accessible --no-multi-az --no-deletion-protection`
    on restore; timestamped unique names; latest-snapshot resolution;
    wait-for-available; 7 psql validation checks present (Tenant,
    User, AuditLog 14-day, RLS tenant_isolation, app_user role,
    Prisma migrations); password from Secrets Manager (not plaintext);
    sslmode=require
  - pg-dump-to-s3.sh: bash strict mode + cleanup trap; pg_dump
    custom-format + compress=9; optional GPG encryption; timestamped
    S3 path; head-object upload verification; small-dump abort;
    30-day retention documented
  - restore-test.yml: triggers (schedule + dispatch); cron fires
    monthly on the 1st; OIDC; production environment gate;
    aws-actions/configure-aws-credentials@v4; invokes the script
    with all 5 required env vars; concurrency group with
    `cancel-in-progress: false`; failure summary with orphan hint
- **Total OI-3 ratchet count across all 4 PRs**: **154 assertions**
  (16 readyz + 22 repository-tracing + 50 observability dashboards
  + 34 alerting + 32 backup-restore). All green.
- **No live restore execution** in this session — the script
  requires a real AWS account, an in-VPC runner, the production
  RDS source instance, etc. The structural ratchet asserts the
  shape; first-real-restore is the operator validation post-merge.
- **No live pg-dump execution** — the script is a bash file with
  no real-side-effect dry-run mode; bash syntax check is the
  static substitute.
