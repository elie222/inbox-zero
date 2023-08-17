<p align="center" style="margin-top: 120px">
  <h3 align="center">Inbox Zero</h3>
  <p align="center">
    Get to inbox zero fast with AI assistance.
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

## About Inbox Zero

Inbox Zero is an open-source project to help people manage their email inbox better with AI assistance.
The project is open-source so users can see exactly how their emails are being processed, and to allow contributions from the community.

You can choose to host it yourself or use our hosted version at [getinboxzero.com](https://getinboxzero.com).

The initial focus is automating responses to emails. Perfect for those that are often asked the same questions.

Roadmap features include:

- Email anayltics - we already provide basic analytics
- Auto archiving and labelling of emails - using AI we can keep your inbox clean and move less important emails out of your own inbox.
- Easy unsubscribe - show all your newsletter subscriptions with an easy unsubscribe option.

You can make additional [feature requests](https://getinboxzero.com/feature-requests).

Initially the aim is that people will use Inbox Zero side-by-side their existing email client and develop Inbox Zero over time into a full fledged email client.

## Built with

- [Next.js](https://nextjs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Prisma](https://www.prisma.io/)
- [Upstash](https://upstash.com/)
- [Turbo](https://turbo.build/)

## Getting Started

### Requirements

- [Node.js](https://nodejs.org/en/) >= 18.0.0
- [pnpm](https://pnpm.io/) >= 8.6.12

Create your own `.env.local` file:

```bash
cp apps/web/.env.example apps/web/.env.local
```

```bash
pnpm install
turbo dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Roadmap

Here's our [roadmap](https://www.getinboxzero.com/roadmap). Feel free to make feature requests.

## Set up push notifications via Google PubSub to handle emails in real time

Follow instructions [here](https://developers.google.com/gmail/api/guides/push).

1. [Create a topic](https://developers.google.com/gmail/api/guides/push#create_a_topic)
2. [Create a subscription](https://developers.google.com/gmail/api/guides/push#create_a_subscription)
3. [Grant publish rights on your topic](https://developers.google.com/gmail/api/guides/push#grant_publish_rights_on_your_topic)

Set env var `GOOGLE_PUBSUB_TOPIC_NAME`.
When creating the subscription select Push and the url should look something like: `https://getinboxzero.com/api/google/webhook` where the domain is your domain.

To run in development ngrok can be helpful:

```sh
ngrok http 3000
```

And then update the webhook endpoint in the [Google PubSub subscriptions dashboard](https://console.cloud.google.com/cloudpubsub/subscription/list).
