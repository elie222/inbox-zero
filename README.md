[![](apps/web/app/opengraph-image.png)](https://www.getinboxzero.com)

<p align="center">
  <a href="https://www.getinboxzero.com">
    <h1 align="center">Inbox Zero - Your AI Email Assistant</h1>
  </a>
  <p align="center">
    Open source email app to reach inbox zero fast.
    <br />
    <a href="https://www.getinboxzero.com">Website</a>
    ·
    <a href="https://www.getinboxzero.com/discord">Discord</a>
    ·
    <a href="https://github.com/elie222/inbox-zero/issues">Issues</a>
  </p>
</p>

## About

There are two parts to Inbox Zero:

1. An AI email assistant that helps you spend less time on email.
2. Open source AI email client.

If you're looking to contribue to the project, the email client is the best place to do this.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Felie222%2Finbox-zero&env=NEXTAUTH_SECRET,GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET,GOOGLE_ENCRYPT_SECRET,GOOGLE_ENCRYPT_SALT,UPSTASH_REDIS_URL,UPSTASH_REDIS_TOKEN,GOOGLE_PUBSUB_TOPIC_NAME,DATABASE_URL)

Thanks to Vercel for sponsoring Inbox Zero in support of open-source software.

## Features

- **AI Personal Assistant:** Manages your email for you based on a plain text prompt file. It can take any action a human assistant can take on your behalf (Draft reply, Label, Archive, Reply, Forward, Mark Spam, and even call a webhook).
- **Reply Zero:** Track emails that need your reply and those awaiting responses.
- **Smart Categories:** Categorize everyone that's ever emailed you.
- **Bulk Unsubscriber:** Quickly unsubscribe from emails you never read in one-click.
- **Cold Email Blocker:** Automatically block cold emails.
- **Email Analytics:** Track your email activity with daily, weekly, and monthly stats.

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

## Feature Requests

To request a feature open a [GitHub issue](https://github.com/elie222/inbox-zero/issues). If you don't have a GitHub account you can request features [here](https://www.getinboxzero.com/feature-requests). Or join our [Discord](https://www.getinboxzero.com/discord).

## Getting Started for Developers

We offer a hosted version of Inbox Zero at [https://getinboxzero.com](https://getinboxzero.com). To self-host follow the steps below.

### Contributing to the project

You can view open tasks in our [GitHub Issues](https://github.com/elie222/inbox-zero/issues).
Join our [Discord](https://www.getinboxzero.com/discord) to discuss tasks and check what's being worked on.

[ARCHITECTURE.md](./ARCHITECTURE.md) explains the architecture of the project (LLM generated).

### Requirements

- [Node.js](https://nodejs.org/en/) >= 18.0.0
- [pnpm](https://pnpm.io/) >= 8.6.12
- [Docker desktop](https://www.docker.com/products/docker-desktop/) (optional)

### Setup

[Here's a video](https://youtu.be/hVQENQ4WT2Y) on how to set up the project. It covers the same steps mentioned in this document. But goes into greater detail on setting up the external services.

The external services that are required are:

- [Google OAuth](https://console.cloud.google.com/apis/credentials)
- [Google PubSub](https://console.cloud.google.com/cloudpubsub/topic/list) - see set up instructions below

You also need to set an LLM, but you can use a local one too:

- [Anthropic](https://console.anthropic.com/settings/keys)
- [OpenAI](https://platform.openai.com/api-keys)
- AWS Bedrock Anthropic
- Google Gemini
- OpenRouter (any model)
- Groq (Llama 3.3 70B)
- Ollama (local)

We use Postgres for the database.
For Redis, you can use [Upstash Redis](https://upstash.com/) or set up your own Redis instance.

You can run Postgres & Redis locally using `docker-compose`

```bash
docker-compose up -d # -d will run the services in the background
```

Create your own `.env` file:

```bash
cp apps/web/.env.example apps/web/.env
cd apps/web
pnpm install
```

For self-hosting, you may also need to copy the `.env` file to both the root directory AND the apps/web directory (PRs welcome to improve this):

```bash
cp apps/web/.env .env
```

Set the environment variables in the newly created `.env`. You can see a list of required variables in: `apps/web/env.ts`.

The required environment variables:

- `NEXTAUTH_SECRET` -- can be any random string (try using `openssl rand -hex 32` for a quick secure random string)
- `GOOGLE_CLIENT_ID` -- Google OAuth client ID. More info [here](https://next-auth.js.org/providers/google)
- `GOOGLE_CLIENT_SECRET` -- Google OAuth client secret. More info [here](https://next-auth.js.org/providers/google)
- `GOOGLE_ENCRYPT_SECRET` -- Secret key for encrypting OAuth tokens (try using `openssl rand -hex 32` for a secure key)
- `GOOGLE_ENCRYPT_SALT` -- Salt for encrypting OAuth tokens (try using `openssl rand -hex 16` for a secure salt)
- `UPSTASH_REDIS_URL` -- Redis URL from Upstash. (can be empty if you are using Docker Compose)
- `UPSTASH_REDIS_TOKEN` -- Redis token from Upstash. (or specify your own random string if you are using Docker Compose)

When using Vercel with Fluid Compute turned off, you should set `MAX_DURATION=300` or lower. See Vercel limits for different plans [here](https://vercel.com/docs/functions/configuring-functions/duration#duration-limits).

To run the migrations:

```bash
pnpm prisma migrate dev
```

To run the app locally for development (slower):

```bash
pnpm run dev
```

Or from the project root:

```bash
turbo dev
```

To build and run the app locally in production mode (faster):

```bash
pnpm run build
pnpm start
```

Open [http://localhost:3000](http://localhost:3000) to view the app in your browser.

To upgrade yourself, make yourself an admin in the `.env`: `ADMINS=hello@gmail.com`
Then upgrade yourself at: [http://localhost:3000/admin](http://localhost:3000/admin).

### Supported LLMs

For the LLM, you can use Anthropic, OpenAI, or Anthropic on AWS Bedrock. You can also use Ollama by setting the following enviroment variables:

```sh
DEFAULT_LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/api
NEXT_PUBLIC_OLLAMA_MODEL=gemma3  # or whatever available model you want to use
```

Note: If you need to access Ollama hosted locally and the application is running on Docker setup, you can use `http://host.docker.internal:11434/api` as the base URL. You might also need to set `OLLAMA_HOST` to `0.0.0.0` in the Ollama configuration file.

You can select the model you wish to use in the app on the `/settings` page of the app.

### Setting up Google OAuth and Gmail API

1. **Create a Project in Google Cloud Console**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project

2. **Enable Required APIs**
   - Enable the [Gmail API](https://console.developers.google.com/apis/api/gmail.googleapis.com/overview)
   - Enable the [People API](https://console.developers.google.com/apis/api/people.googleapis.com/overview)

3. **Configure the OAuth Consent Screen**
   - Go to 'APIs & Services' > 'OAuth consent screen'
   - Choose 'External' user type (or 'Internal' if you have Google Workspace)
   - Fill in required app information
   - Add the following scopes:
     ```plaintext
     https://www.googleapis.com/auth/userinfo.profile
     https://www.googleapis.com/auth/userinfo.email
     https://www.googleapis.com/auth/gmail.modify
     https://www.googleapis.com/auth/gmail.settings.basic
     https://www.googleapis.com/auth/contacts
     ```
   - Add yourself as a test user under 'Test users' section

4. **Create OAuth 2.0 Credentials**
   - Go to 'APIs & Services' > 'Credentials'
   - Click 'Create Credentials' > 'OAuth client ID'
   - Select 'Web application' type
   - Add authorized JavaScript origins:
     - Development: `http://localhost:3000`
     - Production: `https://your-production-url.com`
   - Add authorized redirect URIs:
     - Development:
       ```
       http://localhost:3000/api/auth/callback/google
       ```
     - Production:
       ```
       https://your-production-url.com/api/auth/callback/google
       ```

5. **Configure Environment Variables**
   - Add to your `.env` file:
     ```
     GOOGLE_CLIENT_ID=your_client_id
     GOOGLE_CLIENT_SECRET=your_client_secret
     ```

### Set up push notifications via Google PubSub to handle emails in real time

Follow instructions [here](https://developers.google.com/gmail/api/guides/push).

1. [Create a topic](https://developers.google.com/gmail/api/guides/push#create_a_topic)
2. [Create a subscription](https://developers.google.com/gmail/api/guides/push#create_a_subscription)
3. [Grant publish rights on your topic](https://developers.google.com/gmail/api/guides/push#grant_publish_rights_on_your_topic)

Set env var `GOOGLE_PUBSUB_TOPIC_NAME`.
When creating the subscription select Push and the url should look something like: `https://www.getinboxzero.com/api/google/webhook?token=TOKEN` or `https://abc.ngrok-free.app/api/google/webhook?token=TOKEN` where the domain is your domain. Set `GOOGLE_PUBSUB_VERIFICATION_TOKEN` in your `.env` file to be the value of `TOKEN`.

To run in development ngrok can be helpful:

```sh
ngrok http 3000
# or with an ngrok domain to keep your endpoint stable (set `XYZ`):
ngrok http --domain=XYZ.ngrok-free.app 3000
```

And then update the webhook endpoint in the [Google PubSub subscriptions dashboard](https://console.cloud.google.com/cloudpubsub/subscription/list).

To start watching emails visit: `/api/google/watch/all`

### Watching for email updates

Set a cron job to run these:
The Google watch is necessary. Others are optional.

```json
  "crons": [
    {
      "path": "/api/google/watch/all",
      "schedule": "0 1 * * *"
    },
    {
      "path": "/api/resend/summary/all",
      "schedule": "0 16 * * 1"
    },
    {
      "path": "/api/reply-tracker/disable-unused-auto-draft",
      "schedule": "0 3 * * *"
    }
  ]
```

[Here](https://vercel.com/guides/how-to-setup-cron-jobs-on-vercel#alternative-cron-providers) are some easy ways to run cron jobs. Upstash is a free, easy option. I could never get the Vercel `vercel.json`. Open to PRs if you find a fix for that.
