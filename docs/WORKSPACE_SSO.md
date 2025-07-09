# Google Workspace SSO Configuration for Inbox Zero AI

This guide explains how to set up Google Workspace SSO for Inbox Zero AI, enabling organizations to restrict access to users from specific domains and leverage Google Workspace features.

## Overview

Inbox Zero AI supports Google Workspace SSO, which allows organizations to:

- Restrict access to users from specific domains
- Leverage Google Workspace organization features
- Maintain centralized user management
- Enable seamless Gmail integration for business users

## Configuration

### Environment Variables

Add these environment variables to configure Google Workspace SSO:

```env
# Server-side configuration
GOOGLE_WORKSPACE_DOMAIN=example.com,subsidiary.com
GOOGLE_WORKSPACE_CUSTOMER_ID=C01234567

# Client-side configuration (for UI changes)
NEXT_PUBLIC_GOOGLE_WORKSPACE_DOMAIN=example.com,subsidiary.com
```

### Variable Descriptions

- **`GOOGLE_WORKSPACE_DOMAIN`**: Comma-separated list of allowed domains. Only users with email addresses from these domains can sign in.
- **`GOOGLE_WORKSPACE_CUSTOMER_ID`**: Your Google Workspace customer ID (optional, for future advanced features).
- **`NEXT_PUBLIC_GOOGLE_WORKSPACE_DOMAIN`**: Client-side version of the domain restriction, used for UI updates.

## Setup Instructions

### 1. Configure Google Cloud Console

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project or create a new one
3. Enable the Google Workspace Admin SDK API (for advanced features)
4. Configure OAuth consent screen with your workspace domain

### 2. Update OAuth Settings

In your Google Cloud Console OAuth configuration:

1. **Authorized domains**: Add your workspace domains
2. **Scopes**: Ensure you have the necessary scopes:
   ```
   openid
   profile
   email
   https://www.googleapis.com/auth/gmail.readonly
   https://www.googleapis.com/auth/gmail.modify
   https://www.googleapis.com/auth/gmail.compose
   https://www.googleapis.com/auth/contacts.readonly
   ```

### 3. Configure Environment Variables

Add the configuration to your `.env.local` file:

```env
# Required: Your existing Google OAuth configuration
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret

# New: Workspace SSO configuration
GOOGLE_WORKSPACE_DOMAIN=yourcompany.com
NEXT_PUBLIC_GOOGLE_WORKSPACE_DOMAIN=yourcompany.com

# Optional: For advanced workspace features
GOOGLE_WORKSPACE_CUSTOMER_ID=C01234567
```

### 4. Deploy and Test

1. Deploy your application with the new environment variables
2. Test sign-in with users from allowed domains
3. Verify that users from other domains are blocked

## Features

### Domain Restrictions

When `GOOGLE_WORKSPACE_DOMAIN` is configured:

- Only users with email addresses from specified domains can sign in
- Users from other domains will see an authentication error
- The login UI will show "Sign in with Google Workspace" instead of "Sign in with Google"

### Workspace Detection

The system automatically detects:

- Whether a user is from a Google Workspace organization
- The user's domain and organization ID
- Workspace-specific metadata for enhanced features

### Organization Management

For workspace administrators:

- All users from the same domain are grouped together
- Centralized billing and user management
- Enhanced security controls

## Security Considerations

### Access Control

- Domain restrictions are enforced at the authentication level
- Users must still have valid Gmail access for the app to function
- Workspace SSO doesn't bypass existing permission requirements

### Token Management

- Google Workspace tokens are handled the same way as personal Google tokens
- Refresh tokens are securely stored and encrypted
- Token rotation follows the same security practices

## Troubleshooting

### Common Issues

1. **"Domain not allowed" error**:

   - Verify `GOOGLE_WORKSPACE_DOMAIN` is set correctly
   - Check that the user's email domain matches the configured domains
   - Ensure the domain is properly formatted (no protocols, just the domain)

2. **OAuth consent screen issues**:

   - Make sure your workspace domain is added to authorized domains
   - Verify that the OAuth consent screen is configured for external users (if needed)

3. **Workspace detection not working**:
   - Check that the user is actually from a Google Workspace organization
   - Personal Gmail accounts (gmail.com) are not considered workspace users
   - Verify the OAuth scopes include profile information

### Debugging

Enable debug logging to troubleshoot issues:

```env
ENABLE_DEBUG_LOGS=true
```

Check the logs for workspace authentication events:

- Domain validation results
- Workspace user detection
- Organization metadata extraction

## Advanced Configuration

### Multiple Domains

To allow multiple domains:

```env
GOOGLE_WORKSPACE_DOMAIN=company.com,subsidiary.com,partner.org
```

### Subdomain Support

The system automatically supports subdomains:

```env
GOOGLE_WORKSPACE_DOMAIN=company.com
```

This will allow:

- `user@company.com`
- `user@subsidiary.company.com`
- `user@dept.company.com`

### Google Admin SDK Integration

For advanced workspace features, you can integrate with the Google Admin SDK:

1. Enable the Admin SDK API in Google Cloud Console
2. Create a service account with domain-wide delegation
3. Configure the service account in your Google Workspace admin console
4. Add the service account credentials to your environment

_Note: This is for future advanced features and is not required for basic SSO functionality._

## Migration Guide

### From Personal Google Auth

If you're migrating from personal Google authentication:

1. **Gradual rollout**: Test with a small group first
2. **Communication**: Inform users about the change
3. **Fallback**: Keep personal auth enabled during testing
4. **Monitoring**: Watch for authentication errors

### User Data

- Existing users from allowed domains will continue to work
- Users from disallowed domains will be blocked on next login
- No user data migration is required

## API Reference

### Workspace SSO Utilities

The workspace SSO functionality is implemented in `utils/auth/workspace-sso.ts`:

```typescript
// Check if a domain is allowed
isAllowedWorkspaceDomain(email: string): boolean

// Extract workspace information
extractWorkspaceInfo(email: string, profile?: any): WorkspaceUser

// Validate workspace authentication
validateWorkspaceAuth(email: string, profile?: any): Promise<{isValid: boolean, reason?: string}>
```

## Support

For issues with Google Workspace SSO:

1. Check the troubleshooting section above
2. Review the application logs
3. Verify your Google Cloud Console configuration
4. Test with different user accounts from your workspace

## Future Enhancements

Planned features for Google Workspace SSO:

- Admin dashboard for workspace management
- Advanced user provisioning
- Integration with Google Workspace security features
- Bulk user management tools
- Enhanced organization analytics
