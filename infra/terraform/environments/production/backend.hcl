# Partial backend config for the production environment.
# Loaded by: terraform -chdir=infra/terraform init -reconfigure \
#              -backend-config=envs/production.backend.hcl
#
# Production state lives in a SEPARATE bucket from staging — blast
# radius isolation, independent IAM policies, independent retention.
bucket         = "inflect-compliance-tfstate-production"
key            = "env/production/root.tfstate"
region         = "us-east-1"
dynamodb_table = "inflect-compliance-tfstate-locks"
encrypt        = true
