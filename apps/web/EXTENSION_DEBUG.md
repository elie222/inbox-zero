# Extension Debugging Guide

## The Problem

Google OAuth doesn't work in iframes due to X-Frame-Options headers. Even after authentication, your main app pages still have these headers that prevent iframe embedding.

## What We've Implemented

### 1. Middleware (`apps/web/middleware.ts`)

- Removes X-Frame-Options headers for extension requests
- Adds CSP headers to allow chrome-extension://\* iframe embedding
- Applies to paths starting with `/extension`, `/api/extension`, `/app`

### 2. Extension Layout (`apps/web/app/extension/layout.tsx`)

- Special layout for extension pages
- Sets meta tags to allow iframe embedding

### 3. Test Page (`apps/web/app/extension/test/page.tsx`)

- Simple test page to verify iframe headers are working

## Testing Steps

### Step 1: Test Basic Iframe Loading

1. Build the extension: `cd inbox-zero-extension && pnpm build`
2. Load it in Chrome extensions
3. Open the extension side panel
4. It should load `http://localhost:3000/extension/test` in an iframe
5. You should see the green success message

### Step 2: Check Headers

1. Open Chrome DevTools
2. Go to Network tab
3. Reload the extension
4. Look for the request to `/extension/test`
5. Check the Response Headers - you should NOT see `X-Frame-Options`
6. You should see `Content-Security-Policy` with `frame-ancestors 'self' chrome-extension://*`

### Step 3: Test Authentication Flow

1. Change the iframe src back to: `http://localhost:3000/extension?token=${sessionToken}`
2. Test the full authentication flow
3. The extension page should validate the token and redirect to the main app

## Common Issues and Solutions

### Issue: "Refused to display in a frame"

**Cause**: X-Frame-Options header is still present
**Solution**:

- Check that middleware is running (look for console logs)
- Verify the path matches the middleware matcher
- Check that the response headers are being modified

### Issue: "Content Security Policy violation"

**Cause**: CSP is blocking iframe embedding
**Solution**:

- Check that CSP headers are being set correctly
- Verify the chrome-extension://\* pattern matches your extension ID

### Issue: Middleware not running

**Cause**: Path doesn't match the matcher pattern
**Solution**:

- Check the middleware config matcher
- Add more specific paths if needed
- Look for middleware console logs

## Debugging Commands

### Check if middleware is running:

```bash
# Look for these logs in your Next.js console:
# "Middleware: { pathname: '/extension/test', isExtensionRequest: true, ... }"
# "Applied extension headers for: /extension/test"
```

### Check response headers:

```bash
curl -I http://localhost:3000/extension/test
# Should NOT show X-Frame-Options
# Should show Content-Security-Policy with frame-ancestors
```

### Test with curl:

```bash
curl -H "User-Agent: chrome-extension" http://localhost:3000/extension/test
```

## Next Steps

1. **Test the simple page first** - Make sure `/extension/test` loads in iframe
2. **Test authentication flow** - Once basic iframe works, test full auth
3. **Test main app loading** - Finally test loading the full app in iframe

## Production Considerations

For production, you'll need to:

1. Update URLs in the extension to use your production domain
2. Update CSP headers to match your extension ID
3. Consider more restrictive CSP policies
4. Add rate limiting for session generation
5. Implement proper error handling

## Alternative Approaches

If iframe embedding still doesn't work, consider:

1. **Popup window approach**: Open your app in a popup instead of iframe
2. **Native messaging**: Use Chrome extension native messaging API
3. **WebSocket communication**: Real-time communication between extension and website
4. **Custom protocol**: Register a custom protocol handler for your app
