import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { isRuleGeneratedMessage } from "./rule-generated-message";

vi.mock("@/utils/prisma");

describe("isRuleGeneratedMessage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T12:00:00.000Z"));
    vi.mocked(prisma.executedAction.findMany).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
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
            executionStartedAt: {
              gte: new Date("2026-08-24T11:59:00.000Z"),
            },
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

  it("defers attribution while a sending action is still executing", async () => {
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
    ).rejects.toThrow("Message attribution is still pending");
  });

  it("ignores incomplete attribution after the retry window", async () => {
    vi.mocked(prisma.executedAction.findMany).mockResolvedValue([
      {
        sentMessageIds: [],
        executionStartedAt: new Date("2026-08-24T11:58:59.999Z"),
      },
    ] as any);

    await expect(
      isRuleGeneratedMessage({
        emailAccountId: "account-1",
        threadId: "thread-1",
        messageId: "manual-message-1",
      }),
    ).resolves.toBe(false);
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
