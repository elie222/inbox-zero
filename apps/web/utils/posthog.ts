import { PostHog } from "posthog-node";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("posthog");

async function getPosthogUserId(options: { email: string }) {
  const personsEndpoint = `https://app.posthog.com/api/projects/${env.POSTHOG_PROJECT_ID}/persons/`;

  // 1. find user id by distinct id
  const responseGet = await fetch(
    `${personsEndpoint}?distinct_id=${options.email}`,
    {
      headers: {
        Authorization: `Bearer ${env.POSTHOG_API_SECRET}`,
      },
    },
  );

  const resGet: { results: { id: string; distinct_ids: string[] }[] } =
    await responseGet.json();

  if (!resGet.results?.[0]) {
    logger.error("No Posthog user found with distinct id", {
      email: options.email,
    });
    return;
  }

  if (!resGet.results[0].distinct_ids?.includes(options.email)) {
    // double check distinct id
    throw new Error(
      `Distinct id ${resGet.results[0].distinct_ids} does not include ${options.email}`,
    );
  }

  const userId = resGet.results[0].id;

  return userId;
}

export async function deletePosthogUser(options: { email: string }) {
  if (!env.POSTHOG_API_SECRET || !env.POSTHOG_PROJECT_ID) {
    logger.warn("Posthog env variables not set");
    return;
  }

  // 1. find user id by distinct id
  const userId = await getPosthogUserId({ email: options.email });

  if (!userId) {
    logger.warn("No Posthog user found with distinct id", {
      email: options.email,
    });
    return;
  }

  const personsEndpoint = `https://app.posthog.com/api/projects/${env.POSTHOG_PROJECT_ID}/persons/`;

  // 2. delete user by id
  try {
    await fetch(`${personsEndpoint}${userId}/?delete_events=true`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${env.POSTHOG_API_SECRET}`,
      },
    });
  } catch (error) {
    logger.error("Error deleting Posthog user", { error });
  }
}

export async function posthogCaptureEvent(
  email: string,
  event: string,
  properties?: Record<string, any>,
  sendFeatureFlags?: boolean,
) {
  try {
    if (!env.NEXT_PUBLIC_POSTHOG_KEY) {
      logger.warn("NEXT_PUBLIC_POSTHOG_KEY not set");
      return;
    }

    const client = new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY);
    client.capture({
      distinctId: email,
      event,
      properties,
      sendFeatureFlags,
    });
    await client.shutdown();
  } catch (error) {
    logger.error("Error capturing PostHog event", { error });
  }
}

export async function trackUserSignedUp(email: string, createdAt: Date) {
  return posthogCaptureEvent(
    email,
    "User signed up",
    {
      $set_once: { createdAt },
    },
    true,
  );
}

export async function trackStripeCustomerCreated(
  email: string,
  stripeCustomerId: string,
) {
  return posthogCaptureEvent(
    email,
    "Stripe customer created",
    {
      $set_once: { stripeCustomerId },
    },
    true,
  );
}

export async function trackStripeCheckoutCreated(email: string) {
  return posthogCaptureEvent(email, "Stripe checkout created");
}

export async function trackStripeCheckoutCompleted(email: string) {
  return posthogCaptureEvent(email, "Stripe checkout completed");
}

export async function trackError({
  email,
  errorType,
  type,
  url,
}: {
  email: string;
  errorType: string;
  type: "api" | "action";
  url: string;
}) {
  return posthogCaptureEvent(email, errorType, {
    $set: { isError: true, type, url },
  });
}

export async function trackTrialStarted(email: string, attributes: any) {
  return posthogCaptureEvent(email, "Premium trial started", {
    ...attributes,
    $set: {
      premium: true,
      premiumTier: "subscription",
      premiumStatus: "on_trial",
    },
  });
}

export async function trackUpgradedToPremium(email: string, attributes: any) {
  return posthogCaptureEvent(email, "Upgraded to premium", {
    ...attributes,
    $set: {
      premium: true,
      premiumTier: "subscription",
      premiumStatus: "active",
    },
  });
}

export async function trackSubscriptionTrialStarted(
  email: string,
  attributes: any,
) {
  return posthogCaptureEvent(email, "Premium subscription trial started", {
    ...attributes,
    $set: {
      premium: true,
      premiumTier: "subscription",
      premiumStatus: "on_trial",
    },
  });
}

export async function trackSubscriptionCustom(
  email: string,
  status: string,
  attributes: any,
) {
  const event = `Premium subscription ${status}`;

  return posthogCaptureEvent(email, event, {
    ...attributes,
    $set: {
      premium: true,
      premiumTier: "subscription",
      premiumStatus: status,
    },
  });
}

export async function trackSubscriptionStatusChanged(
  email: string,
  attributes: any,
) {
  return posthogCaptureEvent(email, "Subscription status changed", {
    ...attributes,
    $set: {
      premium: true,
      premiumTier: "subscription",
      premiumStatus: attributes.status,
    },
  });
}

export async function trackSubscriptionCancelled(
  email: string,
  status: string,
  attributes: any,
) {
  return posthogCaptureEvent(email, "Cancelled premium subscription", {
    ...attributes,
    $set: {
      premiumCancelled: true,
      premium: false,
      premiumStatus: status,
    },
  });
}

export async function trackSwitchedPremiumPlan(
  email: string,
  status: string,
  attributes: any,
) {
  return posthogCaptureEvent(email, "Switched premium plan", {
    ...attributes,
    $set: {
      premium: true,
      premiumTier: "subscription",
      premiumStatus: status,
    },
  });
}

export async function trackPaymentSuccess({
  email,
  totalPaidUSD,
  lemonSqueezyId,
  lemonSqueezyType,
}: {
  email: string;
  totalPaidUSD: number | undefined;
  lemonSqueezyId: string;
  lemonSqueezyType: string;
}) {
  return posthogCaptureEvent(email, "Payment success", {
    totalPaidUSD,
    lemonSqueezyId,
    lemonSqueezyType,
  });
}

export async function trackStripeEvent(email: string, data: any) {
  return posthogCaptureEvent(email, "Stripe event", data);
}

export async function trackUserDeleted(userId: string) {
  return posthogCaptureEvent("anonymous", "User deleted", { userId }, false);
}
