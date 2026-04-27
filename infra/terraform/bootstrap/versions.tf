terraform {
  required_version = ">= 1.6.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 6.0"
    }
  }

  # Local state by design: bootstrap creates the resources that
  # back the root module's REMOTE state. Migrating bootstrap state
  # to S3 would be a self-referential init.
}
