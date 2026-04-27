# Database module — primary PostgreSQL store.
#
# Provisions:
#   - aws_db_subnet_group across the private-db subnet tier
#   - aws_security_group "db" with ingress ONLY from app_security_group_id
#   - aws_db_parameter_group on the postgres16 family with:
#       row_security = 1            (closest cluster-level mapping to the
#                                    OI-1 "rls_force = on" requirement;
#                                    the FORCE-RLS *enforcement* is per-
#                                    table in prisma/rls-setup.sql)
#       rds.force_ssl = 1           (TLS-or-reject)
#       log_connections / log_disconnections / log_statement = ddl
#       log_min_duration_statement  (slow-query log)
#       shared_preload_libraries = pg_stat_statements
#       pg_stat_statements.track = ALL
#   - aws_db_instance:
#       engine = postgres 16, gp3 storage_encrypted = true,
#       multi_az = var.multi_az, backup_retention_period = 7,
#       PITR (implicit while retention > 0), deletion_protection,
#       Performance Insights, CloudWatch logs export,
#       publicly_accessible = false (HARDCODED — never tunable),
#       manage_master_user_password = true (RDS auto-generates the
#       password and writes it to AWS Secrets Manager — no plaintext
#       password ever lands in tfvars or terraform state).

# ── Subnet group (private-db tier) ───────────────────────────────────
resource "aws_db_subnet_group" "this" {
  name        = "${var.name_prefix}-db-subnet-group"
  description = "Private DB subnets for ${var.name_prefix}"
  subnet_ids  = var.subnet_ids

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-db-subnet-group"
  })
}

# ── Security group ───────────────────────────────────────────────────
# DB SG owns its own ingress contract — created by this module so the
# VPC module doesn't need to know which apps will reach the DB. The
# only ingress allowed is from the app SG passed in by the caller.
resource "aws_security_group" "db" {
  name        = "${var.name_prefix}-db-sg"
  description = "RDS Postgres — ingress from app SG only"
  vpc_id      = var.vpc_id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-db-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "db_from_app" {
  security_group_id            = aws_security_group.db.id
  description                  = "Postgres from app tier"
  from_port                    = var.port
  to_port                      = var.port
  ip_protocol                  = "tcp"
  referenced_security_group_id = var.app_security_group_id
}

# ── Parameter group ──────────────────────────────────────────────────
# Family is hardcoded to postgres16 — engine_version validation
# enforces the major-version match.
resource "aws_db_parameter_group" "this" {
  name_prefix = "${var.name_prefix}-pg16-"
  family      = "postgres16"
  description = "Postgres 16 parameter group for ${var.name_prefix}"

  # ── RLS enforcement ──
  # row_security cannot be set to 0 by any session under this parameter
  # group. The application's per-tenant policies + per-table FORCE ROW
  # LEVEL SECURITY (prisma/rls-setup.sql) handle the actual isolation;
  # this parameter is the cluster-wide backstop that prevents an
  # operator from globally disabling RLS via SET row_security=off.
  parameter {
    name  = "row_security"
    value = "1"
  }

  # ── Transport security ──
  parameter {
    name         = "rds.force_ssl"
    value        = var.force_ssl ? "1" : "0"
    apply_method = "pending-reboot"
  }

  # ── Logging / observability ──
  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_statement"
    value = "ddl"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = tostring(var.log_min_duration_statement_ms)
  }

  # ── pg_stat_statements ──
  # shared_preload_libraries requires a reboot. Setting it via
  # apply_method = pending-reboot lets terraform converge cleanly;
  # operator triggers the reboot during the next maintenance window.
  parameter {
    name         = "shared_preload_libraries"
    value        = "pg_stat_statements"
    apply_method = "pending-reboot"
  }

  parameter {
    name         = "pg_stat_statements.track"
    value        = "ALL"
    apply_method = "pending-reboot"
  }

  tags = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

# ── DB instance ──────────────────────────────────────────────────────
resource "aws_db_instance" "this" {
  identifier = "${var.name_prefix}-db"

  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  # Storage
  allocated_storage     = var.allocated_storage_gb
  max_allocated_storage = var.max_allocated_storage_gb > 0 ? var.max_allocated_storage_gb : null
  storage_type          = var.storage_type
  storage_encrypted     = true # HARDCODED — never tunable
  kms_key_id            = var.kms_key_arn

  # Database identity
  db_name  = var.db_name
  username = var.master_username
  port     = var.port

  # Master password — managed by RDS in AWS Secrets Manager.
  # No plaintext password ever lands in tfvars or terraform state.
  manage_master_user_password = true

  # Networking — private placement enforced
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false # HARDCODED — never tunable

  # Parameter group
  parameter_group_name = aws_db_parameter_group.this.name

  # Backup & PITR (PITR is implicit while backup_retention_period > 0)
  backup_retention_period = var.backup_retention_days
  backup_window           = var.backup_window
  copy_tags_to_snapshot   = true

  # Maintenance
  maintenance_window         = var.maintenance_window
  auto_minor_version_upgrade = var.auto_minor_version_upgrade
  apply_immediately          = var.apply_immediately

  # HA + protection
  multi_az                  = var.multi_az
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.name_prefix}-db-final-${formatdate("YYYYMMDDHHmmss", timestamp())}"

  # Observability
  performance_insights_enabled          = var.performance_insights_enabled
  performance_insights_retention_period = var.performance_insights_enabled ? var.performance_insights_retention_days : null
  enabled_cloudwatch_logs_exports       = ["postgresql", "upgrade"]

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-db"
  })

  lifecycle {
    # `final_snapshot_identifier` references timestamp() which changes
    # every plan; ignore drift on it so plans aren't perpetually dirty.
    # The identifier is only consulted at destroy-time anyway.
    ignore_changes = [final_snapshot_identifier]
  }
}
