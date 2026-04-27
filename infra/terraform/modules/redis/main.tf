# Redis module — BullMQ broker + cache + lock store.
#
# Provisions:
#   - aws_elasticache_subnet_group across the private app subnet tier
#   - aws_security_group "redis" with ingress ONLY from app_security_group_id on port 6379
#   - aws_elasticache_parameter_group on the redis7 family with:
#       maxmemory-policy = noeviction  (BullMQ requirement — job records
#                                        cannot be evicted under memory
#                                        pressure or workers will lose
#                                        in-flight jobs silently)
#   - random_password + Secrets Manager secret for AUTH token
#       The app reads REDIS_URL = rediss://<token>@<endpoint>:<port>
#       at runtime via the AWS SDK; no plaintext token in tfvars or
#       app env files.
#   - aws_elasticache_replication_group with:
#       transit_encryption_enabled = true  (HARDCODED — OI-1 spec
#                                           requires encryption-in-transit)
#       at_rest_encryption_enabled = true
#       auth_token (only valid when transit_encryption_enabled = true)
#       cluster-mode-disabled (1 node group, replicas_per_node_group
#       toggles staging vs production HA)
#   - Optional CloudWatch log delivery for slow-log + engine-log
#
# Topology toggle:
#   replicas_per_node_group = 0  → single-node (staging)
#   replicas_per_node_group >= 1 → primary + replicas, multi-AZ + automatic
#                                  failover (production)

# ── Subnet group (private app tier) ──────────────────────────────────
resource "aws_elasticache_subnet_group" "this" {
  name        = "${var.name_prefix}-redis-subnet-group"
  description = "Private subnets for ${var.name_prefix} Redis"
  subnet_ids  = var.subnet_ids

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-redis-subnet-group"
  })
}

# ── Security group ───────────────────────────────────────────────────
# Owns its own ingress contract — only-from-app-sg on port 6379.
resource "aws_security_group" "redis" {
  name        = "${var.name_prefix}-redis-sg"
  description = "ElastiCache Redis — ingress from app SG only"
  vpc_id      = var.vpc_id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-redis-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "redis_from_app" {
  security_group_id            = aws_security_group.redis.id
  description                  = "Redis from app tier"
  from_port                    = var.port
  to_port                      = var.port
  ip_protocol                  = "tcp"
  referenced_security_group_id = var.app_security_group_id
}

# ── Parameter group ──────────────────────────────────────────────────
# Family is hardcoded redis7 — engine_version validation enforces
# the major-version match.
resource "aws_elasticache_parameter_group" "this" {
  # ElastiCache parameter groups don't support name_prefix — must use
  # name directly. Most parameter changes apply in-place (no recreate
  # of the parameter group itself), so the static name is fine.
  name        = "${var.name_prefix}-redis7"
  family      = "redis7"
  description = "Redis 7 parameter group for ${var.name_prefix}"

  # BullMQ requirement: job state must NEVER be evicted. The default
  # ElastiCache policy is volatile-lru which would evict TTL-bearing
  # keys under memory pressure — jobs would disappear silently.
  parameter {
    name  = "maxmemory-policy"
    value = "noeviction"
  }

  tags = var.tags
}

# ── AUTH token (random_password → Secrets Manager) ───────────────────
# ElastiCache auth_token must be 16–128 chars from this alphabet:
#   letters, digits, ! & # $ ^ < > -
# (No quotes, @, /, or backslashes.)
resource "random_password" "auth" {
  length           = 64
  special          = true
  override_special = "!&#$^<>-"
}

resource "aws_secretsmanager_secret" "auth" {
  name                    = "${var.name_prefix}-redis-auth"
  description             = "Redis AUTH token for ${var.name_prefix}. App reads this to build REDIS_URL = rediss://<auth>@<endpoint>:<port>"
  recovery_window_in_days = 7

  kms_key_id = var.kms_key_arn

  tags = var.tags
}

resource "aws_secretsmanager_secret_version" "auth" {
  secret_id = aws_secretsmanager_secret.auth.id

  # Stored as JSON so the app gets a self-describing blob — same shape
  # as the RDS-managed master credentials secret.
  secret_string = jsonencode({
    auth_token = random_password.auth.result
    port       = var.port
    engine     = "redis"
  })
}

# ── CloudWatch log groups (slow-log + engine-log) ────────────────────
resource "aws_cloudwatch_log_group" "slow_log" {
  count = var.enable_log_delivery ? 1 : 0

  name              = "/aws/elasticache/${var.name_prefix}/slow-log"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "engine_log" {
  count = var.enable_log_delivery ? 1 : 0

  name              = "/aws/elasticache/${var.name_prefix}/engine-log"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

# ── Replication group ────────────────────────────────────────────────
resource "aws_elasticache_replication_group" "this" {
  replication_group_id = "${var.name_prefix}-redis"
  description          = "${var.name_prefix} Redis 7 replication group"

  engine         = "redis"
  engine_version = var.engine_version
  node_type      = var.node_type
  port           = var.port

  # Topology — cluster-mode-disabled (single shard).
  num_node_groups         = 1
  replicas_per_node_group = var.replicas_per_node_group

  # HA toggles flip together with replica count. Multi-AZ + automatic
  # failover require >= 1 replica.
  automatic_failover_enabled = var.replicas_per_node_group > 0
  multi_az_enabled           = var.replicas_per_node_group > 0

  # Networking — private placement enforced
  subnet_group_name  = aws_elasticache_subnet_group.this.name
  security_group_ids = [aws_security_group.redis.id]

  # Parameter group
  parameter_group_name = aws_elasticache_parameter_group.this.name

  # ── Encryption ──
  # transit_encryption_enabled is HARDCODED true — OI-1 spec requires
  # encryption-in-transit. at_rest also on; KMS key optional.
  transit_encryption_enabled = true
  at_rest_encryption_enabled = true
  kms_key_id                 = var.kms_key_arn

  # auth_token requires transit_encryption_enabled = true (above).
  auth_token                 = random_password.auth.result
  auth_token_update_strategy = "ROTATE"

  # ── Snapshots ──
  snapshot_retention_limit = var.snapshot_retention_days
  snapshot_window          = var.snapshot_window

  # ── Maintenance ──
  maintenance_window         = var.maintenance_window
  apply_immediately          = var.apply_immediately
  auto_minor_version_upgrade = true

  # ── Log delivery ──
  dynamic "log_delivery_configuration" {
    for_each = var.enable_log_delivery ? [
      {
        log_type = "slow-log"
        arn      = aws_cloudwatch_log_group.slow_log[0].arn
      },
      {
        log_type = "engine-log"
        arn      = aws_cloudwatch_log_group.engine_log[0].arn
      },
    ] : []

    content {
      destination      = log_delivery_configuration.value.arn
      destination_type = "cloudwatch-logs"
      log_format       = "json"
      log_type         = log_delivery_configuration.value.log_type
    }
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-redis"
  })

  lifecycle {
    # auth_token rotation strategy gives terraform full control over
    # the token; ignore drift if AWS reports a different stored value
    # mid-rotation.
    ignore_changes = [auth_token]
  }
}
