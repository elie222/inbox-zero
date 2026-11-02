// Copies Stripe customer portal cancellation survey answers onto Premium for
// answers given before the Stripe sync stored them. Safe to re-run.
//
// Run with: `pnpm --filter inbox-zero-ai exec tsx scripts/backfill-cancellation-feedback.ts`
// Apply changes with: `pnpm --filter inbox-zero-ai exec tsx scripts/backfill-cancellation-feedback.ts --apply`

import "dotenv/config";
import { getStripe } from "@/ee/billing/stripe";
import prisma from "@/utils/prisma";

async function main() {
  const apply = process.argv.includes("--apply");
  const stripe = getStripe();

  let matched = 0;
  let unmatched = 0;

  // Premium tracks only each customer's latest subscription, so answers on older subscriptions have nowhere to go.
  for await (const subscription of stripe.subscriptions.list({
    status: "all",
    limit: 100,
  })) {
    const feedback = subscription.cancellation_details?.feedback ?? null;
    const comment = subscription.cancellation_details?.comment || null;
    if (!feedback && !comment) continue;

    const premium = await prisma.premium.findUnique({
      where: { stripeSubscriptionId: subscription.id },
      select: { id: true },
    });
    if (!premium) {
      unmatched++;
      continue;
    }
    matched++;

    if (apply) {
      await prisma.premium.update({
        where: { id: premium.id },
        data: {
          stripeCancellationFeedback: feedback,
          stripeCancellationComment: comment,
        },
      });
    }
  }

  console.log(
    `${apply ? "Updated" : "Would update"} ${matched} Premium rows. ${unmatched} answers are on subscriptions no Premium row tracks.`,
  );
  if (!apply) console.log("Dry run. Re-run with --apply to write.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
