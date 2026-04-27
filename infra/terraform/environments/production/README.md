# Production environment

Per-environment configuration consumed by the shared root module.

## Files

- `backend.hcl` — partial S3 backend config (bucket + key + region + lock table). Production state lives in a SEPARATE bucket from staging — blast-radius isolation, independent IAM policies.
- `terraform.tfvars` — non-sensitive variable values for production.

## Production posture

See the table in `../staging/README.md`. Production runs:
- 3 AZs, per-AZ NAT
- multi-AZ RDS with deletion protection + 14-day PITR
- HA Redis (primary + 1 replica, multi-AZ + automatic failover)
- S3 with `force_destroy = false` (NEVER auto-destroy)

## Prerequisites for CI apply

The Terraform GitHub Actions workflow auto-applies to staging on
push-to-main, then **gates** the production apply behind the GitHub
Environment's required-reviewers protection rule. Setup:

1. **GitHub Environment** named exactly `production`. **Required**:
   - **Required reviewers** — at least one (the platform team).
     Without this, the production apply would auto-run with no human
     gate, contradicting the OI-1 source-of-truth.
   - **Wait timer** (optional) — 0–60 minutes before apply runs after
     approval; useful for last-minute aborts.
   - **Deployment branches** — restrict to `main` only.
2. **Environment secret** `AWS_ROLE_TO_ASSUME` = ARN of the
   production IAM role assumed via OIDC. **Different role** from
   staging — separate trust + separate permissions per env.
3. **IAM role** with:
   - Trust policy as in staging README, but optionally further
     restricted (e.g. `repo:h0mele55/inflect-compliance:ref:refs/heads/main`).
   - Permissions to manage all production resources.
4. **State bucket** `inflect-compliance-tfstate-production` created
   by the bootstrap stack.

## Manual apply (operator)

Production manual applies should be rare — prefer the CI path so the
approval audit trail is captured. When you do need to:

```bash
cd infra/terraform
terraform init -reconfigure -backend-config=environments/production/backend.hcl
terraform plan  -var-file=environments/production/terraform.tfvars
terraform apply -var-file=environments/production/terraform.tfvars
```

Or:

```bash
make -C infra/terraform init  ENV=production
make -C infra/terraform plan  ENV=production
make -C infra/terraform apply ENV=production
```
