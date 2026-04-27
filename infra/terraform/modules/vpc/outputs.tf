output "vpc_id" {
  description = "VPC ID."
  value       = aws_vpc.this.id
}

output "vpc_cidr_block" {
  description = "VPC CIDR block."
  value       = aws_vpc.this.cidr_block
}

output "internet_gateway_id" {
  description = "ID of the IGW attached to the public route table."
  value       = aws_internet_gateway.this.id
}

output "availability_zones" {
  description = "AZ names this VPC spans."
  value       = local.az_names
}

# Subnet ID lists, one entry per AZ. Order is stable (sorted by AZ
# index). Downstream modules consume these in slice form.
output "public_subnet_ids" {
  description = "Public subnet IDs (ALB + NAT)."
  value       = aws_subnet.public[*].id
}

output "private_app_subnet_ids" {
  description = "Private app subnet IDs (app workloads). Egress via NAT; reachable from ALB only."
  value       = aws_subnet.private_app[*].id
}

output "private_db_subnet_ids" {
  description = "Private DB subnet IDs (RDS subnet group). No internet egress."
  value       = aws_subnet.private_db[*].id
}

# Backwards-compat alias — some legacy consumers expect a single
# `private_subnet_ids` list. Defaults to the app tier (the broadest
# private set). Prefer the tier-specific outputs above.
output "private_subnet_ids" {
  description = "DEPRECATED — alias for private_app_subnet_ids. Prefer the tier-specific output."
  value       = aws_subnet.private_app[*].id
}

output "nat_gateway_ids" {
  description = "NAT Gateway IDs. Empty when enable_nat_gateway = false."
  value       = aws_nat_gateway.this[*].id
}

# Security groups
output "alb_security_group_id" {
  description = "Security group attached to the ALB. Ingress from internet on 80/443."
  value       = aws_security_group.alb.id
}

output "app_security_group_id" {
  description = "Security group for app workloads. Ingress from alb_security_group_id on app_ingress_port only."
  value       = aws_security_group.app.id
}

output "flow_logs_log_group_name" {
  description = "CloudWatch log group name for VPC flow logs. Empty when enable_flow_logs = false."
  value       = var.enable_flow_logs ? aws_cloudwatch_log_group.flow_logs[0].name : null
}
