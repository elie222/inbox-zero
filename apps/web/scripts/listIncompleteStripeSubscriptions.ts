// Run with: `npx tsx scripts/listIncompleteStripeSubscriptions.ts`

import "dotenv/config";
import { getStripe } from "@/ee/billing/stripe";

async function main() {
  const stripe = getStripe();

  console.log(
    "Attaching payment methods to ALL Stripe subscriptions without payment methods...",
  );

  let allSubscriptions: any[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  // Fetch all subscriptions with pagination
  while (hasMore && allSubscriptions.length < 1000) {
    const subscriptions = await stripe.subscriptions.list({
      limit: 100,
      status: "canceled",
      expand: ["data.customer", "data.default_payment_method"],
      ...(startingAfter && { starting_after: startingAfter }),
    });

    allSubscriptions = allSubscriptions.concat(subscriptions.data);
    hasMore = subscriptions.has_more;

    if (subscriptions.data.length > 0) {
      startingAfter = subscriptions.data[subscriptions.data.length - 1].id;
    }
  }

  // Limit to 1000 subscriptions
  allSubscriptions = allSubscriptions.slice(0, 1000);

  console.log(`Checked ${allSubscriptions.length} total subscriptions`);
  console.log("=".repeat(80));

  let subscriptionsWithoutPaymentMethod = 0;
  let potentialCandidatesForReactivation = 0;
  let subscriptionsFixed = 0;
  let subscriptionsWithoutAvailableCards = 0;
  const statusCountsWithoutPaymentMethod: Record<string, number> = {};
  const processedEmails: string[] = [];

  for (const subscription of allSubscriptions) {
    // Only process if no payment method is attached
    if (!subscription.default_payment_method) {
      // Track status counts only for subscriptions without payment methods
      statusCountsWithoutPaymentMethod[subscription.status] =
        (statusCountsWithoutPaymentMethod[subscription.status] || 0) + 1;

      const customer = subscription.customer;
      const customerEmail =
        typeof customer === "object" && "email" in customer
          ? customer.email
          : "N/A";
      const customerName =
        typeof customer === "object" && "name" in customer
          ? customer.name
          : "N/A";

      console.log(`Subscription ID: ${subscription.id}`);
      console.log(`Customer: ${customerName} (${customerEmail})`);
      console.log(`Status: ${subscription.status}`);
      console.log(
        `Created: ${new Date(subscription.created * 1000).toISOString()}`,
      );

      // Log cancellation date if subscription is cancelled
      if (subscription.canceled_at) {
        console.log(
          `Cancelled: ${new Date(subscription.canceled_at * 1000).toISOString()}`,
        );
      }

      console.log(`Latest Invoice: ${subscription.latest_invoice}`);
      console.log("Payment Method: None attached");

      // Check if this is a candidate for reactivation (inactive but could be resumed)
      if (subscription.status !== "active") {
        console.log("🎯 CANDIDATE FOR REACTIVATION");
        potentialCandidatesForReactivation++;
      }

      subscriptionsWithoutPaymentMethod++;

      try {
        // Try to find and attach a payment method
        const customerId =
          typeof customer === "object" && "id" in customer
            ? customer.id
            : subscription.customer;

        const paymentMethods = await stripe.paymentMethods.list({
          customer: customerId,
          type: "card",
        });

        if (paymentMethods.data.length > 0) {
          // Attach payment method to customer
          await stripe.customers.update(customerId, {
            invoice_settings: {
              default_payment_method: paymentMethods.data[0].id,
            },
          });

          console.log(
            `✅ Attached payment method to customer: ${paymentMethods.data[0].id}`,
          );

          // For cancelled subscriptions, we need to create a new subscription
          if (subscription.status === "canceled") {
            try {
              // Get the original subscription items (prices/products)
              const originalItems = subscription.items.data.map(
                (item: any) => ({
                  price: item.price.id,
                  quantity: item.quantity,
                }),
              );

              const newSubscription = await stripe.subscriptions.create({
                customer: customerId,
                items: originalItems,
                default_payment_method: paymentMethods.data[0].id,
                expand: ["latest_invoice.payment_intent"],
              });

              console.log(`🔄 Created new subscription: ${newSubscription.id}`);
              console.log(`   Status: ${newSubscription.status}`);
            } catch (createError) {
              console.log(
                `❌ Failed to create new subscription: ${createError instanceof Error ? createError.message : String(createError)}`,
              );
            }
          }

          console.log(`📧 Email: ${customerEmail}`);

          if (customerEmail && customerEmail !== "N/A") {
            processedEmails.push(customerEmail);
          }

          subscriptionsFixed++;
        } else {
          console.log("❌ No card payment methods available for this customer");
          subscriptionsWithoutAvailableCards++;
        }
      } catch (error) {
        console.log(
          `❌ Error processing subscription: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      console.log("-".repeat(40));
    }
  }

  console.log("\nSUMMARY:");
  console.log(`Total subscriptions checked: ${allSubscriptions.length}`);
  console.log(
    `Subscriptions without payment method: ${subscriptionsWithoutPaymentMethod}`,
  );
  console.log(
    `Subscriptions fixed (payment method attached): ${subscriptionsFixed}`,
  );
  console.log(
    `Subscriptions without available cards: ${subscriptionsWithoutAvailableCards}`,
  );
  console.log(
    `Potential candidates for reactivation: ${potentialCandidatesForReactivation}`,
  );
  console.log(
    `Subscriptions with payment method: ${allSubscriptions.length - subscriptionsWithoutPaymentMethod}`,
  );

  console.log(
    "\nSTATUS BREAKDOWN (subscriptions WITHOUT payment methods only):",
  );
  Object.entries(statusCountsWithoutPaymentMethod).forEach(
    ([status, count]) => {
      console.log(`  ${status}: ${count}`);
    },
  );

  console.log(`\n📧 ALL PROCESSED EMAILS (${processedEmails.length} total):`);
  console.log("=".repeat(80));
  processedEmails.forEach((email, index) => {
    console.log(`${index + 1}. ${email}`);
  });

  console.log("\n📋 EMAIL ARRAY FOR COPY/PASTE:");
  console.log(JSON.stringify(processedEmails, null, 2));
}

main().catch(console.error);
