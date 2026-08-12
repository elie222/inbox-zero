import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmailAccount } from "@/__tests__/helpers";
import { getOnboardingChatInput } from "@/app/api/chat/onboarding/test-utils";

const { aiProcessOnboardingChatMock, convertToModelMessagesMock } = vi.hoisted(
  () => ({
    aiProcessOnboardingChatMock: vi.fn(),
    convertToModelMessagesMock: vi.fn(),
  }),
);

vi.mock("ai", () => ({
  convertToModelMessages: convertToModelMessagesMock,
  createUIMessageStream: vi.fn(),
  createUIMessageStreamResponse: vi.fn(),
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithEmailAccountTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailAccountTestMiddleware();
});

vi.mock("@/utils/user/get", () => ({
  getEmailAccountWithAi: vi.fn().mockResolvedValue(getEmailAccount()),
}));

vi.mock("@/utils/ai/onboarding/chat", () => ({
  aiProcessOnboardingChat: aiProcessOnboardingChatMock,
}));

import { POST } from "./route";

describe("onboarding chat route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects file parts before converting messages for the model", async () => {
    const response = await POST(
      new NextRequest("https://www.getinboxzero.com/api/chat/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          getOnboardingChatInput([
            {
              type: "file",
              url: "https://example.com/image.png",
              mediaType: "image/png",
            },
          ]),
        ),
      }),
      {} as never,
    );

    expect(response.status).toBe(400);
    expect(convertToModelMessagesMock).not.toHaveBeenCalled();
    expect(aiProcessOnboardingChatMock).not.toHaveBeenCalled();
  });
});
