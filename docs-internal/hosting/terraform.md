# Terraform Deployment Guide (AWS)

This guide walks you through deploying Inbox Zero to AWS using Terraform. It provisions:

- ECS Fargate service + ALB
- RDS PostgreSQL
- Optional ElastiCache Redis
- SSM Parameter Store secrets

## Prerequisites

- Terraform installed
- AWS credentials configured
- Google OAuth credentials
- LLM provider API key

## Generate Terraform Files (Recommended)

From the repo root:

```bash
pnpm setup-terraform
```

Or with the packaged CLI:

```bash
inbox-zero setup-terraform
```

This creates a `terraform/` directory with:

- `main.tf`, `variables.tf`, `outputs.tf`
- `terraform.tfvars` (contains secrets)
- `.gitignore`

## Deploy

```bash
cd terraform
terraform init
terraform apply
```

After apply:

```bash
terraform output service_url
```

## HTTPS and Custom Domains (Optional)

Set these in `terraform.tfvars`:

- `domain_name` (e.g. `app.example.com`)
- `acm_certificate_arn`
- `route53_zone_id` (optional, to create DNS record)

The service uses the ALB DNS name if `base_url` is not set.

## Notes

- `terraform.tfvars` contains secrets and should not be committed.
- Database migrations run automatically on container startup.
- Secrets are stored in SSM Parameter Store at `/${app_name}/${environment}/secrets`.
- If you want an API Gateway with JWT validation for Pub/Sub webhooks, add it
  separately (see `copilot/templates/webhook-gateway.yml` for the pattern).
- If your app is on a private network, one option is to expose only a small AWS
  Lambda webhook relay (or Lambda behind API Gateway) that forwards verified
  Pub/Sub webhook requests to `/api/google/webhook`.
