# AWS Copilot Deployment Guide

This guide walks you through deploying Inbox Zero to AWS using AWS Copilot. The deployment uses Amazon ECS on Fargate.

## Prerequisites

- AWS CLI installed and configured with appropriate credentials
- AWS Copilot CLI installed ([installation guide](https://aws.github.io/copilot-cli/docs/getting-started/install/))
- Docker installed and running
- An AWS account with appropriate permissions
- Inbox Zero repository cloned locally (run all commands from the repo root)

## Recommended: CLI Setup

The CLI automates Copilot setup, addons (RDS + ElastiCache), secrets, and deployment:

```bash
pnpm setup-aws
```

Useful flags (existing VPC import):
```bash
pnpm setup-aws -- \
  --import-vpc-id vpc-1234567890abcdef \
  --import-public-subnets subnet-aaa,subnet-bbb \
  --import-private-subnets subnet-ccc,subnet-ddd \
  --import-cert-arns arn:aws:acm:us-east-1:123456789012:certificate/abcd-efgh
```

Non-interactive mode:
```bash
pnpm setup-aws -- --yes
```

> The CLI will update `copilot/environments/addons/addons.parameters.yml`, configure SSM secrets,
> deploy the environment, and then deploy the service. It also handles the webhook gateway if enabled.
> Note: The CLI now writes `DATABASE_URL`, `DIRECT_URL`, and `REDIS_URL` after the environment deploy,
> because creating those SSM parameters inside addon templates can trigger EarlyValidation failures.

If you use the CLI, you can skip the manual steps below.

## Manual Copilot Setup (Alternative)

Use this section if you are not running the CLI and prefer to drive Copilot directly.

### 1. Initialize the Copilot Application

First, initialize a new Copilot application with your domain:

```bash
copilot app init inbox-zero-app --domain <YOUR DOMAIN HERE>
```

Replace `<YOUR DOMAIN HERE>` with your actual domain (without the `http://` or `https://` prefix), for example: `example.com`.

This creates the Copilot application structure and sets up your domain.

> **Note:** The `--domain` flag only works if your domain is hosted on AWS Route53. If your domain is managed elsewhere, omit the `--domain` flag and remove the `http` section from `copilot/inbox-zero-ecs/manifest.yml` (the `alias` and `hosted_zone` fields). You'll need to configure your domain's DNS separately to point to the load balancer.

### 2. Configure the Service Manifest

Before initializing the service, configure the environment variables in the manifest file. The service manifest (`copilot/inbox-zero-ecs/manifest.yml`) is already included in the repository.

Edit `copilot/inbox-zero-ecs/manifest.yml` to add your environment variables in the `variables` section.

Required environment variables include:
- `DATABASE_URL` - Your PostgreSQL connection string
- `DIRECT_URL` - Direct database connection (for migrations)
- `AUTH_SECRET` - Authentication secret
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `NEXT_PUBLIC_BASE_URL` - Your application URL
- And other required variables (see `apps/web/env.ts`)

For sensitive values, consider using the `secrets` section instead of `variables` (see [Managing Secrets](#managing-secrets) below).

### 3. Initialize the Production Environment

Create a production environment:

```bash
copilot env init --name production
```

This will prompt you for:
- AWS profile/region (if not already configured)
- Whether to create a new VPC or use an existing one
- Other infrastructure options

#### Using an Existing VPC

Copilot can import an existing VPC during `env init`. You’ll need the VPC ID plus
public/private subnet IDs:

```bash
copilot env init --name production \
  --import-vpc-id vpc-1234567890abcdef \
  --import-public-subnets subnet-aaa,subnet-bbb \
  --import-private-subnets subnet-ccc,subnet-ddd
```

Requirements:
- At least 2 public subnets and 2 private subnets across different AZs
- Public subnets routed to an Internet Gateway
- Private subnets routed through a NAT Gateway

Notes:
- Copilot will create its own ALB and security groups
- Addons read `PrivateSubnets` from `copilot/environments/addons/addons.parameters.yml`

### 4. Initialize the Service

Initialize the Load Balanced Web Service:

```bash
copilot init --app inbox-zero-app --name inbox-zero-ecs --type "Load Balanced Web Service" --deploy no
```

**Note:** The service manifest is already included in the repository. Copilot will detect the existing manifest and configure infrastructure accordingly.

### 5. Deploy the Environment

Deploy the production environment infrastructure:

```bash
copilot env deploy --force
```

This creates the necessary AWS resources (VPC, load balancer, etc.) for your environment.

### 6. Deploy the Service

Deploy your application service:

```bash
copilot svc deploy
```

This will:
- Use the pre-built Docker image from GitHub Container Registry (`ghcr.io/elie222/inbox-zero:latest`), or
- Build your Docker image using `docker/Dockerfile.prod` if you prefer to build from source
- Push the image to Amazon ECR (if building)
- Deploy the service to ECS/Fargate
- Set up the load balancer and domain

**Note:** The manifest is configured to use the pre-built public image by default. If you want to build from source instead, you can remove or comment out the `image.location` line in `copilot/inbox-zero-ecs/manifest.yml` and Copilot will build using the `image.build` configuration.

---

## Post-Deployment

The following sections apply whether you used the CLI or manual setup.

### Updating Your Deployment

To update your application after making changes:

```bash
copilot svc deploy
```

This will:
- Pull the latest pre-built image from GitHub Container Registry (if using the default configuration), or
- Rebuild and redeploy your service with the latest changes (if building from source)

### ElastiCache Redis (Optional)

Redis is deployed as an environment addon. You can enable or change its size by
editing `copilot/environments/addons/addons.parameters.yml`:

```yaml
EnableRedis: 'true'
RedisInstanceClass: 'cache.t4g.micro'
```

Then deploy the environment:
```bash
copilot env deploy --name production
```

### Managing Secrets

For sensitive values, use AWS Systems Manager Parameter Store:

1. Store secrets in Parameter Store:
   ```bash
   aws ssm put-parameter --name /copilot/inbox-zero-app/production/inbox-zero-ecs/AUTH_SECRET --value "your-secret" --type SecureString
   ```

2. Reference them in `manifest.yml`:
   ```yaml
   secrets:
     AUTH_SECRET: AUTH_SECRET  # The key is the env var name, value is the SSM parameter name
   ```

### Viewing Logs

View your application logs:

```bash
copilot svc logs
```

Or follow logs in real-time:

```bash
copilot svc logs --follow
```

### Checking Service Status

Check the status of your service:

```bash
copilot svc status
```

### Database Migrations

Database migrations run automatically on container startup via the `docker/scripts/start.sh` script. The script uses `prisma migrate deploy` to apply any pending migrations.

**Important:** The service manifest includes a `grace_period` of 320 seconds in the healthcheck configuration to ensure the container is not killed before migrations complete. This is especially important for the initial deployment when all migrations need to be applied. If you have a large number of migrations, you may need to increase this value in `copilot/inbox-zero-ecs/manifest.yml`.

If you need to manually run migrations:

```bash
copilot svc exec
# Then inside the container:
prisma migrate deploy --schema=./apps/web/prisma/schema.prisma
```

## Troubleshooting

### Service Won't Start

1. Check logs: `copilot svc logs`
2. Verify environment variables are set correctly
3. Ensure database is accessible from the ECS task
4. Check that the Docker image builds successfully

### Migration Issues

If migrations fail:
1. Check database connectivity
2. Verify `DATABASE_URL` and `DIRECT_URL` are correct
3. Check the container logs for specific error messages
4. You may need to manually resolve failed migrations using `prisma migrate resolve`

### Addons Change Set EarlyValidation

If `copilot env deploy` fails with `AWS::EarlyValidation::PropertyValidation`, make sure addon
templates do not create SSM parameters that include dynamic Secrets Manager references. The CLI
setup flow creates `DATABASE_URL`, `DIRECT_URL`, and `REDIS_URL` after the environment deploy.

### Domain Not Working

1. Verify DNS settings for your domain
2. Check that the load balancer is properly configured
3. Ensure SSL certificate is provisioned (Copilot handles this automatically)

## Firewalled Deployments (Webhook Gateway)

For deployments where the main application is behind a firewall or private network (e.g., only accessible to employees via VPN), you need a way for Google Pub/Sub to deliver Gmail webhook notifications. The webhook gateway addon solves this by creating a public API Gateway endpoint that validates Google's OIDC tokens before forwarding to your private infrastructure.

### Prerequisites

- **IAM User (not root)**: AWS Copilot requires IAM role assumption, which doesn't work with root account credentials. Create an IAM user with `AdministratorAccess` policy.
- **AWS CLI Profile**: Configure an AWS CLI profile for your deployment:
  ```bash
  aws configure --profile inbox-zero
  # Enter your IAM user's access key and secret
  # Set region (e.g., us-east-1)
  ```
- **Set environment variables** before running Copilot commands:
  ```bash
  export AWS_PROFILE=inbox-zero
  export AWS_REGION=us-east-1
  ```

### Architecture

```
Google Pub/Sub → API Gateway (public) → VPC Link → Internal ALB → ECS
                      ↑
               JWT validation
               (Google OIDC)
```

- **API Gateway**: Public endpoint that Google Pub/Sub can reach
- **JWT Authorizer**: Validates Google's OIDC tokens cryptographically
- **VPC Link**: Connects API Gateway to your private VPC
- **Internal ALB**: Your Copilot-managed load balancer

### How It Works

1. Google Pub/Sub sends webhook requests with a signed JWT in the `Authorization` header
2. API Gateway validates the JWT:
   - Verifies signature using Google's public keys
   - Checks issuer is `https://accounts.google.com`
   - Validates audience matches your configured endpoint
   - Ensures token is not expired
3. Valid requests are forwarded to your internal ALB via VPC Link
4. Invalid requests are rejected with 401 (never reach your app)

### Deployment

The webhook gateway is an **environment addon**. However, it requires the ALB's HTTPS listener which is only created when a Load Balanced Web Service is deployed. Follow this specific order:

> **Important**: The addon references `HTTPSListenerArn` which only exists after a service is deployed. If you try to deploy the environment addon before the service, it will fail.

#### First-time Setup (New Deployment)

Keep the webhook gateway template in `copilot/templates/` until the service is deployed.

1. **Deploy the environment** (without the addon):
   ```bash
   copilot env deploy --name production
   ```

2. **Deploy the service** (this creates the ALB and HTTPS listener):
   ```bash
   copilot svc deploy --name inbox-zero-ecs --env production
   ```

3. **Add and deploy the addon**:
   ```bash
   cp copilot/templates/webhook-gateway.yml copilot/environments/addons/
   copilot env deploy --name production
   ```

#### Existing Deployment (Service Already Running)

If you already have a deployed service with an ALB, add the addon then deploy the environment:

```bash
cp copilot/templates/webhook-gateway.yml copilot/environments/addons/
copilot env deploy --name production
```

#### Get the Webhook Endpoint URL

After the addon is deployed, get the webhook URL from the addon stack outputs:

```bash
# Find the addon stack
ADDON_STACK=$(aws cloudformation list-stack-resources \
  --stack-name inbox-zero-app-production \
  --query "StackResourceSummaries[?contains(LogicalResourceId,'AddonsStack')].PhysicalResourceId" \
  --output text)

# Get the webhook URL
aws cloudformation describe-stacks \
  --stack-name "$ADDON_STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='WebhookEndpointUrl'].OutputValue" \
  --output text
```

The URL will look like: `https://abc123xyz.execute-api.us-east-1.amazonaws.com/api/google/webhook`

### Google Cloud Configuration

Configure your Google Cloud Pub/Sub push subscription to use OIDC authentication:

1. **Create or update the push subscription**:
   ```bash
   # Get the webhook URL from the previous step
   WEBHOOK_URL="https://abc123xyz.execute-api.us-east-1.amazonaws.com/api/google/webhook"
   
   gcloud pubsub subscriptions create gmail-push-subscription \
     --topic=projects/YOUR_PROJECT/topics/gmail-notifications \
     --push-endpoint="${WEBHOOK_URL}" \
     --push-auth-service-account=YOUR_SERVICE_ACCOUNT@YOUR_PROJECT.iam.gserviceaccount.com \
     --push-auth-token-audience="${WEBHOOK_URL}"
   ```

   Or update an existing subscription:
   ```bash
   gcloud pubsub subscriptions modify-push-config gmail-push-subscription \
     --push-endpoint="${WEBHOOK_URL}" \
     --push-auth-service-account=YOUR_SERVICE_ACCOUNT@YOUR_PROJECT.iam.gserviceaccount.com \
     --push-auth-token-audience="${WEBHOOK_URL}"
   ```

2. **Grant token creation permissions**:
   ```bash
   PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT --format='value(projectNumber)')
   
   gcloud projects add-iam-policy-binding YOUR_PROJECT \
     --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com" \
     --role="roles/iam.serviceAccountTokenCreator"
   ```

### Custom Domain (Optional)

If you want to use a custom domain for the webhook endpoint:

1. Edit `copilot/environments/addons/addons.parameters.yml`:
   ```yaml
   Parameters:
     WebhookAudience: 'https://webhook.yourdomain.com/api/google/webhook'
   ```

2. Set up a custom domain in API Gateway (via AWS Console or additional CloudFormation)

3. Update the Google Pub/Sub subscription with the custom domain URL

### Verification

Test that the endpoint correctly rejects unauthenticated requests:

```bash
# This should return 401 Unauthorized
curl -X POST https://abc123xyz.execute-api.us-east-1.amazonaws.com/api/google/webhook
```

### Security Notes

| Aspect | Details |
|--------|---------|
| **Authentication** | Cryptographic JWT validation using Google's public keys |
| **Issuer** | Fixed to `https://accounts.google.com` |
| **Audience** | Must match exactly between AWS and Google configurations |
| **Token lifetime** | Google tokens are valid for up to 1 hour |
| **Throttling** | API Gateway applies rate limiting (50 req/sec, 100 burst) |

### Troubleshooting

**401 Unauthorized from API Gateway:**
- Verify the audience in Google Pub/Sub matches the AWS configuration exactly
- Check that the service account has `iam.serviceAccountTokenCreator` permissions
- Ensure the push subscription has OIDC authentication enabled

**502 Bad Gateway:**
- The VPC Link may not have connectivity to the ALB
- Check security group rules allow traffic from API Gateway to ALB
- Verify the ALB listener is healthy

**Logs:**
```bash
# View API Gateway logs
aws logs tail /aws/apigateway/inbox-zero-app-production-webhook-api --follow
```

## Additional Resources

- [AWS Copilot Documentation](https://aws.github.io/copilot-cli/docs/)
- [Copilot Manifest Reference](https://aws.github.io/copilot-cli/docs/manifest/overview/)
- [Self-Hosting Guide](./self-hosting.md) - For local Docker setup
- [Google Pub/Sub Push Authentication](https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions)

