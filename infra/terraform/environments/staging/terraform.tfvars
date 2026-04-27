# Non-sensitive variable values for the staging environment.
# Apply with: terraform -chdir=infra/terraform apply -var-file=envs/staging.tfvars
#
# Secrets MUST NOT live here. The DB master password is RDS-managed
# in AWS Secrets Manager (manage_master_user_password = true). All
# other secrets flow via TF_VAR_<name> env vars or AWS SSM lookups.
environment = "staging"
aws_region  = "us-east-1"
project     = "inflect-compliance"
owner       = "platform"
cost_center = "engineering"

additional_tags = {
  Tier = "non-prod"
}

# ── VPC (staging cost-saver overrides) ──
vpc_az_count           = 2    # min for RDS multi-AZ-ready subnet group
vpc_single_nat_gateway = true # one NAT shared across AZs (~$32/mo savings per missing AZ)

# ── Database (staging tradeoffs — accept lower HA + faster teardown) ──
db_instance_class           = "db.t4g.small"
db_allocated_storage_gb     = 20
db_max_allocated_storage_gb = 100
db_multi_az                 = false # single-AZ in staging
db_deletion_protection      = false # allow re-creation
db_skip_final_snapshot      = true  # accept loss-on-destroy
db_backup_retention_days    = 7

# ── Redis (staging single-node) ──
redis_node_type               = "cache.t4g.small"
redis_replicas_per_node_group = 0 # single-node — no HA in staging
redis_snapshot_retention_days = 1

# ── Storage (staging) ──
storage_ia_transition_days = 90
storage_cors_allowed_origins = [
  "https://staging.example.com",
]
storage_force_destroy = true # accept teardown of staging bucket
