output "bucket_id" {
  description = "S3 bucket ID (== bucket name)."
  value       = aws_s3_bucket.this.id
}

output "bucket_arn" {
  description = "S3 bucket ARN."
  value       = aws_s3_bucket.this.arn
}

output "bucket_domain_name" {
  description = "Bucket domain name (global path-style endpoint)."
  value       = aws_s3_bucket.this.bucket_domain_name
}

output "bucket_regional_domain_name" {
  description = "Bucket regional domain name. Prefer this over bucket_domain_name for app config — region-pinned."
  value       = aws_s3_bucket.this.bucket_regional_domain_name
}

output "region" {
  description = "AWS region the bucket lives in."
  value       = aws_s3_bucket.this.region
}

output "access_policy_arn" {
  description = "ARN of the IAM policy granting the app workload its storage access surface. Attach to any workload role."
  value       = aws_iam_policy.app_access.arn
}

output "app_role_arn" {
  description = "ARN of the optional app role created when create_app_role = true. Null otherwise."
  value       = try(aws_iam_role.app[0].arn, null)
}

output "app_role_name" {
  description = "Name of the optional app role. Null when create_app_role = false."
  value       = try(aws_iam_role.app[0].name, null)
}

output "app_instance_profile_arn" {
  description = "ARN of the optional EC2 instance profile. Null when create_app_role = false."
  value       = try(aws_iam_instance_profile.app[0].arn, null)
}

output "app_instance_profile_name" {
  description = "Name of the optional EC2 instance profile. Null when create_app_role = false."
  value       = try(aws_iam_instance_profile.app[0].name, null)
}

output "kms_key_arn" {
  description = "KMS key ARN. Null with SSE-S3 (AES256). Reserved for a future SSE-KMS migration."
  value       = null
}
