import type Stripe from "stripe";
import { getStripe } from "@/ee/billing/stripe";
import type { Logger } from "@/utils/logger";

export const stripeRefundEvents = [
  "refund.created",
  "refund.updated",
  "refund.failed",
] as const satisfies ReadonlyArray<Stripe.Event.Type>;

export function isStripeRefundEventType(eventType: Stripe.Event.Type) {
  return (
    eventType === "refund.created" ||
    eventType === "refund.updated" ||
    eventType === "refund.failed"
  );
}

export async function getStripeCustomerIdForRefund(refund: Stripe.Refund) {
  const stripe = getStripe();

  const chargeId = normalizeStripeId(refund.charge);
  if (chargeId) {
    const charge = await stripe.charges.retrieve(chargeId);
    return normalizeStripeId(charge.customer);
  }

  const paymentIntentId = normalizeStripeId(refund.payment_intent);
  if (paymentIntentId) {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return normalizeStripeId(paymentIntent.customer);
  }

  return null;
}

export async function getStripeInvoiceForRefundEvent({
  refund,
  logger,
  eventType,
}: {
  refund: Stripe.Refund;
  logger: Logger;
  eventType: Stripe.Event.Type;
}) {
  const stripe = getStripe();

  const chargeId = normalizeStripeId(refund.charge);
  if (chargeId) {
    const charge = await stripe.charges.retrieve(chargeId);
    const invoiceId = getChargeInvoiceId(charge);
    if (!invoiceId) {
      logger.warn(
        "Skipping Stripe refund payment sync due to missing invoice",
        {
          refundId: refund.id,
          chargeId,
          eventType,
        },
      );
      return null;
    }

    return await stripe.invoices.retrieve(invoiceId, {
      expand: ["charge", "charge.refunds"],
    });
  }

  const paymentIntentId = normalizeStripeId(refund.payment_intent);
  if (paymentIntentId) {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const invoiceId = getPaymentIntentInvoiceId(paymentIntent);
    if (!invoiceId) {
      logger.warn(
        "Skipping Stripe refund payment sync due to missing invoice",
        {
          refundId: refund.id,
          paymentIntentId,
          eventType,
        },
      );
      return null;
    }

    return await stripe.invoices.retrieve(invoiceId, {
      expand: ["charge", "charge.refunds"],
    });
  }

  logger.warn(
    "Skipping Stripe refund payment sync due to missing payment link",
    {
      refundId: refund.id,
      eventType,
    },
  );
  return null;
}

export function getStripeRefundState(invoice: Stripe.Invoice) {
  const charge = getInvoiceCharge(invoice);
  const refundedAmount = charge?.amount_refunded ?? 0;
  const chargedAmount = charge?.amount ?? null;

  return {
    status: getStripePaymentStatus(invoice, refundedAmount, chargedAmount),
    refunded: refundedAmount > 0,
    refundedAt: refundedAmount > 0 ? getLatestRefundedAt(charge) : null,
    refundedAmount: refundedAmount > 0 ? refundedAmount : null,
  };
}

function getStripePaymentStatus(
  invoice: Stripe.Invoice,
  refundedAmount: number,
  chargedAmount: number | null,
) {
  if (chargedAmount && refundedAmount >= chargedAmount && refundedAmount > 0) {
    return "refunded";
  }

  if (refundedAmount > 0) {
    return "partially_refunded";
  }

  return invoice.status ?? "unknown";
}

function getLatestRefundedAt(charge: Stripe.Charge | null) {
  if (!charge) {
    return null;
  }

  let latestRefundTimestamp = 0;
  const refunds = charge.refunds?.data ?? [];

  for (const refund of refunds) {
    if (refund.status === "failed") {
      continue;
    }

    if (refund.created > latestRefundTimestamp) {
      latestRefundTimestamp = refund.created;
    }
  }

  return latestRefundTimestamp ? new Date(latestRefundTimestamp * 1000) : null;
}

function getChargeInvoiceId(charge: Stripe.Charge) {
  return normalizeStripeId(
    (charge as Stripe.Charge & { invoice?: string | { id: string } | null })
      .invoice,
  );
}

function getInvoiceCharge(invoice: Stripe.Invoice) {
  const charge = (
    invoice as Stripe.Invoice & {
      charge?: string | Stripe.Charge | null;
    }
  ).charge;

  if (!charge || typeof charge === "string") {
    return null;
  }

  return charge;
}

function getPaymentIntentInvoiceId(paymentIntent: Stripe.PaymentIntent) {
  return normalizeStripeId(
    (
      paymentIntent as Stripe.PaymentIntent & {
        invoice?: string | { id: string } | null;
      }
    ).invoice,
  );
}

function normalizeStripeId(value: string | { id: string } | null | undefined) {
  if (!value) {
    return null;
  }

  return typeof value === "string" ? value : value.id;
}
