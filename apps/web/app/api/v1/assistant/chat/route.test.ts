import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";

const { handler, register } = vi.hoisted(() => ({
  handler: vi.fn((_request: { auth: unknown }) => new Response("stream")),
  register: vi.fn((_name, _scopes, callback) => callback),
}));

vi.mock("@/utils/api-middleware", () => ({ withAccountApiKey: register }));
vi.mock("@/app/api/chat/handle-chat-request", () => ({
  handleChatRequest: handler,
}));

import { POST } from "./route";

describe("account-scoped assistant chat", () => {
  it("requires the assistant scope and binds identity to the authenticated key", async () => {
    const request = Object.assign(
      new NextRequest("http://localhost/api/v1/assistant/chat", {
        method: "POST",
        headers: { "X-Email-Account-ID": "another-account" },
        body: JSON.stringify({ emailAccountId: "another-account" }),
      }),
      {
        apiAuth: {
          userId: "owner",
          emailAccountId: "key-account",
          email: "owner@example.com",
        },
        logger: createTestLogger(),
      },
    );

    await POST(request, { params: Promise.resolve({}) });

    expect(register).toHaveBeenCalledWith(
      "v1/assistant/chat",
      ["ASSISTANT_CHAT"],
      expect.any(Function),
    );
    expect(handler.mock.calls[0]?.[0].auth).toEqual({
      userId: "owner",
      emailAccountId: "key-account",
      email: "owner@example.com",
    });
  });
});
