import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmail, getEmailAccount } from "@/__tests__/helpers";
import { aiDraftFollowUp } from "@/utils/ai/reply/draft-follow-up";

const { mockCreateGenerateObject, mockGenerateObject } = vi.hoisted(() => {
  const mockGenerateObject = vi.fn();
  const mockCreateGenerateObject = vi.fn(() => mockGenerateObject);
  return { mockCreateGenerateObject, mockGenerateObject };
});

vi.mock("server-only", () => ({}));

vi.mock("@/utils/llms/model", () => ({
  getModel: vi.fn(() => ({
    provider: "openai",
    modelName: "test-model",
    model: {},
    providerOptions: undefined,
    fallbackModels: [],
  })),
}));

vi.mock("@/utils/llms/index", () => ({
  createGenerateObject: mockCreateGenerateObject,
}));

describe("aiDraftFollowUp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes thread-language instructions in generation prompts", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        reply: "Seguimiento rapido.",
      },
    });

    const result = await aiDraftFollowUp(getDraftParams());

    expect(result).toBe("Seguimiento rapido.");
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    const [callArgs] = mockGenerateObject.mock.calls[0]!;

    expect(callArgs.system).toContain(
      "Write the follow-up in the same language as the latest message in the thread.",
    );
    expect(callArgs.prompt).toContain(
      "IMPORTANT: You are writing an email as user@example.com. Write the follow-up from their perspective.",
    );
  });
});

function getDraftParams() {
  const messageFromSender = getEmail({
    from: "contact@example.com",
    to: "user@example.com",
    subject: "Reunion",
    content: "Podemos cerrar esto hoy?",
    date: new Date("2026-02-05T10:00:00.000Z"),
  });
  const latestMessageFromUser = getEmail({
    from: "user@example.com",
    to: "contact@example.com",
    subject: "Reunion",
    content: "Si, te mando una actualizacion hoy.",
    date: new Date("2026-02-05T11:00:00.000Z"),
  });

  const baseEmailAccount = getEmailAccount({
    email: "user@example.com",
  });
  const emailAccount = {
    ...baseEmailAccount,
    user: {
      ...baseEmailAccount.user,
      aiProvider: "openai",
      aiModel: "gpt-5.1",
      aiApiKey: null,
    },
  };

  return {
    messages: [
      { ...messageFromSender, id: "msg-1" },
      { ...latestMessageFromUser, id: "msg-2" },
    ],
    emailAccount,
    writingStyle: null,
  } as Parameters<typeof aiDraftFollowUp>[0];
}
