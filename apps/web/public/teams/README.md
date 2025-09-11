# Inbox Zero Teams App

This directory contains the Microsoft Teams app package files for Inbox Zero.

## Files

- `manifest.json` - Teams app manifest defining capabilities and configuration
- `icon-color.png` - Color icon (192x192px) shown in Teams
- `icon-outline.png` - Outline icon (192x192px) for Teams dark mode

## Creating the App Package

Run the npm script from the web app directory:

```bash
cd apps/web
npm run teams:package
```

This will create `inbox-zero-teams.zip` in the `apps/web` directory.

## Testing the App

1. In Microsoft Teams, go to Apps
2. Click "Upload a custom app" (may need admin permissions)
3. Upload the `inbox-zero-teams.zip` file
4. Test the app functionality

## Manifest Configuration

Key sections to update before deployment:

1. **App IDs**: Replace the placeholder ID with your Azure App Registration ID
2. **URLs**: Update all URLs to match your production domain
3. **Developer Info**: Update with your organization's information
4. **Descriptions**: Customize for your use case

## Icon Requirements

- Format: PNG
- Size: 192x192 pixels
- Color icon: Full color with transparent background
- Outline icon: Single color (white/black) with transparent background

## Resources

- [Teams App Manifest Reference](https://docs.microsoft.com/en-us/microsoftteams/platform/resources/schema/manifest-schema)
- [Teams App Design Guidelines](https://docs.microsoft.com/en-us/microsoftteams/platform/concepts/design/design-teams-app-overview)