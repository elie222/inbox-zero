import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { isRuleGeneratedMessage } from "./rule-generated-message";

vi.mock("@/utils/prisma");

describe("isRuleGeneratedMessage", () => {
  beforeEach(() => {
    vi.mocked(prisma.executedAction.findFirst).mockResolvedValue(null);
  });

  it("recognizes the exact provider message saved by a sending action", async () => {
    vi.mocked(prisma.executedAction.findFirst).mockResolvedValue({
      id: "action-1",
    } as any);

    await expect(
      isRuleGeneratedMessage({
        emailAccountId: "account-1",
        threadId: "thread-1",
        messageId: "sent-message-1",
      }),
    ).resolves.toBe(true);

    expect(prisma.executedAction.findFirst).toHaveBeenCalledWith({
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
            executionStatus: null,
            OR: [
              { executedRule: { status: "APPLYING" } },
              { scheduledAction: { status: "EXECUTING" } },
            ],
          },
        ],
      },
      select: { id: true },
    });
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
