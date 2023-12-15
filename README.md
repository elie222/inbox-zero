<p align="center">
  <a href="https://www.getinboxzero.com">
    <h1 align="center">Inbox Zero</h1>
  </a>
  <p align="center">
    Open source email management tools to reach inbox zero fast.
    <br />
    <a href="https://www.getinboxzero.com">Website</a>
    ·
    <a href="https://www.getinboxzero.com/discord">Discord</a>
    ·
    <a href="https://github.com/elie222/inbox-zero">Issues</a>
    ·
    <a href="https://www.getinboxzero.com/roadmap">Roadmap</a>
  </p>
</p>

## About

Inbox Zero is a powerful open-source tool designed for Gmail and Gsuite users. It streamlines your email management, helping you achieve 'Inbox Zero' swiftly with features like email analytics, newsletter management, and AI assistance. Enhance your email experience without replacing your client!

## Demo Video

[![Inbox Zero demo](/video-thumbnail.png)](http://www.youtube.com/watch?v=WP2ZTcZq3RM)

## Key Features

- **Email Analytics:** Track your email activity with daily, weekly, and monthly stats.
- **Newsletter Management:** Easily manage and unsubscribe from newsletters.
- **New Senders:** Identify and block new spam senders.
- **Unreplied Emails:** Keep track of emails awaiting responses.
- **Large Email Finder:** Free up space by locating and deleting large emails.
- **AI Auto-Responder:** Automate responses for common queries.
- **AI Email Assistant:** Auto-archive, label, and forward emails based on set rules.

## Built with

- [Next.js](https://nextjs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Prisma](https://www.prisma.io/)
- [Tinybird](https://tinybird.co/)
- [Upstash](https://upstash.com/)
- [Turbo](https://turbo.build/)

## Roadmap

Explore our upcoming features and improvements on our [Roadmap](https://www.getinboxzero.com/roadmap). Your feedback and [feature requests](https://www.getinboxzero.com/feature-requests) are always welcome!

## Getting Started for Developers

### Requirements

- [Node.js](https://nodejs.org/en/) >= 18.0.0
- [pnpm](https://pnpm.io/) >= 8.6.12

Create your own `.env` file:

```bash
cp apps/web/.env.example apps/web/.env
cd apps/web
pnpm install
```

Set the environment variables in the newly created `.env`. You can see a list of required variables in: `apps/web/env.mjs`.

The external services that are required are:

- [OpenAI](https://platform.openai.com/api-keys)
- [Google OAuth](https://console.cloud.google.com/apis/credentials)
- [Google PubSub](https://console.cloud.google.com/cloudpubsub/topic/list) - see set up instructions below
- [Upstash Redis](https://upstash.com/)
- [Tinybird](https://www.tinybird.co/)

We use Postgres for the database.

To run the migrations:

```bash
pnpm prisma migrate dev
```

Now run:

```bash
pnpm run dev
```

Or from the project root:

```bash
turbo dev
```

Open [http://localhost:3000](http://localhost:3000) to view it in your browser.
To upgrade yourself to admin visit: [http://localhost:3000/admin](http://localhost:3000/admin).

### Set up push notifications via Google PubSub to handle emails in real time

Follow instructions [here](https://developers.google.com/gmail/api/guides/push).

1. [Create a topic](https://developers.google.com/gmail/api/guides/push#create_a_topic)
2. [Create a subscription](https://developers.google.com/gmail/api/guides/push#create_a_subscription)
3. [Grant publish rights on your topic](https://developers.google.com/gmail/api/guides/push#grant_publish_rights_on_your_topic)

Set env var `GOOGLE_PUBSUB_TOPIC_NAME`.
When creating the subscription select Push and the url should look something like: `https://www.getinboxzero.com/api/google/webhook` or `https://abc.ngrok-free.app/api/google/webhook` where the domain is your domain.

To run in development ngrok can be helpful:

```sh
ngrok http 3000
```

And then update the webhook endpoint in the [Google PubSub subscriptions dashboard](https://console.cloud.google.com/cloudpubsub/subscription/list).

To start watching emails visit: `/api/google/watch/all`.
