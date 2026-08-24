import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createEmailProviderMock,
  excludeRepliedSendersFromColdEmailMock,
  getEmailAccountWithAiAndTokensMock,
  getMessageMock,
  publishToQstashMock,
  sleepMock,
} = vi.hoisted(() => ({
  createEmailProviderMock: vi.fn(),
  excludeRepliedSendersFromColdEmailMock: vi.fn(),
  getEmailAccountWithAiAndTokensMock: vi.fn(),
  getMessageMock: vi.fn(),
  publishToQstashMock: vi.fn(),
  sleepMock: vi.fn(),
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});
vi.mock("@/utils/qstash", () => ({
  withQstashOrInternal: (handler: unknown) => handler,
}));
vi.mock("@/utils/user/get", () => ({
  getEmailAccountWithAiAndTokens: getEmailAccountWithAiAndTokensMock,
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: createEmailProviderMock,
}));
vi.mock("@/utils/cold-email/exclude-replied-sender", () => ({
  excludeRepliedSendersFromColdEmail: excludeRepliedSendersFromColdEmailMock,
}));
vi.mock("@/utils/upstash", () => ({
  publishToQstash: publishToQstashMock,
}));
vi.mock("@/utils/sleep", () => ({ sleep: sleepMock }));

import { POST } from "./route";

describe("replied sender exclusion retry route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEmailAccountWithAiAndTokensMock.mockResolvedValue({
      account: { provider: "google" },
    });
    getMessageMock.mockResolvedValue({ id: "message-1" });
    createEmailProviderMock.mockResolvedValue({ getMessage: getMessageMock });
    excludeRepliedSendersFromColdEmailMock.mockResolvedValue(undefined);
    publishToQstashMock.mockResolvedValue(undefined);
  });

  it("retries the focused exclusion after loading the provider message", async () => {
    const response = await postRetry({ attempt: 1 });

    expect(response.status).toBe(200);
    expect(sleepMock).toHaveBeenCalledWith(2000);
    expect(excludeRepliedSendersFromColdEmailMock).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      message: { id: "message-1" },
      provider: { getMessage: getMessageMock },
      logger: expect.anything(),
    });
    expect(publishToQstashMock).not.toHaveBeenCalled();
  });

  it("queues another attempt when attribution is still pending", async () => {
    excludeRepliedSendersFromColdEmailMock.mockRejectedValue(
      new Error("Message attribution is still pending"),
    );

    const response = await postRetry({ attempt: 2 });

    expect(response.status).toBe(200);
    expect(publishToQstashMock).toHaveBeenCalledWith(
      "/api/cold-email/exclude-replied-sender",
      {
        emailAccountId: "account-1",
        messageId: "message-1",
        attempt: 3,
      },
      undefined,
      undefined,
      { waitForFallback: true },
    );
  });

  it("queues another attempt when loading the provider message fails", async () => {
    getMessageMock.mockRejectedValue(new Error("provider unavailable"));

    const response = await postRetry({ attempt: 2 });

    expect(response.status).toBe(200);
    expect(excludeRepliedSendersFromColdEmailMock).not.toHaveBeenCalled();
    expect(publishToQstashMock).toHaveBeenCalledWith(
      "/api/cold-email/exclude-replied-sender",
      {
        emailAccountId: "account-1",
        messageId: "message-1",
        attempt: 3,
      },
      undefined,
      undefined,
      { waitForFallback: true },
    );
  });

  it("surfaces the failure after the final attempt", async () => {
    excludeRepliedSendersFromColdEmailMock.mockRejectedValue(
      new Error("Message attribution is still pending"),
    );

    await expect(postRetry({ attempt: 6 })).rejects.toThrow(
      "Message attribution is still pending",
    );
    expect(publishToQstashMock).not.toHaveBeenCalled();
  });
});

async function postRetry({ attempt }: { attempt: number }) {
  return POST(
    new Request("https://example.com/api/cold-email/exclude-replied-sender", {
      method: "POST",
      body: JSON.stringify({
        emailAccountId: "account-1",
        messageId: "message-1",
        attempt,
      }),
    }) as never,
    { params: Promise.resolve({}) },
  );
}
