# Debugging Google OAuth on Vercel Deployment

This guide helps you debug Google OAuth authorization errors on your Vercel deployment.

## Quick Debug Checklist

### 1. Environment Variables Check
```bash
# Run the debug script
./scripts/debug-vercel-oauth.sh
```

### 2. Test OAuth Flow on Deployment
1. Visit `https://your-app.vercel.app/debug-oauth`
2. Click "Fetch Debug Info" to see configuration
3. Click "Open Auth URL" to test OAuth flow
4. Complete the flow and test token exchange

### 3. Check Vercel Logs
```bash
# Get latest deployment logs
vercel logs --limit 100

# Get logs for specific deployment
vercel logs [deployment-id] --limit 100
```

## Common OAuth Errors & Solutions

### Error: "redirect_uri_mismatch"
**Cause**: Redirect URI in Google Console doesn't match your deployment URL

**Solution**:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to APIs & Services > Credentials
3. Edit your OAuth 2.0 Client ID
4. Add authorized redirect URIs:
   - `https://your-app.vercel.app/api/auth/callback/google`
   - `https://your-app-git-main.vercel.app/api/auth/callback/google` (for preview deployments)

### Error: "invalid_client"
**Cause**: Client ID or Client Secret mismatch

**Solution**:
1. Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Vercel environment variables
2. Check if secrets are correctly set:
   ```bash
   vercel env ls
   ```

### Error: "access_denied"
**Cause**: OAuth consent screen issues

**Solution**:
1. Check OAuth consent screen configuration
2. Ensure app is in "Testing" mode with your email added as test user
3. Verify app name matches between OAuth client and consent screen

### Error: "invalid_request"
**Cause**: Missing or malformed parameters

**Solution**:
1. Check all required scopes are configured
2. Verify `NEXT_PUBLIC_BASE_URL` matches your deployment URL
3. Ensure prompt=consent is set for refresh token

## Step-by-Step Debugging Process

### Step 1: Verify Environment Variables
```bash
# Check Vercel environment variables
vercel env ls

# Should see:
# GOOGLE_CLIENT_ID
# GOOGLE_CLIENT_SECRET  
# NEXT_PUBLIC_BASE_URL
```

### Step 2: Test Configuration
1. Deploy your app with debug endpoints
2. Visit `https://your-app.vercel.app/api/debug-oauth`
3. Check the JSON response for configuration issues

### Step 3: Test OAuth Flow
1. Visit `https://your-app.vercel.app/debug-oauth`
2. Use the interactive debug tool
3. Test the complete OAuth flow

### Step 4: Check Deployment Logs
```bash
# Get recent logs
vercel logs --limit 50

# Look for OAuth-related errors
vercel logs --limit 100 | grep -i "oauth\|auth\|google"
```

### Step 5: Verify Google Console Settings
1. **OAuth Client Configuration**:
   - Client ID matches `GOOGLE_CLIENT_ID`
   - Client Secret matches `GOOGLE_CLIENT_SECRET`
   - Authorized redirect URIs include your Vercel URLs

2. **OAuth Consent Screen**:
   - App name is consistent
   - App is in "Testing" mode
   - Your email is added as test user
   - All required scopes are configured

## Advanced Debugging

### Real-time Monitoring
```bash
# Monitor deployment logs in real-time
vercel logs --follow

# Monitor specific function logs
vercel logs --follow --filter="api/debug-oauth"
```

### Network Debugging
1. Open browser DevTools
2. Go to Network tab
3. Test OAuth flow
4. Check for failed requests to Google APIs

### Environment Variable Debugging
```bash
# Add debug logging to your API routes
console.log('Environment check:', {
  clientId: process.env.GOOGLE_CLIENT_ID ? 'SET' : 'MISSING',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'MISSING',
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL
});
```

## Debug Scripts

### Enhanced Debug Script
Run `./scripts/debug-vercel-oauth.sh` for comprehensive checks.

### OAuth Test Script
Run `./scripts/test-oauth.js` for local OAuth testing.

### Deployment Test Script
Run `./scripts/test-deployment.sh` for deployment status checks.

## Troubleshooting Tips

1. **Always test on the actual deployment URL**, not localhost
2. **Check both production and preview deployments**
3. **Verify environment variables are set for all environments**
4. **Use the debug endpoints to get real-time configuration info**
5. **Check Vercel function logs for runtime errors**

## Getting Help

If you're still having issues:

1. Run all debug scripts and collect output
2. Check Vercel deployment logs
3. Test OAuth flow using debug endpoints
4. Verify Google Console configuration
5. Check for any recent changes to environment variables

The debug tools in `/debug-oauth` provide the most comprehensive way to diagnose OAuth issues on your Vercel deployment.
