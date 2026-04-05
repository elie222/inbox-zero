## Inbox Zero Teams submission notes

### What the app does

Inbox Zero is an AI email assistant for Microsoft Teams direct messages. Users install the app, open a personal chat with the bot, link their Inbox Zero account with `/connect <code>`, and then chat with the assistant to triage or draft email actions.

### Supported scope

- Personal scope only
- Microsoft Teams commercial cloud

### Important reviewer setup note

This app requires a working Inbox Zero account to complete the `/connect <code>` flow. Provide Microsoft with a test Inbox Zero account or clear setup instructions before submission.

### Suggested test flow

1. Install the app in Teams.
2. Open a personal chat with the bot.
3. Sign in to Inbox Zero at `https://www.getinboxzero.com`.
4. Go to Settings -> Connected Apps.
5. Click Connect Teams.
6. Copy the generated `/connect <code>` command.
7. Paste the command into the Teams DM with the bot.
8. Confirm the bot replies successfully.
9. Send a normal message such as `Summarize my inbox`.
10. Confirm the assistant responds in the Teams DM.

### Links

- Website: `https://www.getinboxzero.com`
- Privacy: `https://www.getinboxzero.com/privacy`
- Terms: `https://www.getinboxzero.com/terms`

### Submission checklist

- Confirm production env uses the public bot configuration before submission.
- Confirm `TEAMS_BOT_APP_TYPE=MultiTenant` is deployed.
- Confirm the app package version matches the uploaded zip.
- Confirm the bot still works in your own tenant after the multitenant change.
