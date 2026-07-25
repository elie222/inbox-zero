import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createGenerateObject } from "@/utils/llms";
import { getEmailAccount, createTestLogger } from "@/__tests__/helpers";
import { getContactInboxPriorityOverride } from "./contact-inbox-priority";

vi.mock("@/utils/prisma");
vi.mock("@/utils/llms", () => ({
  createGenerateObject: vi.fn(),
}));
vi.mock("@/utils/llms/use-cases", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getModelForUseCase: vi.fn(() => ({}) as never),
}));

const logger = createTestLogger();

const message = {
  id: "message-1",
  threadId: "thread-1",
  snippet: "",
  historyId: "history-1",
  inline: [],
  attachments: [],
  textPlain: "Hey Chris, the order shipped.",
  headers: {
    from: "Jane Doe <jane@example.com>",
    to: "user@test.com",
    subject: "Order update",
    date: "Mon, 1 Jan 2026 12:00:00 +0000",
    "message-id": "<message-1>",
  },
} as any;

function mockAiDecision(object: { keepInInbox: boolean; reason: string }) {
  const generate = vi.fn().mockResolvedValue({ object });
  vi.mocked(createGenerateObject).mockReturnValue(generate as never);
  return generate;
}

describe("getContactInboxPriorityOverride", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when the sender has no saved contact", async () => {
    prisma.contact.findUnique.mockResolvedValue(null);

    const result = await getContactInboxPriorityOverride({
      message,
      emailAccount: getEmailAccount(),
      logger,
    });

    expect(result).toBeNull();
    expect(createGenerateObject).not.toHaveBeenCalled();
  });

  it("returns a reason without calling the LLM for ALWAYS", async () => {
    prisma.contact.findUnique.mockResolvedValue({
      inboxPriority: "ALWAYS",
      inboxPriorityInstructions: null,
    } as any);

    const result = await getContactInboxPriorityOverride({
      message,
      emailAccount: getEmailAccount(),
      logger,
    });

    expect(result?.reason).toContain("always stay in the inbox");
    expect(createGenerateObject).not.toHaveBeenCalled();
  });

  it("keeps the email in the inbox when the AI matches the instructions", async () => {
    prisma.contact.findUnique.mockResolvedValue({
      inboxPriority: "AI",
      inboxPriorityInstructions: "Only when they mention my name",
    } as any);
    const generate = mockAiDecision({
      keepInInbox: true,
      reason: "The email greets the user by name",
    });

    const result = await getContactInboxPriorityOverride({
      message,
      emailAccount: getEmailAccount(),
      logger,
    });

    expect(result?.reason).toContain("greets the user by name");
    const call = generate.mock.calls[0][0];
    expect(call.system).toContain("Only when they mention my name");
    expect(call.prompt).toContain("Order update");
  });

  it("falls through to the rules when the AI says no", async () => {
    prisma.contact.findUnique.mockResolvedValue({
      inboxPriority: "AI",
      inboxPriorityInstructions: "Only when they mention my name",
    } as any);
    mockAiDecision({ keepInInbox: false, reason: "No mention of the user" });

    const result = await getContactInboxPriorityOverride({
      message,
      emailAccount: getEmailAccount(),
      logger,
    });

    expect(result).toBeNull();
  });

  it("treats AI mode with no instructions as ALWAYS", async () => {
    prisma.contact.findUnique.mockResolvedValue({
      inboxPriority: "AI",
      inboxPriorityInstructions: "   ",
    } as any);

    const result = await getContactInboxPriorityOverride({
      message,
      emailAccount: getEmailAccount(),
      logger,
    });

    expect(result?.reason).toContain("no instructions set");
    expect(createGenerateObject).not.toHaveBeenCalled();
  });

  it("keeps the email in the inbox when the AI check fails", async () => {
    prisma.contact.findUnique.mockResolvedValue({
      inboxPriority: "AI",
      inboxPriorityInstructions: "Only when they mention my name",
    } as any);
    const generate = vi.fn().mockRejectedValue(new Error("model down"));
    vi.mocked(createGenerateObject).mockReturnValue(generate as never);

    const result = await getContactInboxPriorityOverride({
      message,
      emailAccount: getEmailAccount(),
      logger,
    });

    expect(result?.reason).toContain("couldn't run the AI check");
  });
});
