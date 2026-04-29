/** @vitest-environment jsdom */

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import { ConditionType } from "@/utils/config";

const mockUseAccount = vi.fn();
const mockUseLabels = vi.fn();
const mockUseMessagingChannels = vi.fn();
const mockUseFolders = vi.fn();
const mockUseRouter = vi.fn();
const mockUsePostHog = vi.fn();
const { mockEnv, mockUpdateRuleAction } = vi.hoisted(() => ({
  mockEnv: {
    webhookActionsEnabled: true,
  },
  mockUpdateRuleAction: vi.fn(),
}));

(globalThis as { React?: typeof React }).React = React;

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

(globalThis as { ResizeObserver?: typeof MockResizeObserver }).ResizeObserver =
  MockResizeObserver;

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
    get NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED() {
      return mockEnv.webhookActionsEnabled;
    },
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
  updateRuleAction: mockUpdateRuleAction,
}));

vi.mock("@/utils/attachments/rule", () => ({
  handleRuleAttachmentSourceSave: vi.fn(),
}));

vi.mock("@/app/(app)/[emailAccountId]/assistant/group/LearnedPatterns", () => ({
  LearnedPatternsDialog: () => null,
}));

import { RuleForm } from "./RuleForm";

describe("RuleForm", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.webhookActionsEnabled = true;

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
    mockUpdateRuleAction.mockResolvedValue({
      data: {
        rule: {
          id: "cmjzoasfv000004ld2qar07t3",
        },
      },
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

  function renderLabelRuleAndOpenActionTypeDropdown() {
    render(
      <RuleForm
        alwaysEditMode
        rule={{
          id: "cmjzoasfv000004ld2qar07t3",
          name: "Label rule",
          instructions: null,
          groupId: null,
          runOnThreads: false,
          digest: false,
          conditionalOperator: LogicalOperator.AND,
          conditions: [
            {
              type: ConditionType.STATIC,
              from: "sender@example.com",
              to: null,
              subject: null,
              body: null,
              instructions: null,
            },
          ],
          actions: [
            {
              id: "action-label",
              type: ActionType.LABEL,
              labelId: { value: "label-1", name: "Follow up" },
            },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getAllByRole("combobox")[0]);
  }

  it("shows Call webhook in the action type dropdown when webhook actions are enabled", () => {
    mockEnv.webhookActionsEnabled = true;

    renderLabelRuleAndOpenActionTypeDropdown();

    expect(screen.queryAllByText("Call webhook").length).toBeGreaterThan(0);
  });

  it("hides Call webhook from the action type dropdown when webhook actions are disabled", () => {
    mockEnv.webhookActionsEnabled = false;

    renderLabelRuleAndOpenActionTypeDropdown();

    expect(screen.queryAllByText("Call webhook")).toHaveLength(0);
  });

  it("hides existing webhook actions when webhook actions are disabled", () => {
    mockEnv.webhookActionsEnabled = false;

    render(
      <RuleForm
        alwaysEditMode
        rule={{
          id: "cmjzoasfv000004ld2qar07t3",
          name: "Webhook rule",
          instructions: null,
          groupId: null,
          runOnThreads: false,
          digest: false,
          conditionalOperator: LogicalOperator.AND,
          conditions: [
            {
              type: ConditionType.STATIC,
              from: "alerts@example.com",
              to: null,
              subject: null,
              body: null,
              instructions: null,
            },
          ],
          actions: [
            {
              id: "action-webhook",
              type: ActionType.CALL_WEBHOOK,
              url: { value: "https://example.com/webhook" },
            },
          ],
        }}
      />,
    );

    expect(
      screen.queryByPlaceholderText("https://example.com/webhook"),
    ).toBeNull();
    expect(
      screen.queryByDisplayValue("https://example.com/webhook"),
    ).toBeNull();
  });

  it("keeps draft reply destinations grouped when persisted actions arrive out of order", () => {
    mockUseMessagingChannels.mockReturnValue({
      data: {
        channels: [
          {
            id: "cmessagingchannel1234567890123",
            provider: "SLACK",
            teamName: "Workspace",
            teamId: "team-1",
            isConnected: true,
            canSendAsDm: true,
            actions: [],
            destinations: {
              ruleNotifications: {
                enabled: true,
                targetId: "U123",
                targetLabel: "Direct message",
                isDm: true,
              },
              meetingBriefs: {
                enabled: false,
                targetId: null,
                targetLabel: null,
                isDm: false,
              },
              documentFilings: {
                enabled: false,
                targetId: null,
                targetLabel: null,
                isDm: false,
              },
            },
          },
          {
            id: "cmessagingchannel1234567890456",
            provider: "TELEGRAM",
            teamName: "Telegram DM",
            teamId: "chat-1",
            isConnected: true,
            canSendAsDm: false,
            actions: [],
            destinations: {
              ruleNotifications: {
                enabled: true,
                targetId: "chat-1",
                targetLabel: "Direct message",
                isDm: true,
              },
              meetingBriefs: {
                enabled: false,
                targetId: null,
                targetLabel: null,
                isDm: false,
              },
              documentFilings: {
                enabled: false,
                targetId: null,
                targetLabel: null,
                isDm: false,
              },
            },
          },
        ],
        availableProviders: ["SLACK", "TELEGRAM"],
      },
    });

    render(
      <RuleForm
        alwaysEditMode
        rule={{
          id: "cmjzoasfv000004ld2qar07t3",
          name: "Draft reply rule",
          instructions: null,
          groupId: null,
          runOnThreads: false,
          digest: false,
          conditionalOperator: LogicalOperator.AND,
          conditions: [
            {
              type: ConditionType.STATIC,
              from: "sender@example.com",
              to: null,
              subject: null,
              body: null,
              instructions: null,
            },
          ],
          actions: [
            {
              id: "action-telegram",
              type: ActionType.DRAFT_MESSAGING_CHANNEL,
              messagingChannelId: "cmessagingchannel1234567890456",
              content: { value: "" },
            },
            {
              id: "action-email",
              type: ActionType.DRAFT_EMAIL,
              content: { value: "" },
            },
            {
              id: "action-slack",
              type: ActionType.DRAFT_MESSAGING_CHANNEL,
              messagingChannelId: "cmessagingchannel1234567890123",
              content: { value: "" },
            },
          ],
        }}
      />,
    );

    expect(screen.getAllByText("Draft to")).toHaveLength(1);
    expect(screen.getByText("Email")).toBeTruthy();
    expect(screen.getByText("Slack DM")).toBeTruthy();
    expect(screen.getByText("Telegram DM")).toBeTruthy();
  });

  it("does not show disconnected draft reply destinations as selected options", () => {
    mockUseMessagingChannels.mockReturnValue({
      data: {
        channels: [
          createMessagingChannel({
            id: "cmessagingchannel1234567890123",
            provider: "SLACK",
            teamName: "Workspace",
            teamId: "team-1",
          }),
          createMessagingChannel({
            id: "cmessagingchannel1234567890456",
            provider: "TELEGRAM",
            teamName: "Telegram DM",
            teamId: "chat-1",
          }),
        ],
        availableProviders: ["SLACK", "TELEGRAM"],
      },
    });

    render(
      <RuleForm
        alwaysEditMode
        rule={{
          id: "cmjzoasfv000004ld2qar07t3",
          name: "Draft reply rule",
          instructions: null,
          groupId: null,
          runOnThreads: false,
          digest: false,
          conditionalOperator: LogicalOperator.AND,
          conditions: [
            {
              type: ConditionType.STATIC,
              from: "sender@example.com",
              to: null,
              subject: null,
              body: null,
              instructions: null,
            },
          ],
          actions: [
            {
              id: "action-email",
              type: ActionType.DRAFT_EMAIL,
              content: { value: "" },
            },
            {
              id: "action-slack",
              type: ActionType.DRAFT_MESSAGING_CHANNEL,
              messagingChannelId: "cmessagingchannel1234567890123",
              content: { value: "" },
            },
            {
              id: "action-telegram",
              type: ActionType.DRAFT_MESSAGING_CHANNEL,
              messagingChannelId: "cmessagingchannel1234567890456",
              content: { value: "" },
            },
          ],
        }}
      />,
    );

    expect(screen.getAllByText("Draft to")).toHaveLength(1);
    expect(screen.getByText("Email")).toBeTruthy();
    expect(screen.queryByText(/Disconnected/)).toBeNull();
  });

  it("preserves the original action order when saving an unchanged rule", async () => {
    const view = render(
      <RuleForm
        alwaysEditMode
        rule={{
          id: "cmjzoasfv000004ld2qar07t3",
          name: "Sorted for display",
          instructions: null,
          groupId: null,
          runOnThreads: false,
          digest: false,
          conditionalOperator: LogicalOperator.AND,
          conditions: [
            {
              type: ConditionType.STATIC,
              from: "sender@example.com",
              to: null,
              subject: null,
              body: null,
              instructions: null,
            },
          ],
          actions: [
            {
              id: "action-reply",
              type: ActionType.REPLY,
              content: { value: "Thanks" },
            },
            {
              id: "action-label",
              type: ActionType.LABEL,
              labelId: { value: "label-1", name: "Follow up" },
            },
          ],
        }}
      />,
    );

    fireEvent.click(
      within(view.container).getByRole("button", { name: "Save" }),
    );

    await waitFor(() => expect(mockUpdateRuleAction).toHaveBeenCalledTimes(1));

    expect(mockUpdateRuleAction.mock.calls.at(-1)?.[1]).toMatchObject({
      id: "cmjzoasfv000004ld2qar07t3",
      actions: [
        expect.objectContaining({
          id: "action-reply",
          type: ActionType.REPLY,
        }),
        expect.objectContaining({
          id: "action-label",
          type: ActionType.LABEL,
        }),
      ],
    });
  });
});

function createMessagingChannel({
  id,
  provider,
  teamName,
  teamId,
}: {
  id: string;
  provider: "SLACK" | "TELEGRAM";
  teamName: string;
  teamId: string;
}) {
  const disabledDestination = {
    enabled: false,
    targetId: null,
    targetLabel: null,
    isDm: false,
  };
  const savedRuleNotificationDestination = {
    enabled: true,
    targetId: `${id}-route`,
    targetLabel: teamName,
    isDm: false,
  };

  return {
    id,
    provider,
    teamName,
    teamId,
    isConnected: false,
    canSendAsDm: false,
    actions: [],
    destinations: {
      ruleNotifications: savedRuleNotificationDestination,
      scheduledCheckIns: disabledDestination,
      meetingBriefs: disabledDestination,
      documentFilings: disabledDestination,
      digests: disabledDestination,
      followUps: disabledDestination,
    },
  };
}
