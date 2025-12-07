# AWS Copilot Deployment Guide

This guide walks you through deploying Inbox Zero to AWS using AWS Copilot, which simplifies deploying containerized applications to AWS App Runner, Amazon ECS, or AWS Fargate.

## Prerequisites

- AWS CLI installed and configured with appropriate credentials
- AWS Copilot CLI installed ([installation guide](https://aws.github.io/copilot-cli/docs/getting-started/install/))
- Docker installed and running
- An AWS account with appropriate permissions

## Initial Setup

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

### 4. Initialize the Service

Initialize the Load Balanced Web Service:

```bash
copilot init --app inbox-zero-app --name inbox-zero-ecs --type "Load Balanced Web Service" --deploy no
```

**Note:** The service manifest is already included in the repository. This command will detect the existing manifest and set up the necessary infrastructure without modifying it.

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

## Updating Your Deployment

To update your application after making changes:

```bash
copilot svc deploy
```

This will:
- Pull the latest pre-built image from GitHub Container Registry (if using the default configuration), or
- Rebuild and redeploy your service with the latest changes (if building from source)

## Managing Secrets

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

## Viewing Logs

View your application logs:

```bash
copilot svc logs
```

Or follow logs in real-time:

```bash
copilot svc logs --follow
```

## Checking Service Status

Check the status of your service:

```bash
copilot svc status
```

## Database Migrations

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

### Domain Not Working

1. Verify DNS settings for your domain
2. Check that the load balancer is properly configured
3. Ensure SSL certificate is provisioned (Copilot handles this automatically)

## Additional Resources

- [AWS Copilot Documentation](https://aws.github.io/copilot-cli/docs/)
- [Copilot Manifest Reference](https://aws.github.io/copilot-cli/docs/manifest/overview/)
- [Self-Hosting Guide](./self-hosting.md) - For local Docker setup

