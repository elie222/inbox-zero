import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { sendStripeInvoiceEmail } from "./invoice-email";

const { mockSendInvoiceEmail } = vi.hoisted(() => ({
  mockSendInvoiceEmail: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@inboxzero/resend", () => ({
  sendInvoiceEmail: mockSendInvoiceEmail,
}));
vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BASE_URL: "https://example.com",
    RESEND_FROM_EMAIL: "Inbox Zero <billing@example.com>",
  },
}));

const logger = createTestLogger();

describe("sendStripeInvoiceEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });
    mockSendInvoiceEmail.mockResolvedValue(undefined);
  });

  it("emails a paid invoice after claiming its payment record", async () => {
    await sendStripeInvoiceEmail({ event: invoiceEvent(), logger });

    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: {
        processorId: "in_test",
        processorType: "STRIPE",
        invoiceEmailSentAt: null,
        premium: { stripeInvoiceEmailsEnabled: true },
      },
      data: { invoiceEmailSentAt: expect.any(Date) },
    });
    expect(mockSendInvoiceEmail).toHaveBeenCalledWith({
      from: "Inbox Zero <billing@example.com>",
      to: "billing@example.com",
      attachmentUrl: "https://stripe.example.com/invoice.pdf",
      emailProps: {
        baseUrl: "https://example.com",
        invoiceUrl: "https://stripe.example.com/invoice.pdf",
      },
    });
  });

  it("does not email when the preference is disabled or already sent", async () => {
    prisma.payment.updateMany.mockResolvedValue({ count: 0 });

    await sendStripeInvoiceEmail({ event: invoiceEvent(), logger });

    expect(mockSendInvoiceEmail).not.toHaveBeenCalled();
  });

  it("uses the hosted invoice when the PDF URL is unavailable", async () => {
    await sendStripeInvoiceEmail({
      event: invoiceEvent({
        invoice_pdf: null,
        hosted_invoice_url: "https://stripe.example.com/hosted-invoice",
      }),
      logger,
    });

    expect(mockSendInvoiceEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentUrl: undefined,
        emailProps: expect.objectContaining({
          invoiceUrl: "https://stripe.example.com/hosted-invoice",
        }),
      }),
    );
  });

  it("releases the payment record when sending fails", async () => {
    mockSendInvoiceEmail.mockRejectedValue(new Error("send failed"));

    await expect(
      sendStripeInvoiceEmail({ event: invoiceEvent(), logger }),
    ).rejects.toThrow("send failed");

    const claimedAt = prisma.payment.updateMany.mock.calls[0]?.[0].data
      .invoiceEmailSentAt as Date;
    expect(prisma.payment.updateMany).toHaveBeenLastCalledWith({
      where: {
        processorId: "in_test",
        invoiceEmailSentAt: claimedAt,
      },
      data: { invoiceEmailSentAt: null },
    });
  });

  it("ignores invoices without a positive paid amount", async () => {
    await sendStripeInvoiceEmail({
      event: invoiceEvent({ total: 0 }),
      logger,
    });

    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    expect(mockSendInvoiceEmail).not.toHaveBeenCalled();
  });
});

function invoiceEvent(
  invoiceOverrides: Partial<Stripe.Invoice> = {},
): Stripe.Event {
  return {
    id: "evt_test",
    type: "invoice.paid",
    object: "event",
    api_version: "2025-03-31.basil",
    created: 1,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: "in_test",
        customer: "cus_test",
        customer_email: "billing@example.com",
        created: 1_700_000_000,
        currency: "usd",
        total: 1000,
        status: "paid",
        invoice_pdf: "https://stripe.example.com/invoice.pdf",
        hosted_invoice_url: "https://stripe.example.com/hosted-invoice",
        ...invoiceOverrides,
      } as Stripe.Invoice,
    },
  } as Stripe.Event;
}
