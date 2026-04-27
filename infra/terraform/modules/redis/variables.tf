variable "name_prefix" {
  description = "Prefix for resources."
  type        = string
}

variable "environment" {
  description = "Deployment environment."
  type        = string
}

variable "vpc_id" {
  description = "VPC the cache lives in."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnet IDs for the ElastiCache subnet group. Must span >= 2 AZs when replicas_per_node_group > 0 (multi_az_enabled requires it)."
  type        = list(string)

  validation {
    condition     = length(var.subnet_ids) >= 1
    error_message = "subnet_ids must have at least 1 entry; >= 2 required when running with replicas."
  }
}

variable "app_security_group_id" {
  description = "Security group of the app tier. Cache ingress is opened ONLY from this SG."
  type        = string
}

variable "engine_version" {
  description = "Redis engine version. Pin to the 7.x line — parameter_group family is hardcoded redis7."
  type        = string
  default     = "7.1"

  validation {
    condition     = can(regex("^7\\.", var.engine_version))
    error_message = "engine_version must be on the Redis 7 line — parameter_group_family is hardcoded to redis7."
  }
}

variable "node_type" {
  description = "ElastiCache node type. Override per-env (smaller in staging)."
  type        = string
  default     = "cache.t4g.small"
}

variable "replicas_per_node_group" {
  description = "Read replicas per node group. 0 = single-node (staging); >= 1 = HA (production with multi-AZ + automatic failover)."
  type        = number
  default     = 0

  validation {
    condition     = var.replicas_per_node_group >= 0 && var.replicas_per_node_group <= 5
    error_message = "replicas_per_node_group must be between 0 and 5."
  }
}

variable "port" {
  description = "Redis port."
  type        = number
  default     = 6379
}

variable "snapshot_retention_days" {
  description = "Days to retain automatic snapshots. 0 disables snapshots — explicitly disallowed for OI-1."
  type        = number
  default     = 1

  validation {
    condition     = var.snapshot_retention_days >= 1 && var.snapshot_retention_days <= 35
    error_message = "snapshot_retention_days must be 1–35."
  }
}

variable "snapshot_window" {
  description = "UTC snapshot window, format hh24:mi-hh24:mi. Must not overlap maintenance_window."
  type        = string
  default     = "01:00-02:00"
}

variable "maintenance_window" {
  description = "UTC maintenance window."
  type        = string
  default     = "sun:02:30-sun:03:30"
}

variable "kms_key_arn" {
  description = "Customer-managed KMS key ARN for at-rest encryption. Null = AWS-managed ElastiCache KMS key."
  type        = string
  default     = null
}

variable "apply_immediately" {
  description = "If true, parameter / replication-group changes apply outside the maintenance window. Production should be false."
  type        = bool
  default     = false
}

variable "enable_log_delivery" {
  description = "If true, ship slow-log + engine-log to CloudWatch Logs."
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch retention for ElastiCache logs. Must be one of the AWS-allowed values."
  type        = number
  default     = 30

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.log_retention_days)
    error_message = "log_retention_days must be one of the AWS-allowed CloudWatch retention values."
  }
}

variable "tags" {
  description = "Tags applied to every resource in this module."
  type        = map(string)
  default     = {}
}
