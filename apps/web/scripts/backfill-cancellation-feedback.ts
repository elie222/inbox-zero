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

  let answers = 0;
  let updated = 0;

  // Matching on stripeSubscriptionId only touches the subscription the Stripe sync tracks for each Premium.
  for await (const subscription of stripe.subscriptions.list({
    status: "all",
    limit: 100,
  })) {
    const feedback = subscription.cancellation_details?.feedback ?? null;
    const comment = subscription.cancellation_details?.comment || null;
    if (!feedback && !comment) continue;
    answers++;

    if (!apply) continue;

    const result = await prisma.premium.updateMany({
      where: { stripeSubscriptionId: subscription.id },
      data: {
        stripeCancellationFeedback: feedback,
        stripeCancellationComment: comment,
      },
    });
    updated += result.count;
  }

  console.log(`Found ${answers} answers in Stripe.`);
  if (apply) console.log(`Updated ${updated} Premium rows.`);
  else console.log("Dry run. Re-run with --apply to write.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
