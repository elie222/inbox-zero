import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroupItemSource } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger, getMockMessage } from "@/__tests__/helpers";
import { getColdEmailRule } from "@/utils/cold-email/cold-email-rule";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";
import { excludeRepliedSendersFromColdEmail } from "./exclude-replied-sender";

vi.mock("@/utils/prisma");
vi.mock("@/utils/cold-email/cold-email-rule", () => ({
  getColdEmailRule: vi.fn(),
}));
vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPattern: vi.fn(),
}));

describe("excludeRepliedSendersFromColdEmail", () => {
  const logger = createTestLogger();
  const provider = {
    getMessageByRfc822MessageId: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getColdEmailRule).mockResolvedValue({
      id: "cold-email-rule",
      groupId: "cold-email-group",
    } as any);
    vi.mocked(prisma.groupItem.findMany).mockResolvedValue([]);
    provider.getMessageByRfc822MessageId.mockResolvedValue(null);
  });

  it("excludes a pinned sender using the casing it was stored under", async () => {
    vi.mocked(prisma.groupItem.findMany).mockResolvedValue([
      { value: "Cold.Sender@Example.com" },
    ] as any);

    await excludeRepliedSendersFromColdEmail({
      emailAccountId: "email-account-1",
      message: getMockMessage({ to: "cold.sender@example.com" }),
      provider,
      logger,
    });

    expect(saveLearnedPattern).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "email-account-1",
        from: "Cold.Sender@Example.com",
        ruleId: "cold-email-rule",
        exclude: true,
        source: GroupItemSource.USER,
      }),
    );
  });

  it("looks up every recipient of the reply", async () => {
    const base = getMockMessage({ to: "first@example.com" });

    await excludeRepliedSendersFromColdEmail({
      emailAccountId: "email-account-1",
      message: {
        ...base,
        headers: {
          ...base.headers,
          cc: "second@example.com",
          bcc: "third@example.com",
        },
      },
      provider,
      logger,
    });

    expect(prisma.groupItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          groupId: "cold-email-group",
          exclude: false,
          OR: [
            { value: { equals: "first@example.com", mode: "insensitive" } },
            { value: { equals: "second@example.com", mode: "insensitive" } },
            { value: { equals: "third@example.com", mode: "insensitive" } },
          ],
        }),
      }),
    );
  });

  it("excludes a pinned sender when they are only a BCC recipient", async () => {
    const message = getMockMessage({ to: "" });
    vi.mocked(prisma.groupItem.findMany).mockResolvedValue([
      { value: "hidden@example.com" },
    ] as any);

    await excludeRepliedSendersFromColdEmail({
      emailAccountId: "email-account-1",
      message: {
        ...message,
        headers: { ...message.headers, bcc: "hidden@example.com" },
      },
      provider,
      logger,
    });

    expect(saveLearnedPattern).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "hidden@example.com",
        exclude: true,
      }),
    );
  });

  it("never adds a pattern for a sender who was not already pinned", async () => {
    await excludeRepliedSendersFromColdEmail({
      emailAccountId: "email-account-1",
      message: getMockMessage({ to: "stranger@example.com" }),
      provider,
      logger,
    });

    expect(saveLearnedPattern).not.toHaveBeenCalled();
  });

  it("un-pins a sender after a manual reply even when a rule sent earlier on the thread", async () => {
    vi.mocked(prisma.executedRule.count).mockResolvedValue(1);
    vi.mocked(prisma.groupItem.findMany).mockResolvedValue([
      { value: "cold.sender@example.com" },
    ] as any);

    await excludeRepliedSendersFromColdEmail({
      emailAccountId: "email-account-1",
      message: getMockMessage({ to: "cold.sender@example.com" }),
      provider,
      logger,
    });

    expect(saveLearnedPattern).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "cold.sender@example.com",
        exclude: true,
      }),
    );
  });

  it("keeps the pattern when the current outbound message was sent by a rule", async () => {
    const message = getMockMessage({ to: "cold.sender@example.com" });

    await excludeRepliedSendersFromColdEmail({
      emailAccountId: "email-account-1",
      message: {
        ...message,
        headers: {
          ...message.headers,
          "x-inbox-zero-automated": "true",
        },
      } as any,
      provider,
      logger,
    });

    expect(getColdEmailRule).not.toHaveBeenCalled();
    expect(saveLearnedPattern).not.toHaveBeenCalled();
  });

  it("un-pins the original sender when the reply target differs from From", async () => {
    const outbound = getMockMessage({
      threadId: "thread-1",
      to: "replies@example.com",
    });
    const source = getMockMessage({
      id: "source-1",
      threadId: "thread-1",
      from: "Cold Sender <cold.sender@example.com>",
    });
    provider.getMessageByRfc822MessageId.mockResolvedValue({
      ...source,
      headers: {
        ...source.headers,
        "message-id": "<source@example.com>",
        "reply-to": "replies@example.com",
      },
    });
    vi.mocked(prisma.groupItem.findMany).mockImplementation(async (args) => {
      const matchesThread = (args.where as any).OR.some(
        (condition: any) => condition.threadId === "thread-1",
      );
      return matchesThread
        ? ([{ value: "cold.sender@example.com" }] as any)
        : [];
    });

    await excludeRepliedSendersFromColdEmail({
      emailAccountId: "email-account-1",
      message: {
        ...outbound,
        headers: {
          ...outbound.headers,
          "in-reply-to": "<source@example.com>",
        },
      },
      provider,
      logger,
    });

    expect(saveLearnedPattern).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "cold.sender@example.com",
        exclude: true,
      }),
    );
    expect(provider.getMessageByRfc822MessageId).toHaveBeenCalledWith(
      "<source@example.com>",
    );
  });

  it("does nothing when the account has no cold email group", async () => {
    vi.mocked(getColdEmailRule).mockResolvedValue({
      id: "cold-email-rule",
      groupId: null,
    } as any);

    await excludeRepliedSendersFromColdEmail({
      emailAccountId: "email-account-1",
      message: getMockMessage({ to: "someone@example.com" }),
      provider,
      logger,
    });

    expect(prisma.groupItem.findMany).not.toHaveBeenCalled();
  });

  it("does not query the cold email rule when there are no recipients", async () => {
    await excludeRepliedSendersFromColdEmail({
      emailAccountId: "email-account-1",
      message: getMockMessage({ to: "" }),
      provider,
      logger,
    });

    expect(getColdEmailRule).not.toHaveBeenCalled();
  });
});
