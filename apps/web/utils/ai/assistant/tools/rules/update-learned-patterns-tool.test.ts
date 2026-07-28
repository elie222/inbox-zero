import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import {
  removeConflictingFromPatterns,
  saveLearnedPatterns,
} from "@/utils/rule/learned-patterns";
import { updateLearnedPatternsTool } from "./update-learned-patterns-tool";

vi.mock("@/utils/prisma");
vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPatterns: vi.fn(),
  removeConflictingFromPatterns: vi.fn().mockResolvedValue(undefined),
}));

const logger = createTestLogger();

describe("updateLearnedPatternsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks stale-read guidance as hidden from user display", async () => {
    const toolInstance = updateLearnedPatternsTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      logger,
      getRuleReadState: () => null,
    });

    const result = await toolInstance.execute({
      ruleName: "VIP senders",
      learnedPatterns: [
        {
          include: {
            from: "vip@example.com",
          },
        },
      ],
    });

    expect(result).toEqual({
      success: false,
      error:
        "No rule was changed. Call getUserRulesAndSettings immediately before updating this rule.",
      toolErrorVisibility: "hidden",
    });
    expect(prisma.rule.findUnique).not.toHaveBeenCalled();
  });

  it("marks missing-rule retry guidance as hidden from user display", async () => {
    prisma.rule.findUnique.mockResolvedValueOnce(null);

    const toolInstance = updateLearnedPatternsTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      logger,
      getRuleReadState: () => ({
        readAt: Date.now(),
        rulesRevision: 3,
        ruleUpdatedAtByName: new Map([
          ["VIP senders", "2026-04-12T10:00:00.000Z"],
        ]),
      }),
    });

    const result = await toolInstance.execute({
      ruleName: "VIP senders",
      learnedPatterns: [
        {
          exclude: {
            from: "sender@example.com",
          },
        },
      ],
    });

    expect(result).toEqual({
      success: false,
      error:
        "Rule not found. Try listing the rules again. The user may have made changes since you last checked.",
      toolErrorVisibility: "hidden",
    });
  });

  it("returns a failure when saving learned patterns fails", async () => {
    prisma.rule.findUnique
      .mockResolvedValueOnce({
        id: "rule-1",
        name: "VIP senders",
        updatedAt: new Date("2026-04-12T10:00:00.000Z"),
        emailAccount: {
          rulesRevision: 3,
        },
      } as any)
      .mockResolvedValueOnce({
        id: "rule-1",
        name: "VIP senders",
        updatedAt: new Date("2026-04-12T10:00:00.000Z"),
        emailAccount: {
          rulesRevision: 3,
        },
      } as any);

    vi.mocked(saveLearnedPatterns).mockResolvedValue({
      error: "Failed to update learned patterns",
    });

    const toolInstance = updateLearnedPatternsTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      logger,
      getRuleReadState: () => ({
        readAt: Date.now(),
        rulesRevision: 3,
        ruleUpdatedAtByName: new Map([
          ["VIP senders", "2026-04-12T10:00:00.000Z"],
        ]),
      }),
    });

    const result = await toolInstance.execute({
      ruleName: "VIP senders",
      learnedPatterns: [
        {
          include: {
            from: "vip@example.com",
          },
        },
      ],
    });

    expect(result).toEqual({
      success: false,
      error: "Failed to update learned patterns",
    });
    expect(removeConflictingFromPatterns).not.toHaveBeenCalled();
  });

  it("clears conflicting sender patterns on other rules for saved includes", async () => {
    const rule = {
      id: "rule-1",
      name: "VIP senders",
      updatedAt: new Date("2026-04-12T10:00:00.000Z"),
      emailAccount: {
        rulesRevision: 3,
      },
    } as any;
    prisma.rule.findUnique.mockResolvedValue(rule);
    vi.mocked(saveLearnedPatterns).mockResolvedValue({ success: true });

    const readState = () => ({
      readAt: Date.now(),
      rulesRevision: 3,
      ruleUpdatedAtByName: new Map([
        ["VIP senders", "2026-04-12T10:00:00.000Z"],
      ]),
    });

    const toolInstance = updateLearnedPatternsTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      logger,
      getRuleReadState: readState,
    });

    const result = await toolInstance.execute({
      ruleName: "VIP senders",
      learnedPatterns: [
        {
          include: { from: "vip@example.com" },
          exclude: { from: "spam@example.com" },
        },
      ],
    });

    expect(result).toEqual({ success: true, ruleId: "rule-1" });
    // Only the include participates in conflict cleanup — the exclude can't
    // misroute mail on this rule
    expect(removeConflictingFromPatterns).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
      ruleId: "rule-1",
      values: ["vip@example.com"],
      logger,
    });
  });

  it("does not run conflict cleanup for exclude-only updates", async () => {
    prisma.rule.findUnique.mockResolvedValue({
      id: "rule-1",
      name: "VIP senders",
      updatedAt: new Date("2026-04-12T10:00:00.000Z"),
      emailAccount: {
        rulesRevision: 3,
      },
    } as any);
    vi.mocked(saveLearnedPatterns).mockResolvedValue({ success: true });

    const toolInstance = updateLearnedPatternsTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      logger,
      getRuleReadState: () => ({
        readAt: Date.now(),
        rulesRevision: 3,
        ruleUpdatedAtByName: new Map([
          ["VIP senders", "2026-04-12T10:00:00.000Z"],
        ]),
      }),
    });

    const result = await toolInstance.execute({
      ruleName: "VIP senders",
      learnedPatterns: [{ exclude: { from: "spam@example.com" } }],
    });

    expect(result).toEqual({ success: true, ruleId: "rule-1" });
    expect(removeConflictingFromPatterns).not.toHaveBeenCalled();
  });
});
