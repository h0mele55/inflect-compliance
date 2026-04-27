output "state_buckets" {
  description = "Map of environment → S3 bucket name. Use these values in envs/<env>.backend.hcl."
  value       = { for env, bucket in aws_s3_bucket.tfstate : env => bucket.id }
}

output "lock_table_name" {
  description = "DynamoDB lock table name for the s3 backend `dynamodb_table` field."
  value       = aws_dynamodb_table.tfstate_lock.name
}

output "region" {
  description = "AWS region of the bootstrap resources."
  value       = var.aws_region
}
