# Docker Build Guide - Environment Variables

## Important: NEXT_PUBLIC_* Variables

In Next.js, environment variables prefixed with `NEXT_PUBLIC_` are embedded at **build time**, not runtime. This means they are baked into the JavaScript bundles during the build process.

## Setting Your Own Values

The Dockerfile uses ARG directives with defaults, but **you can override any of them** during build:

```dockerfile
# In Dockerfile - these are just defaults
ARG NEXT_PUBLIC_BASE_URL="http://localhost:3000"
```

## Building with Custom Values

### Method 1: Command Line Arguments

```bash
# Set your custom values
docker build \
  --build-arg NEXT_PUBLIC_BASE_URL="https://app.mycompany.com" \
  -t my-custom-inbox-zero \
  -f docker/Dockerfile.prod .
```

### Method 2: Using Environment Variables

```bash
# Export your value
export NEXT_PUBLIC_BASE_URL="https://app.mycompany.com"

# Build with the environment variable
docker build \
  --build-arg NEXT_PUBLIC_BASE_URL \
  -t my-custom-inbox-zero \
  -f docker/Dockerfile.prod .
```

Note: When using `--build-arg NEXT_PUBLIC_BASE_URL` without a value, Docker will use the value from your environment variable.

## Docker Compose Example

If using Docker Compose, you can specify build arguments in your `docker-compose.yml`:

```yaml
version: '3.8'
services:
  app:
    build:
      context: .
      dockerfile: docker/Dockerfile.prod
      args:
        NEXT_PUBLIC_BASE_URL: ${NEXT_PUBLIC_BASE_URL:-http://localhost:3000}
    ports:
      - "3000:3000"
```

Then build with:
```bash
NEXT_PUBLIC_BASE_URL=https://your-domain.com docker-compose build
```

## Common Mistakes to Avoid

1. **Don't try to override at runtime**: Setting `NEXT_PUBLIC_BASE_URL` in your `.env` file or as a runtime environment variable won't work if the image was already built with a different value.

2. **Rebuild when changing**: You must rebuild the Docker image whenever you need to change the `NEXT_PUBLIC_BASE_URL`.

3. **Multi-stage builds**: If you need different URLs for different environments, build separate images for each environment.

## Alternative Approach: Runtime Configuration

If you need truly dynamic configuration that can change without rebuilding, consider:

1. Using a server-side API endpoint to provide configuration to the client
2. Using environment variables only on the server side (without `NEXT_PUBLIC_` prefix)
3. Implementing a configuration service that the client can query

## Verification

After building and running your container, you can verify the configured URL:

```bash
# Check the bundled JavaScript files
docker run --rm inbox-zero-prod grep -r "NEXT_PUBLIC_BASE_URL" /app/.next/static
```

## Security Considerations

### Build Arguments Visibility

Build arguments are visible in the Docker image history:

```bash
# This will show build args used
docker history <image-name> --no-trunc
```

**Important**: `NEXT_PUBLIC_BASE_URL` is not sensitive - it's designed to be public. However, this means:

1. **Never use build args for secrets**: API keys, passwords, or tokens should never be passed as build arguments
2. **Use runtime environment variables for secrets**: All sensitive configuration should be injected at runtime
3. **CI/CD considerations**: Build commands may be logged, so ensure your CI/CD system masks sensitive values

### Best Practices

1. **Separate build and runtime configuration**:
   - Build-time: Only non-sensitive configuration (URLs, feature flags)
   - Runtime: All secrets and sensitive configuration

2. **Use secret management services**:
   - AWS Secrets Manager, HashiCorp Vault, or Kubernetes Secrets
   - Never commit secrets to version control

3. **Multi-stage builds for security**:
   ```dockerfile
   # Build stage
   FROM node:alpine AS builder
   ARG NEXT_PUBLIC_BASE_URL
   # ... build process ...
   
   # Runtime stage - smaller attack surface
   FROM node:alpine
   COPY --from=builder /app/.next ./.next
   # No build history from builder stage
   ```

4. **Scan images for vulnerabilities**:
   ```bash
   # Use tools like Trivy or Docker Scout
   docker scout cves <image-name>
   ```
