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
- [Tinybird](https://tinybird.co/)
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
- Groq Llama 3.3 70B
- Ollama (local)

To enable Bulk Unsubscriber, Analytics and Smart Categories you will also need to set:

- [Tinybird](https://www.tinybird.co/)

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

Set the environment variables in the newly created `.env`. You can see a list of required variables in: `apps/web/env.ts`.

The required environment variables:

- `NEXTAUTH_SECRET` -- can be any random string (try using `openssl rand -hex 32` for a quick secure random string)
- `GOOGLE_CLIENT_ID` -- Google OAuth client ID. More info [here](https://next-auth.js.org/providers/google)
- `GOOGLE_CLIENT_SECRET` -- Google OAuth client secret. More info [here](https://next-auth.js.org/providers/google)
- `UPSTASH_REDIS_URL` -- Redis URL from Upstash. (can be empty if you are using Docker Compose)
- `UPSTASH_REDIS_TOKEN` -- Redis token from Upstash. (or specify your own random string if you are using Docker Compose)
- `TINYBIRD_TOKEN` -- (optional) Admin token for your Tinybird workspace (be sure to create an instance in the GCP `us-east4` region. This can also be changed via your `.env` if you prefer a different region). You can also decide to disabled Tinybird and then the analytics and bulk unsubscribe features will be disabled. Set `NEXT_PUBLIC_DISABLE_TINYBIRD=true` if you decide to disable Tinybird.

When using Vercel with Fluid Compute turned off, you should set `MAX_DURATION=300` or lower. See Vercel limits for different plans [here](https://vercel.com/docs/functions/configuring-functions/duration#duration-limits).

To run the migrations:

```bash
pnpm prisma migrate dev
```

To run the app locally:

```bash
pnpm run dev
```

Or from the project root:

```bash
turbo dev
```

Open [http://localhost:3000](http://localhost:3000) to view it in your browser.
To upgrade yourself to admin visit: [http://localhost:3000/admin](http://localhost:3000/admin).

### Supported LLMs

For the LLM, you can use Anthropic, OpenAI, or Anthropic on AWS Bedrock. You can also use Ollama by setting the following enviroment variables:

```sh
OLLAMA_BASE_URL=http://localhost:11434/api
NEXT_PUBLIC_OLLAMA_MODEL=phi3
```

Note: If you need to access Ollama hosted locally and the application is running on Docker setup, you can use `http://host.docker.internal:11434/api` as the base URL. You might also need to set `OLLAMA_HOST` to `0.0.0.0` in the Ollama configuration file.

You can select the model you wish to use in the app on the `/settings` page of the app.

### Setting up Google OAuth and Gmail API

You need to enable these scopes in the Google Cloud Console:

```plaintext
https://www.googleapis.com/auth/userinfo.profile
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/gmail.modify
https://www.googleapis.com/auth/gmail.settings.basic
https://www.googleapis.com/auth/contacts
```

### Setting up Tinybird

Follow the instructions [here](./packages/tinybird/README.md) to setup the `pipes` and `datasources`.

Optional: If you want to store AI usage stats in Tinybird too, then do the same in `/packages/tinybird-ai-analytics`.

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
The Google watch is necessary. The Resend one is optional.

```json
  "crons": [
    {
      "path": "/api/google/watch/all",
      "schedule": "0 1 * * *"
    },
    {
      "path": "/api/resend/summary/all",
      "schedule": "0 16 * * 1"
    }
  ]
```

[Here](https://vercel.com/guides/how-to-setup-cron-jobs-on-vercel#alternative-cron-providers) are some easy ways to run cron jobs. Upstash is a free, easy option. I could never get the Vercel `vercel.json`. Open to PRs if you find a fix for that.
