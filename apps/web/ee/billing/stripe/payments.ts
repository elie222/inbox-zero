import type Stripe from "stripe";
import { ProcessorType } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";

const stripeInvoicePaymentEvents = new Set<Stripe.Event.Type>([
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "invoice.marked_uncollectible",
]);

export async function syncStripeInvoicePayment({
  event,
  logger,
}: {
  event: Stripe.Event;
  logger: Logger;
}) {
  const invoice = getStripeInvoiceForPaymentSync(event);
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

export function getStripeInvoiceForPaymentSync(event: Stripe.Event) {
  if (!stripeInvoicePaymentEvents.has(event.type)) return null;

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
    status: invoice.status ?? "unknown",
    tax,
    // Stripe invoice payloads do not expose a single reliable invoice-level
    // inclusive/exclusive boolean without expanded line-price inspection.
    taxInclusive: false,
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
