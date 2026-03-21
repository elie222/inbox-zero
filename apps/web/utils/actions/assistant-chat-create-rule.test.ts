import { beforeEach, describe, expect, it, vi } from "vitest";

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

function buildPendingCreateRulePart() {
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
    prisma.chatMessage.update.mockResolvedValue({ id: "cm-1" } as never);

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
      prisma.chatMessage.update.mock.calls[0][0] as {
        data: { parts: { output: Record<string, unknown> }[] };
      }
    ).data.parts;
    expect(updatedParts[0].output.confirmationState).toBe("confirmed");
    expect(updatedParts[0].output.ruleId).toBe("rule-created-1");
  });
});
