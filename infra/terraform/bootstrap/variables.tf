variable "aws_region" {
  description = "AWS region for the state bucket + lock table."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Project identifier used to derive bucket + table names."
  type        = string
  default     = "inflect-compliance"
}

variable "environments" {
  description = "Environments that need their own state bucket. Each gets <project>-tfstate-<env>."
  type        = list(string)
  default     = ["staging", "production"]

  validation {
    condition     = length(var.environments) > 0
    error_message = "environments must list at least one entry."
  }
}

variable "lock_table_name" {
  description = "DynamoDB lock table name. A single table is shared across environments — locks key on the LockID hash so cross-env contention is impossible."
  type        = string
  default     = "inflect-compliance-tfstate-locks"
}

variable "force_destroy" {
  description = "If true, allow `terraform destroy` to remove non-empty state buckets. Leave false in real environments — accidental destroy of state is unrecoverable."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags applied to all bootstrap resources."
  type        = map(string)
  default = {
    Project   = "inflect-compliance"
    Component = "tfstate-bootstrap"
    ManagedBy = "terraform"
  }
}
