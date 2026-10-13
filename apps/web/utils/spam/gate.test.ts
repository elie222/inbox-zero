import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockMessage } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import type { EmailProvider } from "@/utils/email/types";
import { filterSpam } from "./gate";
import { enabledSpamModel, resolveSpamTokens } from "./store";

vi.mock("@/utils/prisma");
vi.mock("./store", () => ({
  enabledSpamModel: vi.fn(),
  resolveSpamTokens: vi.fn(),
  withSpamMessageLock: vi.fn(
    (_accountId: string, _messageKey: string, action: () => Promise<unknown>) =>
      action(),
  ),
}));
vi.mock("./media", () => ({
  extractSpamFeatures: vi.fn(async () => ({
    tokens: new Map([["offer", 1]]),
    warnings: new Set<string>(),
  })),
}));

const message = {
  ...getMockMessage({ labelIds: ["INBOX", "UNREAD"] }),
  headers: {
    ...getMockMessage().headers,
    "message-id": "<spam-test@example.test>",
  },
};
const provider = {
  isSentMessage: vi.fn(() => false),
  markMessageSpam: vi.fn(async () => undefined),
  markMessagesReadState: vi.fn(async () => undefined),
  getMessage: vi.fn(),
  getMessageByRfc822MessageId: vi.fn(),
};
const args = {
  emailAccountId: "account",
  message,
  provider: provider as unknown as EmailProvider,
};

beforeEach(() => {
  vi.resetAllMocks();
  provider.isSentMessage.mockReturnValue(false);
  vi.mocked(enabledSpamModel).mockResolvedValue({
    id: "model",
    goodMessages: 10,
    spamMessages: 10,
    bias: 1,
    threshold: 0.9,
    revision: 1,
  } as never);
  vi.mocked(resolveSpamTokens).mockResolvedValue([
    { token: "offer", occurrences: 1, good: 0, spam: 10 },
  ] as never);
  prisma.spamTraining.findUnique.mockResolvedValue(null);
  prisma.spamDecision.findUnique.mockResolvedValue(null);
  prisma.spamDecision.upsert.mockResolvedValue({
    movedAt: null,
    moveStartedAt: null,
  } as never);
});

describe("spam read state", () => {
  it("marks only the detected spam message read before moving it to Junk", async () => {
    await expect(filterSpam(args)).resolves.toMatchObject({ spam: true });

    expect(provider.markMessagesReadState).toHaveBeenCalledExactlyOnceWith(
      [message.id],
      true,
    );
    expect(provider.markMessageSpam).toHaveBeenCalledExactlyOnceWith(
      message.id,
    );
    expect(
      provider.markMessagesReadState.mock.invocationCallOrder[0],
    ).toBeLessThan(provider.markMessageSpam.mock.invocationCallOrder[0]);
    expect(prisma.spamDecision.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { movedAt: expect.any(Date) } }),
    );
  });

  it("leaves the move retryable when marking read fails", async () => {
    provider.markMessagesReadState.mockRejectedValueOnce(new Error("Offline"));

    await expect(filterSpam(args)).rejects.toThrow("Offline");

    expect(provider.markMessageSpam).not.toHaveBeenCalled();
    expect(prisma.spamDecision.update).not.toHaveBeenCalled();
    await expect(filterSpam(args)).resolves.toMatchObject({ spam: true });
    expect(provider.markMessageSpam).toHaveBeenCalledExactlyOnceWith(
      message.id,
    );
  });

  it.each([
    false,
    true,
  ])("marks confirmed Junk read when recovering an interrupted move (relocated: %s)", async (relocated) => {
    prisma.spamDecision.findUnique.mockResolvedValue({
      verdict: "spam",
      score: 0.99,
      movedAt: null,
      moveStartedAt: new Date(),
    } as never);
    const current = {
      ...message,
      id: relocated ? "relocated-message" : message.id,
      labelIds: ["SPAM", "UNREAD"],
    };
    if (relocated) {
      provider.getMessage.mockRejectedValueOnce(new Error("Message moved"));
      provider.getMessageByRfc822MessageId.mockResolvedValue(current);
    } else {
      provider.getMessage.mockResolvedValue(current);
    }

    await expect(filterSpam(args)).resolves.toMatchObject({ spam: true });

    expect(provider.markMessagesReadState).toHaveBeenCalledExactlyOnceWith(
      [current.id],
      true,
    );
    expect(provider.markMessageSpam).not.toHaveBeenCalled();
  });

  it("does not mark a manually rescued message read during move recovery", async () => {
    prisma.spamDecision.findUnique.mockResolvedValue({
      verdict: "spam",
      score: 0.99,
      movedAt: null,
      moveStartedAt: new Date(),
    } as never);
    provider.getMessage.mockResolvedValue(message);

    await expect(filterSpam(args)).rejects.toThrow("uncertain");

    expect(provider.markMessagesReadState).not.toHaveBeenCalled();
    expect(provider.markMessageSpam).not.toHaveBeenCalled();
  });

  it("does not mark good messages read", async () => {
    vi.mocked(resolveSpamTokens).mockResolvedValue([]);

    await expect(filterSpam(args)).resolves.toMatchObject({ spam: false });

    expect(provider.markMessagesReadState).not.toHaveBeenCalled();
    expect(provider.markMessageSpam).not.toHaveBeenCalled();
  });

  it("does not mark spam read in test mode", async () => {
    await expect(filterSpam({ ...args, isTest: true })).resolves.toMatchObject({
      spam: true,
    });

    expect(provider.markMessagesReadState).not.toHaveBeenCalled();
    expect(provider.markMessageSpam).not.toHaveBeenCalled();
  });
});
