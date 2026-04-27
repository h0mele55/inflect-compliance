variable "name_prefix" {
  description = "Prefix for resources (e.g. inflect-compliance-staging)."
  type        = string
}

variable "environment" {
  description = "Deployment environment."
  type        = string
}

variable "additional_secret_arns" {
  description = "Secret ARNs from other modules (RDS-managed master credentials, Redis AUTH token, etc.) to include in the runtime read policy. The module-internal secrets are added automatically."
  type        = list(string)
  default     = []
}

variable "kms_key_arn" {
  description = "Customer-managed KMS key ARN for at-rest encryption of secrets. Null = AWS-managed Secrets Manager KMS key."
  type        = string
  default     = null
}

variable "data_encryption_key_recovery_days" {
  description = "Recovery window (days) on the master KEK secret. Loss = loss of all encrypted data — keep at the AWS max of 30."
  type        = number
  default     = 30

  validation {
    condition     = var.data_encryption_key_recovery_days >= 7 && var.data_encryption_key_recovery_days <= 30
    error_message = "data_encryption_key_recovery_days must be 7–30."
  }
}

variable "secret_recovery_days" {
  description = "Recovery window (days) on regenerable secrets (auth, jwt, av-webhook, oauth)."
  type        = number
  default     = 7

  validation {
    condition     = var.secret_recovery_days >= 7 && var.secret_recovery_days <= 30
    error_message = "secret_recovery_days must be 7–30."
  }
}

variable "tags" {
  description = "Tags applied to every resource in this module."
  type        = map(string)
  default     = {}
}
