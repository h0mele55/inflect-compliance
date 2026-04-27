# Bootstrap stack — creates the S3 buckets + DynamoDB table that hold
# remote state for the root module.
#
# Run ONCE per AWS account, by an operator with admin credentials:
#   terraform -chdir=infra/terraform/bootstrap init
#   terraform -chdir=infra/terraform/bootstrap apply
#
# After apply, commit nothing from this directory's runtime state
# (.terraform/, terraform.tfstate). The bootstrap state is small and
# can be re-imported from AWS via `terraform import` if lost — but
# protect it: the operator who ran apply should archive the resulting
# terraform.tfstate offline (e.g. encrypted in a password manager).

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = var.tags
  }
}

# One state bucket per environment — blast-radius isolation.
# A compromised staging credential cannot read or mutate production state.
resource "aws_s3_bucket" "tfstate" {
  for_each = toset(var.environments)

  bucket        = "${var.project}-tfstate-${each.value}"
  force_destroy = var.force_destroy
}

resource "aws_s3_bucket_versioning" "tfstate" {
  for_each = aws_s3_bucket.tfstate

  bucket = each.value.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  for_each = aws_s3_bucket.tfstate

  bucket = each.value.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  for_each = aws_s3_bucket.tfstate

  bucket = each.value.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "tfstate" {
  for_each = aws_s3_bucket.tfstate

  bucket = each.value.id

  rule {
    id     = "expire-noncurrent-state-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# One DynamoDB lock table shared across environments. The terraform
# S3 backend computes a per-state LockID, so cross-env contention is
# architecturally impossible despite the shared table.
resource "aws_dynamodb_table" "tfstate_lock" {
  name         = var.lock_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}
