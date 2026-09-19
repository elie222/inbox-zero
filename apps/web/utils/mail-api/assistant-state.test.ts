import { describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { readAssistantStatePage } from "./assistant-state";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

describe("readAssistantStatePage", () => {
  it("maps executed rules and actions into assistant catch-up entries", async () => {
    prisma.executedRule.findMany.mockResolvedValue([
      {
        id: "rule-1",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        messageId: "m1",
        threadId: "c1",
        status: "APPLIED",
        actionItems: [
          { id: "act-1", type: "ARCHIVE", executionStatus: "COMPLETED" },
        ],
      },
    ]);
    const page = await readAssistantStatePage({
      emailAccountId: "acc-1",
      cursor: null,
    });
    expect(page.entries).toEqual([
      {
        id: "rule-1:act-1",
        revision: "2026-01-01T00:00:00.000Z",
        messageId: "m1",
        conversationId: "c1",
        kind: "ARCHIVE",
        payload: {
          executedRuleId: "rule-1",
          status: "APPLIED",
          executionStatus: "COMPLETED",
        },
      },
    ]);
    expect(page.nextCursor).toBe("rule-1");
  });

  it("keeps the current cursor when there are no further executed rules", async () => {
    prisma.executedRule.findMany.mockResolvedValue([]);
    const page = await readAssistantStatePage({
      emailAccountId: "acc-1",
      cursor: "rule-1",
    });
    expect(page.entries).toEqual([]);
    expect(page.cursor).toBe("rule-1");
    expect(page.nextCursor).toBe("rule-1");
  });
});
