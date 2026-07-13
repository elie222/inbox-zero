import type Stripe from "stripe";
import { sendInvoiceEmail } from "@inboxzero/resend";
import { env } from "@/env";
import { ProcessorType } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const successfulInvoiceEvents = new Set<Stripe.Event.Type>([
  "invoice.paid",
  "invoice.payment_succeeded",
]);

export async function sendStripeInvoiceEmail({
  event,
  logger,
}: {
  event: Stripe.Event;
  logger: Logger;
}) {
  if (!successfulInvoiceEvents.has(event.type)) return;

  const invoice = event.data.object as Stripe.Invoice;
  const invoiceUrl = invoice.invoice_pdf || invoice.hosted_invoice_url;

  if (
    !invoice.id ||
    invoice.status !== "paid" ||
    invoice.total <= 0 ||
    !invoice.customer_email ||
    !invoiceUrl
  ) {
    return;
  }

  const claimedAt = new Date();
  const claim = await prisma.payment.updateMany({
    where: {
      processorId: invoice.id,
      processorType: ProcessorType.STRIPE,
      invoiceEmailSentAt: null,
      premium: { stripeInvoiceEmailsEnabled: true },
    },
    data: { invoiceEmailSentAt: claimedAt },
  });

  if (claim.count === 0) return;

  try {
    await sendInvoiceEmail({
      from: env.RESEND_FROM_EMAIL,
      to: invoice.customer_email,
      attachmentUrl: invoice.invoice_pdf || undefined,
      emailProps: {
        baseUrl: env.NEXT_PUBLIC_BASE_URL,
        invoiceUrl,
      },
    });
    logger.info("Sent Stripe invoice email", { invoiceId: invoice.id });
  } catch (error) {
    await prisma.payment.updateMany({
      where: {
        processorId: invoice.id,
        invoiceEmailSentAt: claimedAt,
      },
      data: { invoiceEmailSentAt: null },
    });
    throw error;
  }
}
