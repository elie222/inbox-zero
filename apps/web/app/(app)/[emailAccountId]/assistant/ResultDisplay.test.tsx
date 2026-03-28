/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExecutedRuleStatus } from "@/generated/prisma/enums";

const mockUseAccount = vi.fn();
const mockUseRuleDialog = vi.fn();

(globalThis as { React?: typeof React }).React = React;

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => mockUseAccount(),
}));

vi.mock("@/app/(app)/[emailAccountId]/assistant/RuleDialog", () => ({
  useRuleDialog: () => mockUseRuleDialog(),
}));

vi.mock("@/app/(app)/[emailAccountId]/assistant/group/LearnedPatterns", () => ({
  LearnedPatternsDialog: () => (
    <button type="button">View learned patterns</button>
  ),
}));

import { ResultDisplayContent } from "@/app/(app)/[emailAccountId]/assistant/ResultDisplay";

afterEach(() => {
  cleanup();
});

describe("ResultDisplayContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAccount.mockReturnValue({
      provider: "google",
    });

    mockUseRuleDialog.mockReturnValue({
      ruleDialog: {
        onOpen: vi.fn(),
      },
      RuleDialogComponent: () => null,
    });
  });

  it("shows the thread-skip hint for skipped results with skipped thread rules", () => {
    render(
      <ResultDisplayContent
        result={{
          createdAt: new Date("2025-01-01"),
          reason:
            "The email looks automated and part of an existing thread, so no eligible rule was selected.",
          status: ExecutedRuleStatus.SKIPPED,
          selectionMetadata: {
            isThread: true,
            skippedThreadRuleNames: ["Notification", "Newsletter"],
            continuedThreadRuleNames: [],
            learnedPatternExcludedRules: [],
            filteredConversationRuleNames: [],
            conversationFilterReason: undefined,
            remainingAiRuleNames: [],
          },
        }}
      />,
    );

    expect(screen.getByText("No match found")).toBeTruthy();
    expect(
      screen.getByText(
        "Some rules were skipped because this email is part of a thread.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "View skipped rules" }),
    ).toBeTruthy();
  });

  it("does not show the thread-skip hint when no thread rules were skipped", () => {
    render(
      <ResultDisplayContent
        result={{
          createdAt: new Date("2025-01-01"),
          reason: "No specific rule applies.",
          status: ExecutedRuleStatus.SKIPPED,
          selectionMetadata: {
            isThread: true,
            skippedThreadRuleNames: [],
            continuedThreadRuleNames: [],
            learnedPatternExcludedRules: [],
            filteredConversationRuleNames: [],
            conversationFilterReason: undefined,
            remainingAiRuleNames: [],
          },
        }}
      />,
    );

    expect(
      screen.queryByText(
        "Some rules were skipped because this email is part of a thread.",
      ),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "View skipped rules" }),
    ).toBeNull();
  });

  it("shows learned-pattern exclusions for skipped results", () => {
    render(
      <ResultDisplayContent
        result={{
          createdAt: new Date("2025-01-01"),
          reason: "A learned exclusion removed the expected system rule.",
          status: ExecutedRuleStatus.SKIPPED,
          selectionMetadata: {
            isThread: false,
            skippedThreadRuleNames: [],
            continuedThreadRuleNames: [],
            learnedPatternExcludedRules: [
              {
                ruleId: "rule-1",
                ruleName: "Notification",
                groupId: "group-1",
                groupName: "Notification",
                itemType: "FROM",
                itemValue: "updates@example.com",
              },
            ],
            filteredConversationRuleNames: [],
            conversationFilterReason: undefined,
            remainingAiRuleNames: ["Conversations"],
          },
        }}
      />,
    );

    expect(
      screen.getByText("Some rules were excluded by learned patterns."),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "View exclusions" }),
    ).toBeTruthy();
  });

  it("shows learned-pattern exclusions for applied results", () => {
    render(
      <ResultDisplayContent
        result={{
          createdAt: new Date("2025-01-01"),
          status: ExecutedRuleStatus.APPLIED,
          reason:
            "A matching rule was applied after exclusions removed others.",
          rule: {
            id: "rule-2",
            name: "Marketing",
            from: null,
            to: null,
            subject: null,
            body: null,
            instructions: "Promotional emails",
            conditionalOperator: "AND",
          } as any,
          selectionMetadata: {
            isThread: false,
            skippedThreadRuleNames: [],
            continuedThreadRuleNames: [],
            learnedPatternExcludedRules: [
              {
                ruleId: "rule-1",
                ruleName: "Notification",
                groupId: "group-1",
                groupName: "Notification",
                itemType: "FROM",
                itemValue: "updates@example.com",
              },
            ],
            filteredConversationRuleNames: [],
            conversationFilterReason: undefined,
            remainingAiRuleNames: ["Marketing"],
          },
        }}
      />,
    );

    expect(
      screen.getByText("Some rules were excluded by learned patterns."),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "View exclusions" }),
    ).toBeTruthy();
  });
});
