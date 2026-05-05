import { PostHog } from "posthog-node";
import type { Properties } from "posthog-js";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import { hash } from "@/utils/hash";
import prisma from "@/utils/prisma";
import { redis } from "@/utils/redis";

const logger = createScopedLogger("posthog");
let posthogLlmClient: PostHog | undefined;

export function getPosthogLlmClient() {
  if (!env.NEXT_PUBLIC_POSTHOG_KEY) return;

  if (!posthogLlmClient) {
    const host = env.NEXT_PUBLIC_POSTHOG_API_HOST?.startsWith("http")
      ? env.NEXT_PUBLIC_POSTHOG_API_HOST
      : undefined;

    posthogLlmClient = new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY, {
      ...(host ? { host } : {}),
      flushAt: 1,
      flushInterval: 0,
    });
  }

  return posthogLlmClient;
}

export function isPosthogLlmEvalApproved(email: string) {
  if (env.NODE_ENV !== "development") return false;

  const approvedEmails = getPosthogLlmEvalApprovedEmails();
  if (!approvedEmails.length) return false;

  return approvedEmails.includes(email.trim().toLowerCase());
}

async function getPosthogUserId(options: { email: string }) {
  const personsEndpoint = new URL(
    `https://app.posthog.com/api/projects/${env.POSTHOG_PROJECT_ID}/persons/`,
  );
  personsEndpoint.searchParams.set("distinct_id", options.email);

  // 1. find user id by distinct id
  const responseGet = await fetch(personsEndpoint.toString(), {
    headers: {
      Authorization: `Bearer ${env.POSTHOG_API_SECRET}`,
    },
  });

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

export async function aliasPosthogUser({
  oldEmail,
  newEmail,
}: {
  oldEmail: string;
  newEmail: string;
}) {
  if (!env.NEXT_PUBLIC_POSTHOG_KEY) {
    logger.warn("NEXT_PUBLIC_POSTHOG_KEY not set");
    return;
  }

  try {
    const client = new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY);
    // Alias links the old distinct ID to the new distinct ID
    // This ensures all historical events remain connected
    client.alias({ distinctId: newEmail, alias: oldEmail });
    await client.shutdown();
    logger.info("PostHog user aliased", {
      oldEmail: hash(oldEmail),
      newEmail: hash(newEmail),
    });
  } catch (error) {
    logger.error("Error aliasing PostHog user", { error });
  }
}

export async function posthogCaptureEvent(
  email: string,
  event: string,
  // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
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

export async function trackStripeCheckoutCreated(
  email: string,
  properties?: Properties,
) {
  return posthogCaptureEvent(email, "Stripe checkout created", properties);
}

export async function trackStripeCheckoutCompleted(
  email: string,
  properties?: Properties,
) {
  return posthogCaptureEvent(email, "Stripe checkout completed", properties);
}

export async function trackError({
  email,
  emailAccountId,
  errorType,
  type,
  url,
}: {
  email: string;
  emailAccountId: string;
  errorType: string;
  type: "api" | "action";
  url: string;
}) {
  return posthogCaptureEvent(email, errorType, {
    $set: { isError: true, type, url, emailAccountId },
  });
}

// biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
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

// biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
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
  // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
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

export async function trackBillingTrialStarted(
  email: string,
  attributes: Properties,
) {
  return posthogCaptureEvent(email, "billing_trial_started", {
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
  // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
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
  // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
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
  // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
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
  // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
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

// biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
export async function trackStripeEvent(email: string, data: any) {
  return posthogCaptureEvent(email, "Stripe event", data);
}

export async function trackUserDeletionRequested(userId: string) {
  return posthogCaptureEvent(
    "anonymous",
    "User deletion requested",
    { userId },
    false,
  );
}

export async function trackUserDeleted(userId: string) {
  return posthogCaptureEvent("anonymous", "User deleted", { userId }, false);
}

export const FIRST_TIME_EVENTS = {
  FIRST_AUTOMATED_RULE_RUN: "First automated rule run",
  FIRST_DRAFT_SENT: "First AI draft sent",
  FIRST_CHAT_MESSAGE: "First chat message",
} as const;

type FirstTimeEvent =
  (typeof FIRST_TIME_EVENTS)[keyof typeof FIRST_TIME_EVENTS];

const firedFirstTimeEvents = new Set<string>();

/**
 * Uses User.email as distinctId (not EmailAccount.email) so the event attaches
 * to the same PostHog person as signup/billing events.
 */
export async function trackFirstTimeEvent({
  emailAccountId,
  event,
  properties,
}: {
  emailAccountId: string;
  event: FirstTimeEvent;
  properties?: Record<string, unknown>;
}) {
  const key = `first-event:${emailAccountId}:${event}`;
  if (firedFirstTimeEvents.has(key)) return;

  try {
    const firstTime = await redis.set(key, "1", { nx: true });
    firedFirstTimeEvents.add(key);
    if (!firstTime) return;

    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { user: { select: { email: true } } },
    });
    const userEmail = emailAccount?.user?.email;
    if (!userEmail) return;

    await posthogCaptureEvent(userEmail, event, {
      emailAccountId,
      ...properties,
    });
  } catch (error) {
    logger.error("Error tracking first-time event", { error, event });
  }
}

export async function trackOnboardingAnswer(
  email: string,
  answers: {
    surveyFeatures?: string[];
    surveyRole?: string;
    surveyGoal?: string;
    surveyCompanySize?: number;
    surveySource?: string;
    surveyImprovements?: string;
  },
) {
  return posthogCaptureEvent(email, "Onboarding answer submitted", {
    ...answers,
    $set: answers,
  });
}

function getPosthogLlmEvalApprovedEmails() {
  return (
    env.POSTHOG_LLM_EVALS_APPROVED_EMAILS?.split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean) ?? []
  );
}
