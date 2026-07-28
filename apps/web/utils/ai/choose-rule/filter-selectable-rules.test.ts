import { describe, expect, it, vi } from "vitest";
import { SystemType } from "@/generated/prisma/enums";
import { createTestLogger } from "@/__tests__/helpers";
import { checkSenderReplyHistory } from "@/utils/reply-tracker/check-sender-reply-history";
import {
  filterConversationStatusRules,
  filterMultipleSystemRules,
} from "./filter-selectable-rules";
import {
  getHeaders,
  getMessage,
  getProvider,
  getRule,
} from "./match-rules-test-utils";

const logger = createTestLogger();

const provider = getProvider();

vi.mock("@/utils/prisma");
vi.mock("@/utils/reply-tracker/check-sender-reply-history", () => ({
  checkSenderReplyHistory: vi.fn(),
}));

describe("filterConversationStatusRules", () => {
  it("should filter out no-reply emails from TO_REPLY rules", async () => {
    const toReplyRule = {
      ...getRule({
        systemType: SystemType.TO_REPLY,
      }),
      instructions: "Reply to important emails",
    };
    const otherRule = {
      ...getRule({
        systemType: SystemType.NEWSLETTER,
      }),
      instructions: "Handle newsletter",
    };

    const potentialMatches = [toReplyRule, otherRule];

    const message = getMessage({
      headers: getHeaders({ from: "noreply@company.com" }),
    });

    const result = await filterConversationStatusRules(
      potentialMatches,
      message,
      provider,
      logger,
    );

    expect(result).toHaveLength(1);
    expect(result).toContain(otherRule);
  });

  it("should return all rules when no TO_REPLY rule exists", async () => {
    const newsletterRule = {
      ...getRule({
        systemType: SystemType.NEWSLETTER,
      }),
      instructions: "Handle newsletter",
    };
    const receiptRule = {
      ...getRule({
        systemType: SystemType.RECEIPT,
      }),
      instructions: "Handle receipts",
    };

    const potentialMatches = [newsletterRule, receiptRule];

    const message = getMessage({
      headers: getHeaders({ from: "user@example.com" }),
    });

    const result = await filterConversationStatusRules(
      potentialMatches,
      message,
      provider,
      logger,
    );

    // Should return all rules when no TO_REPLY rule exists
    expect(result).toHaveLength(2);
    expect(result).toContain(newsletterRule);
    expect(result).toContain(receiptRule);
  });

  it("should filter out TO_REPLY rule when sender has high received count and no replies", async () => {
    vi.mocked(checkSenderReplyHistory).mockResolvedValueOnce({
      hasReplied: false,
      receivedCount: 15,
    });

    const toReplyRule = {
      ...getRule({
        id: "to-reply-rule",
        systemType: SystemType.TO_REPLY,
      }),
      instructions: "Reply to important emails",
    };
    const otherRule = {
      ...getRule({
        systemType: SystemType.NEWSLETTER,
      }),
      instructions: "Handle newsletter",
    };

    const potentialMatches = [toReplyRule, otherRule];

    const message = getMessage({
      headers: getHeaders({ from: "sender@example.com" }),
    });

    const result = await filterConversationStatusRules(
      potentialMatches,
      message,
      provider,
      logger,
    );

    // Should filter out TO_REPLY rule
    expect(result).toHaveLength(1);
    expect(result).not.toContain(toReplyRule);
    expect(result).toContain(otherRule);
    expect(checkSenderReplyHistory).toHaveBeenCalledWith(
      provider,
      "sender@example.com",
      10,
    );
  });

  it("should keep TO_REPLY rule when sender has prior replies", async () => {
    vi.mocked(checkSenderReplyHistory).mockResolvedValueOnce({
      hasReplied: true,
      receivedCount: 20,
    });

    const toReplyRule = {
      ...getRule({
        systemType: SystemType.TO_REPLY,
      }),
      instructions: "Reply to important emails",
    };
    const otherRule = {
      ...getRule({
        systemType: SystemType.NEWSLETTER,
      }),
      instructions: "Handle newsletter",
    };

    const potentialMatches = [toReplyRule, otherRule];

    const message = getMessage({
      headers: getHeaders({ from: "friend@example.com" }),
    });

    const result = await filterConversationStatusRules(
      potentialMatches,
      message,
      provider,
      logger,
    );

    // Should keep TO_REPLY rule because sender has replied before
    expect(result).toHaveLength(2);
    expect(result).toContain(toReplyRule);
    expect(result).toContain(otherRule);
  });

  it("should keep TO_REPLY rule when received count is below threshold", async () => {
    vi.mocked(checkSenderReplyHistory).mockResolvedValueOnce({
      hasReplied: false,
      receivedCount: 5,
    });

    const toReplyRule = {
      ...getRule({
        systemType: SystemType.TO_REPLY,
      }),
      instructions: "Reply to important emails",
    };

    const potentialMatches = [toReplyRule];

    const message = getMessage({
      headers: getHeaders({ from: "newcontact@example.com" }),
    });

    const result = await filterConversationStatusRules(
      potentialMatches,
      message,
      provider,
      logger,
    );

    // Should keep TO_REPLY rule because received count is low
    expect(result).toHaveLength(1);
    expect(result).toContain(toReplyRule);
  });

  it("should handle multiple no-reply prefix variations", async () => {
    const toReplyRule = {
      ...getRule({
        systemType: SystemType.TO_REPLY,
      }),
      instructions: "Reply to important emails",
    };

    const noReplyVariations = [
      "no-reply@company.com",
      "notifications@service.com",
      "info@business.org",
      "newsletter@news.com",
      "updates@app.io",
      "account@bank.com",
    ];

    for (const email of noReplyVariations) {
      const message = getMessage({
        headers: getHeaders({ from: email }),
      });

      const result = await filterConversationStatusRules(
        [toReplyRule],
        message,
        provider,
        logger,
      );

      // All no-reply variations should return the rule (not filtered)
      expect(result).toHaveLength(0);
    }
  });

  it("should handle errors from checkSenderReplyHistory gracefully", async () => {
    vi.mocked(checkSenderReplyHistory).mockRejectedValueOnce(
      new Error("API error"),
    );

    const toReplyRule = {
      ...getRule({
        systemType: SystemType.TO_REPLY,
      }),
      instructions: "Reply to important emails",
    };

    const potentialMatches = [toReplyRule];

    const message = getMessage({
      headers: getHeaders({ from: "user@example.com" }),
    });

    const result = await filterConversationStatusRules(
      potentialMatches,
      message,
      provider,
      logger,
    );

    // Should return all rules when error occurs
    expect(result).toHaveLength(1);
    expect(result).toContain(toReplyRule);
  });

  it("should return all rules when message has no from header", async () => {
    const toReplyRule = {
      ...getRule({
        systemType: SystemType.TO_REPLY,
      }),
      instructions: "Reply to important emails",
    };

    const potentialMatches = [toReplyRule];

    const message = getMessage({
      headers: getHeaders({ from: "" }),
    });

    const result = await filterConversationStatusRules(
      potentialMatches,
      message,
      provider,
      logger,
    );

    // Should return all rules when no sender email
    expect(result).toHaveLength(1);
    expect(result).toContain(toReplyRule);
  });
});

describe("filterMultipleSystemRules", () => {
  describe("filterMultipleSystemRules branches", () => {
    it("returns all system rules when none marked primary (plus conversation rules)", () => {
      const sysA = getRuleSelectionCandidate("Sys A", "TO_REPLY");
      const sysB = getRuleSelectionCandidate("Sys B", "AWAITING_REPLY");
      const conv = getRuleSelectionCandidate("Conv", null);

      const result = filterMultipleSystemRules([
        { rule: sysA, isPrimary: false },
        { rule: sysB },
        { rule: conv },
      ]);

      expect(result).toEqual([sysA, sysB, conv]);
    });

    it("keeps only the primary system rule when multiple system rules present", () => {
      const sysA = getRuleSelectionCandidate("Sys A", "TO_REPLY");
      const sysB = getRuleSelectionCandidate("Sys B", "AWAITING_REPLY");
      const conv = getRuleSelectionCandidate("Conv", null);

      const result = filterMultipleSystemRules([
        { rule: sysA, isPrimary: false },
        { rule: sysB, isPrimary: true },
        { rule: conv },
      ]);

      expect(result).toEqual([sysB, conv]);
    });
  });
});

function getRuleSelectionCandidate(name: string, systemType: string | null) {
  return {
    name,
    instructions: "",
    systemType,
  };
}
