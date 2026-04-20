import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionType } from "@/generated/prisma/enums";
import {
  getAvailableActionsForRuleEditor,
  getExtraAvailableActionsForRuleEditor,
} from "./action-availability";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    emailSendEnabled: true,
    autoDraftDisabled: false,
    webhookActionsEnabled: true,
  },
}));

vi.mock("@/env", () => ({
  env: {
    get NEXT_PUBLIC_EMAIL_SEND_ENABLED() {
      return mockEnv.emailSendEnabled;
    },
    get NEXT_PUBLIC_AUTO_DRAFT_DISABLED() {
      return mockEnv.autoDraftDisabled;
    },
    get NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED() {
      return mockEnv.webhookActionsEnabled;
    },
  },
}));

describe("getAvailableActionsForRuleEditor", () => {
  beforeEach(() => {
    mockEnv.emailSendEnabled = true;
    mockEnv.autoDraftDisabled = false;
    mockEnv.webhookActionsEnabled = true;
  });

  it("preserves move folder for existing Microsoft-only actions", () => {
    const actions = getAvailableActionsForRuleEditor({
      provider: "",
      existingActionTypes: [ActionType.MOVE_FOLDER],
    });

    expect(actions).toContain(ActionType.MOVE_FOLDER);
  });

  it("keeps only persisted send actions when email sending is disabled", () => {
    mockEnv.emailSendEnabled = false;

    const actions = getAvailableActionsForRuleEditor({
      provider: "google",
      existingActionTypes: [ActionType.REPLY],
    });

    expect(actions).toContain(ActionType.REPLY);
    expect(actions).not.toContain(ActionType.SEND_EMAIL);
    expect(actions).not.toContain(ActionType.FORWARD);
  });

  it("normalizes persisted messaging drafts to the shared draft reply option", () => {
    mockEnv.autoDraftDisabled = true;

    const actions = getAvailableActionsForRuleEditor({
      provider: "google",
      existingActionTypes: [ActionType.DRAFT_MESSAGING_CHANNEL],
    });

    expect(actions).toContain(ActionType.DRAFT_EMAIL);
    expect(actions).not.toContain(ActionType.DRAFT_MESSAGING_CHANNEL);
  });
});

describe("getExtraAvailableActionsForRuleEditor", () => {
  beforeEach(() => {
    mockEnv.emailSendEnabled = true;
    mockEnv.autoDraftDisabled = false;
    mockEnv.webhookActionsEnabled = true;
  });

  it("keeps webhook actions for existing rules when the feature is disabled", () => {
    mockEnv.webhookActionsEnabled = false;

    const actions = getExtraAvailableActionsForRuleEditor([
      ActionType.CALL_WEBHOOK,
    ]);

    expect(actions).toContain(ActionType.CALL_WEBHOOK);
  });

  it("hides webhook actions for new rules when the feature is disabled", () => {
    mockEnv.webhookActionsEnabled = false;

    const actions = getExtraAvailableActionsForRuleEditor();

    expect(actions).not.toContain(ActionType.CALL_WEBHOOK);
  });
});
