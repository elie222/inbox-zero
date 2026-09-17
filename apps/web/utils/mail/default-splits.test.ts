import { describe, expect, it } from "vitest";
import {
  ActionType,
  MailSplitFilterKind,
  SystemType,
} from "@/generated/prisma/enums";
import { getDefaultMailSplitDrafts } from "@/utils/mail/default-splits";
import { STANDARD_CATEGORY_SYSTEM_TYPES } from "@/utils/rule/consts";
import { categoryConfig } from "@/utils/category-config";

describe("getDefaultMailSplitDrafts", () => {
  it("keeps OTP out of onboarding categories", () => {
    expect(STANDARD_CATEGORY_SYSTEM_TYPES).not.toContain(SystemType.OTP);
    expect(
      categoryConfig("google").map((category) => category.key),
    ).not.toContain(SystemType.OTP);
  });

  it("creates label splits for the standard category rules in their standard order", () => {
    const rules = [
      rule(SystemType.RECEIPT, "receipt-label"),
      rule(SystemType.FYI, "fyi-label"),
      rule(SystemType.TO_REPLY, "reply-label"),
      rule(SystemType.NEWSLETTER, "newsletter-label"),
      rule(SystemType.OTP, "otp-label"),
      rule(null, "custom-label"),
    ];

    expect(getDefaultMailSplitDrafts(rules)).toEqual([
      {
        name: "To Reply",
        labelId: "reply-label",
        filters: [{ kind: MailSplitFilterKind.LABEL, value: "reply-label" }],
      },
      {
        name: "Newsletter",
        labelId: "newsletter-label",
        filters: [
          { kind: MailSplitFilterKind.LABEL, value: "newsletter-label" },
        ],
      },
      {
        name: "Receipt",
        labelId: "receipt-label",
        filters: [{ kind: MailSplitFilterKind.LABEL, value: "receipt-label" }],
      },
      {
        name: "OTP",
        labelId: "otp-label",
        filters: [{ kind: MailSplitFilterKind.LABEL, value: "otp-label" }],
      },
    ]);
  });

  it("skips standard rules without a resolved inbox label action", () => {
    const rules = [
      rule(SystemType.NEWSLETTER, null, ActionType.MOVE_FOLDER),
      rule(SystemType.RECEIPT, null),
      {
        ...rule(SystemType.MARKETING, "marketing-label"),
        actions: [
          { type: ActionType.LABEL, labelId: "marketing-label" },
          { type: ActionType.ARCHIVE, labelId: null },
        ],
      },
      rule(SystemType.NOTIFICATION, "notification-label"),
    ];

    expect(getDefaultMailSplitDrafts(rules)).toEqual([
      {
        name: "Notification",
        labelId: "notification-label",
        filters: [
          { kind: MailSplitFilterKind.LABEL, value: "notification-label" },
        ],
      },
    ]);
  });
});

function rule(
  systemType: SystemType | null,
  labelId: string | null,
  type = ActionType.LABEL,
) {
  return {
    systemType,
    actions: [{ type, labelId }],
  };
}
