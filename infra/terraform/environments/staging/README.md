# Staging environment

Per-environment configuration consumed by the shared root module.

## Files

- `backend.hcl` — partial S3 backend config (bucket + key + region + lock table). Loaded at `terraform init -backend-config=...`.
- `terraform.tfvars` — non-sensitive variable values for the staging env. Loaded at `terraform plan/apply -var-file=...`.

## Tradeoffs vs production

Encoded explicitly in `terraform.tfvars`:

| Knob | Staging | Production |
|---|---|---|
| `vpc_az_count` | 2 | 3 |
| `vpc_single_nat_gateway` | `true` (one shared NAT) | `false` (per-AZ NAT) |
| `db_instance_class` | `db.t4g.small` | `db.m6g.large` |
| `db_multi_az` | `false` | `true` |
| `db_deletion_protection` | `false` | `true` |
| `db_skip_final_snapshot` | `true` (loss-on-destroy OK) | `false` |
| `db_backup_retention_days` | 7 | 14 |
| `redis_node_type` | `cache.t4g.small` | `cache.t4g.medium` |
| `redis_replicas_per_node_group` | 0 (single-node) | 1 (HA + multi-AZ + automatic failover) |
| `redis_snapshot_retention_days` | 1 | 7 |
| `storage_force_destroy` | `true` (allow teardown) | `false` |
| `storage_cors_allowed_origins` | `["https://staging.example.com"]` | `["https://app.example.com"]` |

## Prerequisites for CI apply

The Terraform GitHub Actions workflow (`.github/workflows/terraform.yml`)
auto-applies to staging on push-to-main. Setup needed:

1. **GitHub Environment** named exactly `staging`. No protection rules
   required — staging auto-applies.
2. **Environment secret** `AWS_ROLE_TO_ASSUME` = ARN of the IAM role
   the workflow assumes via OIDC.
3. **IAM role** in the AWS account with:
   - Trust policy allowing `arn:aws:iam::<account>:oidc-provider/token.actions.githubusercontent.com`
     to assume from this repo (`repo:h0mele55/inflect-compliance:*`).
   - Permissions sufficient to read/write all resources in this stack
     (vpc, rds, elasticache, s3, secrets manager, iam, cloudwatch logs).
4. **State bucket + lock table** created via the bootstrap stack
   (`infra/terraform/bootstrap/`) — chicken-and-egg, run once per
   AWS account by an admin operator.

## Manual apply (operator)

```bash
cd infra/terraform
terraform init -reconfigure -backend-config=environments/staging/backend.hcl
terraform plan  -var-file=environments/staging/terraform.tfvars
terraform apply -var-file=environments/staging/terraform.tfvars
```

Or via the Makefile shorthand:

```bash
make -C infra/terraform init  ENV=staging
make -C infra/terraform plan  ENV=staging
make -C infra/terraform apply ENV=staging
```
