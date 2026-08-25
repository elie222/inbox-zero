import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { isRuleGeneratedMessage } from "./rule-generated-message";

vi.mock("@/utils/prisma");

describe("isRuleGeneratedMessage", () => {
  beforeEach(() => {
    vi.mocked(prisma.executedAction.findMany).mockResolvedValue([]);
  });

  it("recognizes the exact provider message saved by a sending action", async () => {
    vi.mocked(prisma.executedAction.findMany).mockResolvedValue([
      {
        sentMessageIds: ["sent-message-1"],
        executionStartedAt: new Date(),
      },
    ] as any);

    await expect(
      isRuleGeneratedMessage({
        emailAccountId: "account-1",
        threadId: "thread-1",
        messageId: "sent-message-1",
      }),
    ).resolves.toBe(true);

    expect(prisma.executedAction.findMany).toHaveBeenCalledWith({
      where: {
        type: {
          in: ["REPLY", "SEND_EMAIL", "FORWARD"],
        },
        executedRule: {
          emailAccountId: "account-1",
          threadId: "thread-1",
        },
        OR: [
          { sentMessageIds: { has: "sent-message-1" } },
          {
            executionStartedAt: { not: null },
            executionStatus: null,
          },
        ],
      },
      select: {
        executionStartedAt: true,
        sentMessageIds: true,
      },
    });
  });

  it("treats messages racing an in-flight sending action as rule-generated", async () => {
    vi.mocked(prisma.executedAction.findMany).mockResolvedValue([
      {
        sentMessageIds: [],
        executionStartedAt: new Date(),
      },
    ] as any);

    await expect(
      isRuleGeneratedMessage({
        emailAccountId: "account-1",
        threadId: "thread-1",
        messageId: "message-racing-with-send",
      }),
    ).resolves.toBe(true);
  });

  it("does not treat historical rule activity as the current message", async () => {
    await expect(
      isRuleGeneratedMessage({
        emailAccountId: "account-1",
        threadId: "thread-1",
        messageId: "manual-message-1",
      }),
    ).resolves.toBe(false);
  });
});
