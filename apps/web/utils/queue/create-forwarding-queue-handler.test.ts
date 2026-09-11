import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const handleCallbackMock = vi.hoisted(() => vi.fn());

vi.mock("@vercel/queue", () => ({
  handleCallback: handleCallbackMock,
}));

import { createForwardingQueueHandler } from "./create-forwarding-queue-handler";

describe("createForwardingQueueHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleCallbackMock.mockReturnValue(vi.fn());
  });

  it("acknowledges a failing message after the configured delivery limit", () => {
    createForwardingQueueHandler({
      loggerScope: "test/queue",
      schema: z.object({ id: z.string() }),
      path: "/api/test",
      invalidPayloadMessage: "Invalid test payload",
      visibilityTimeoutSeconds: 30,
      maxDeliveryAttempts: 5,
    });

    const retry = handleCallbackMock.mock.calls[0][1].retry;

    expect(
      retry(new Error("Temporary failure"), {
        messageId: "message-id",
        deliveryCount: 4,
      }),
    ).toEqual({ afterSeconds: 80 });
    expect(
      retry(new Error("Persistent failure"), {
        messageId: "message-id",
        deliveryCount: 5,
      }),
    ).toEqual({ acknowledge: true });
  });
});
