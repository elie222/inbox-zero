import { beforeEach, describe, expect, it, vi } from "vitest";
import { addTestEmailAccountAuth } from "@/__tests__/helpers";
import type { ConfirmAssistantEmailActionBody } from "@/utils/actions/assistant-chat.validation";

const { mockConfirmAssistantEmailActionForAccount, mockGetEmailAccountWithAi } =
  vi.hoisted(() => ({
    mockConfirmAssistantEmailActionForAccount: vi.fn(),
    mockGetEmailAccountWithAi: vi.fn(),
  }));

vi.mock("@/utils/middleware", async () => {
  const { createWithEmailAccountTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailAccountTestMiddleware({
    auth: {
      userId: "user-1",
      emailAccountId: "email-account-1",
      email: "user@example.com",
    },
  });
});

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
    const request = addTestEmailAccountAuth(
      new Request("http://localhost/api/chat/confirm-email-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{invalid",
      }),
      {
        auth: {
          userId: "user-1",
          emailAccountId: "email-account-1",
          email: "user@example.com",
        },
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

    const request = addTestEmailAccountAuth(
      new Request("http://localhost/api/chat/confirm-email-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      {
        auth: {
          userId: "user-1",
          emailAccountId: "email-account-1",
          email: "user@example.com",
        },
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
