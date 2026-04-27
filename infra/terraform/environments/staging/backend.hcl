# Partial backend config for the staging environment.
# Loaded by: terraform -chdir=infra/terraform init -backend-config=envs/staging.backend.hcl
#
# The bucket + table referenced here are created by ./bootstrap/.
bucket         = "inflect-compliance-tfstate-staging"
key            = "env/staging/root.tfstate"
region         = "us-east-1"
dynamodb_table = "inflect-compliance-tfstate-locks"
encrypt        = true
