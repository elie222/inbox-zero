import { NextResponse } from "next/server";
import {
  sendStripeInvoiceEmail,
  stripeInvoiceEmailBody,
} from "@/ee/billing/stripe/invoice-email";
import { withError } from "@/utils/middleware";
import { withQstashOrInternal } from "@/utils/qstash";

export const POST = withError(
  "stripe/invoice-email",
  withQstashOrInternal(async (request) => {
    const validation = stripeInvoiceEmailBody.safeParse(await request.json());

    if (!validation.success) {
      request.logger.error("Invalid Stripe invoice email payload", {
        errors: validation.error.issues,
      });
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    await sendStripeInvoiceEmail({
      invoiceId: validation.data.invoiceId,
      logger: request.logger,
    });

    return NextResponse.json({ success: true });
  }),
);
