import { after } from "next/server";
import { redirect } from "next/navigation";
import { syncStripeDataToDb } from "@/ee/billing/stripe/sync-stripe";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { trackStripeCheckoutCompleted } from "@/utils/posthog";

export const GET = withAuth(async (request) => {
  const userId = request.auth.userId;

  after(async () => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) return;
    trackStripeCheckoutCompleted(user.email);
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { premium: { select: { stripeCustomerId: true } } },
  });

  if (!user?.premium?.stripeCustomerId) redirect("/premium");

  await syncStripeDataToDb({ customerId: user.premium.stripeCustomerId });

  redirect("/setup");
});
