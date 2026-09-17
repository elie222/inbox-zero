import { after } from "next/server";
import { redirect } from "next/navigation";
import { syncStripeDataToDb } from "@/ee/billing/stripe/sync-stripe";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { trackStripeCheckoutCompleted } from "@/utils/posthog";
import {
  CONVERSION_EVENT_ID_PARAM,
  CONVERSION_EVENT_PARAM,
} from "@/utils/analytics/conversion-events";
import { buildRedirectUrl } from "@/utils/redirect";
import {
  CHECKOUT_RETURN_TO_PARAM,
  checkoutReturnToSchema,
} from "@/utils/actions/premium.validation";

export const GET = withAuth("stripe/success", async (request) => {
  const userId = request.auth.userId;
  const logger = request.logger;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      premium: { select: { stripeCustomerId: true } },
    },
  });

  if (!user?.premium?.stripeCustomerId) redirect("/premium");

  const searchParams = new URL(request.url).searchParams;
  const stripeCheckoutSessionId = searchParams.get("session_id");
  const returnTo = checkoutReturnToSchema.safeParse(
    searchParams.get(CHECKOUT_RETURN_TO_PARAM),
  );
  const destination = returnTo.success ? "/onboarding" : "/setup";

  after(async () => {
    if (!user?.email) return;
    await trackStripeCheckoutCompleted(user.email, {
      source: "success_redirect",
    });
  });

  await syncStripeDataToDb({
    customerId: user.premium.stripeCustomerId,
    logger,
  });

  redirect(
    buildRedirectUrl(destination, {
      [CONVERSION_EVENT_PARAM]: "trial_started",
      [CONVERSION_EVENT_ID_PARAM]: stripeCheckoutSessionId ?? undefined,
    }),
  );
});
