# Terraform bootstrap

Creates the S3 buckets + DynamoDB lock table that back the root
module's remote state. Run **once per AWS account**.

## Why a separate stack

The root module's `backend "s3" {}` reads from the bucket+table this
stack creates. We can't use the root module to create them — that
would be a self-referential init. So bootstrap uses **local state**.

## Usage

```bash
cd infra/terraform/bootstrap

# First run only — local state init
terraform init

# Plan + review
terraform plan

# Apply — creates buckets + table
terraform apply

# Capture outputs into the env backend configs
terraform output -json
```

The output map tells you exactly what to put in
`infra/terraform/envs/<env>.backend.hcl`:

```
state_buckets = {
  "staging"    = "inflect-compliance-tfstate-staging"
  "production" = "inflect-compliance-tfstate-production"
}
lock_table_name = "inflect-compliance-tfstate-locks"
```

## After apply

- Archive `terraform.tfstate` offline (encrypted password manager
  or sealed secret). It is tiny and can be reconstructed via
  `terraform import`, but having it on hand is faster.
- The bucket + table now exist with versioning, SSE, public-access
  block, lifecycle on noncurrent versions (90d), and PITR on the
  lock table — independent of any future Terraform changes.

## Adding a new environment

1. Add the environment name to `var.environments` (default list).
2. `terraform apply` — a new bucket appears for that env.
3. Add `infra/terraform/envs/<new-env>.backend.hcl` pointing at it.
4. Add `infra/terraform/envs/<new-env>.tfvars` with the env's
   non-sensitive config.
5. Update the structural ratchet test if it locks the env list.

## Destruction

`force_destroy = false` by default — `terraform destroy` will refuse
to remove non-empty state buckets. This is deliberate. Set
`-var force_destroy=true` ONLY when you have already manually emptied
the bucket and confirmed no active environment depends on it.
