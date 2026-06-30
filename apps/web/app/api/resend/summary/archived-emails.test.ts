import { describe, expect, it, vi } from "vitest";
import { SystemType } from "@/generated/prisma/enums";
import type { ParsedMessage } from "@/utils/types";
import { buildArchivedEmailSummaryItems } from "./archived-emails";

const { mockShouldSkipAutomatedArchiveForSender } = vi.hoisted(() => ({
  mockShouldSkipAutomatedArchiveForSender: vi.fn(),
}));

vi.mock("@/utils/ai/automated-archive-exception", () => ({
  shouldSkipAutomatedArchiveForSender: (
    ...args: Parameters<typeof mockShouldSkipAutomatedArchiveForSender>
  ) => mockShouldSkipAutomatedArchiveForSender(...args),
}));

describe("archived email summary", () => {
  it("maps archived actions to message rows grouped by rule metadata", () => {
    mockShouldSkipAutomatedArchiveForSender.mockReturnValue(false);

    const archivedAt = new Date("2026-06-02T12:00:00.000Z");

    expect(
      buildArchivedEmailSummaryItems({
        archivedActions: [
          {
            createdAt: archivedAt,
            executedRule: {
              messageId: "message-1",
              rule: { name: "Marketing", systemType: SystemType.MARKETING },
            },
          },
          {
            createdAt: archivedAt,
            executedRule: {
              messageId: "message-2",
              rule: null,
            },
          },
        ],
        messageMap: {
          "message-1": getMessage({
            id: "message-1",
            from: "Sender <sender@example.com>",
            subject: "Product update",
            snippet: "Snippet fallback",
          }),
          "message-2": getMessage({
            id: "message-2",
            from: "Other <other@example.com>",
            subject: "",
            snippet: "Snippet fallback",
          }),
        },
      }),
    ).toEqual([
      {
        from: "Sender <sender@example.com>",
        subject: "Product update",
        sentAt: archivedAt,
        ruleName: "Marketing",
      },
      {
        from: "Other <other@example.com>",
        subject: "Snippet fallback",
        sentAt: archivedAt,
        ruleName: "Automation rule",
      },
    ]);
  });

  it("skips missing messages and archive exceptions", () => {
    mockShouldSkipAutomatedArchiveForSender.mockImplementation(({ from }) =>
      from.includes("protected@example.com"),
    );

    expect(
      buildArchivedEmailSummaryItems({
        archivedActions: [
          {
            createdAt: new Date("2026-06-02T12:00:00.000Z"),
            executedRule: {
              messageId: "missing-message",
              rule: { name: "Marketing", systemType: SystemType.MARKETING },
            },
          },
          {
            createdAt: new Date("2026-06-02T12:00:00.000Z"),
            executedRule: {
              messageId: "protected-message",
              rule: { name: "Marketing", systemType: SystemType.MARKETING },
            },
          },
        ],
        messageMap: {
          "protected-message": getMessage({
            id: "protected-message",
            from: "Protected <protected@example.com>",
            subject: "Protected update",
            snippet: "Snippet",
          }),
        },
      }),
    ).toEqual([]);
  });
});

function getMessage({
  id,
  from,
  subject,
  snippet,
}: {
  id: string;
  from: string;
  subject: string;
  snippet: string;
}): ParsedMessage {
  return {
    date: "2026-06-02T12:00:00.000Z",
    headers: {
      date: "2026-06-02T12:00:00.000Z",
      from,
      subject,
      to: "user@example.com",
    },
    historyId: "history-id",
    id,
    inline: [],
    snippet,
    subject,
    threadId: `thread-${id}`,
  };
}
