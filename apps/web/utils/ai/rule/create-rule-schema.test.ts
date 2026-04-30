import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { ActionType } from "@/generated/prisma/enums";
import {
  createRuleSchema,
  getAvailableActions,
  getExtraActions,
} from "./create-rule-schema";

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

describe("createRuleSchema", () => {
  const provider = "google";
  const hasSendEmail = getAvailableActions(provider).includes(
    ActionType.SEND_EMAIL,
  );
  const assertSendEmailAvailable = () => {
    if (!hasSendEmail) {
      throw new Error(
        "Test precondition failed: SEND_EMAIL must be available for this provider.",
      );
    }
  };

  beforeEach(() => {
    mockEnv.emailSendEnabled = true;
    mockEnv.autoDraftDisabled = false;
    mockEnv.webhookActionsEnabled = true;
  });

  it("includes SEND_EMAIL in available actions for this test provider", () => {
    assertSendEmailAvailable();
  });

  it("rejects SEND_EMAIL without fields.to", () => {
    assertSendEmailAvailable();

    const result = createRuleSchema(provider).safeParse(
      buildRule({
        type: ActionType.SEND_EMAIL,
        fields: {
          label: null,
          to: null,
          cc: null,
          bcc: null,
          subject: "Hello",
          content: "World",
          webhookUrl: null,
        },
        delayInMinutes: null,
      }),
    );

    expect(result.success).toBe(false);
  });

  it("accepts SEND_EMAIL when fields.to is present", () => {
    assertSendEmailAvailable();

    const result = createRuleSchema(provider).safeParse(
      buildRule({
        type: ActionType.SEND_EMAIL,
        fields: {
          label: null,
          to: "recipient@example.com",
          cc: null,
          bcc: null,
          subject: "Hello",
          content: "World",
          webhookUrl: null,
        },
        delayInMinutes: null,
      }),
    );

    expect(result.success).toBe(true);
  });

  it("rejects FORWARD without fields.to", () => {
    assertSendEmailAvailable();

    const result = createRuleSchema(provider).safeParse(
      buildRule({
        type: ActionType.FORWARD,
        fields: {
          label: null,
          to: null,
          cc: null,
          bcc: null,
          subject: "FYI",
          content: null,
          webhookUrl: null,
        },
        delayInMinutes: null,
      }),
    );

    expect(result.success).toBe(false);
  });

  it("accepts FORWARD when fields.to is present", () => {
    assertSendEmailAvailable();

    const result = createRuleSchema(provider).safeParse(
      buildRule({
        type: ActionType.FORWARD,
        fields: {
          label: null,
          to: "forward@example.com",
          cc: null,
          bcc: null,
          subject: "FYI",
          content: null,
          webhookUrl: null,
        },
        delayInMinutes: null,
      }),
    );

    expect(result.success).toBe(true);
  });

  it("accepts REPLY without fields.to", () => {
    assertSendEmailAvailable();

    const result = createRuleSchema(provider).safeParse(
      buildRule({
        type: ActionType.REPLY,
        fields: {
          label: null,
          to: null,
          cc: null,
          bcc: null,
          subject: null,
          content: "Thanks for your email",
          webhookUrl: null,
        },
        delayInMinutes: null,
      }),
    );

    expect(result.success).toBe(true);
  });

  it("accepts omitted aiInstructions for sender-only rules", () => {
    const result = createRuleSchema(provider).safeParse({
      ...buildRule({
        type: ActionType.LABEL,
        fields: {
          label: "Newsletters",
          to: null,
          cc: null,
          bcc: null,
          subject: null,
          content: null,
          webhookUrl: null,
        },
        delayInMinutes: null,
      }),
      condition: {
        conditionalOperator: null,
        static: {
          from: "@briefing.example",
          to: null,
          subject: null,
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts LABEL actions when only the label field is provided", () => {
    const result = createRuleSchema(provider).safeParse({
      ...buildRule({
        type: ActionType.LABEL,
        fields: {
          label: "Finance",
        },
        delayInMinutes: null,
      }),
      condition: {
        conditionalOperator: null,
        aiInstructions: null,
        static: {
          from: "@billing.example",
          to: null,
          subject: null,
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts ARCHIVE actions with an empty fields object", () => {
    const result = createRuleSchema(provider).safeParse({
      ...buildRule({
        type: ActionType.ARCHIVE,
        fields: {},
        delayInMinutes: null,
      }),
      condition: {
        conditionalOperator: null,
        aiInstructions: "Archive recurring newsletters",
        static: null,
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects LABEL actions without fields.label", () => {
    const result = createRuleSchema(provider).safeParse({
      ...buildRule({
        type: ActionType.LABEL,
        fields: {},
        delayInMinutes: null,
      }),
    });

    expect(result.success).toBe(false);
  });

  it("rejects CALL_WEBHOOK without fields.webhookUrl", () => {
    const result = createRuleSchema(provider).safeParse({
      ...buildRule({
        type: ActionType.CALL_WEBHOOK,
        fields: {},
        delayInMinutes: null,
      }),
    });

    expect(result.success).toBe(false);
  });

  it("rejects MOVE_FOLDER actions for non-Microsoft providers", () => {
    const result = createRuleSchema(provider).safeParse(
      buildRule({
        type: ActionType.MOVE_FOLDER,
        fields: {
          folderName: "Finance",
        },
        delayInMinutes: null,
      }),
    );

    expect(result.success).toBe(false);
  });

  it("requires folderName for MOVE_FOLDER on Microsoft providers", () => {
    const result = createRuleSchema("microsoft").safeParse(
      buildRule({
        type: ActionType.MOVE_FOLDER,
        fields: {},
        delayInMinutes: null,
      }),
    );

    expect(result.success).toBe(false);
  });

  it("accepts MOVE_FOLDER with folderName on Microsoft providers", () => {
    const result = createRuleSchema("microsoft").safeParse(
      buildRule({
        type: ActionType.MOVE_FOLDER,
        fields: {
          folderName: "Finance",
        },
        delayInMinutes: null,
      }),
    );

    expect(result.success).toBe(true);
  });

  it("rejects structurally invalid static.from values", () => {
    const result = createRuleSchema(provider).safeParse({
      ...buildRule({
        type: ActionType.LABEL,
        fields: {
          label: "Escalations",
          to: null,
          cc: null,
          bcc: null,
          subject: null,
          content: null,
          webhookUrl: null,
        },
        delayInMinutes: null,
      }),
      condition: {
        conditionalOperator: null,
        aiInstructions: "Emails about vendor escalations",
        static: {
          from: "not-a-sender",
          to: null,
          subject: null,
        },
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) => issue.path.join(".") === "condition.static.from",
        ),
      ).toBe(true);
    }
  });

  it("rejects catch-all static.from values", () => {
    const result = createRuleSchema(provider).safeParse({
      ...buildRule({
        type: ActionType.LABEL,
        fields: {
          label: "Escalations",
          to: null,
          cc: null,
          bcc: null,
          subject: null,
          content: null,
          webhookUrl: null,
        },
        delayInMinutes: null,
      }),
      condition: {
        conditionalOperator: null,
        aiInstructions: "Emails about vendor escalations",
        static: {
          from: "*@*.*",
          to: null,
          subject: null,
        },
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) => issue.path.join(".") === "condition.static.from",
        ),
      ).toBe(true);
    }
  });
});

describe("getExtraActions", () => {
  beforeEach(() => {
    mockEnv.emailSendEnabled = true;
    mockEnv.autoDraftDisabled = false;
    mockEnv.webhookActionsEnabled = true;
  });

  it("includes CALL_WEBHOOK when webhook actions are enabled", () => {
    expect(getExtraActions()).toContain(ActionType.CALL_WEBHOOK);
  });

  it("omits CALL_WEBHOOK when webhook actions are disabled", () => {
    mockEnv.webhookActionsEnabled = false;

    expect(getExtraActions()).not.toContain(ActionType.CALL_WEBHOOK);
  });

  it("omits CALL_WEBHOOK for persisted actions when webhook actions are disabled", () => {
    mockEnv.webhookActionsEnabled = false;

    expect(getExtraActions([ActionType.CALL_WEBHOOK])).not.toContain(
      ActionType.CALL_WEBHOOK,
    );
  });
});

type CreateRuleInput = z.input<ReturnType<typeof createRuleSchema>>;
type RuleActionFixture = CreateRuleInput["actions"][number] & {
  fields?: Partial<{
    label: string | null;
    to: string | null;
    cc: string | null;
    bcc: string | null;
    subject: string | null;
    content: string | null;
    webhookUrl: string | null;
    folderName: string | null;
  }> | null;
};

function buildRule(action: RuleActionFixture) {
  return {
    name: "AutoReplyRule",
    condition: {
      conditionalOperator: null,
      aiInstructions: "Auto reply to support emails",
      static: null,
    },
    actions: [action],
  };
}
