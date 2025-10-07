# Vercel Deployment Configuration

This document outlines the production-grade CI/CD setup for the Inbox Zero application.

## Overview

The application is deployed on Vercel with the following architecture:
- **Framework**: Next.js 15 with App Router
- **Monorepo**: pnpm workspaces with Turbo for build orchestration
- **Database**: PostgreSQL with Prisma ORM
- **Package Manager**: pnpm with corepack

## Key Improvements Made

### 1. Build Optimization
- **Turbo Integration**: Leverages Turbo's caching for faster builds
- **Memory Management**: Increased Node.js memory limit to 16GB for large builds
- **Frozen Lockfile**: Ensures consistent dependency resolution
- **Force Build**: Ensures fresh builds when needed

### 2. Security Headers
- **X-Frame-Options**: Prevents clickjacking attacks
- **X-Content-Type-Options**: Prevents MIME type sniffing
- **Referrer-Policy**: Controls referrer information
- **Permissions-Policy**: Restricts browser features

### 3. Performance Optimization
- **Static Asset Caching**: 1-year cache for `_next/static` files
- **API Route Caching**: No-cache for dynamic API routes
- **Function Timeouts**: 30-second timeout for API functions

### 4. Monitoring & Observability
- **Cron Jobs**: Automated email processing and cleanup
- **Health Checks**: Built-in health monitoring
- **Sentry Integration**: Error tracking and performance monitoring

## Environment Variables

### Required for Production
```bash
# Database
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Authentication
AUTH_SECRET=your-secret-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Email Encryption
EMAIL_ENCRYPT_SECRET=your-encryption-secret
EMAIL_ENCRYPT_SALT=your-encryption-salt

# Google Pub/Sub
GOOGLE_PUBSUB_TOPIC_NAME=your-topic-name
GOOGLE_PUBSUB_VERIFICATION_TOKEN=your-verification-token

# Internal API
INTERNAL_API_KEY=your-internal-api-key

# Base URL
NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

### Optional but Recommended
```bash
# AI Providers
DEFAULT_LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key

# Monitoring
SENTRY_AUTH_TOKEN=your-sentry-token
SENTRY_ORGANIZATION=your-org
SENTRY_PROJECT=your-project
NEXT_PUBLIC_SENTRY_DSN=your-sentry-dsn

# Analytics
NEXT_PUBLIC_POSTHOG_KEY=your-posthog-key
POSTHOG_API_SECRET=your-posthog-secret

# Payments
STRIPE_SECRET_KEY=your-stripe-key
STRIPE_WEBHOOK_SECRET=your-webhook-secret
LEMON_SQUEEZY_API_KEY=your-lemon-key

# Redis/Caching
UPSTASH_REDIS_URL=your-redis-url
UPSTASH_REDIS_TOKEN=your-redis-token

# Marketing Repository (for production builds)
GITHUB_MARKETING_TOKEN=your-github-token
```

## Deployment Process

### 1. Pre-deployment Checklist
- [ ] All environment variables are set in Vercel dashboard
- [ ] Database migrations are up to date
- [ ] Marketing repository access is configured
- [ ] Monitoring and alerting are set up

### 2. Build Process
1. **Install Dependencies**: `pnpm install --frozen-lockfile`
2. **Clone Marketing**: Private marketing content is cloned
3. **Build Application**: `turbo run build --filter=./apps/web --force`
4. **Deploy**: Vercel handles the deployment

### 3. Post-deployment Verification
- [ ] Health check endpoint responds correctly
- [ ] Database connections are working
- [ ] Authentication flows are functional
- [ ] Email processing cron jobs are running
- [ ] Monitoring dashboards show healthy metrics

## Monitoring & Alerts

### Health Checks
- **Endpoint**: `/api/health`
- **Frequency**: Every 5 minutes
- **Alerts**: Configure in Vercel dashboard

### Cron Jobs
- **Email Processing**: Every 5 minutes (`/api/cron/process-emails`)
- **Session Cleanup**: Daily at 2 AM (`/api/cron/cleanup-sessions`)

### Performance Monitoring
- **Sentry**: Error tracking and performance monitoring
- **Vercel Analytics**: Built-in performance metrics
- **PostHog**: User analytics and feature flags

## Troubleshooting

### Common Issues

1. **Build Failures**
   - Check environment variables are set
   - Verify database connectivity
   - Check marketing repository access

2. **Memory Issues**
   - Node.js memory limit is set to 16GB
   - Consider optimizing bundle size if issues persist

3. **Database Connection Issues**
   - Verify `DATABASE_URL` and `DIRECT_URL` are correct
   - Check database server is accessible from Vercel

4. **Authentication Issues**
   - Verify OAuth credentials are correct
   - Check redirect URIs in provider dashboards

### Debug Commands
```bash
# Check build locally
pnpm build

# Run tests
pnpm test

# Check environment variables
pnpm run env:check

# Database migration
pnpm prisma migrate deploy
```

## Security Considerations

1. **Environment Variables**: All secrets are stored in Vercel dashboard
2. **Database**: Use connection pooling and SSL
3. **API Routes**: Implement rate limiting and validation
4. **Headers**: Security headers are configured in `vercel.json`
5. **Dependencies**: Regular security audits with `pnpm audit`

## Performance Optimization

1. **Build Caching**: Turbo cache is enabled for faster builds
2. **Static Assets**: Long-term caching for static files
3. **API Optimization**: Appropriate caching headers for API routes
4. **Bundle Size**: Regular analysis and optimization

## Backup & Recovery

1. **Database**: Regular automated backups
2. **Environment**: Export environment variables regularly
3. **Code**: Git repository with proper branching strategy
4. **Monitoring**: Sentry and Vercel logs for debugging

## Scaling Considerations

1. **Database**: Consider read replicas for high traffic
2. **Caching**: Redis for session and data caching
3. **CDN**: Vercel's global CDN for static assets
4. **Functions**: Monitor function execution limits

## Support

For deployment issues:
1. Check Vercel dashboard logs
2. Review Sentry error reports
3. Check database connectivity
4. Verify environment variables
5. Contact support with specific error messages
