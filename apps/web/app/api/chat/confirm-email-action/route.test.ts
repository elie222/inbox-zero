import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import type { ConfirmAssistantEmailActionBody } from "@/utils/actions/assistant-chat.validation";

const { mockConfirmAssistantEmailActionForAccount, mockGetEmailAccountWithAi } =
  vi.hoisted(() => ({
    mockConfirmAssistantEmailActionForAccount: vi.fn(),
    mockGetEmailAccountWithAi: vi.fn(),
  }));

vi.mock("@/utils/middleware", () => ({
  withEmailAccount:
    (_scope: string, handler: (request: Request) => Promise<Response>) =>
    async (request: Request) =>
      handler(request),
}));

vi.mock("@/utils/actions/assistant-chat-confirmation", () => ({
  confirmAssistantEmailActionForAccount:
    mockConfirmAssistantEmailActionForAccount,
}));

vi.mock("@/utils/user/get", () => ({
  getEmailAccountWithAi: mockGetEmailAccountWithAi,
}));

import { POST } from "./route";

describe("confirm email action route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEmailAccountWithAi.mockResolvedValue({
      account: { provider: "google" },
    });
  });

  it("returns 400 when the request body is malformed JSON", async () => {
    const request = Object.assign(
      new Request("http://localhost/api/chat/confirm-email-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{invalid",
      }),
      {
        auth: { emailAccountId: "email-account-1" },
        logger: createTestLogger(),
      },
    );

    const response = await POST(request as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid JSON body",
    });
    expect(mockConfirmAssistantEmailActionForAccount).not.toHaveBeenCalled();
  });

  it("confirms the pending action for a valid request body", async () => {
    const body: ConfirmAssistantEmailActionBody = {
      chatId: "chat-1",
      chatMessageId: "message-1",
      toolCallId: "tool-1",
      actionType: "reply_email",
      contentOverride: "Updated draft",
    };
    mockConfirmAssistantEmailActionForAccount.mockResolvedValue({
      success: true,
    });

    const request = Object.assign(
      new Request("http://localhost/api/chat/confirm-email-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      {
        auth: { emailAccountId: "email-account-1" },
        logger: createTestLogger(),
      },
    );

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mockConfirmAssistantEmailActionForAccount).toHaveBeenCalledWith({
      ...body,
      waitForPersistence: true,
      persistenceWaitMs: 10_000,
      emailAccountId: "email-account-1",
      logger: request.logger,
      provider: "google",
    });
  });
});
