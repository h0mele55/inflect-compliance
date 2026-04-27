variable "name_prefix" {
  description = "Prefix for resources."
  type        = string
}

variable "environment" {
  description = "Deployment environment."
  type        = string
}

variable "bucket_name" {
  description = "Override S3 bucket name. Empty = derive as <name_prefix>-storage."
  type        = string
  default     = ""
}

variable "versioning_enabled" {
  description = "If true, enable bucket versioning. OI-1 spec requires true."
  type        = bool
  default     = true
}

variable "ia_transition_days" {
  description = "Days after which current objects transition to STANDARD_IA. 0 disables. OI-1 spec = 90."
  type        = number
  default     = 90
}

variable "noncurrent_version_expiration_days" {
  description = "Days after which noncurrent versions are deleted. 0 disables. Helps cap storage cost when versioning is on."
  type        = number
  default     = 365
}

variable "abort_incomplete_multipart_days" {
  description = "Days after which incomplete multipart uploads are aborted (cost-cleanup)."
  type        = number
  default     = 7
}

variable "cors_allowed_origins" {
  description = "Origins permitted to upload via pre-signed URLs (PUT/POST). Use the app's web origin(s). Empty list = no CORS rule (server-side uploads only)."
  type        = list(string)
  default     = []
}

variable "cors_allowed_methods" {
  description = "HTTP methods permitted by CORS. Pre-signed-URL uploads use PUT; multipart browser uploads use POST."
  type        = list(string)
  default     = ["PUT", "POST", "GET", "HEAD"]

  validation {
    condition     = length(setsubtract(var.cors_allowed_methods, ["GET", "HEAD", "PUT", "POST", "DELETE"])) == 0
    error_message = "cors_allowed_methods entries must be from: GET, HEAD, PUT, POST, DELETE."
  }
}

variable "cors_allowed_headers" {
  description = "CORS allowed request headers. Pre-signed PUT forwards Content-Type and x-amz-meta-*; ['*'] is the standard pattern."
  type        = list(string)
  default     = ["*"]
}

variable "cors_expose_headers" {
  description = "Headers exposed to JS in the response. ETag is needed by clients that verify upload integrity."
  type        = list(string)
  default     = ["ETag"]
}

variable "cors_max_age_seconds" {
  description = "Browser preflight cache duration."
  type        = number
  default     = 3600
}

variable "deny_non_tls_access" {
  description = "If true, attach a bucket policy denying any access where aws:SecureTransport = false. Production must keep this true."
  type        = bool
  default     = true
}

variable "create_app_role" {
  description = "If true, create an IAM role + instance profile for the app workload, with the storage policy attached. Most callers leave this false and attach the policy ARN to whatever workload role already exists (ECS task role, EC2 instance profile, etc.)."
  type        = bool
  default     = false
}

variable "app_role_assume_principals" {
  description = "Service principals permitted to assume the app role (only used when create_app_role = true). Typical values: ec2.amazonaws.com, ecs-tasks.amazonaws.com, lambda.amazonaws.com."
  type        = list(string)
  default     = ["ec2.amazonaws.com"]
}

variable "force_destroy" {
  description = "If true, allow `terraform destroy` to remove non-empty buckets. Production MUST leave false — accidental destroy of tenant evidence is unrecoverable."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags applied to every resource in this module."
  type        = map(string)
  default     = {}
}
