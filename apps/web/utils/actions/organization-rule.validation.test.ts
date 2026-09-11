import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionType } from "@/generated/prisma/enums";
import {
  createOrganizationRuleBody,
  updateOrganizationRuleBody,
} from "./organization-rule.validation";

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

describe("createOrganizationRuleBody", () => {
  beforeEach(() => {
    mockEnv.autoDraftDisabled = false;
    mockEnv.emailSendEnabled = true;
    mockEnv.webhookActionEnabled = true;
    mockEnv.deleteEmailActionEnabled = true;
  });

  it("rejects draft actions when auto-drafting is disabled", () => {
    mockEnv.autoDraftDisabled = true;

    const result = createOrganizationRuleBody.safeParse(
      organizationRuleWithAction({ type: ActionType.DRAFT_EMAIL }),
    );

    expect(result.success).toBe(false);
  });

  it("rejects send actions when email sending is disabled", () => {
    mockEnv.emailSendEnabled = false;

    const result = createOrganizationRuleBody.safeParse(
      organizationRuleWithAction({
        type: ActionType.SEND_EMAIL,
        to: "recipient@example.com",
      }),
    );

    expect(result.success).toBe(false);
  });

  it("rejects webhook actions when webhooks are disabled", () => {
    mockEnv.webhookActionEnabled = false;

    const result = createOrganizationRuleBody.safeParse(
      organizationRuleWithAction({
        type: ActionType.CALL_WEBHOOK,
        url: "https://example.com/webhook",
      }),
    );

    expect(result.success).toBe(false);
  });

  it("requires delete actions to be explicitly enabled", () => {
    mockEnv.deleteEmailActionEnabled = false;

    const result = createOrganizationRuleBody.safeParse(
      organizationRuleWithAction({ type: ActionType.DELETE }),
    );

    expect(result.success).toBe(false);
  });

  it("preserves persisted disabled actions on update", () => {
    mockEnv.autoDraftDisabled = true;

    const result = updateOrganizationRuleBody.safeParse({
      ...organizationRuleWithAction({
        id: "organization-action-1",
        type: ActionType.DRAFT_EMAIL,
      }),
      organizationRuleId: "organization-rule-1",
    });

    expect(result.success).toBe(true);
  });

  it("does not let persisted action ids bypass create restrictions", () => {
    mockEnv.autoDraftDisabled = true;

    const result = createOrganizationRuleBody.safeParse(
      organizationRuleWithAction({
        id: "organization-action-1",
        type: ActionType.DRAFT_EMAIL,
      }),
    );

    expect(result.success).toBe(false);
  });

  it("accepts enabled actions", () => {
    const result = createOrganizationRuleBody.safeParse(
      organizationRuleWithAction({ type: ActionType.DRAFT_EMAIL }),
    );

    expect(result.success).toBe(true);
  });
});

function organizationRuleWithAction(action: {
  id?: string;
  type: ActionType;
  to?: string;
  url?: string;
}) {
  return {
    organizationId: "organization-1",
    name: "Rule",
    instructions: "Handle matching messages",
    actions: [action],
  };
}
