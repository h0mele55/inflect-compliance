# Storage module — S3 bucket backing src/lib/storage/s3-provider.ts.
#
# Provides:
#   - aws_s3_bucket (force_destroy guarded; default false for prod safety)
#   - aws_s3_bucket_versioning ENABLED       (OI-1 spec)
#   - aws_s3_bucket_server_side_encryption_configuration AES256 (SSE-S3, OI-1 spec)
#   - aws_s3_bucket_public_access_block — all four flags ON
#   - aws_s3_bucket_lifecycle_configuration:
#       • current objects → STANDARD_IA after ia_transition_days (default 90)
#       • noncurrent versions expire after noncurrent_version_expiration_days
#       • incomplete multipart uploads aborted after abort_incomplete_multipart_days
#   - aws_s3_bucket_cors_configuration when cors_allowed_origins is non-empty
#       (the app's pre-signed URL upload flow PUTs directly from the
#       browser, so CORS must permit PUT/POST from the app origin)
#   - aws_s3_bucket_policy with deny-non-TLS statement
#   - aws_iam_policy "app-storage" with the minimum surface for the
#     pre-signed-URL upload + readback + delete flow
#   - Optional: aws_iam_role + instance_profile when create_app_role = true
#
# Access model (IAM-driven, never bucket-policy-grants):
#   - Bucket has NO public-grant policy
#   - Bucket public-access-block enforces no future grant can leak it public
#   - The app's workload role attaches the storage policy emitted by
#     this module (or a role created here when create_app_role = true)

locals {
  bucket_name = var.bucket_name != "" ? var.bucket_name : "${var.name_prefix}-storage"

  has_cors = length(var.cors_allowed_origins) > 0
}

# ── Bucket ───────────────────────────────────────────────────────────
resource "aws_s3_bucket" "this" {
  bucket        = local.bucket_name
  force_destroy = var.force_destroy

  tags = merge(var.tags, {
    Name = local.bucket_name
  })
}

# ── Public-access-block (defence in depth — no public grants ever) ──
resource "aws_s3_bucket_public_access_block" "this" {
  bucket = aws_s3_bucket.this.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── Versioning ───────────────────────────────────────────────────────
resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id

  versioning_configuration {
    status = var.versioning_enabled ? "Enabled" : "Suspended"
  }
}

# ── Server-side encryption (SSE-S3 / AES256) ─────────────────────────
# OI-1 spec requires SSE-S3 specifically (not SSE-KMS). AES256 is the
# AWS-managed-key flavour — no per-bucket KMS key, no kms:* perms
# required on the workload role.
resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }

    bucket_key_enabled = true
  }
}

# ── Lifecycle ────────────────────────────────────────────────────────
resource "aws_s3_bucket_lifecycle_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  # OI-1 lifecycle rule: current objects → STANDARD_IA after 90d.
  rule {
    id     = "transition-to-ia"
    status = var.ia_transition_days > 0 ? "Enabled" : "Disabled"

    filter {}

    transition {
      days          = var.ia_transition_days
      storage_class = "STANDARD_IA"
    }
  }

  # Cap noncurrent-version retention so versioning doesn't grow without
  # bound. Set to 0 to disable.
  rule {
    id     = "expire-noncurrent-versions"
    status = var.noncurrent_version_expiration_days > 0 ? "Enabled" : "Disabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_expiration_days
    }
  }

  # Abort multipart uploads that never completed (cost cleanup).
  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = var.abort_incomplete_multipart_days
    }
  }

  # Prevent terraform from re-applying lifecycle changes if the bucket
  # is still receiving uploads when the rule applies.
  depends_on = [aws_s3_bucket_versioning.this]
}

# ── CORS (browser-direct upload via pre-signed URLs) ─────────────────
# Skipped entirely when cors_allowed_origins = [] (server-side uploads
# only). Wildcard origins are intentionally NOT allowed — every caller
# must list explicit origins.
resource "aws_s3_bucket_cors_configuration" "this" {
  count = local.has_cors ? 1 : 0

  bucket = aws_s3_bucket.this.id

  cors_rule {
    allowed_methods = var.cors_allowed_methods
    allowed_origins = var.cors_allowed_origins
    allowed_headers = var.cors_allowed_headers
    expose_headers  = var.cors_expose_headers
    max_age_seconds = var.cors_max_age_seconds
  }
}

# ── Bucket policy: deny non-TLS access ───────────────────────────────
data "aws_iam_policy_document" "bucket" {
  count = var.deny_non_tls_access ? 1 : 0

  statement {
    sid     = "DenyNonTLS"
    effect  = "Deny"
    actions = ["s3:*"]

    resources = [
      aws_s3_bucket.this.arn,
      "${aws_s3_bucket.this.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "this" {
  count = var.deny_non_tls_access ? 1 : 0

  bucket = aws_s3_bucket.this.id
  policy = data.aws_iam_policy_document.bucket[0].json

  # Public-access-block must be set BEFORE attaching a policy that
  # references the bucket — AWS rejects policy attaches that "could be"
  # public until the block is in place.
  depends_on = [aws_s3_bucket_public_access_block.this]
}

# ── App access policy ───────────────────────────────────────────────
# Always created so the contract is stable. Attach to any workload
# role (ECS task role, EC2 instance profile, Lambda exec role).
data "aws_iam_policy_document" "app_access" {
  statement {
    sid    = "AppBucketLevel"
    effect = "Allow"

    actions = [
      "s3:ListBucket",
      "s3:GetBucketLocation",
    ]

    resources = [aws_s3_bucket.this.arn]
  }

  statement {
    sid    = "AppObjectLevel"
    effect = "Allow"

    actions = [
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:DeleteObjectVersion",
      "s3:AbortMultipartUpload",
      "s3:ListMultipartUploadParts",
    ]

    resources = ["${aws_s3_bucket.this.arn}/*"]
  }
}

resource "aws_iam_policy" "app_access" {
  name        = "${var.name_prefix}-storage-access"
  description = "Object-storage access for ${var.name_prefix} app workload"
  policy      = data.aws_iam_policy_document.app_access.json

  tags = var.tags
}

# ── Optional: app role + instance profile ───────────────────────────
data "aws_iam_policy_document" "app_assume" {
  count = var.create_app_role ? 1 : 0

  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = var.app_role_assume_principals
    }
  }
}

resource "aws_iam_role" "app" {
  count = var.create_app_role ? 1 : 0

  name               = "${var.name_prefix}-app"
  assume_role_policy = data.aws_iam_policy_document.app_assume[0].json

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "app_storage" {
  count = var.create_app_role ? 1 : 0

  role       = aws_iam_role.app[0].name
  policy_arn = aws_iam_policy.app_access.arn
}

resource "aws_iam_instance_profile" "app" {
  count = var.create_app_role ? 1 : 0

  name = "${var.name_prefix}-app"
  role = aws_iam_role.app[0].name

  tags = var.tags
}
