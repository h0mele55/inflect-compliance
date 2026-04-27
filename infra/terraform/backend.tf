# Remote state — S3 bucket + DynamoDB lock table.
#
# Configured at init time via partial backend config so the same root
# module can target staging and production with separate state files
# and separate lock rows. See envs/<env>.backend.hcl.
#
# Bootstrap (one-shot, per AWS account): see ./bootstrap/ — it creates
# the bucket + table this backend reads from. It uses local state
# because the resources it creates ARE the remote state.
#
# Per-environment init:
#   terraform -chdir=infra/terraform init \
#     -backend-config=envs/staging.backend.hcl
#
# Switching envs:
#   terraform -chdir=infra/terraform init -reconfigure \
#     -backend-config=envs/production.backend.hcl
#
# Required keys in each <env>.backend.hcl:
#   bucket          — S3 bucket created by ./bootstrap/
#   key             — state object path (env-scoped, e.g. env/staging/root.tfstate)
#   region          — AWS region of the bucket
#   dynamodb_table  — DynamoDB lock table created by ./bootstrap/
#   encrypt         — must be true; the bucket also enforces SSE
terraform {
  backend "s3" {}
}
