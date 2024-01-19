// Run with: `npx tsx scripts/addLemonDataToPosthog.ts`
// uncomment sections to run

import { PrismaClient } from "@prisma/client";
import { PostHog } from "posthog-node";

// eslint-disable-next-line no-process-env
const lemonApiKey = process.env.LEMON_API_SECRET;
if (!lemonApiKey) throw new Error("No Lemon Squeezy API key provided.");

// eslint-disable-next-line no-process-env
const posthogApiKey = process.env.POSTHOG_API_KEY;
if (!posthogApiKey) throw new Error("No PostHog API key provided.");

const prisma = new PrismaClient();

async function main() {
  // await saveSubscriptions();
  // await saveOrders();
}

async function fetchLemon(url: string) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${lemonApiKey}`,
    },
  });
  return await res.json();
}

async function saveSubscriptions() {
  let nextUrl = "https://api.lemonsqueezy.com/v1/subscriptions";
  let subscriptions: any[] = [];

  while (nextUrl) {
    const res = await fetchLemon(nextUrl);
    const page = res.data;

    subscriptions = [...subscriptions, ...page];
    console.log("subscriptions:", subscriptions.length);
    nextUrl = res.links.next;
  }

  console.log("subscriptions:", subscriptions.length);

  for (const subscription of subscriptions) {
    // console.log("subscription:", JSON.stringify(subscription, null, 2));

    let email: string | null = null;

    const premium = await prisma.premium.findFirst({
      where: {
        lemonSqueezyCustomerId: subscription.attributes.customer_id,
      },
      select: { users: { select: { email: true } } },
    });

    if (premium?.users?.[0]?.email) {
      email = premium?.users?.[0]?.email;
    } else {
      const user = await prisma.user.findFirst({
        where: {
          email: subscription.attributes.user_email,
        },
        select: { email: true },
      });
      if (user?.email) {
        email = user?.email;
      }
    }

    if (!email) {
      console.log(
        "No user found for subscription:",
        subscription.attributes.customer_id,
        subscription.attributes.user_email,
      );
      continue;
    }

    console.log("Saving subscription for user:", email);

    await posthogCaptureEvent(email, "Upgraded to premium", {
      ...subscription.attributes,
      $set: { premium: true, premiumTier: "subscription" },
    });
  }
}

async function saveOrders() {
  let nextUrl = "https://api.lemonsqueezy.com/v1/orders";
  let orders: any[] = [];

  while (nextUrl) {
    const res = await fetchLemon(nextUrl);
    const page = res.data;

    orders = [...orders, ...page];
    console.log("orders:", orders.length);
    nextUrl = res.links.next;
  }

  console.log("orders:", orders.length);

  for (const order of orders) {
    // console.log("order:", JSON.stringify(order, null, 2));

    // not lifetime deal
    if (order.attributes.total < 150_00) continue;

    let email: string | null = null;

    const premium = await prisma.premium.findFirst({
      where: {
        lemonSqueezyCustomerId: order.attributes.customer_id,
      },
      select: { users: { select: { email: true } } },
    });

    if (premium?.users?.[0]?.email) {
      email = premium?.users?.[0]?.email;
    } else {
      const user = await prisma.user.findFirst({
        where: {
          email: order.attributes.user_email,
        },
        select: { email: true },
      });
      if (user?.email) {
        email = user?.email;
      }
    }

    if (!email) {
      console.log(
        "No user found for order:",
        order.attributes.customer_id,
        order.attributes.user_email,
      );
      continue;
    }

    console.log("Saving order for user:", email);

    await posthogCaptureEvent(email, "Upgraded to premium", {
      ...order.attributes,
      $set: { premium: true, premiumTier: "lifetime" },
    });
  }
}

async function posthogCaptureEvent(
  email: string,
  event: string,
  properties: Record<string, any>,
) {
  if (!posthogApiKey) throw new Error("No PostHog API key provided.");
  const client = new PostHog(posthogApiKey);
  client.capture({ distinctId: email, event, properties });
  await client.shutdownAsync();
}

main();
