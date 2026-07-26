import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import {
  enqueueStripeInvoiceEmail,
  sendStripeInvoiceEmail,
} from "./invoice-email";

const { mockEnqueueBackgroundJob, mockRetrieveInvoice, mockSendInvoiceEmail } =
  vi.hoisted(() => ({
    mockEnqueueBackgroundJob: vi.fn(),
    mockRetrieveInvoice: vi.fn(),
    mockSendInvoiceEmail: vi.fn(),
  }));

vi.mock("@/utils/prisma");
vi.mock("@/utils/queue/dispatch", () => ({
  enqueueBackgroundJob: mockEnqueueBackgroundJob,
}));
vi.mock("@/ee/billing/stripe", () => ({
  getStripe: () => ({
    invoices: { retrieve: mockRetrieveInvoice },
  }),
}));
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

describe("enqueueStripeInvoiceEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueueBackgroundJob.mockResolvedValue("qstash");
  });

  it("queues a positive paid invoice", async () => {
    await enqueueStripeInvoiceEmail({ event: invoiceEvent(), logger });

    expect(mockEnqueueBackgroundJob).toHaveBeenCalledWith({
      topic: "stripe-invoice-email",
      body: { invoiceId: "in_test" },
      qstash: {
        queueName: "stripe-invoice-email",
        parallelism: 3,
        path: "/api/stripe/invoice-email",
      },
      logger,
    });
  });

  it("ignores invoices without a positive paid amount", async () => {
    await enqueueStripeInvoiceEmail({
      event: invoiceEvent({ total: 0 }),
      logger,
    });

    expect(mockEnqueueBackgroundJob).not.toHaveBeenCalled();
  });
});

describe("sendStripeInvoiceEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.payment.findFirst.mockResolvedValue({ id: "payment-1" });
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });
    mockRetrieveInvoice.mockResolvedValue(invoice());
    mockSendInvoiceEmail.mockResolvedValue(undefined);
  });

  it("emails an eligible invoice idempotently and marks it sent", async () => {
    await sendStripeInvoiceEmail({ invoiceId: "in_test", logger });

    expect(mockSendInvoiceEmail).toHaveBeenCalledWith({
      from: "Inbox Zero <billing@example.com>",
      to: "billing@example.com",
      attachmentUrl: "https://stripe.example.com/invoice.pdf",
      idempotencyKey: "stripe-invoice-email/in_test",
      emailProps: {
        baseUrl: "https://example.com",
        invoiceUrl: "https://stripe.example.com/invoice.pdf",
      },
    });
    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: "payment-1",
        invoiceEmailSentAt: null,
      },
      data: { invoiceEmailSentAt: expect.any(Date) },
    });
  });

  it("does not retrieve or email an invoice that is disabled or already sent", async () => {
    prisma.payment.findFirst.mockResolvedValue(null);

    await sendStripeInvoiceEmail({ invoiceId: "in_test", logger });

    expect(mockRetrieveInvoice).not.toHaveBeenCalled();
    expect(mockSendInvoiceEmail).not.toHaveBeenCalled();
  });

  it("uses the hosted invoice when the PDF URL is unavailable", async () => {
    mockRetrieveInvoice.mockResolvedValue(
      invoice({
        invoice_pdf: null,
        hosted_invoice_url: "https://stripe.example.com/hosted-invoice",
      }),
    );

    await sendStripeInvoiceEmail({ invoiceId: "in_test", logger });

    expect(mockSendInvoiceEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentUrl: undefined,
        emailProps: expect.objectContaining({
          invoiceUrl: "https://stripe.example.com/hosted-invoice",
        }),
      }),
    );
  });

  it("leaves the payment unsent when delivery fails", async () => {
    mockSendInvoiceEmail.mockRejectedValue(new Error("send failed"));

    await expect(
      sendStripeInvoiceEmail({ invoiceId: "in_test", logger }),
    ).rejects.toThrow("send failed");

    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
  });
});

function invoice(overrides: Partial<Stripe.Invoice> = {}): Stripe.Invoice {
  return {
    id: "in_test",
    customer: "cus_test",
    customer_email: "billing@example.com",
    created: 1_700_000_000,
    currency: "usd",
    total: 1000,
    status: "paid",
    invoice_pdf: "https://stripe.example.com/invoice.pdf",
    hosted_invoice_url: "https://stripe.example.com/hosted-invoice",
    ...overrides,
  } as Stripe.Invoice;
}

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
      object: invoice(invoiceOverrides),
    },
  } as Stripe.Event;
}
