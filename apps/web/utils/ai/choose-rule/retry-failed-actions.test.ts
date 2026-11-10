import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  ActionType,
  ExecutedActionStatus,
  ExecutedRuleStatus,
} from "@/generated/prisma/enums";
import { runActionFunction } from "@/utils/ai/actions";
import { retryFailedRuleActions } from "@/utils/ai/choose-rule/retry-failed-actions";
import prisma from "@/utils/prisma";
import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";
import { createTestLogger } from "@/__tests__/helpers";

vi.mock("@/utils/ai/actions", () => ({
  runActionFunction: vi.fn(),
}));

vi.mock("@/utils/ai/choose-rule/draft-management", () => ({
  updateExecutedActionWithDraftId: vi.fn(),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    executedAction: {
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    executedRule: {
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
    scheduledAction: {
      count: vi.fn(),
    },
  },
}));

const mockRunActionFunction = runActionFunction as Mock;
const mockFindExecutedRule = prisma.executedRule.findUnique as Mock;
const mockExecutedRuleUpdate = prisma.executedRule.update as Mock;
const mockFindExistingDraft = prisma.executedAction.findFirst as Mock;
const mockClaimExecutedRule = prisma.executedRule.updateMany as Mock;
const mockCountFailedScheduledActions = prisma.scheduledAction.count as Mock;

const logger = createTestLogger();
const client = {} as EmailProvider;
const emailAccount = {
  email: "user@example.com",
  id: "email-account-1",
  userId: "user-1",
};
const message: ParsedMessage = {
  id: "message-1",
  threadId: "thread-1",
  snippet: "",
  historyId: "history-1",
  inline: [],
  headers: {
    from: "sender@example.com",
    to: "user@example.com",
    subject: "Subject",
    date: "Mon, 1 Jan 2026 12:00:00 +0000",
    "message-id": "<message-1>",
  },
  subject: "Subject",
  date: "2026-01-01T12:00:00.000Z",
  internalDate: "1700000000000",
};

describe("retryFailedRuleActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunActionFunction.mockResolvedValue(undefined);
    mockFindExistingDraft.mockResolvedValue(null);
    mockClaimExecutedRule.mockResolvedValue({ count: 1 });
    mockCountFailedScheduledActions.mockResolvedValue(0);
  });

  it("completes an archive that failed on a rate limit without repeating actions that succeeded", async () => {
    mockFindExecutedRule.mockResolvedValue(
      buildExecutedRule([
        action("label", ActionType.LABEL, ExecutedActionStatus.SUCCEEDED),
        action("archive", ActionType.ARCHIVE, ExecutedActionStatus.FAILED),
        action("mark-read", ActionType.MARK_READ, null),
      ]),
    );

    const status = await retry();

    expect(ranActionIds()).toEqual(["archive", "mark-read"]);
    expect(status).toBe(ExecutedRuleStatus.APPLIED);
    expect(mockExecutedRuleUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { status: ExecutedRuleStatus.APPLIED },
      }),
    );
  });

  it.each([
    ActionType.SEND_EMAIL,
    ActionType.REPLY,
    ActionType.FORWARD,
    ActionType.NOTIFY_SENDER,
    ActionType.NOTIFY_MESSAGING_CHANNEL,
    ActionType.CALL_WEBHOOK,
  ])("never runs %s again and keeps the rule in error", async (type) => {
    mockFindExecutedRule.mockResolvedValue(
      buildExecutedRule([
        action("archive", ActionType.ARCHIVE, ExecutedActionStatus.FAILED),
        action("unsafe", type, null),
      ]),
    );

    const status = await retry();

    expect(ranActionIds()).toEqual(["archive"]);
    expect(status).toBe(ExecutedRuleStatus.ERROR);
    expect(mockExecutedRuleUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { status: ExecutedRuleStatus.ERROR },
      }),
    );
  });

  it("does nothing when only actions that are unsafe to repeat are left", async () => {
    mockFindExecutedRule.mockResolvedValue(
      buildExecutedRule([
        action("archive", ActionType.ARCHIVE, ExecutedActionStatus.SUCCEEDED),
        action("send", ActionType.SEND_EMAIL, ExecutedActionStatus.FAILED),
      ]),
    );

    const status = await retry();

    expect(mockRunActionFunction).not.toHaveBeenCalled();
    expect(mockExecutedRuleUpdate).not.toHaveBeenCalled();
    expect(status).toBe(ExecutedRuleStatus.ERROR);
  });

  it("creates a draft that never got created", async () => {
    mockFindExecutedRule.mockResolvedValue(
      buildExecutedRule([
        action("draft", ActionType.DRAFT_EMAIL, ExecutedActionStatus.FAILED),
      ]),
    );

    await retry();

    expect(ranActionIds()).toEqual(["draft"]);
    expect(mockFindExistingDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: ActionType.DRAFT_EMAIL,
          draftId: { not: null },
          executedRule: {
            emailAccountId: "email-account-1",
            threadId: "thread-1",
            ruleId: "rule-1",
          },
        }),
      }),
    );
  });

  it("does not create a second draft when the rule already drafted a reply in the thread", async () => {
    mockFindExistingDraft.mockResolvedValue({ id: "earlier-draft-action" });
    mockFindExecutedRule.mockResolvedValue(
      buildExecutedRule([
        action("draft", ActionType.DRAFT_EMAIL, ExecutedActionStatus.FAILED),
        action("archive", ActionType.ARCHIVE, null),
      ]),
    );

    await retry();

    expect(ranActionIds()).toEqual(["archive"]);
  });

  it("does not create a draft when the run has draft replies turned off", async () => {
    mockFindExecutedRule.mockResolvedValue(
      buildExecutedRule([
        action("draft", ActionType.DRAFT_EMAIL, ExecutedActionStatus.FAILED),
        action("archive", ActionType.ARCHIVE, null),
      ]),
    );

    const status = await retry({ skipDraftReplies: true });

    expect(ranActionIds()).toEqual(["archive"]);
    expect(status).toBe(ExecutedRuleStatus.ERROR);
  });

  it("does not run actions while another run is already retrying them", async () => {
    mockClaimExecutedRule.mockResolvedValue({ count: 0 });
    mockFindExecutedRule.mockResolvedValue(
      buildExecutedRule([
        action("draft", ActionType.DRAFT_EMAIL, ExecutedActionStatus.FAILED),
      ]),
    );

    await retry();

    expect(mockRunActionFunction).not.toHaveBeenCalled();
  });

  it("keeps the rule in error when one of its scheduled actions failed", async () => {
    mockCountFailedScheduledActions.mockResolvedValue(1);
    mockFindExecutedRule.mockResolvedValue(
      buildExecutedRule([
        action("archive", ActionType.ARCHIVE, ExecutedActionStatus.FAILED),
      ]),
    );

    const status = await retry();

    expect(ranActionIds()).toEqual(["archive"]);
    expect(status).toBe(ExecutedRuleStatus.ERROR);
  });

  it("leaves results that are not in error alone", async () => {
    mockFindExecutedRule.mockResolvedValue({
      ...buildExecutedRule([
        action("archive", ActionType.ARCHIVE, ExecutedActionStatus.FAILED),
      ]),
      status: ExecutedRuleStatus.APPLYING,
    });

    const status = await retry();

    expect(mockRunActionFunction).not.toHaveBeenCalled();
    expect(status).toBe(ExecutedRuleStatus.APPLYING);
  });
});

function retry({ skipDraftReplies }: { skipDraftReplies?: boolean } = {}) {
  return retryFailedRuleActions({
    client,
    executedRuleId: "executed-rule-1",
    message,
    emailAccount,
    skipDraftReplies,
    logger,
  });
}

function ranActionIds() {
  return mockRunActionFunction.mock.calls.map(([options]) => options.action.id);
}

function buildExecutedRule(actionItems: ReturnType<typeof action>[]) {
  return {
    id: "executed-rule-1",
    ruleId: "rule-1",
    threadId: "thread-1",
    messageId: "message-1",
    emailAccountId: "email-account-1",
    automated: true,
    reason: "Rule matched",
    createdAt: new Date("2026-01-01T12:00:00.000Z"),
    updatedAt: new Date("2026-01-01T12:00:00.000Z"),
    status: ExecutedRuleStatus.ERROR,
    actionItems,
  };
}

function action(
  id: string,
  type: ActionType,
  executionStatus: ExecutedActionStatus | null,
) {
  return { id, type, executionStatus, draftId: null };
}
