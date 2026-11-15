import { Suspense } from "react";
import { after } from "next/server";
import { redirect } from "next/navigation";
import {
  ConversionAnalyticsScript,
  ConversionQueryParamEvents,
} from "@/components/ConversionAnalytics";
import { PageHeading, TypographyP } from "@/components/Typography";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { CardBasic } from "@/components/ui/card";
import { getStripe } from "@/ee/billing/stripe";
import { syncStripeDataToDb } from "@/ee/billing/stripe/sync-stripe";
import {
  CONVERSION_EVENT_ID_PARAM,
  CONVERSION_EVENT_PARAM,
} from "@/utils/analytics/conversion-events";
import { createScopedLogger } from "@/utils/logger";
import { trackStripeCheckoutCompleted } from "@/utils/posthog";
import prisma from "@/utils/prisma";
import { buildRedirectUrl } from "@/utils/redirect";

const logger = createScopedLogger("checkout-complete");

// Checkouts started in the desktop app finish in the system browser, which is
// usually signed out. Stripe sends them here instead of the authenticated
// success route, and the app picks up the new plan on its own.
export default async function CheckoutCompletePage(props: {
  searchParams: Promise<{ session_id?: string; status?: string }>;
}) {
  const { session_id: sessionId, status } = await props.searchParams;

  if (sessionId) {
    const outcome = await syncCompletedCheckout(sessionId);
    redirect(
      buildRedirectUrl("/checkout-complete", {
        status: outcome,
        ...(outcome === "trial"
          ? {
              [CONVERSION_EVENT_PARAM]: "trial_started",
              [CONVERSION_EVENT_ID_PARAM]: sessionId,
            }
          : {}),
      }),
    );
  }

  const { title, description } = getCopy(status);

  return (
    <BasicLayout>
      <Suspense>
        <ConversionQueryParamEvents />
      </Suspense>
      <ConversionAnalyticsScript />
      <div className="px-4 pb-40 pt-40">
        <CardBasic className="mx-auto max-w-xl text-center">
          <PageHeading>{title}</PageHeading>
          <TypographyP className="mt-2">{description}</TypographyP>
        </CardBasic>
      </div>
    </BasicLayout>
  );
}

type CheckoutOutcome = "trial" | "subscribed" | "unconfirmed";

async function syncCompletedCheckout(
  sessionId: string,
): Promise<CheckoutOutcome> {
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });
    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id;
    if (session.status !== "complete" || !customerId) return "unconfirmed";

    await syncStripeDataToDb({ customerId, logger });

    const user = await prisma.user.findFirst({
      where: { premium: { stripeCustomerId: customerId } },
      select: { email: true },
    });
    if (user) {
      after(() =>
        trackStripeCheckoutCompleted(user.email, {
          source: "desktop_checkout_complete",
        }),
      );
    }

    const subscription =
      typeof session.subscription === "object" ? session.subscription : null;
    return subscription?.status === "trialing" ? "trial" : "subscribed";
  } catch (error) {
    // The Stripe webhook still syncs the plan, so the page can carry on.
    logger.error("Failed to sync a desktop checkout", { error });
    return "unconfirmed";
  }
}

function getCopy(status: string | undefined) {
  switch (status) {
    case "canceled":
      return {
        title: "Checkout canceled",
        description:
          "No charge was made. Switch back to the Inbox Zero app to pick a plan.",
      };
    case "trial":
      return {
        title: "You're all set",
        description:
          "Your trial has started. Switch back to the Inbox Zero app, which will open your inbox.",
      };
    case "subscribed":
      return {
        title: "You're all set",
        description:
          "Your subscription is active. Switch back to the Inbox Zero app, which will open your inbox.",
      };
    default:
      return {
        title: "Switch back to Inbox Zero",
        description:
          "We're still confirming your checkout. Switch back to the Inbox Zero app, which will open your inbox once your plan is active.",
      };
  }
}
