output "primary_endpoint_address" {
  description = "Primary endpoint hostname. Use with TLS (rediss://) — transit_encryption is on."
  value       = aws_elasticache_replication_group.this.primary_endpoint_address
}

output "reader_endpoint_address" {
  description = "Reader endpoint hostname (load-balanced across replicas). Null when replicas_per_node_group = 0."
  value       = aws_elasticache_replication_group.this.reader_endpoint_address
}

output "configuration_endpoint_address" {
  description = "Configuration endpoint (cluster-mode only). Null in cluster-mode-disabled."
  value       = aws_elasticache_replication_group.this.configuration_endpoint_address
}

output "port" {
  description = "Redis port."
  value       = aws_elasticache_replication_group.this.port
}

output "replication_group_id" {
  description = "Replication group ID."
  value       = aws_elasticache_replication_group.this.id
}

output "security_group_id" {
  description = "Security group ID controlling ingress to Redis."
  value       = aws_security_group.redis.id
}

output "subnet_group_name" {
  description = "ElastiCache subnet group name."
  value       = aws_elasticache_subnet_group.this.name
}

output "parameter_group_name" {
  description = "Parameter group name. Locks maxmemory-policy = noeviction (BullMQ requirement)."
  value       = aws_elasticache_parameter_group.this.name
}

output "auth_secret_arn" {
  description = "ARN of the Secrets Manager secret holding the AUTH token. App reads this and builds REDIS_URL = rediss://<token>@<endpoint>:<port>."
  value       = aws_secretsmanager_secret.auth.arn
  sensitive   = true
}

output "auth_secret_name" {
  description = "Name of the Secrets Manager secret. Useful for IAM policy resource scoping."
  value       = aws_secretsmanager_secret.auth.name
}
