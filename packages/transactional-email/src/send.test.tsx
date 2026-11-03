import { beforeEach, describe, expect, it, vi } from "vitest";

const { deliver } = vi.hoisted(() => ({ deliver: vi.fn() }));

vi.mock("./delivery", () => ({
  deliverTransactionalEmail: deliver,
  isTransactionalEmailConfigured: () => true,
}));

import { sendInvoiceEmail } from "./send";

describe("sendInvoiceEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deliver.mockResolvedValue({ messageId: "message_1" });
  });

  it("sends an identical request when retried with the same idempotency key", async () => {
    const send = () =>
      sendInvoiceEmail({
        from: "billing@example.test",
        to: "customer@example.test",
        attachmentUrl: "https://example.test/invoice.pdf",
        idempotencyKey: "stripe-invoice-email/in_1",
        emailProps: {
          baseUrl: "https://example.test",
          invoiceUrl: "https://example.test/invoice",
        },
      });

    await send();
    await send();

    expect(deliver).toHaveBeenCalledTimes(2);
    expect(deliver.mock.calls[1]).toEqual(deliver.mock.calls[0]);
  });
});
