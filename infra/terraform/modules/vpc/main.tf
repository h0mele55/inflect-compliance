# VPC module — networking foundation.
#
# Topology (3 AZs by default; configurable):
#
#                      ┌──────────────────────────────────────────┐
#   internet  ───▶ IGW ▶│  public  /24 × N AZs  (ALB + NAT GW)    │
#                      └──────────────────────────────────────────┘
#                                       │
#                                NAT GW (per-AZ in prod, single in staging)
#                                       │
#                      ┌──────────────────────────────────────────┐
#                      │  private-app  /24 × N AZs  (app SG)     │ ──── egress to internet via NAT
#                      └──────────────────────────────────────────┘
#                                       │
#                          ┌── (5432, app_sg → db_sg only) ──┐
#                          ▼                                  │
#                      ┌──────────────────────────────────────────┐
#                      │  private-db   /24 × N AZs  (db SG)      │
#                      └──────────────────────────────────────────┘
#
# CIDR layout for the default 10.0.0.0/16:
#   public:      10.0.0.0/24   .. 10.0.{N-1}.0/24
#   private-app: 10.0.10.0/24  .. 10.0.{10+N-1}.0/24
#   private-db:  10.0.20.0/24  .. 10.0.{20+N-1}.0/24
#
# Subnets are derived via cidrsubnet() from var.cidr_block so a custom
# VPC CIDR works without re-coding offsets.
#
# Security groups created here:
#   - alb_security_group: 80/443 from internet
#   - app_security_group: var.app_ingress_port from alb_sg only
# The database security group is owned by the DATABASE module — it
# adds its own ingress rule from app_security_group_id at creation.

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  az_names = length(var.availability_zones) > 0 ? var.availability_zones : slice(data.aws_availability_zones.available.names, 0, var.az_count)
  az_count = length(local.az_names)

  # /24s carved from the VPC /16 (or whatever was passed). The 8-bit
  # netmask delta gives us 256 possible /24 subnets — plenty of
  # headroom for future tiers (cache, ops, peering).
  public_subnet_cidrs      = [for i in range(local.az_count) : cidrsubnet(var.cidr_block, 8, i)]
  private_app_subnet_cidrs = [for i in range(local.az_count) : cidrsubnet(var.cidr_block, 8, i + 10)]
  private_db_subnet_cidrs  = [for i in range(local.az_count) : cidrsubnet(var.cidr_block, 8, i + 20)]

  nat_gateway_count = var.enable_nat_gateway ? (var.single_nat_gateway ? 1 : local.az_count) : 0
}

# ── VPC ──────────────────────────────────────────────────────────────
resource "aws_vpc" "this" {
  cidr_block           = var.cidr_block
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-vpc"
  })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-igw"
  })
}

# ── Subnets ──────────────────────────────────────────────────────────
resource "aws_subnet" "public" {
  count = local.az_count

  vpc_id                  = aws_vpc.this.id
  cidr_block              = local.public_subnet_cidrs[count.index]
  availability_zone       = local.az_names[count.index]
  map_public_ip_on_launch = false # We never want auto-public IPs; the ALB lives here, nothing else.

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-public-${local.az_names[count.index]}"
    Tier = "public"
  })
}

resource "aws_subnet" "private_app" {
  count = local.az_count

  vpc_id            = aws_vpc.this.id
  cidr_block        = local.private_app_subnet_cidrs[count.index]
  availability_zone = local.az_names[count.index]

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-private-app-${local.az_names[count.index]}"
    Tier = "private-app"
  })
}

resource "aws_subnet" "private_db" {
  count = local.az_count

  vpc_id            = aws_vpc.this.id
  cidr_block        = local.private_db_subnet_cidrs[count.index]
  availability_zone = local.az_names[count.index]

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-private-db-${local.az_names[count.index]}"
    Tier = "private-db"
  })
}

# ── NAT Gateways ─────────────────────────────────────────────────────
# Production: one NAT GW per AZ — losing one AZ doesn't lose egress.
# Staging:   single NAT GW shared across all AZs — saves ~$32/mo per
#            extra AZ at the cost of a single AZ-failure egress outage.
resource "aws_eip" "nat" {
  count = local.nat_gateway_count

  domain = "vpc"

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-nat-eip-${count.index}"
  })

  depends_on = [aws_internet_gateway.this]
}

resource "aws_nat_gateway" "this" {
  count = local.nat_gateway_count

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-nat-${count.index}"
  })

  depends_on = [aws_internet_gateway.this]
}

# ── Route Tables ─────────────────────────────────────────────────────
# Public RT: 0.0.0.0/0 → IGW. Shared across all public subnets.
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-rt-public"
  })
}

resource "aws_route_table_association" "public" {
  count = local.az_count

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private-app RT: one per AZ, default route → that AZ's NAT GW.
# When single_nat_gateway = true, all RTs point at the single NAT.
resource "aws_route_table" "private_app" {
  count = local.az_count

  vpc_id = aws_vpc.this.id

  dynamic "route" {
    for_each = var.enable_nat_gateway ? [1] : []

    content {
      cidr_block     = "0.0.0.0/0"
      nat_gateway_id = aws_nat_gateway.this[var.single_nat_gateway ? 0 : count.index].id
    }
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-rt-private-app-${local.az_names[count.index]}"
  })
}

resource "aws_route_table_association" "private_app" {
  count = local.az_count

  subnet_id      = aws_subnet.private_app[count.index].id
  route_table_id = aws_route_table.private_app[count.index].id
}

# Private-db RT: deliberately NO default route. The database tier is
# isolated from internet egress. RDS reaches AWS service endpoints via
# the AWS-internal network when SSL is enforced.
resource "aws_route_table" "private_db" {
  count = local.az_count

  vpc_id = aws_vpc.this.id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-rt-private-db-${local.az_names[count.index]}"
  })
}

resource "aws_route_table_association" "private_db" {
  count = local.az_count

  subnet_id      = aws_subnet.private_db[count.index].id
  route_table_id = aws_route_table.private_db[count.index].id
}

# ── Security Groups ──────────────────────────────────────────────────
# ALB: 80 + 443 from the world.
resource "aws_security_group" "alb" {
  name        = "${var.name_prefix}-alb-sg"
  description = "ALB ingress from internet on 80/443"
  vpc_id      = aws_vpc.this.id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-alb-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTP from internet (Caddy/ALB redirects to HTTPS)"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTPS from internet"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "alb_egress_all" {
  security_group_id = aws_security_group.alb.id
  description       = "Egress to app SG and AWS services"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

# App: ingress on var.app_ingress_port from alb_sg ONLY. Egress all
# (NAT for outbound; reaches RDS / Redis / S3 over private routes).
resource "aws_security_group" "app" {
  name        = "${var.name_prefix}-app-sg"
  description = "App tier — ingress from ALB only on app port"
  vpc_id      = aws_vpc.this.id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-app-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "app_from_alb" {
  security_group_id            = aws_security_group.app.id
  description                  = "Ingress from ALB on app port"
  from_port                    = var.app_ingress_port
  to_port                      = var.app_ingress_port
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.alb.id
}

resource "aws_vpc_security_group_egress_rule" "app_egress_all" {
  security_group_id = aws_security_group.app.id
  description       = "Egress to RDS, Redis, S3, AWS APIs, and via NAT to internet"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

# ── VPC Flow Logs (optional but on-by-default) ───────────────────────
resource "aws_cloudwatch_log_group" "flow_logs" {
  count = var.enable_flow_logs ? 1 : 0

  name              = "/aws/vpc/${var.name_prefix}/flow-logs"
  retention_in_days = var.flow_logs_retention_days

  tags = var.tags
}

data "aws_iam_policy_document" "flow_logs_assume" {
  count = var.enable_flow_logs ? 1 : 0

  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["vpc-flow-logs.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "flow_logs" {
  count = var.enable_flow_logs ? 1 : 0

  name               = "${var.name_prefix}-vpc-flow-logs"
  assume_role_policy = data.aws_iam_policy_document.flow_logs_assume[0].json

  tags = var.tags
}

data "aws_iam_policy_document" "flow_logs_publish" {
  count = var.enable_flow_logs ? 1 : 0

  statement {
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogGroups",
      "logs:DescribeLogStreams",
    ]

    resources = ["${aws_cloudwatch_log_group.flow_logs[0].arn}:*"]
  }
}

resource "aws_iam_role_policy" "flow_logs" {
  count = var.enable_flow_logs ? 1 : 0

  name   = "${var.name_prefix}-vpc-flow-logs"
  role   = aws_iam_role.flow_logs[0].id
  policy = data.aws_iam_policy_document.flow_logs_publish[0].json
}

resource "aws_flow_log" "this" {
  count = var.enable_flow_logs ? 1 : 0

  iam_role_arn    = aws_iam_role.flow_logs[0].arn
  log_destination = aws_cloudwatch_log_group.flow_logs[0].arn
  traffic_type    = "ALL"
  vpc_id          = aws_vpc.this.id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-vpc-flow-logs"
  })
}
