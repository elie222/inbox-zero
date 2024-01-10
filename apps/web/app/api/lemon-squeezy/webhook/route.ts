import crypto from "crypto";
import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { env } from "@/env.mjs";
import { posthogCaptureEvent } from "@/utils/posthog";
import {
  cancelUserPremium,
  extendUserPremium,
  upgradeUserToPremium,
} from "@/utils/premium/server";
import { Payload } from "@/app/api/lemon-squeezy/webhook/types";

// https://docs.lemonsqueezy.com/help/webhooks#signing-requests
// https://gist.github.com/amosbastian/e403e1d8ccf4f7153f7840dd11a85a69
export const POST = withError(async (request: Request) => {
  const payload = await getPayload(request);
  const userId = payload.meta.custom_data?.user_id;

  // monthly/annual subscription
  if (payload.meta.event_name === "subscription_created") {
    if (!userId) throw new Error("No userId provided");
    return await subscriptionCreated(payload, userId);
  }

  // lifetime plan
  const productId = payload.data.attributes.first_order_item?.product_id;
  const isLifetimePlan = productId === env.NEXT_PUBLIC_LIFETIME_PLAN_ID;
  if (payload.meta.event_name === "order_created" && isLifetimePlan) {
    if (!userId) throw new Error("No userId provided");
    return await lifetimeOrder(payload, userId);
  }

  const lemonSqueezyCustomerId = payload.data.attributes.customer_id;
  const user = await prisma.user.findFirst({
    where: { lemonSqueezyCustomerId },
    select: { id: true },
  });

  if (!user)
    throw new Error(
      `No user found for lemonSqueezyCustomerId ${lemonSqueezyCustomerId}`,
    );

  // renewal
  if (payload.meta.event_name === "subscription_updated") {
    return await subscriptionUpdated(payload, user.id);
  }

  // cancellation
  if (payload.data.attributes.ends_at) {
    return await subscriptionCancelled(
      payload,
      user.id,
      payload.data.attributes.ends_at,
    );
  }

  return NextResponse.json({ ok: true });
});

async function getPayload(request: Request): Promise<Payload> {
  if (!env.LEMON_SQUEEZY_SIGNING_SECRET)
    throw new Error("No Lemon Squeezy signing secret provided.");

  const text = await request.text();
  const hmac = crypto.createHmac("sha256", env.LEMON_SQUEEZY_SIGNING_SECRET);
  const digest = Buffer.from(hmac.update(text).digest("hex"), "utf8");
  const signature = Buffer.from(
    request.headers.get("x-signature") as string,
    "utf8",
  );

  if (!crypto.timingSafeEqual(digest, signature))
    throw new Error("Invalid signature.");

  const payload: Payload = JSON.parse(text);

  return payload;
}

async function subscriptionCreated(payload: Payload, userId: string) {
  if (!payload.data.attributes.renews_at)
    throw new Error("No renews_at provided");

  const lemonSqueezyRenewsAt = new Date(payload.data.attributes.renews_at);

  const updatedUser = await upgradeUserToPremium({
    userId,
    isLifetime: false,
    lemonSqueezyRenewsAt,
    lemonSqueezySubscriptionId: payload.data.id,
    lemonSqueezyCustomerId: payload.data.attributes.customer_id,
  });

  if (updatedUser.email) {
    await posthogCaptureEvent(updatedUser.email, "Upgraded to premium", {
      ...payload.data.attributes,
      $set: { premium: true, premiumTier: "subscription" },
    });
  }

  return NextResponse.json({ ok: true });
}

async function lifetimeOrder(payload: Payload, userId: string) {
  const updatedUser = await upgradeUserToPremium({
    userId,
    isLifetime: true,
    lemonSqueezySubscriptionId: payload.data.id,
    lemonSqueezyCustomerId: payload.data.attributes.customer_id,
  });

  if (updatedUser.email) {
    await posthogCaptureEvent(updatedUser.email, "Upgraded to lifetime plan", {
      ...payload.data.attributes,
      $set: { premium: true, premiumTier: "lifetime" },
    });
  }

  return NextResponse.json({ ok: true });
}

async function subscriptionUpdated(payload: Payload, userId: string) {
  if (!payload.data.attributes.renews_at)
    throw new Error("No renews_at provided");

  const updatedUser = await extendUserPremium({
    userId,
    lemonSqueezyRenewsAt: new Date(payload.data.attributes.renews_at),
  });

  if (updatedUser.email) {
    await posthogCaptureEvent(
      updatedUser.email,
      "Premium subscription payment success",
      {
        ...payload.data.attributes,
        $set: { premium: true, premiumTier: "subscription" },
      },
    );
  }

  return NextResponse.json({ ok: true });
}

async function subscriptionCancelled(
  payload: Payload,
  userId: string,
  endsAt: NonNullable<Payload["data"]["attributes"]["ends_at"]>,
) {
  const updatedUser = await cancelUserPremium({
    userId,
    lemonSqueezyEndsAt: new Date(endsAt),
  });

  if (updatedUser.email) {
    await posthogCaptureEvent(
      updatedUser.email,
      "Cancelled premium subscription",
      {
        ...payload.data.attributes,
        $set: { premiumCancelled: true, premium: false },
      },
    );
  }

  return NextResponse.json({ ok: true });
}
