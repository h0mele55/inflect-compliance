# Non-sensitive variable values for the production environment.
# Apply with: terraform -chdir=infra/terraform apply -var-file=envs/production.tfvars
#
# Secrets MUST NOT live here. The DB master password is RDS-managed
# in AWS Secrets Manager (manage_master_user_password = true). All
# other secrets flow via TF_VAR_<name> env vars or AWS SSM lookups.
environment = "production"
aws_region  = "us-east-1"
project     = "inflect-compliance"
owner       = "platform"
cost_center = "engineering"

additional_tags = {
  Tier = "prod"
}

# ── VPC (production HA defaults) ──
vpc_az_count           = 3
vpc_single_nat_gateway = false # per-AZ NAT — losing one AZ doesn't lose egress

# ── Database (production HA + protection) ──
db_instance_class           = "db.m6g.large"
db_allocated_storage_gb     = 100
db_max_allocated_storage_gb = 1000
db_multi_az                 = true
db_deletion_protection      = true
db_skip_final_snapshot      = false # final snapshot is mandatory for prod
db_backup_retention_days    = 14    # OI-1 floor is 7; prod extends to 14

# ── Redis (production HA) ──
redis_node_type               = "cache.t4g.medium"
redis_replicas_per_node_group = 1 # primary + 1 replica → multi-AZ + automatic failover
redis_snapshot_retention_days = 7

# ── Storage (production) ──
storage_ia_transition_days = 90
storage_cors_allowed_origins = [
  "https://app.example.com",
]
storage_force_destroy = false # NEVER allow destroy of production bucket
