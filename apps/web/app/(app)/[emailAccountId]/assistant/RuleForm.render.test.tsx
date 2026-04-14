/** @vitest-environment jsdom */

import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import { ConditionType } from "@/utils/config";

const mockUseAccount = vi.fn();
const mockUseLabels = vi.fn();
const mockUseMessagingChannels = vi.fn();
const mockUseFolders = vi.fn();
const mockUseRouter = vi.fn();
const mockUsePostHog = vi.fn();

(globalThis as { React?: typeof React }).React = React;

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  useRouter: () => mockUseRouter(),
}));

vi.mock("posthog-js/react", () => ({
  usePostHog: () => mockUsePostHog(),
}));

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => mockUseAccount(),
}));

vi.mock("@/hooks/useLabels", () => ({
  useLabels: () => mockUseLabels(),
}));

vi.mock("@/hooks/useMessagingChannels", () => ({
  useMessagingChannels: () => mockUseMessagingChannels(),
}));

vi.mock("@/hooks/useFolders", () => ({
  useFolders: () => mockUseFolders(),
}));

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_AUTO_DRAFT_DISABLED: false,
    NEXT_PUBLIC_DIGEST_ENABLED: true,
    NEXT_PUBLIC_EMAIL_SEND_ENABLED: true,
    NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED: true,
    NEXT_PUBLIC_IS_RESEND_CONFIGURED: true,
    NEXT_PUBLIC_SUPPORT_EMAIL: "support@example.com",
    EMAIL_ENCRYPT_SECRET: "test-secret",
    EMAIL_ENCRYPT_SALT: "test-salt",
  },
}));

vi.mock("@/utils/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/utils/prisma");

vi.mock("@/utils/actions/rule", () => ({
  createRuleAction: vi.fn(),
  deleteRuleAction: vi.fn(),
  updateRuleAction: vi.fn(),
}));

vi.mock("@/utils/attachments/rule", () => ({
  handleRuleAttachmentSourceSave: vi.fn(),
}));

vi.mock("@/app/(app)/[emailAccountId]/assistant/group/LearnedPatterns", () => ({
  LearnedPatternsDialog: () => null,
}));

import { RuleForm } from "./RuleForm";

describe("RuleForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAccount.mockReturnValue({
      emailAccountId: "18d9553a-5182-4347-8cfa-75c76c72f51e",
      provider: "google",
    });
    mockUseLabels.mockReturnValue({
      userLabels: [],
      isLoading: false,
      mutate: vi.fn(),
    });
    mockUseMessagingChannels.mockReturnValue({
      data: {
        channels: [],
        availableProviders: [],
      },
    });
    mockUseFolders.mockReturnValue({
      folders: [],
      isLoading: false,
    });
    mockUseRouter.mockReturnValue({
      push: vi.fn(),
      replace: vi.fn(),
    });
    mockUsePostHog.mockReturnValue({
      capture: vi.fn(),
    });
  });

  it("renders a rule with multiple forward actions and split static conditions", () => {
    render(
      <RuleForm
        alwaysEditMode
        rule={{
          id: "cmjzoasfv000004ld2qar07t3",
          name: "Claude",
          instructions: null,
          groupId: null,
          runOnThreads: false,
          digest: false,
          conditionalOperator: LogicalOperator.AND,
          conditions: [
            {
              type: ConditionType.STATIC,
              from: "@mail.anthropic.com",
              to: null,
              subject: null,
              body: null,
              instructions: null,
            },
            {
              type: ConditionType.STATIC,
              from: null,
              to: null,
              subject: "Secure link to log in to Claude.ai",
              body: null,
              instructions: null,
            },
          ],
          actions: [
            {
              id: "action-1",
              type: ActionType.FORWARD,
              to: { value: "one@example.com" },
            },
            {
              id: "action-2",
              type: ActionType.FORWARD,
              to: { value: "two@example.com" },
            },
            {
              id: "action-3",
              type: ActionType.FORWARD,
              to: { value: "three@example.com" },
            },
            {
              id: "action-4",
              type: ActionType.FORWARD,
              to: { value: "four@example.com" },
            },
          ],
        }}
      />,
    );

    expect(screen.getByDisplayValue("Claude")).toBeTruthy();
    expect(
      screen.getByDisplayValue("Secure link to log in to Claude.ai"),
    ).toBeTruthy();
    expect(screen.getAllByDisplayValue(/@?example\.com/)).toHaveLength(4);
  });
});
