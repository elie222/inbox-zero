[![](apps/web/app/opengraph-image.png)](https://www.getinboxzero.com)

<p align="center">
  <a href="https://www.getinboxzero.com">
    <h1 align="center">Inbox Zero - your 24/7 AI email assistant</h1>
  </a>
  <p align="center">
    Organizes your inbox, pre-drafts replies, and tracks follow‑ups - so you reach inbox zero faster. Open source alternative to Fyxer, but more customisable and secure.
    <br />
    <a href="https://www.getinboxzero.com">Website</a>
    ·
    <a href="https://www.getinboxzero.com/discord">Discord</a>
    ·
    <a href="https://github.com/elie222/inbox-zero/issues">Issues</a>
  </p>
</p>

<div align="center">

![Stars](https://img.shields.io/github/stars/elie222/inbox-zero?labelColor=black&style=for-the-badge&color=2563EB)
![Forks](https://img.shields.io/github/forks/elie222/inbox-zero?labelColor=black&style=for-the-badge&color=2563EB)

<a href="https://trendshift.io/repositories/6400" target="_blank"><img src="https://trendshift.io/api/badge/repositories/6400" alt="elie222%2Finbox-zero | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

[![Vercel OSS Program](https://vercel.com/oss/program-badge.svg)](https://vercel.com/oss)

</div>

## Mission

To help you spend less time in your inbox, so you can focus on what matters.

<br />

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Felie222%2Finbox-zero&env=AUTH_SECRET,GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET,MICROSOFT_CLIENT_ID,MICROSOFT_CLIENT_SECRET,EMAIL_ENCRYPT_SECRET,EMAIL_ENCRYPT_SALT,UPSTASH_REDIS_URL,UPSTASH_REDIS_TOKEN,GOOGLE_PUBSUB_TOPIC_NAME,DATABASE_URL,NEXT_PUBLIC_BASE_URL)

## Features

- **AI Personal Assistant:** Organizes your inbox and pre-drafts replies in your tone and style.
- **Cursor Rules for email:** Explain in plain English how your AI should handle your inbox.
- **Reply Zero:** Track emails to reply to and those awaiting responses.
- **Smart Categories:** Automatically categorize every sender.
- **Bulk Unsubscriber:** One-click unsubscribe and archive emails you never read.
- **Cold Email Blocker:** Auto‑block cold emails.
- **Email Analytics:** Track your activity and trends over time.
- **Meeting Briefs (Beta):** Get personalized briefings before every meeting, pulling context from your email and calendar.
- **Auto File (Early Access):** Automatically save email attachments to Google Drive or OneDrive.


Learn more in our [docs](https://docs.getinboxzero.com).

## Feature Screenshots

| ![AI Assistant](.github/screenshots/email-assistant.png) |        ![Reply Zero](.github/screenshots/reply-zero.png)        |
| :------------------------------------------------------: | :-------------------------------------------------------------: |
|                      _AI Assistant_                      |                          _Reply Zero_                           |
|  ![Gmail Client](.github/screenshots/email-client.png)   | ![Bulk Unsubscriber](.github/screenshots/bulk-unsubscriber.png) |
|                      _Gmail client_                      |                       _Bulk Unsubscriber_                       |

## Demo Video

[![Inbox Zero demo](/video-thumbnail.png)](http://www.youtube.com/watch?v=hfvKvTHBjG0)

## Built with

- [Next.js](https://nextjs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Prisma](https://www.prisma.io/)
- [Upstash](https://upstash.com/)
- [Turborepo](https://turbo.build/)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=elie222/inbox-zero&type=Date)](https://www.star-history.com/#elie222/inbox-zero&Date)

## Feature Requests

To request a feature open a [GitHub issue](https://github.com/elie222/inbox-zero/issues), or join our [Discord](https://www.getinboxzero.com/discord).

## Getting Started

We offer a hosted version of Inbox Zero at [https://getinboxzero.com](https://www.getinboxzero.com).

### Self-Hosting with Docker

The easiest way to self-host Inbox Zero is using our pre-built Docker image.

See our **[Self-Hosting Guide](docs/hosting/self-hosting.md)** for complete instructions.

### Local Development Setup

[Here's a video](https://youtu.be/hVQENQ4WT2Y) on how to set up the project. It covers the same steps mentioned in this document. But goes into greater detail on setting up the external services.

#### Requirements

- [Node.js](https://nodejs.org/en/) >= 22.0.0
- [pnpm](https://pnpm.io/) >= 10.0.0
- [Docker desktop](https://www.docker.com/products/docker-desktop/) (recommended for running Postgres and Redis)

#### Quick Start

1. **Start PostgreSQL and Redis:**
   ```bash
   docker compose -f docker-compose.dev.yml up -d
   ```

2. **Install dependencies and set up environment:**
   ```bash
   pnpm install
   ```

   **Option A: Interactive CLI** - Guides you through each step and auto-generates secrets
   ```bash
   npm run setup
   ```

   **Option B: Manual setup** - Copy the example file and edit it yourself
   ```bash
   cp apps/web/.env.example apps/web/.env
   # Generate secrets with: openssl rand -hex 32
   ```

3. **Run database migrations:**
   ```bash
   cd apps/web
   pnpm prisma migrate dev
   ```

5. **Run the development server:**
   ```bash
   pnpm dev
   ```

The app will be available at `http://localhost:3000`.

The sections below provide detailed setup instructions for OAuth and other services. For a comprehensive reference of all environment variables, see the [Environment Variables Guide](docs/hosting/environment-variables.md).

### Google OAuth Setup

Go to [Google Cloud Console](https://console.cloud.google.com/) and create a new project if necessary.

Create [new credentials](https://console.cloud.google.com/apis/credentials):

1.  If the banner shows up, configure **consent screen** (if not, you can do this later)
    1. Click the banner, then Click `Get Started`.
    2. Choose a name for your app, and enter your email.
    3. In Audience, choose `External`
    4. Enter your contact information
    5. Agree to the User Data policy and then click `Create`.
    6. Return to APIs and Services using the left sidebar.
2.  Create new [credentials](https://console.cloud.google.com/apis/credentials):
    1. Click the `+Create Credentials` button. Choose OAuth Client ID.
    2. In `Application Type`, Choose `Web application`
    3. Choose a name for your web client
    4. In Authorized JavaScript origins, add a URI and enter `http://localhost:3000` (replace `localhost:3000` with your domain in production)
    5. In `Authorized redirect URIs` enter (replace `localhost:3000` with your domain in production):
      - `http://localhost:3000/api/auth/callback/google`
      - `http://localhost:3000/api/google/linking/callback`
      - `http://localhost:3000/api/google/calendar/callback` (only required for calendar integration)
      - `http://localhost:3000/api/google/drive/callback` (only required for Google Drive integration)
    6. Click `Create`.
    7. A popup will show up with the new credentials, including the Client ID and secret.
3.  Update .env file:
    1. Copy the Client ID to `GOOGLE_CLIENT_ID`
    2. Copy the Client secret to `GOOGLE_CLIENT_SECRET`
4.  Update [scopes](https://console.cloud.google.com/auth/scopes)

    1. Go to `Data Access` in the left sidebar (or click link above)
    2. Click `Add or remove scopes`
    3. Copy paste the below into the `Manually add scopes` box:

    ```plaintext
    https://www.googleapis.com/auth/userinfo.profile
    https://www.googleapis.com/auth/userinfo.email
    https://www.googleapis.com/auth/gmail.modify
    https://www.googleapis.com/auth/gmail.settings.basic
    https://www.googleapis.com/auth/contacts
    https://www.googleapis.com/auth/calendar (only required for calendar integration)
    https://www.googleapis.com/auth/drive.file (only required for Google Drive integration)
    ```

    4. Click `Update`
    5. Click `Save` in the Data Access page.

5.  Add yourself as a test user
    1. Go to [Audience](https://console.cloud.google.com/auth/audience)
    2. In the `Test users` section, click `+Add users`
    3. Enter your email and press `Save`

6.  Enable required APIs in [Google Cloud Console](https://console.cloud.google.com/apis/library):
    - [Google People API](https://console.cloud.google.com/marketplace/product/google/people.googleapis.com) (required)
    - [Google Calendar API](https://console.cloud.google.com/marketplace/product/google/calendar-json.googleapis.com) (only required for calendar integration)
    - [Google Drive API](https://console.cloud.google.com/marketplace/product/google/drive.googleapis.com) (only required for Google Drive integration)

### Google PubSub Setup

PubSub enables real-time email notifications. Follow the [official guide](https://developers.google.com/gmail/api/guides/push):

1. [Create a topic](https://developers.google.com/gmail/api/guides/push#create_a_topic)
2. [Create a subscription](https://developers.google.com/gmail/api/guides/push#create_a_subscription)
3. [Grant publish rights on your topic](https://developers.google.com/gmail/api/guides/push#grant_publish_rights_on_your_topic)

Set `GOOGLE_PUBSUB_TOPIC_NAME` in your `.env` file.

When creating the subscription, select **Push** and set the URL to:
`https://yourdomain.com/api/google/webhook?token=TOKEN`

Set `GOOGLE_PUBSUB_VERIFICATION_TOKEN` in your `.env` file to the value of `TOKEN`.

**For local development**, use ngrok to expose your local server:

```sh
ngrok http 3000
```

Then update the webhook endpoint in the [Google PubSub subscriptions dashboard](https://console.cloud.google.com/cloudpubsub/subscription/list).

**Scheduled tasks:** Gmail/Outlook watch subscriptions and meeting briefs require periodic execution. If using Docker Compose, this is handled automatically by the cron container. Otherwise, set up cron jobs for `/api/watch/all` (every 6 hours) and `/api/meeting-briefs` (every 15 minutes). See [Self-Hosting Guide](docs/hosting/self-hosting.md#scheduled-tasks).

### Microsoft OAuth Setup

Go to [Microsoft Azure Portal](https://portal.azure.com/) and create a new Azure Active Directory app registration:

1. Navigate to Azure Active Directory
2. Go to "App registrations" in the left sidebar or search it in the searchbar
3. Click "New registration"

   1. Choose a name for your application
   2. Under "Supported account types" select one of:
      - **Multitenant (default):** "Accounts in any organizational directory (Any Azure AD directory - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)" - allows any Microsoft account
      - **Single tenant:** "Accounts in this organizational directory only" - restricts to your organization only
   3. Set the Redirect URI:
      - Platform: Web
      - URL: `http://localhost:3000/api/auth/callback/microsoft` (replace `localhost:3000` with your domain in production)
   4. Click "Register"
   5. In the "Manage" menu click "Authentication (Preview)"
   6. Add the following Redirect URIs (replace `localhost:3000` with your domain in production):
      - `http://localhost:3000/api/outlook/linking/callback`
      - `http://localhost:3000/api/outlook/calendar/callback` (only required for calendar integration)
      - `http://localhost:3000/api/outlook/drive/callback` (only required for OneDrive integration)

4. Get your credentials from the `Overview` tab:

   1. Copy the "Application (client) ID" → this is your `MICROSOFT_CLIENT_ID`
   2. If using single tenant, copy the "Directory (tenant) ID" → this is your `MICROSOFT_TENANT_ID`
   3. Go to "Certificates & secrets" in the left sidebar
      - Click "New client secret"
      - Add a description and choose an expiry
      - Click "Add"
      - Copy the `Value` → this is your `MICROSOFT_CLIENT_SECRET` (**Important:** copy `Value`, not `Secret ID`)

5. Configure API permissions:

   1. In the "Manage" menu click "API permissions" in the left sidebar
   2. Click "Add a permission"
   3. Select "Microsoft Graph"
   4. Select "Delegated permissions"
   5. Add the following permissions:

      - openid
      - profile
      - email
      - User.Read
      - offline_access
      - Mail.ReadWrite
      - Mail.Send (only required if `NEXT_PUBLIC_EMAIL_SEND_ENABLED=true`, which is the default)
      - MailboxSettings.ReadWrite
      - Calendars.Read (only required for calendar integration)
      - Calendars.ReadWrite (only required for calendar integration)
      - Files.ReadWrite (only required for OneDrive integration)

   6. Click "Add permissions"
   7. Click "Grant admin consent" if you're an admin

6. Update your `.env` file with the credentials:
   ```
   MICROSOFT_CLIENT_ID=your_client_id_here
   MICROSOFT_CLIENT_SECRET=your_client_secret_here
   MICROSOFT_TENANT_ID=your_tenant_id_here  # Only needed for single tenant, omit for multitenant
   ```

### LLM Setup

In your `.env` file, uncomment one of the LLM provider blocks and add your API key:

- [Anthropic](https://console.anthropic.com/settings/keys)
- [OpenAI](https://platform.openai.com/api-keys)
- [Google Gemini](https://ai.google.dev/)
- [OpenRouter](https://openrouter.ai/settings/keys)
- [Vercel AI Gateway](https://vercel.com/docs/ai-gateway)
- [AWS Bedrock](https://aws.amazon.com/bedrock/)
- [Groq](https://console.groq.com/)

Users can also change the model in the app on the `/settings` page.

### Local Production Build

To test a production build locally:

```bash
# Without Docker
pnpm run build
pnpm start

# With Docker (includes Postgres and Redis)
NEXT_PUBLIC_BASE_URL=http://localhost:3000 docker compose --profile all up --build
```

### Self-Hosting

For production deployments, see our guides:
- [Self-Hosting Guide](docs/hosting/self-hosting.md)
- [AWS EC2 Deployment](docs/hosting/ec2-deployment.md)
- [AWS Copilot (ECS/Fargate)](docs/hosting/aws-copilot.md)


## Contributing to the project

You can view open tasks in our [GitHub Issues](https://github.com/elie222/inbox-zero/issues).
Join our [Discord](https://www.getinboxzero.com/discord) to discuss tasks and check what's being worked on.

[ARCHITECTURE.md](./ARCHITECTURE.md) explains the architecture of the project (LLM generated).

### Releases

Docker images are automatically built on every push to `main` and tagged with the commit SHA (e.g., `elie222/inbox-zero:abc1234`). The `latest` tag always points to the most recent main build.

For formal releases, we create GitHub Releases with version tags (e.g., `v2.26.0`) which also trigger Docker builds with that version tag.
