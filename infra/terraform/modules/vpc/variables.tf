variable "name_prefix" {
  description = "Prefix for resources (e.g. inflect-compliance-staging)."
  type        = string
}

variable "environment" {
  description = "Deployment environment."
  type        = string
}

variable "cidr_block" {
  description = "Primary IPv4 CIDR for the VPC. Must not overlap with peered networks."
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "AZs to span. Empty = use the first var.az_count AZs in the region."
  type        = list(string)
  default     = []
}

variable "az_count" {
  description = "How many AZs to span when var.availability_zones is empty. Min 2 (RDS requires multi-AZ subnet group). 3 recommended for prod."
  type        = number
  default     = 3

  validation {
    condition     = var.az_count >= 2 && var.az_count <= 6
    error_message = "az_count must be between 2 and 6."
  }
}

variable "enable_nat_gateway" {
  description = "If true, provision NAT gateways so private subnets reach the internet egress-only."
  type        = bool
  default     = true
}

variable "single_nat_gateway" {
  description = "If true, share ONE NAT gateway across all private subnets (cost-saver for staging). False = per-AZ NAT for HA (production). Ignored when enable_nat_gateway = false."
  type        = bool
  default     = false
}

variable "app_ingress_port" {
  description = "Port the app process listens on. ALB → app SG ingress is opened on this port only."
  type        = number
  default     = 3000
}

variable "enable_flow_logs" {
  description = "If true, enable VPC Flow Logs to CloudWatch. Recommended for production."
  type        = bool
  default     = true
}

variable "flow_logs_retention_days" {
  description = "CloudWatch retention in days for VPC flow logs. AWS-allowed values only."
  type        = number
  default     = 30

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.flow_logs_retention_days)
    error_message = "flow_logs_retention_days must be one of the AWS-allowed CloudWatch retention values."
  }
}

variable "tags" {
  description = "Tags applied to every resource in this module."
  type        = map(string)
  default     = {}
}
