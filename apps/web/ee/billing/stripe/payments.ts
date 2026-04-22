import type Stripe from "stripe";
import { ProcessorType } from "@/generated/prisma/enums";
import { getStripe } from "@/ee/billing/stripe";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";

const stripeInvoicePaymentEvents = new Set<Stripe.Event.Type>([
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "invoice.marked_uncollectible",
  "refund.created",
  "refund.updated",
  "refund.failed",
]);

export async function syncStripeInvoicePayment({
  event,
  logger,
}: {
  event: Stripe.Event;
  logger: Logger;
}) {
  const invoice = await getStripeInvoiceForPaymentSync(event, logger);
  if (!invoice) return;

  await upsertStripeInvoicePayment({
    invoice,
    updatedAtUnix: event.created,
    logger,
    context: {
      eventType: event.type,
    },
  });
}

export async function upsertStripeInvoicePayment({
  invoice,
  updatedAtUnix,
  logger,
  context,
}: {
  invoice: Stripe.Invoice;
  updatedAtUnix?: number;
  logger: Logger;
  context?: Record<string, unknown>;
}) {
  const invoiceId = invoice.id;
  const customerId = normalizeStripeId(invoice.customer);

  if (!invoiceId || !customerId) {
    logger.warn("Skipping Stripe payment sync due to missing invoice fields", {
      invoiceId: invoiceId ?? null,
      hasCustomerId: !!customerId,
      ...context,
    });
    return;
  }

  if (invoice.total === 0) {
    logger.info("Skipping zero-amount Stripe invoice for Payment sync", {
      invoiceId,
      customerId,
      status: invoice.status ?? "unknown",
      ...context,
    });
    return;
  }

  const premium = await prisma.premium.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });

  const paymentData = buildStripePaymentData({
    invoice,
    eventCreated: updatedAtUnix,
    premiumId: premium?.id ?? null,
  });

  await prisma.payment.upsert({
    where: { processorId: invoiceId },
    create: paymentData,
    update: paymentData,
  });

  logger.info("Synced Stripe invoice to Payment table", {
    invoiceId,
    customerId,
    premiumId: premium?.id ?? null,
    status: paymentData.status,
    ...context,
  });
}

export async function getStripeInvoiceForPaymentSync(
  event: Stripe.Event,
  logger: Logger,
) {
  if (!stripeInvoicePaymentEvents.has(event.type)) return null;

  if (event.type.startsWith("refund.")) {
    return await getStripeInvoiceForRefundEvent({
      refund: event.data.object as Stripe.Refund,
      logger,
      eventType: event.type,
    });
  }

  const invoice = event.data.object as Stripe.Invoice;
  if (!invoice?.id) return null;

  return invoice;
}

export function buildStripePaymentData({
  invoice,
  eventCreated,
  premiumId,
}: {
  invoice: Stripe.Invoice;
  eventCreated?: number;
  premiumId: string | null;
}) {
  const customerId = normalizeStripeId(invoice.customer);
  const subscriptionId = normalizeStripeId(
    invoice.parent?.subscription_details?.subscription ?? null,
  );
  const tax = getStripeInvoiceTaxAmount(invoice);
  const charge =
    invoice.charge && typeof invoice.charge !== "string"
      ? invoice.charge
      : null;
  const refundedAmount = charge?.amount_refunded ?? 0;

  return {
    premiumId,
    createdAt: new Date(invoice.created * 1000),
    updatedAt: new Date(
      getStripeInvoiceUpdatedAtUnix(invoice, eventCreated) * 1000,
    ),
    processorType: ProcessorType.STRIPE,
    processorId: invoice.id,
    processorSubscriptionId: subscriptionId,
    processorCustomerId: customerId,
    amount: invoice.total,
    currency: invoice.currency.toUpperCase(),
    status: getStripePaymentStatus(invoice, refundedAmount),
    tax,
    // Stripe invoice payloads do not expose a single reliable invoice-level
    // inclusive/exclusive boolean without expanded line-price inspection.
    taxInclusive: false,
    refunded: refundedAmount > 0,
    refundedAt: refundedAmount > 0 ? getLatestRefundedAt(charge) : null,
    refundedAmount: refundedAmount > 0 ? refundedAmount : null,
    billingReason: invoice.billing_reason ?? null,
  };
}

function getStripeInvoiceTaxAmount(invoice: Stripe.Invoice) {
  return (
    invoice.total_taxes?.reduce((sum, taxAmount) => {
      return sum + taxAmount.amount;
    }, 0) ?? 0
  );
}

function getStripeInvoiceUpdatedAtUnix(
  invoice: Stripe.Invoice,
  eventCreated?: number,
) {
  return (
    invoice.status_transitions?.paid_at ??
    invoice.status_transitions?.marked_uncollectible_at ??
    invoice.status_transitions?.voided_at ??
    invoice.status_transitions?.finalized_at ??
    eventCreated ??
    invoice.created
  );
}

async function getStripeInvoiceForRefundEvent({
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
    const invoiceId = normalizeStripeId(charge.invoice);
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
    const invoiceId = normalizeStripeId(paymentIntent.invoice);
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

function getStripePaymentStatus(
  invoice: Stripe.Invoice,
  refundedAmount: number,
) {
  if (refundedAmount >= invoice.total && refundedAmount > 0) {
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

  for (const refund of charge.refunds.data) {
    if (refund.status === "failed") {
      continue;
    }

    if (refund.created > latestRefundTimestamp) {
      latestRefundTimestamp = refund.created;
    }
  }

  return latestRefundTimestamp ? new Date(latestRefundTimestamp * 1000) : null;
}

function normalizeStripeId(
  value:
    | string
    | Stripe.Customer
    | Stripe.DeletedCustomer
    | Stripe.Subscription
    | null,
) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
