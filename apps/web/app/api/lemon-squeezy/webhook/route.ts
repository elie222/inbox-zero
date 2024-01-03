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

  const userId = payload.meta.custom_data?.user_id;

  // monthly/annual subscription
  if (payload.meta.event_name === "subscription_created") {
    if (!userId) throw new Error("No userId provided");
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
      await posthogCaptureEvent(
        updatedUser.email,
        "Upgraded to premium",
        payload.data.attributes,
      );
    }

    return NextResponse.json({ ok: true });
  }

  // lifetime plan
  const productId = payload.data.attributes.first_order_item?.product_id;
  const isLifetimePlan = productId === env.NEXT_PUBLIC_LIFETIME_PLAN_ID;
  if (payload.meta.event_name === "order_created" && isLifetimePlan) {
    if (!userId) throw new Error("No userId provided");

    const updatedUser = await upgradeUserToPremium({
      userId,
      isLifetime: true,
      lemonSqueezySubscriptionId: payload.data.id,
      lemonSqueezyCustomerId: payload.data.attributes.customer_id,
    });

    if (updatedUser.email) {
      await posthogCaptureEvent(
        updatedUser.email,
        "Upgraded to premium",
        payload.data.attributes,
      );
    }

    return NextResponse.json({ ok: true });
  }

  const lemonSqueezyCustomerId = payload.data.attributes.customer_id;
  const user = await prisma.user.findFirst({
    where: { lemonSqueezyCustomerId },
    select: { id: true },
  });

  if (!user) throw new Error("No user found for lemonSqueezyCustomerId");

  // renewal
  if (payload.meta.event_name === "subscription_payment_success") {
    if (!payload.data.attributes.renews_at)
      throw new Error("No renews_at provided");

    const updatedUser = await extendUserPremium({
      userId: user.id,
      lemonSqueezyRenewsAt: new Date(payload.data.attributes.renews_at),
    });

    if (updatedUser.email) {
      await posthogCaptureEvent(
        updatedUser.email,
        "Premium subscription payment success",
        payload.data.attributes,
      );
    }

    return NextResponse.json({ ok: true });
  }

  // cancellation
  if (payload.data.attributes.ends_at) {
    const updatedUser = await cancelUserPremium({
      userId: user.id,
      lemonSqueezyEndsAt: new Date(payload.data.attributes.ends_at),
    });

    if (updatedUser.email) {
      await posthogCaptureEvent(
        updatedUser.email,
        "Cancelled premium subscription",
        payload.data.attributes,
      );
    }
  }

  return NextResponse.json({ ok: true });
});
