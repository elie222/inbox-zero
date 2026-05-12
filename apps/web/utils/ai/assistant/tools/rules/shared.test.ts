import { describe, expect, it, vi } from "vitest";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import {
  buildCreateRuleSchemaFromChatToolInput,
  buildProviderRuleActionFields,
} from "./shared";

vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("buildProviderRuleActionFields", () => {
  it("preserves Microsoft folder names for folder move actions", () => {
    expect(
      buildProviderRuleActionFields({
        provider: "microsoft",
        fields: {
          folderName: "Finance",
          label: "Finance",
        },
      }),
    ).toEqual({
      content: null,
      to: null,
      subject: null,
      label: "Finance",
      webhookUrl: null,
      cc: null,
      bcc: null,
      folderName: "Finance",
    });
  });

  it("omits Outlook-only folder fields for Gmail rule actions", () => {
    const fields = buildProviderRuleActionFields({
      provider: "google",
      fields: {
        folderName: "Finance",
        label: "Finance",
      },
    });

    expect(fields).toEqual({
      content: null,
      to: null,
      subject: null,
      label: "Finance",
      webhookUrl: null,
      cc: null,
      bcc: null,
    });
    expect(fields).not.toHaveProperty("folderName");
  });
});

describe("buildCreateRuleSchemaFromChatToolInput", () => {
  it("keeps Microsoft folder move targets when converting chat tool input", () => {
    const result = buildCreateRuleSchemaFromChatToolInput(
      {
        name: "Finance filing",
        condition: {
          conditionalOperator: LogicalOperator.AND,
          aiInstructions: null,
          static: {
            from: "billing@example.com",
            to: null,
            subject: null,
          },
        },
        actions: [
          {
            type: ActionType.MOVE_FOLDER,
            fields: {
              folderName: "Finance",
            },
            delayInMinutes: null,
          },
        ],
      },
      "microsoft",
    );

    expect(result.actions).toEqual([
      {
        type: ActionType.MOVE_FOLDER,
        fields: {
          content: null,
          to: null,
          subject: null,
          label: null,
          webhookUrl: null,
          cc: null,
          bcc: null,
          folderName: "Finance",
        },
        delayInMinutes: null,
      },
    ]);
  });
});
