// Copies Stripe customer portal cancellation survey answers into CancellationFeedback.
// The webhook saves new answers; this covers answers given before it did. Safe to re-run.
//
// Run with: `pnpm --filter inbox-zero-ai exec tsx scripts/backfill-cancellation-feedback.ts`
// Apply changes with: `pnpm --filter inbox-zero-ai exec tsx scripts/backfill-cancellation-feedback.ts --apply`

import "dotenv/config";
import { getStripe } from "@/ee/billing/stripe";
import { saveStripeCancellationFeedback } from "@/ee/billing/stripe/cancellation-feedback";

async function main() {
  const apply = process.argv.includes("--apply");
  const stripe = getStripe();

  let canceled = 0;
  let withFeedback = 0;

  for await (const subscription of stripe.subscriptions.list({
    status: "all",
    limit: 100,
  })) {
    if (!subscription.canceled_at) continue;
    canceled++;

    const details = subscription.cancellation_details;
    if (!details?.feedback && !details?.comment) continue;
    withFeedback++;

    if (apply) await saveStripeCancellationFeedback(subscription);
  }

  console.log(
    `${apply ? "Saved" : "Would save"} ${withFeedback} answers from ${canceled} canceled subscriptions.`,
  );
  if (!apply) console.log("Dry run. Re-run with --apply to write.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
