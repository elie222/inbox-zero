import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";

const createRuleMock = vi.hoisted(() => vi.fn());

vi.mock("@/utils/rule/rule", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/rule/rule")>();
  return {
    ...actual,
    createRule: createRuleMock,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u1", email: "owner@example.com" } })),
}));

import prisma from "@/utils/__mocks__/prisma";
import { confirmAssistantCreateRule } from "@/utils/actions/assistant-chat";
import { confirmAssistantCreateRuleForAccount } from "@/utils/actions/assistant-chat-confirmation";

function buildPendingCreateRulePart({
  output,
}: {
  output?: Record<string, unknown>;
} = {}) {
  return {
    type: "tool-createRule",
    toolCallId: "tool-cr-1",
    state: "output-available",
    input: {
      name: "Auto reply",
      condition: {
        conditionalOperator: null,
        aiInstructions: null,
        static: { from: "@acme.com", to: null, subject: null },
      },
      actions: [
        {
          type: "REPLY",
          fields: {
            content: "{{AI_DRAFT}}",
            to: null,
            subject: null,
            label: null,
            webhookUrl: null,
            cc: null,
            bcc: null,
          },
        },
      ],
    },
    output: {
      success: true,
      actionType: "create_rule",
      requiresConfirmation: true,
      confirmationState: "pending",
      riskMessages: ["Medium Risk: templates"],
      ...output,
    },
  };
}

describe("confirmAssistantCreateRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createRuleMock.mockResolvedValue({
      id: "rule-created-1",
      actions: [],
    } as Awaited<ReturnType<typeof createRuleMock>>);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for pending rule persistence when waitForPersistence is enabled", async () => {
    vi.useFakeTimers();

    prisma.chatMessage.findMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        {
          id: "assistant-message-1",
          chatId: "chat-1",
          updatedAt: new Date("2026-02-23T00:00:00.000Z"),
          parts: [buildPendingCreateRulePart()],
        },
      ] as never);
    prisma.chatMessage.findFirst.mockResolvedValue({
      id: "assistant-message-1",
      chatId: "chat-1",
      updatedAt: new Date("2026-02-23T00:00:00.000Z"),
      parts: [
        buildPendingCreateRulePart({
          output: {
            confirmationState: "processing",
            confirmationProcessingAt: "2026-02-23T00:00:00.000Z",
          },
        }),
      ],
    } as never);

    prisma.chatMessage.updateMany.mockResolvedValue({ count: 1 } as never);

    const resultPromise = confirmAssistantCreateRuleForAccount({
      chatId: "chat-1",
      toolCallId: "tool-cr-1",
      waitForPersistence: true,
      emailAccountId: "ea_1",
      provider: "google",
      logger: createScopedLogger("assistant-chat-create-rule.test"),
    });

    await vi.runAllTimersAsync();

    const result = await resultPromise;

    expect(result.confirmationState).toBe("confirmed");
    expect(prisma.chatMessage.findMany).toHaveBeenCalledTimes(3);
    expect(createRuleMock).toHaveBeenCalledTimes(1);
  });

  it("waits for pending rule persistence in the web confirmation action", async () => {
    vi.useFakeTimers();

    (
      prisma.emailAccount.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      email: "owner@example.com",
      account: { userId: "u1", provider: "google" },
    });

    prisma.chatMessage.findMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        {
          id: "assistant-message-1",
          chatId: "chat-1",
          updatedAt: new Date("2026-02-23T00:00:00.000Z"),
          parts: [buildPendingCreateRulePart()],
        },
      ] as never);
    prisma.chatMessage.findFirst.mockResolvedValue({
      id: "assistant-message-1",
      chatId: "chat-1",
      updatedAt: new Date("2026-02-23T00:00:00.000Z"),
      parts: [
        buildPendingCreateRulePart({
          output: {
            confirmationState: "processing",
            confirmationProcessingAt: "2026-02-23T00:00:00.000Z",
          },
        }),
      ],
    } as never);

    prisma.chatMessage.updateMany.mockResolvedValue({ count: 1 } as never);

    const resultPromise = confirmAssistantCreateRule(
      "ea_1" as never,
      {
        chatId: "chat-1",
        toolCallId: "tool-cr-1",
      } as never,
    );

    await vi.runAllTimersAsync();

    const result = await resultPromise;

    expect(result?.data?.confirmationState).toBe("confirmed");
    expect(prisma.chatMessage.findMany).toHaveBeenCalledTimes(3);
    expect(createRuleMock).toHaveBeenCalledTimes(1);
  });

  it("creates rule with chat risk confirmation and persists assistant part", async () => {
    (
      prisma.emailAccount.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      email: "owner@example.com",
      account: { userId: "u1", provider: "google" },
    });

    prisma.chatMessage.findFirst.mockResolvedValue({
      id: "cm-1",
      chatId: "chat-1",
      updatedAt: new Date("2026-02-23T00:00:00.000Z"),
      parts: [buildPendingCreateRulePart()],
    } as never);

    prisma.chatMessage.updateMany.mockResolvedValue({ count: 1 } as never);

    const result = await confirmAssistantCreateRule(
      "ea_1" as never,
      {
        chatId: "chat-1",
        chatMessageId: "cm-1",
        toolCallId: "tool-cr-1",
      } as never,
    );

    expect(createRuleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enablement: { source: "chat", chatRiskConfirmed: true },
      }),
    );
    expect(createRuleMock.mock.calls[0][0]).toMatchObject({
      emailAccountId: "ea_1",
    });
    expect(result?.data?.ruleId).toBe("rule-created-1");
    expect(result?.data?.confirmationState).toBe("confirmed");

    const updatedParts = (
      prisma.chatMessage.updateMany.mock.calls[1][0] as {
        data: { parts: { output: Record<string, unknown> }[] };
      }
    ).data.parts;
    expect(updatedParts[0].output.confirmationState).toBe("confirmed");
    expect(updatedParts[0].output.ruleId).toBe("rule-created-1");
  });

  it("returns an error when confirmation persistence fails", async () => {
    const logger = createScopedLogger("assistant-chat-create-rule.test");

    prisma.chatMessage.findFirst.mockResolvedValue({
      id: "cm-1",
      chatId: "chat-1",
      updatedAt: new Date("2026-02-23T00:00:00.000Z"),
      parts: [buildPendingCreateRulePart()],
    } as never);

    prisma.chatMessage.updateMany
      .mockResolvedValueOnce({ count: 1 } as never)
      .mockResolvedValue({ count: 0 } as never);

    await expect(
      confirmAssistantCreateRuleForAccount({
        chatId: "chat-1",
        chatMessageId: "cm-1",
        toolCallId: "tool-cr-1",
        emailAccountId: "ea_1",
        provider: "google",
        logger,
      }),
    ).rejects.toThrow(
      "Rule was created but confirmation state could not be saved. Please refresh and try again.",
    );

    expect(createRuleMock).toHaveBeenCalledTimes(1);
    expect(prisma.chatMessage.updateMany).toHaveBeenCalledTimes(4);
  });

  it("does not clear processing when a newer confirmed state already exists", async () => {
    const logger = createScopedLogger("assistant-chat-create-rule.test");
    const pendingPart = buildPendingCreateRulePart();
    const processingAt = "2026-02-23T00:01:00.000Z";
    const processingPart = buildPendingCreateRulePart({
      output: {
        confirmationState: "processing",
        confirmationProcessingAt: processingAt,
      },
    });
    const confirmedPart = buildPendingCreateRulePart({
      output: {
        confirmationState: "confirmed",
        ruleId: "rule-created-1",
        confirmationResult: {
          ruleId: "rule-created-1",
          confirmedAt: "2026-02-23T00:02:00.000Z",
        },
      },
    });

    let storedMessage = {
      id: "cm-1",
      chatId: "chat-1",
      updatedAt: new Date("2026-02-23T00:00:00.000Z"),
      parts: [pendingPart],
    };

    prisma.chatMessage.findFirst
      .mockResolvedValueOnce({ ...storedMessage } as never)
      .mockResolvedValueOnce({
        id: "cm-1",
        chatId: "chat-1",
        updatedAt: new Date("2026-02-23T00:01:00.000Z"),
        parts: [processingPart],
      } as never);

    prisma.chatMessage.updateMany.mockImplementation(async (args) => {
      const where = args.where as { updatedAt?: Date };

      if (where.updatedAt?.toISOString() === "2026-02-23T00:00:00.000Z") {
        storedMessage = {
          ...storedMessage,
          updatedAt: new Date("2026-02-23T00:01:00.000Z"),
          parts: [processingPart],
        };
        return { count: 1 } as never;
      }

      storedMessage = {
        ...storedMessage,
        updatedAt: new Date("2026-02-23T00:02:00.000Z"),
        parts: [confirmedPart],
      };

      return { count: 0 } as never;
    });

    createRuleMock.mockRejectedValueOnce(new Error("create failed"));

    await expect(
      confirmAssistantCreateRuleForAccount({
        chatId: "chat-1",
        chatMessageId: "cm-1",
        toolCallId: "tool-cr-1",
        emailAccountId: "ea_1",
        provider: "google",
        logger,
      }),
    ).rejects.toThrow("create failed");

    expect(
      (storedMessage.parts[0] as { output: { confirmationState: string } })
        .output.confirmationState,
    ).toBe("confirmed");
  });
});
