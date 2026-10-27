# Connect Outlook to Open Inbox Zero

Outlook needs your own Microsoft OAuth application; Google credentials authorize
Gmail only. Follow [the upstream Microsoft guide](docs/hosting/microsoft-oauth.mdx)
and keep all client credentials private.

1. In Microsoft Entra, create an app registration. For Outlook.com plus Microsoft
   365, choose accounts in any organizational directory and personal Microsoft
   accounts. An organizational-only registration does not accept personal mailboxes.
2. Add Web redirect URIs exactly:
   - `http://localhost:3000/api/auth/callback/microsoft`
   - `http://localhost:3000/api/outlook/linking/callback`
3. Configure Microsoft Graph delegated permissions from the upstream guide:
   `openid`, `profile`, `email`, `User.Read`, `offline_access`, `Mail.ReadWrite`,
   `Mail.Send`, and `MailboxSettings.ReadWrite`. Optional integrations require
   additional scopes. Your organization may require administrator consent.
4. Copy the Application (client) ID. Create a client secret and save its Value,
   not its Secret ID; track and rotate its expiration yourself.
5. Save a private JSON file outside the repository using this format:

```json
{
  "MICROSOFT_CLIENT_ID": "REPLACE_WITH_APPLICATION_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET": "REPLACE_WITH_SECRET_VALUE",
  "MICROSOFT_TENANT_ID": "common"
}
```

Run **Configure Outlook.cmd** with that file path, stop/restart the app, and use
Accounts > Add Microsoft while signed into the Inbox Zero account that should
own the mailbox. The importer writes `.env.local` without displaying secrets.
Never commit the downloaded credentials or generated runtime data.

See [Microsoft app registration documentation](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)
for directory and account-type details. Registering an app in a school/work tenant
may require switching directories or using an account with appropriate permissions.