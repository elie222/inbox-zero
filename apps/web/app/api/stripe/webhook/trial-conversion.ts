import type Stripe from "stripe";
import prisma from "@/utils/prisma";
import { getStripe } from "@/ee/billing/stripe";

export async function getStripeTrialConversion(event: Stripe.Event) {
  // Unlike invoice.paid, this event is not emitted for out-of-band payments.
  if (event.type !== "invoice.payment_succeeded") return null;

  const stripe = getStripe();
  const invoice = await stripe.invoices.retrieve(event.data.object.id);
  const paidAt = invoice.status_transitions?.paid_at;
  const subscriptionReference =
    invoice.parent?.subscription_details?.subscription;
  if (
    invoice.status !== "paid" ||
    invoice.amount_paid <= 0 ||
    (invoice.billing_reason !== "subscription_cycle" &&
      invoice.billing_reason !== "subscription_update") ||
    !paidAt ||
    !subscriptionReference ||
    !invoice.customer
  )
    return null;

  const subscription = await stripe.subscriptions.retrieve(
    typeof subscriptionReference === "string"
      ? subscriptionReference
      : subscriptionReference.id,
  );
  if (
    !subscription.trial_end ||
    invoice.created < subscription.trial_end ||
    paidAt < subscription.trial_end
  )
    return null;

  // Use Stripe history rather than webhook order: a renewal must not become a
  // conversion when the original payment predates tracking or arrives late.
  for await (const paidInvoice of stripe.invoices.list({
    customer:
      typeof invoice.customer === "string"
        ? invoice.customer
        : invoice.customer.id,
    status: "paid",
    limit: 100,
  })) {
    if (
      paidInvoice.id !== invoice.id &&
      paidInvoice.amount_paid > 0 &&
      paidInvoice.parent?.subscription_details?.subscription &&
      paidInvoice.status_transitions.paid_at &&
      paidInvoice.status_transitions.paid_at <= paidAt
    )
      return null;
  }

  return { subscription, invoice, convertedAt: new Date(paidAt * 1000) };
}

export async function recordStripeTrialConversion({
  premiumId,
  subscriptionId,
  invoiceId,
  convertedAt,
}: {
  premiumId: string;
  subscriptionId: string;
  invoiceId: string;
  convertedAt: Date;
}) {
  const result = await prisma.premium.updateMany({
    where: {
      id: premiumId,
      stripeSubscriptionId: subscriptionId,
      OR: [
        { stripeTrialConvertedAt: null },
        { stripeTrialConversionInvoiceId: invoiceId },
      ],
    },
    data: {
      stripeTrialConvertedAt: convertedAt,
      stripeTrialConversionInvoiceId: invoiceId,
    },
  });
  return result.count > 0;
}
