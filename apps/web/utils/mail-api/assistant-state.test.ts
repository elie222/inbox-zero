import { describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { readAssistantStatePage } from "./assistant-state";
import {
  ExecutedActionStatus,
  ExecutedRuleStatus,
} from "@/generated/prisma/enums";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

describe("readAssistantStatePage", () => {
  it("maps executed rules and actions into assistant catch-up entries", async () => {
    prisma.executedRule.findMany.mockResolvedValue([
      {
        id: "rule-1",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:05:00.000Z"),
        messageId: "m1",
        threadId: "c1",
        status: ExecutedRuleStatus.APPLIED,
        actionItems: [
          {
            id: "act-1",
            type: "ARCHIVE",
            executionStatus: ExecutedActionStatus.SUCCEEDED,
          },
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
        revision: "2026-01-01T00:05:00.000Z",
        messageId: "m1",
        conversationId: "c1",
        kind: "ARCHIVE",
        payload: {
          executedRuleId: "rule-1",
          status: ExecutedRuleStatus.APPLIED,
          executionStatus: ExecutedActionStatus.SUCCEEDED,
        },
      },
    ]);
    expect(JSON.parse(page.nextCursor ?? "")).toEqual({
      updatedAt: "2026-01-01T00:05:00.000Z",
      id: "rule-1",
    });
  });

  it("includes failed and skipped action status metadata", async () => {
    prisma.executedRule.findMany.mockResolvedValue([
      {
        id: "rule-1",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:02:00.000Z"),
        messageId: "m1",
        threadId: "c1",
        status: ExecutedRuleStatus.ERROR,
        actionItems: [
          {
            id: "act-1",
            type: "ARCHIVE",
            executionStatus: ExecutedActionStatus.FAILED,
          },
        ],
      },
      {
        id: "rule-2",
        createdAt: new Date("2026-01-01T00:01:00.000Z"),
        updatedAt: new Date("2026-01-01T00:03:00.000Z"),
        messageId: "m2",
        threadId: "c2",
        status: ExecutedRuleStatus.APPLIED,
        actionItems: [
          {
            id: "act-2",
            type: "ARCHIVE",
            executionStatus: ExecutedActionStatus.SKIPPED,
          },
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
        revision: "2026-01-01T00:02:00.000Z",
        messageId: "m1",
        conversationId: "c1",
        kind: "ARCHIVE",
        payload: {
          executedRuleId: "rule-1",
          status: ExecutedRuleStatus.ERROR,
          executionStatus: ExecutedActionStatus.FAILED,
        },
      },
      {
        id: "rule-2:act-2",
        revision: "2026-01-01T00:03:00.000Z",
        messageId: "m2",
        conversationId: "c2",
        kind: "ARCHIVE",
        payload: {
          executedRuleId: "rule-2",
          status: ExecutedRuleStatus.APPLIED,
          executionStatus: ExecutedActionStatus.SKIPPED,
        },
      },
    ]);
    expect(JSON.parse(page.nextCursor ?? "")).toEqual({
      updatedAt: "2026-01-01T00:03:00.000Z",
      id: "rule-2",
    });
  });

  it("uses the updatedAt and id cursor to avoid missing mutable status updates", async () => {
    const cursor = JSON.stringify({
      updatedAt: "2026-01-01T00:01:00.000Z",
      id: "rule-1",
    });
    prisma.executedRule.findMany.mockResolvedValue([]);

    await readAssistantStatePage({
      emailAccountId: "acc-1",
      cursor,
    });

    expect(prisma.executedRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          emailAccountId: "acc-1",
          OR: [
            { updatedAt: { gt: new Date("2026-01-01T00:01:00.000Z") } },
            {
              updatedAt: new Date("2026-01-01T00:01:00.000Z"),
              id: { gt: "rule-1" },
            },
          ],
        },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      }),
    );
  });

  it("emits rule status metadata when a rule has no action items", async () => {
    prisma.executedRule.findMany.mockResolvedValue([
      {
        id: "rule-1",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:01:00.000Z"),
        messageId: "m1",
        threadId: "c1",
        status: ExecutedRuleStatus.PENDING,
        actionItems: [],
      },
    ]);

    const page = await readAssistantStatePage({
      emailAccountId: "acc-1",
      cursor: null,
    });

    expect(page.entries).toEqual([
      {
        id: "rule-1",
        revision: "2026-01-01T00:01:00.000Z",
        messageId: "m1",
        conversationId: "c1",
        kind: "RULE_STATUS",
        payload: {
          executedRuleId: "rule-1",
          status: ExecutedRuleStatus.PENDING,
        },
      },
    ]);
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
