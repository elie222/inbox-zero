import { stripeInvoiceEmailBody } from "@/ee/billing/stripe/invoice-email";
import { createForwardingQueueHandler } from "@/utils/queue/create-forwarding-queue-handler";

export const maxDuration = 60;

export const POST = createForwardingQueueHandler({
  loggerScope: "stripe/invoice-email/queue",
  schema: stripeInvoiceEmailBody,
  path: "/api/stripe/invoice-email",
  invalidPayloadMessage: "Invalid Stripe invoice email queue payload",
  visibilityTimeoutSeconds: 55,
  getLoggerContext: ({ invoiceId }) => ({ invoiceId }),
});
