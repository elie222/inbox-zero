import crypto from "node:crypto";
import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { env } from "@/env";
import { posthogCaptureEvent } from "@/utils/posthog";
import {
  cancelPremium,
  editEmailAccountsAccess,
  extendPremium,
  upgradeToPremium,
} from "@/utils/premium/server";
import type { Payload } from "@/app/api/lemon-squeezy/webhook/types";
import { PremiumTier } from "@prisma/client";
import {
  cancelledPremium,
  switchedPremiumPlan,
  upgradedToPremium,
} from "@inboxzero/loops";
import { SafeError } from "@/utils/error";
import { getSubscriptionTier } from "@/app/(app)/premium/config";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("Lemon Squeezy Webhook");

export const POST = withError(async (request) => {
  const payload = await getPayload(request);
  const userId = payload.meta.custom_data?.user_id;

  logger.info("Lemon Squeezy webhook", {
    event: payload.meta.event_name,
    userId,
  });

  // ignored events
  if (["subscription_payment_success"].includes(payload.meta.event_name)) {
    return NextResponse.json({ ok: true });
  }

  // monthly/annual subscription
  if (payload.meta.event_name === "subscription_created") {
    if (!userId) throw new SafeError("No userId provided");
    return await subscriptionCreated({ payload, userId });
  }

  const variant = payload.data.attributes.first_order_item?.variant_id;
  const isLifetimePlan = variant === env.NEXT_PUBLIC_LIFETIME_VARIANT_ID;

  // lifetime plan
  if (payload.meta.event_name === "order_created" && isLifetimePlan) {
    if (!userId) throw new SafeError("No userId provided");
    return await lifetimeOrder({ payload, userId });
  }

  const lemonSqueezyCustomerId = payload.data.attributes.customer_id;

  const premium = await prisma.premium.findFirst({
    where: { lemonSqueezyCustomerId },
    select: { id: true },
  });
  const premiumId = premium?.id;

  if (!premiumId) {
    logger.warn("No user found", { lemonSqueezyCustomerId });

    return NextResponse.json({ ok: true });
  }

  // extra seats for lifetime plan
  const isLifetimeSeatPlan =
    variant === env.NEXT_PUBLIC_LIFETIME_EXTRA_SEATS_VARIANT_ID;
  if (payload.meta.event_name === "order_created") {
    if (isLifetimeSeatPlan) {
      return await lifetimeSeatOrder({ payload, premiumId });
    }
    // license plan - not handled here
    return NextResponse.json({ ok: true });
  }

  // renewal
  if (payload.meta.event_name === "subscription_updated") {
    return await subscriptionUpdated({ payload, premiumId });
  }

  // changed plan
  if (payload.meta.event_name === "subscription_plan_changed") {
    if (!userId) {
      logger.error("No userId provided", {
        webhookId: payload.data.id,
        event: payload.meta.event_name,
      });
      throw new SafeError("No userId provided");
    }
    return await subscriptionPlanChanged({ payload, userId });
  }

  // payment failed
  if (payload.meta.event_name === "subscription_payment_failed") {
    return await subscriptionCancelled({
      payload,
      premiumId,
      endsAt: new Date().toISOString(),
      variantId: payload.data.attributes.variant_id,
    });
  }

  // payment success
  if (payload.meta.event_name === "subscription_payment_success") {
    return await subscriptionPaymentSuccess({ payload, premiumId });
  }

  // cancelled or expired
  if (payload.data.attributes.ends_at) {
    return await subscriptionCancelled({
      payload,
      premiumId,
      endsAt: payload.data.attributes.ends_at,
      variantId: payload.data.attributes.variant_id,
    });
  }

  return NextResponse.json({ ok: true });
});

// https://docs.lemonsqueezy.com/help/webhooks#signing-requests
// https://gist.github.com/amosbastian/e403e1d8ccf4f7153f7840dd11a85a69
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

async function subscriptionCreated({
  payload,
  userId,
}: {
  payload: Payload;
  userId: string;
}) {
  logger.info("Subscription created", {
    lemonSqueezyRenewsAt:
      payload.data.attributes.renews_at &&
      new Date(payload.data.attributes.renews_at),
    userId,
  });

  const { updatedPremium, tier } = await handleSubscriptionCreated(
    payload,
    userId,
  );

  const email = getEmailFromPremium(updatedPremium);
  if (email) {
    try {
      await Promise.allSettled([
        posthogCaptureEvent(
          email,
          payload.data.attributes.status === "on_trial"
            ? "Premium trial started"
            : "Upgraded to premium",
          {
            ...payload.data.attributes,
            $set: {
              premium: true,
              premiumTier: "subscription",
              premiumStatus: payload.data.attributes.status,
            },
          },
        ),
        upgradedToPremium(email, tier),
      ]);
    } catch (error) {
      logger.error("Error capturing event", {
        error,
        webhookId: payload.data.id,
        event: payload.meta.event_name,
      });
    }
  }

  return NextResponse.json({ ok: true });
}

async function subscriptionPlanChanged({
  payload,
  userId,
}: {
  payload: Payload;
  userId: string;
}) {
  logger.info("Subscription plan changed", {
    lemonSqueezyRenewsAt:
      payload.data.attributes.renews_at &&
      new Date(payload.data.attributes.renews_at),
    userId,
  });

  const { updatedPremium, tier } = await handleSubscriptionCreated(
    payload,
    userId,
  );

  const email = getEmailFromPremium(updatedPremium);
  if (email) {
    try {
      await Promise.allSettled([
        posthogCaptureEvent(email, "Switched premium plan", {
          ...payload.data.attributes,
          $set: {
            premium: true,
            premiumTier: "subscription",
            premiumStatus: payload.data.attributes.status,
          },
        }),
        switchedPremiumPlan(email, tier),
      ]);
    } catch (error) {
      logger.error("Error capturing event", {
        error,
        webhookId: payload.data.id,
        event: payload.meta.event_name,
      });
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleSubscriptionCreated(payload: Payload, userId: string) {
  if (!payload.data.attributes.renews_at)
    throw new Error("No renews_at provided");

  const lemonSqueezyRenewsAt = new Date(payload.data.attributes.renews_at);

  if (!payload.data.attributes.first_subscription_item)
    throw new Error("No subscription item");

  logger.info("Subscription created", {
    lemonSqueezyRenewsAt: lemonSqueezyRenewsAt,
    lemonSqueezySubscriptionId:
      payload.data.attributes.first_subscription_item.subscription_id,
    lemonSqueezySubscriptionItemId:
      payload.data.attributes.first_subscription_item.id,
  });

  const tier = getSubscriptionTier({
    variantId: payload.data.attributes.variant_id,
  });

  const updatedPremium = await upgradeToPremium({
    userId,
    tier,
    lemonSqueezyRenewsAt,
    lemonSqueezySubscriptionId:
      payload.data.attributes.first_subscription_item.subscription_id,
    lemonSqueezySubscriptionItemId:
      payload.data.attributes.first_subscription_item.id,
    lemonSqueezyOrderId: null,
    lemonSqueezyCustomerId: payload.data.attributes.customer_id,
    lemonSqueezyProductId: payload.data.attributes.product_id,
    lemonSqueezyVariantId: payload.data.attributes.variant_id,
  });

  return { updatedPremium, tier };
}

async function lifetimeOrder({
  payload,
  userId,
}: {
  payload: Payload;
  userId: string;
}) {
  if (!payload.data.attributes.first_order_item)
    throw new Error("No order item");

  logger.info("Lifetime order", {
    lemonSqueezyOrderId: payload.data.attributes.first_order_item.order_id,
    lemonSqueezyCustomerId: payload.data.attributes.customer_id,
    lemonSqueezyProductId: payload.data.attributes.product_id,
    lemonSqueezyVariantId: payload.data.attributes.variant_id,
  });

  const updatedPremium = await upgradeToPremium({
    userId,
    tier: PremiumTier.LIFETIME,
    lemonSqueezySubscriptionId: null,
    lemonSqueezySubscriptionItemId: null,
    lemonSqueezyRenewsAt: null,
    lemonSqueezyOrderId: payload.data.attributes.first_order_item.order_id,
    lemonSqueezyCustomerId: payload.data.attributes.customer_id,
    lemonSqueezyProductId: payload.data.attributes.product_id,
    lemonSqueezyVariantId: payload.data.attributes.variant_id,
  });

  const email = getEmailFromPremium(updatedPremium);
  if (email) {
    await Promise.allSettled([
      posthogCaptureEvent(email, "Upgraded to lifetime plan", {
        ...payload.data.attributes,
        $set: { premium: true, premiumTier: "lifetime" },
      }),
      upgradedToPremium(email, PremiumTier.LIFETIME),
    ]);
  }

  return NextResponse.json({ ok: true });
}

async function lifetimeSeatOrder({
  payload,
  premiumId,
}: {
  payload: Payload;
  premiumId: string;
}) {
  if (!payload.data.attributes.first_order_item)
    throw new Error("No order item");

  logger.info("Lifetime seat order", {
    quantity: payload.data.attributes.first_order_item.quantity,
    premiumId,
  });

  const updatedPremium = await editEmailAccountsAccess({
    premiumId,
    count: payload.data.attributes.first_order_item.quantity,
  });

  const email = updatedPremium && getEmailFromPremium(updatedPremium);
  if (email) {
    await posthogCaptureEvent(email, "Added seats to lifetime plan", {
      ...payload.data.attributes,
      $set: { premium: true, premiumTier: "lifetime" },
    });
  }

  return NextResponse.json({ ok: true });
}

async function subscriptionUpdated({
  payload,
  premiumId,
}: {
  payload: Payload;
  premiumId: string;
}) {
  if (!payload.data.attributes.renews_at)
    throw new Error("No renews_at provided");

  logger.info("Subscription updated", {
    lemonSqueezyRenewsAt: new Date(payload.data.attributes.renews_at),
    premiumId,
  });

  const updatedPremium = await extendPremium({
    premiumId,
    lemonSqueezyRenewsAt: new Date(payload.data.attributes.renews_at),
  });

  const email = getEmailFromPremium(updatedPremium);

  if (email) {
    const event =
      payload.data.attributes.status === "on_trial"
        ? "Premium subscription trial started"
        : `Premium subscription ${payload.data.attributes.status}`;

    await posthogCaptureEvent(email, event, {
      ...payload.data.attributes,
      $set: {
        premium: true,
        premiumTier: "subscription",
        premiumStatus: payload.data.attributes.status,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

async function subscriptionCancelled({
  payload,
  premiumId,
  endsAt,
  variantId,
}: {
  payload: Payload;
  premiumId: string;
  endsAt: NonNullable<Payload["data"]["attributes"]["ends_at"]>;
  variantId: NonNullable<Payload["data"]["attributes"]["variant_id"]>;
}) {
  logger.info("Subscription cancelled", {
    endsAt: new Date(endsAt),
    variantId,
    premiumId,
  });

  const updatedPremium = await cancelPremium({
    premiumId,
    variantId,
    lemonSqueezyEndsAt: new Date(endsAt),
    expired:
      payload.data.attributes.status === "expired" ||
      new Date(endsAt) < new Date(),
  });

  if (!updatedPremium) return NextResponse.json({ ok: true });

  const email = getEmailFromPremium(updatedPremium);
  if (email) {
    await Promise.allSettled([
      posthogCaptureEvent(email, "Cancelled premium subscription", {
        ...payload.data.attributes,
        $set: {
          premiumCancelled: true,
          premium: false,
          premiumStatus: payload.data.attributes.status,
        },
      }),
      cancelledPremium(email),
    ]);
  }

  return NextResponse.json({ ok: true });
}

async function subscriptionPaymentSuccess({
  payload,
  premiumId,
}: {
  payload: Payload;
  premiumId: string;
}) {
  logger.info("Subscription payment success", {
    premiumId,
    lemonSqueezyId: payload.data.id,
    lemonSqueezyType: payload.data.type,
  });

  if (payload.data.attributes.status !== "paid") {
    throw new Error(
      `Unexpected status for subscription payment success: ${payload.data.attributes.status}`,
    );
  }

  const premium = await prisma.premium.findUnique({
    where: { id: premiumId },
    select: {
      admins: { select: { email: true } },
      users: { select: { email: true } },
    },
  });

  const email = premium?.admins?.[0]?.email || premium?.users?.[0]?.email;
  if (!email) throw new Error("No email found");
  await posthogCaptureEvent(email, "Payment success", {
    totalPaidUSD: payload.data.attributes.total_usd,
    lemonSqueezyId: payload.data.id,
    lemonSqueezyType: payload.data.type,
  });
  return NextResponse.json({ ok: true });
}

function getEmailFromPremium(premium: {
  users: Array<{ email: string | null }>;
}) {
  return premium.users?.[0]?.email;
}
