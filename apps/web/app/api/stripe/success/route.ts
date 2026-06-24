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

  after(async () => {
    if (!user?.email) return;
    trackStripeCheckoutCompleted(user.email, { source: "success_redirect" });
  });

  await syncStripeDataToDb({
    customerId: user.premium.stripeCustomerId,
    logger,
  });

  const stripeCheckoutSessionId =
    request.nextUrl.searchParams.get("session_id");

  redirect(
    buildRedirectUrl("/setup", {
      [CONVERSION_EVENT_PARAM]: "trial_started",
      [CONVERSION_EVENT_ID_PARAM]: stripeCheckoutSessionId ?? undefined,
    }),
  );
});
