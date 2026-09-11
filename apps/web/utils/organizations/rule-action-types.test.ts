import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionType } from "@/generated/prisma/enums";
import { getAvailableOrganizationRuleActionTypes } from "./rule-action-types";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    autoDraftDisabled: false,
    emailSendEnabled: true,
    webhookActionEnabled: true,
    deleteEmailActionEnabled: true,
  },
}));

vi.mock("@/env", () => ({
  env: {
    get NEXT_PUBLIC_AUTO_DRAFT_DISABLED() {
      return mockEnv.autoDraftDisabled;
    },
    get NEXT_PUBLIC_EMAIL_SEND_ENABLED() {
      return mockEnv.emailSendEnabled;
    },
    get NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED() {
      return mockEnv.webhookActionEnabled;
    },
    get NEXT_PUBLIC_DELETE_EMAIL_ACTION_ENABLED() {
      return mockEnv.deleteEmailActionEnabled;
    },
  },
}));

describe("getAvailableOrganizationRuleActionTypes", () => {
  beforeEach(() => {
    mockEnv.autoDraftDisabled = false;
    mockEnv.emailSendEnabled = true;
    mockEnv.webhookActionEnabled = true;
    mockEnv.deleteEmailActionEnabled = true;
  });

  it("excludes drafting when auto-drafting is disabled", () => {
    mockEnv.autoDraftDisabled = true;

    expect(getAvailableOrganizationRuleActionTypes()).not.toContain(
      ActionType.DRAFT_EMAIL,
    );
  });

  it("preserves a persisted disabled action for editing", () => {
    mockEnv.autoDraftDisabled = true;

    expect(
      getAvailableOrganizationRuleActionTypes(ActionType.DRAFT_EMAIL),
    ).toContain(ActionType.DRAFT_EMAIL);
  });

  it("excludes outbound actions when email sending is disabled", () => {
    mockEnv.emailSendEnabled = false;

    const actionTypes = getAvailableOrganizationRuleActionTypes();

    expect(actionTypes).not.toContain(ActionType.REPLY);
    expect(actionTypes).not.toContain(ActionType.FORWARD);
    expect(actionTypes).not.toContain(ActionType.SEND_EMAIL);
  });

  it("excludes other deployment-disabled actions", () => {
    mockEnv.webhookActionEnabled = false;
    mockEnv.deleteEmailActionEnabled = false;

    const actionTypes = getAvailableOrganizationRuleActionTypes();

    expect(actionTypes).not.toContain(ActionType.CALL_WEBHOOK);
    expect(actionTypes).not.toContain(ActionType.DELETE);
  });
});
