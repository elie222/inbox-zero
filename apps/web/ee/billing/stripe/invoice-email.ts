import { sendInvoiceEmail } from "@inboxzero/resend";
import type Stripe from "stripe";
import { z } from "zod";
import { getStripe } from "@/ee/billing/stripe";
import { env } from "@/env";
import { ProcessorType } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { enqueueBackgroundJob } from "@/utils/queue/dispatch";

const successfulInvoiceEvents = new Set<Stripe.Event.Type>([
  "invoice.paid",
  "invoice.payment_succeeded",
]);

export const stripeInvoiceEmailBody = z.object({
  invoiceId: z.string().min(1),
});

export async function enqueueStripeInvoiceEmail({
  event,
  logger,
}: {
  event: Stripe.Event;
  logger: Logger;
}) {
  if (!successfulInvoiceEvents.has(event.type)) return;

  const invoice = event.data.object as Stripe.Invoice;
  if (!invoice.id || invoice.status !== "paid" || invoice.total <= 0) return;

  await enqueueBackgroundJob({
    topic: "stripe-invoice-email",
    body: { invoiceId: invoice.id },
    qstash: {
      queueName: "stripe-invoice-email",
      parallelism: 3,
      path: "/api/stripe/invoice-email",
    },
    logger,
  });
}

export async function sendStripeInvoiceEmail({
  invoiceId,
  logger,
}: {
  invoiceId: string;
  logger: Logger;
}) {
  const payment = await prisma.payment.findFirst({
    where: {
      processorId: invoiceId,
      processorType: ProcessorType.STRIPE,
      invoiceEmailSentAt: null,
      premium: { stripeInvoiceEmailsEnabled: true },
    },
    select: { id: true },
  });

  if (!payment) return;

  const invoice = await getStripe().invoices.retrieve(invoiceId);
  const invoiceUrl = invoice.invoice_pdf || invoice.hosted_invoice_url;

  if (
    invoice.status !== "paid" ||
    invoice.total <= 0 ||
    !invoice.customer_email ||
    !invoiceUrl
  ) {
    return;
  }

  await sendInvoiceEmail({
    from: env.RESEND_FROM_EMAIL,
    to: invoice.customer_email,
    attachmentUrl: invoice.invoice_pdf || undefined,
    idempotencyKey: `stripe-invoice-email/${invoice.id}`,
    emailProps: {
      baseUrl: env.NEXT_PUBLIC_BASE_URL,
      invoiceUrl,
    },
  });

  await prisma.payment.updateMany({
    where: { id: payment.id, invoiceEmailSentAt: null },
    data: { invoiceEmailSentAt: new Date() },
  });
  logger.info("Sent Stripe invoice email", { invoiceId });
}
