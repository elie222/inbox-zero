import { beforeEach, describe, expect, it, vi } from "vitest";
import { SystemType } from "@/generated/prisma/enums";
import { getEmail, getEmailAccount, getRule } from "@/__tests__/helpers";
import { createScopedLogger } from "@/utils/logger";

const { mockCreateGenerateObject, mockGenerateObject } = vi.hoisted(() => {
  const mockGenerateObject = vi.fn();
  const mockCreateGenerateObject = vi.fn(() => mockGenerateObject);
  return { mockCreateGenerateObject, mockGenerateObject };
});

vi.mock("server-only", () => ({}));
vi.mock("@/utils/llms", () => ({
  createGenerateObject: mockCreateGenerateObject,
}));
vi.mock("@/utils/llms/model", () => ({
  getModel: vi.fn(() => ({
    provider: "openai",
    modelName: "gpt-5-mini",
    model: {},
    providerOptions: undefined,
    fallbackModels: [],
  })),
}));

import { aiChooseRule } from "@/utils/ai/choose-rule/ai-choose-rule";

const logger = createScopedLogger("ai-choose-rule-prompt-test");

describe("aiChooseRule prompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateObject.mockResolvedValue({
      object: {
        reasoning: "This is an automated account update.",
        ruleName: "Notification",
        noMatchFound: false,
      },
    });
  });

  it("treats built-in system rules as valid single-rule matches", async () => {
    const notificationRule = {
      ...getRule(
        "Notifications: Alerts, status updates, or system messages",
        [],
        "Notification",
      ),
      systemType: SystemType.NOTIFICATION,
    };
    const customRule = getRule(
      "Only match a very specific QA workflow",
      [],
      "QA Workflow",
    );

    const result = await aiChooseRule({
      email: getEmail({
        from: "updates@service.example",
        subject: "Account status update",
        listUnsubscribe: "<https://service.example/unsubscribe?id=updates>",
        content:
          "Your account status changed after a recent billing check. Review the update in your dashboard.",
      }),
      rules: [customRule, notificationRule],
      emailAccount: getEmailAccount(),
      logger,
    });

    expect(result.rules[0]?.rule.name).toBe("Notification");

    const promptCall = mockGenerateObject.mock.calls[0]?.[0];
    expect(promptCall?.system).toContain(
      "whether it is user-defined or a built-in system rule",
    );
    expect(promptCall?.system).toContain(
      "usually belong to Notification, even when the email includes a List-Unsubscribe header",
    );
  });
});
