output "secret_arns" {
  description = "Map of logical name → ARN for the secrets created by this module. App reads via the AWS SDK at boot."
  value = {
    data_encryption_key     = aws_secretsmanager_secret.data_encryption_key.arn
    auth_secret             = aws_secretsmanager_secret.auth_secret.arn
    jwt_secret              = aws_secretsmanager_secret.jwt_secret.arn
    av_webhook_secret       = aws_secretsmanager_secret.av_webhook_secret.arn
    google_client_secret    = aws_secretsmanager_secret.google_client_secret.arn
    microsoft_client_secret = aws_secretsmanager_secret.microsoft_client_secret.arn
  }
}

output "secret_names" {
  description = "Map of app env-var name → AWS Secrets Manager secret name. Consumed by scripts/bootstrap-env-from-secrets.sh."
  value = {
    DATA_ENCRYPTION_KEY     = aws_secretsmanager_secret.data_encryption_key.name
    AUTH_SECRET             = aws_secretsmanager_secret.auth_secret.name
    JWT_SECRET              = aws_secretsmanager_secret.jwt_secret.name
    AV_WEBHOOK_SECRET       = aws_secretsmanager_secret.av_webhook_secret.name
    GOOGLE_CLIENT_SECRET    = aws_secretsmanager_secret.google_client_secret.name
    MICROSOFT_CLIENT_SECRET = aws_secretsmanager_secret.microsoft_client_secret.name
  }
}

output "all_runtime_secret_arns" {
  description = "Every secret ARN covered by the runtime-secrets-read policy (module-internal + additional_secret_arns). Useful for auditing the workload role's actual secret surface."
  value       = local.all_secret_arns
}

output "runtime_secrets_read_policy_arn" {
  description = "ARN of the IAM policy granting GetSecretValue + DescribeSecret on every runtime secret. Attach to the app workload role."
  value       = aws_iam_policy.runtime_secrets_read.arn
}

output "runtime_secrets_read_policy_name" {
  description = "Name of the runtime-secrets-read IAM policy."
  value       = aws_iam_policy.runtime_secrets_read.name
}
