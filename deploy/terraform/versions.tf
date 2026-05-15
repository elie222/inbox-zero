terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state in S3. Bucket created out-of-band (see deploy/terraform/README.md).
  # Locking uses S3 conditional writes (OpenTofu 1.8+ / Terraform 1.10+); swap to
  # `dynamodb_table = "..."` if on an older version.
  backend "s3" {
    bucket       = "inbox-zero-tfstate-253610008894"
    key          = "inbox-zero/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.aws_region
}
