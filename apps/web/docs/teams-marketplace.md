# Microsoft Teams Marketplace Integration

This guide covers how to set up and deploy Inbox Zero as a Microsoft Teams app.

## Prerequisites

1. Microsoft Azure account with permissions to create app registrations
2. Microsoft Partner Center account (for marketplace submission)
3. Teams admin access for testing

## Setup Instructions

### 1. Azure App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to "Azure Active Directory" > "App registrations"
3. Click "New registration"
   - Name: `Inbox Zero for Teams`
   - Supported account types: "Accounts in any organizational directory (Any Azure AD directory - Multitenant) and personal Microsoft accounts"
   - Redirect URIs:
     - Web: `https://your-domain.com/api/teams/callback`
     - Web: `https://your-domain.com/api/auth/callback/microsoft`
     - Web: `https://your-domain.com/api/outlook/linking/callback`

4. After creation, note down:
   - Application (client) ID → `MICROSOFT_CLIENT_ID` and `TEAMS_APP_ID`
   - Directory (tenant) ID → Use "common" for `TEAMS_TENANT_ID`

5. Create client secret:
   - Go to "Certificates & secrets"
   - Click "New client secret"
   - Copy the value → `MICROSOFT_CLIENT_SECRET`

6. Configure API permissions:
   - Click "API permissions" > "Add a permission" > "Microsoft Graph"
   - Add these delegated permissions:
     - `openid`
     - `profile`
     - `email`
     - `User.Read`
     - `Team.ReadBasic.All`
     - `TeamSettings.Read.All`
     - `Mail.ReadWrite`
     - `Mail.Send`
     - `Mail.ReadBasic`
     - `Mail.Read`
     - `Mail.Read.Shared`
     - `MailboxSettings.ReadWrite`
     - `Contacts.ReadWrite` (if contacts enabled)
     - `offline_access`

### 2. Environment Variables

Add these to your `.env.local`:

```bash
# Existing Microsoft OAuth (if you have it)
MICROSOFT_CLIENT_ID=your-app-client-id
MICROSOFT_CLIENT_SECRET=your-app-client-secret

# Teams specific
TEAMS_APP_ID=same-as-microsoft-client-id  # Usually the same
TEAMS_TENANT_ID=common  # For multi-tenant apps
NEXT_PUBLIC_TEAMS_APP_ID=your-app-client-id
NEXT_PUBLIC_TEAMS_ENABLED=true

# Webhook security (generate a random string)
MICROSOFT_WEBHOOK_CLIENT_STATE=your-random-webhook-secret
```

### 3. Database Migration

Run the migration to create the TeamsInstallation table:

```bash
cd apps/web
npx prisma migrate dev --name add-teams-installation
```

### 4. Teams App Package

1. Update the manifest:
   - Edit `apps/web/public/teams/manifest.json`
   - Replace the `id` and `webApplicationInfo.id` with your app ID
   - Update URLs to match your domain
   - Ensure icon files exist: `icon-color.png` and `icon-outline.png` (192x192px)

2. Create the app package:
   ```bash
   cd apps/web/public/teams
   zip -r inbox-zero-teams.zip manifest.json icon-*.png
   ```

### 5. Teams App Validation

1. Use [Teams App Studio](https://docs.microsoft.com/en-us/microsoftteams/platform/concepts/build-and-test/app-studio-overview) or [Developer Portal](https://dev.teams.microsoft.com)
2. Import your app package
3. Test in your Teams environment
4. Run validation to check for issues

### 6. Configure Webhooks (Optional)

If you want to receive Teams lifecycle events:

1. In Azure Portal, go to your app registration
2. Add a new Web platform redirect URI: `https://your-domain.com/api/teams/webhook`
3. The webhook endpoint handles:
   - App installation/uninstallation
   - Team member additions/removals

### 7. Testing

1. **Local Testing:**
   ```bash
   # Use ngrok for local development
   ngrok http 3000
   
   # Update redirect URIs in Azure to use ngrok URL temporarily
   ```

2. **Teams Testing:**
   - Go to Teams > Apps > Upload a custom app
   - Upload your app package
   - Install in a team or personal scope
   - Test the tab functionality

### 8. Publishing to Teams Store

1. **Partner Center Setup:**
   - Create account at [Partner Center](https://partner.microsoft.com)
   - Complete publisher verification
   - Complete publisher attestation

2. **Submission Checklist:**
   - [ ] App package validated
   - [ ] Privacy policy URL updated
   - [ ] Terms of service URL updated
   - [ ] Support contact information ready
   - [ ] App description and screenshots prepared
   - [ ] Test notes documented

3. **Submit via Partner Center:**
   - New offer > Office add-in
   - Upload your app package
   - Fill in all required metadata
   - Submit for validation

## User Experience Flow

1. **Installation:**
   - User finds Inbox Zero in Teams app store
   - Clicks "Add" and grants permissions
   - Redirected to consent flow
   - App installed in their Teams workspace

2. **Usage:**
   - Access via Teams tab
   - Pin to favorite apps
   - Use from any team or chat as a tab
   - Single sign-on with Teams credentials

3. **Features in Teams:**
   - View email summary
   - Quick actions (archive, reply)
   - AI assistant access
   - Links to full Inbox Zero features

## Security Considerations

1. **Authentication:**
   - Uses OAuth 2.0 with PKCE
   - Tokens stored encrypted
   - Automatic token refresh

2. **Data Access:**
   - Only accesses data user consents to
   - Respects Teams tenant policies
   - No data stored in Teams

3. **Webhook Validation:**
   - Validates Microsoft signatures
   - Uses secure webhook secrets
   - Handles errors gracefully

## Troubleshooting

### Common Issues

1. **"App not loading in Teams"**
   - Check manifest.json URLs
   - Verify domain in validDomains
   - Check browser console for errors

2. **"Authentication failing"**
   - Verify redirect URIs match exactly
   - Check client ID/secret
   - Ensure permissions granted

3. **"Webhook not receiving events"**
   - Verify webhook URL is publicly accessible
   - Check signature validation
   - Review webhook logs

### Debug Mode

Enable debug logging:
```typescript
// In your Teams tab component
import * as microsoftTeams from "@microsoft/teams-js";

if (process.env.NODE_ENV === 'development') {
  microsoftTeams.app.initialize().then(() => {
    // Enable verbose logging for debugging
    console.log("Teams SDK initialized");
  });
}
```

## Maintenance

1. **Regular Updates:**
   - Keep Teams SDK updated
   - Monitor API deprecations
   - Update manifest schema version

2. **Monitoring:**
   - Track installation metrics
   - Monitor error rates
   - Collect user feedback

3. **Support:**
   - Provide Teams-specific documentation
   - Handle Teams-specific support tickets
   - Monitor Teams developer announcements

## Resources

- [Teams App Development](https://docs.microsoft.com/en-us/microsoftteams/platform/)
- [Graph API Reference](https://docs.microsoft.com/en-us/graph/api/overview)
- [Teams Toolkit](https://marketplace.visualstudio.com/items?itemName=TeamsDevApp.ms-teams-vscode-extension)
- [App Submission Guide](https://docs.microsoft.com/en-us/microsoftteams/platform/concepts/deploy-and-publish/appsource/publish)
- [Teams JavaScript SDK](https://docs.microsoft.com/en-us/javascript/api/overview/msteams-client)