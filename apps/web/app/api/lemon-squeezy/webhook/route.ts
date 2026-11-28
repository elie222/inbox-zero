import crypto from "node:crypto";
import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { env } from "@/env";
import {
  trackPaymentSuccess,
  trackSubscriptionCustom,
  trackSubscriptionTrialStarted,
  trackSwitchedPremiumPlan,
  trackTrialStarted,
  trackUpgradedToPremium,
} from "@/utils/posthog";
import {
  applyLemonSubscriptionEvent,
  upgradeToPremiumLemon,
} from "@/utils/premium/server";
import type { Payload } from "@/app/api/lemon-squeezy/webhook/types";
import { switchedPremiumPlan, startedTrial } from "@inboxzero/loops";
import { SafeError } from "@/utils/error";
import {
  findLemonSubscriptionTier,
  getLemonSubscriptionTier,
} from "@/app/(app)/premium/config";
import { getLemonSubscription } from "@/ee/billing/lemon";
import type { Logger } from "@/utils/logger";
import { secureCompare } from "@/utils/crypto-compare";

export const POST = withError("lemon-squeezy/webhook", async (request) => {
  const logger = request.logger;
  const payload = await getPayload(request);
  const userId = payload.meta.custom_data?.user_id;

  logger.info("Lemon Squeezy webhook", {
    event: payload.meta.event_name,
    userId,
  });

  // ignored events
  if (
    ["subscription_payment_success", "order_created"].includes(
      payload.meta.event_name,
    )
  ) {
    return NextResponse.json({ ok: true });
  }

  // monthly/annual subscription
  if (payload.meta.event_name === "subscription_created") {
    if (!userId) throw new SafeError("No userId provided");
    return await subscriptionCreated({ payload, userId, logger });
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

  // renewal
  if (payload.meta.event_name === "subscription_updated") {
    return await subscriptionUpdated({ payload, premiumId, logger });
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
    return await subscriptionPlanChanged({ payload, userId, logger });
  }

  // payment failed
  if (payload.meta.event_name === "subscription_payment_failed") {
    const subscriptionId = payload.data.attributes.subscription_id;
    if (!subscriptionId) throw new Error("No subscription_id provided");

    // Order this write using the subscription snapshot, since the invoice has its own timestamp.
    const { data, error } = await getLemonSubscription(subscriptionId);
    if (!data)
      throw new Error("Could not retrieve Lemon Squeezy subscription", {
        cause: error,
      });
    const snapshot = data.data.attributes;
    if (isPaymentPastDue(snapshot.status)) {
      await applySubscriptionSnapshot(premiumId, subscriptionId, snapshot);
    }
    return NextResponse.json({ ok: true });
  }

  // payment success
  if (payload.meta.event_name === "subscription_payment_success") {
    return await subscriptionPaymentSuccess({ payload, premiumId, logger });
  }

  // cancelled or expired
  if (
    payload.data.type === "subscriptions" &&
    payload.data.attributes.ends_at
  ) {
    await applySubscriptionSnapshot(
      premiumId,
      Number(payload.data.id),
      payload.data.attributes,
    );
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
  const digest = hmac.update(text).digest("hex");
  const signature = request.headers.get("x-signature");

  if (!secureCompare(digest, signature)) throw new Error("Invalid signature.");

  const payload: Payload = JSON.parse(text);

  return payload;
}

async function subscriptionCreated({
  payload,
  userId,
  logger,
}: {
  payload: Payload;
  userId: string;
  logger: Logger;
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
    logger,
  );

  // null: a newer event was already applied, so skip the side effects too
  if (!updatedPremium) return NextResponse.json({ ok: true });

  const email = getEmailFromPremium(updatedPremium);
  if (email) {
    try {
      await Promise.allSettled([
        payload.data.attributes.status === "on_trial"
          ? trackTrialStarted(email, payload.data.attributes)
          : trackUpgradedToPremium(email, payload.data.attributes),
        startedTrial(email, tier),
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
  logger,
}: {
  payload: Payload;
  userId: string;
  logger: Logger;
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
    logger,
  );

  // null: a newer event was already applied, so skip the side effects too
  if (!updatedPremium) return NextResponse.json({ ok: true });

  const email = getEmailFromPremium(updatedPremium);
  if (email) {
    try {
      await Promise.allSettled([
        trackSwitchedPremiumPlan(
          email,
          payload.data.attributes.status,
          payload.data.attributes,
        ),
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

async function handleSubscriptionCreated(
  payload: Payload,
  userId: string,
  logger: Logger,
) {
  const { lemonSqueezyRenewsAt, eventAt, isCutoff } = subscriptionExpiry(
    payload.data.attributes,
  );

  if (!payload.data.attributes.first_subscription_item)
    throw new Error("No subscription item");

  logger.info("Subscription created", {
    lemonSqueezyRenewsAt,
    lemonSqueezySubscriptionId:
      payload.data.attributes.first_subscription_item.subscription_id,
    lemonSqueezySubscriptionItemId:
      payload.data.attributes.first_subscription_item.id,
  });

  const tier = getLemonSubscriptionTier({
    variantId: payload.data.attributes.variant_id,
  });

  const updatedPremium = await upgradeToPremiumLemon({
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
    eventAt,
    isCutoff,
  });

  return { updatedPremium, tier };
}

async function subscriptionUpdated({
  payload,
  premiumId,
  logger,
}: {
  payload: Payload;
  premiumId: string;
  logger: Logger;
}) {
  const updatedPremium = await applySubscriptionSnapshot(
    premiumId,
    Number(payload.data.id),
    payload.data.attributes,
  );

  if (!updatedPremium) {
    logger.info("Ignored an out-of-order subscription_updated event", {
      premiumId,
    });
    return NextResponse.json({ ok: true });
  }

  const email = getEmailFromPremium(updatedPremium);

  if (email) {
    if (payload.data.attributes.status === "on_trial") {
      await trackSubscriptionTrialStarted(email, payload.data.attributes);
    } else {
      await trackSubscriptionCustom(
        email,
        payload.data.attributes.status,
        payload.data.attributes,
      );
    }
  }

  return NextResponse.json({ ok: true });
}

async function subscriptionPaymentSuccess({
  payload,
  premiumId,
  logger,
}: {
  payload: Payload;
  premiumId: string;
  logger: Logger;
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
  await trackPaymentSuccess({
    email,
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

type SubscriptionSnapshot = Pick<
  Payload["data"]["attributes"],
  | "status"
  | "renews_at"
  | "ends_at"
  | "updated_at"
  | "variant_id"
  | "product_id"
> & { first_subscription_item?: { id: number } | null };

function isPaymentPastDue(status: string) {
  return status === "past_due" || status === "unpaid";
}

function subscriptionExpiry(snapshot: SubscriptionSnapshot) {
  const cutoffAt =
    snapshot.ends_at ??
    (isPaymentPastDue(snapshot.status) ? snapshot.updated_at : null);
  const expiresAt = cutoffAt ?? snapshot.renews_at;
  if (!expiresAt) throw new Error("No subscription expiry provided");

  return {
    eventAt: new Date(snapshot.updated_at),
    lemonSqueezyRenewsAt: new Date(expiresAt),
    isCutoff: cutoffAt !== null,
  };
}

async function applySubscriptionSnapshot(
  premiumId: string,
  subscriptionId: number,
  snapshot: SubscriptionSnapshot,
) {
  const tier = findLemonSubscriptionTier(snapshot.variant_id);
  return await applyLemonSubscriptionEvent({
    premiumId,
    subscriptionId,
    variantId: snapshot.variant_id,
    ...subscriptionExpiry(snapshot),
    plan: tier
      ? {
          tier,
          lemonSqueezyVariantId: snapshot.variant_id,
          lemonSqueezyProductId: snapshot.product_id,
          lemonSqueezySubscriptionItemId: snapshot.first_subscription_item?.id,
        }
      : undefined,
  });
}
