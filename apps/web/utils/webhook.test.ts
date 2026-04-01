import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { callWebhook } from "./webhook";
import { WEBHOOK_ACTION_DISABLED_MESSAGE } from "@/utils/webhook-action";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    webhookActionsEnabled: true,
  },
}));

vi.mock("@/utils/prisma");
vi.mock("@/env", () => ({
  env: {
    get NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED() {
      return mockEnv.webhookActionsEnabled;
    },
  },
}));

describe("callWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.webhookActionsEnabled = true;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects before hitting the database or network when webhook actions are disabled", async () => {
    mockEnv.webhookActionsEnabled = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      callWebhook("user-1", "https://example.com/webhook", {
        email: {
          threadId: "thread-1",
          messageId: "message-1",
          subject: "Subject",
          from: "sender@example.com",
          headerMessageId: "<message-1@example.com>",
        },
        executedRule: {
          id: "executed-rule-1",
          ruleId: "rule-1",
          reason: "matched",
          automated: true,
          createdAt: new Date("2026-04-01T10:00:00.000Z"),
        },
      }),
    ).rejects.toThrow(WEBHOOK_ACTION_DISABLED_MESSAGE);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
