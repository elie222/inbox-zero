## Getting Started

First, run the development server:

```bash
turbo dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

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

force push
